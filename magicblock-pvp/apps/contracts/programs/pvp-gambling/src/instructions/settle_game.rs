use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::error::PvpGamblingError;
use crate::state::{GameEscrow, GameState, PlayerState, CostModel};
use crate::vrf::EcVrf;
use crate::utils::Utils;

/// Settle the game using VRF-based winner selection
#[derive(Accounts)]
pub struct SettleGame<'info> {
    /// Authority that can settle the game (could be either player or designated settler)
    #[account(mut)]
    pub settler: Signer<'info>,
    
    /// Game escrow account
    #[account(
        mut,
        constraint = game_escrow.game_state == GameState::ReadyToSettle @ PvpGamblingError::InvalidStateTransition,
    )]
    pub game_escrow: Account<'info, GameEscrow>,
    
    /// Game authority PDA for signing transfers
    /// CHECK: This is the game authority PDA
    #[account(
        seeds = [
            b"game_authority", 
            &game_escrow.game_id.to_le_bytes()
        ],
        bump = game_escrow.authority_bump
    )]
    pub game_authority: UncheckedAccount<'info>,
    
    /// Player 1 state account
    #[account(
        mut,
        seeds = [
            b"player_state",
            game_escrow.player1.as_ref(),
            game_escrow.key().as_ref(),
        ],
        bump
    )]
    pub player1_state: Account<'info, PlayerState>,
    
    /// Player 2 state account
    #[account(
        mut,
        seeds = [
            b"player_state",
            game_escrow.player2.as_ref(),
            game_escrow.key().as_ref(),
        ],
        bump
    )]
    pub player2_state: Account<'info, PlayerState>,
    
    /// Winner account to receive payout
    /// CHECK: Will be validated as either player1 or player2
    #[account(mut)]
    pub winner_account: UncheckedAccount<'info>,
    
    /// VRF authority account containing the public key for verification
    /// CHECK: VRF authority PDA  
    #[account(
        seeds = [b"vrf_authority"],
        bump
    )]
    pub vrf_authority: UncheckedAccount<'info>,
    
    /// System program for SOL transfers
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SettleGame>,
    vrf_proof: [u8; 80],
    alpha_string: Vec<u8>,
) -> Result<()> {
    let game_escrow = &mut ctx.accounts.game_escrow;
    let player1_state = &mut ctx.accounts.player1_state;
    let player2_state = &mut ctx.accounts.player2_state;
    let clock = Clock::get()?;
    
    // Validate that both players have deposited
    require!(
        game_escrow.both_players_ready(),
        PvpGamblingError::PlayersNotReady
    );
    
    // Validate alpha string matches game parameters
    let expected_alpha = EcVrf::generate_alpha_string(
        game_escrow.game_id,
        &game_escrow.player1,
        &game_escrow.player2,
        game_escrow.bet_amount,
        game_escrow.created_at,
    );
    
    require!(
        alpha_string == expected_alpha,
        PvpGamblingError::InvalidVrfProof
    );
    
    // Get VRF public key from authority account
    // In a real implementation, this would be stored in the VRF authority account
    // For now, we'll use a placeholder - in production, derive from authority PDA data
    let vrf_public_key = [0u8; 32]; // Placeholder - should be loaded from vrf_authority account data
    
    // Verify VRF proof and extract randomness
    let (vrf_output, is_valid) = EcVrf::verify_and_extract(
        &vrf_public_key,
        &vrf_proof,
        &alpha_string,
    )?;
    
    require!(is_valid, PvpGamblingError::VrfVerificationFailed);
    
    // Determine winner using proportional selection
    // For equal bets, this is essentially a coin flip
    // For unequal bets, this would be proportional (though both players bet the same in this implementation)
    let player1_wins = EcVrf::select_winner(
        &vrf_output,
        player1_state.deposited_amount,
        player2_state.deposited_amount,
    )?;
    
    let winner_pubkey = if player1_wins {
        game_escrow.player1
    } else {
        game_escrow.player2
    };
    
    // Validate winner account matches the selected winner
    require!(
        ctx.accounts.winner_account.key() == winner_pubkey,
        PvpGamblingError::InvalidPlayer
    );
    
    // Calculate settlement cost
    let settlement_cost = CostModel::calculate_transaction_cost(1, 0)?; // Base cost
    
    // Check cost cap before proceeding
    if game_escrow.gasless_mode {
        let projected_cost = Utils::safe_add(game_escrow.accumulated_costs, settlement_cost)?;
        if let Some(max_cap) = game_escrow.max_cost_cap {
            require!(
                projected_cost <= max_cap,
                PvpGamblingError::CostCapExceeded
            );
        }
    }
    
    // Calculate payout (deduct costs if gasless mode)
    let payout_amount = Utils::calculate_payout(
        game_escrow.total_amount,
        Utils::safe_add(game_escrow.accumulated_costs, settlement_cost)?,
        game_escrow.gasless_mode,
    )?;
    
    // Transfer winnings to winner using game authority PDA
    let authority_seeds = &[
        b"game_authority",
        &game_escrow.game_id.to_le_bytes(),
        &[game_escrow.authority_bump],
    ];
    let authority_signer = &[&authority_seeds[..]];
    
    let transfer_instruction = system_program::Transfer {
        from: game_escrow.to_account_info(),
        to: ctx.accounts.winner_account.to_account_info(),
    };
    
    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        transfer_instruction,
        authority_signer,
    );
    
    system_program::transfer(cpi_context, payout_amount)?;
    
    // Update game state
    game_escrow.winner = Some(winner_pubkey);
    game_escrow.game_state = GameState::Settled;
    game_escrow.settled_at = Some(clock.unix_timestamp);
    game_escrow.add_cost(settlement_cost)?;
    game_escrow.increment_signatures(1)?;
    
    // Update remaining balance (should be close to 0 or equal to costs in gasless mode)
    game_escrow.total_amount = Utils::safe_sub(game_escrow.total_amount, payout_amount)?;
    
    // Update player activity
    player1_state.update_activity();
    player2_state.update_activity();
    
    // Add settlement costs to settler if not gasless mode
    if !game_escrow.gasless_mode {
        if ctx.accounts.settler.key() == game_escrow.player1 {
            player1_state.add_cost(settlement_cost)?;
        } else if ctx.accounts.settler.key() == game_escrow.player2 {
            player2_state.add_cost(settlement_cost)?;
        }
    }
    
    msg!(
        "Game {} settled! Winner: {}, Payout: {} lamports, VRF Output: {:?}",
        game_escrow.game_id,
        winner_pubkey,
        payout_amount,
        &vrf_output[..8] // Log first 8 bytes of VRF output for verification
    );
    
    Ok(())
}