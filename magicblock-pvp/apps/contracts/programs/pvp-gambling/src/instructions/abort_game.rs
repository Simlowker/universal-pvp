use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::error::PvpGamblingError;
use crate::state::{GameEscrow, GameState, PlayerState, CostModel};
use crate::utils::{Utils, GameConstants};

/// Abort a game and return deposited funds to players
#[derive(Accounts)]
pub struct AbortGame<'info> {
    /// Player or authority requesting the abort
    #[account(mut)]
    pub aborter: Signer<'info>,
    
    /// Game escrow account
    #[account(
        mut,
        constraint = game_escrow.game_state != GameState::Settled @ PvpGamblingError::GameAlreadySettled,
        constraint = game_escrow.game_state != GameState::Aborted @ PvpGamblingError::GameAborted,
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
    
    /// Player 1 account to receive refund
    /// CHECK: Validated against game_escrow.player1
    #[account(mut)]
    pub player1_account: UncheckedAccount<'info>,
    
    /// Player 2 account to receive refund  
    /// CHECK: Validated against game_escrow.player2
    #[account(mut)]
    pub player2_account: UncheckedAccount<'info>,
    
    /// System program for SOL transfers
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AbortGame>) -> Result<()> {
    let game_escrow = &mut ctx.accounts.game_escrow;
    let player1_state = &ctx.accounts.player1_state;
    let player2_state = &ctx.accounts.player2_state;
    let clock = Clock::get()?;
    
    // Validate player accounts
    require!(
        ctx.accounts.player1_account.key() == game_escrow.player1,
        PvpGamblingError::InvalidPlayer
    );
    require!(
        ctx.accounts.player2_account.key() == game_escrow.player2,
        PvpGamblingError::InvalidPlayer
    );
    
    // Check abort conditions
    let can_abort = check_abort_conditions(
        &ctx.accounts.aborter.key(),
        game_escrow,
        clock.unix_timestamp,
    )?;
    
    require!(can_abort, PvpGamblingError::Unauthorized);
    
    // Calculate abort transaction cost
    let abort_cost = CostModel::calculate_transaction_cost(1, 0)?; // Base cost for signatures
    
    // Check cost cap if gasless mode
    if game_escrow.gasless_mode {
        let projected_cost = Utils::safe_add(game_escrow.accumulated_costs, abort_cost)?;
        if let Some(max_cap) = game_escrow.max_cost_cap {
            require!(
                projected_cost <= max_cap,
                PvpGamblingError::CostCapExceeded
            );
        }
    }
    
    // Calculate refund amounts based on what each player deposited
    let player1_refund = player1_state.deposited_amount;
    let player2_refund = player2_state.deposited_amount;
    
    // In gasless mode, deduct proportional costs from refunds
    let (final_player1_refund, final_player2_refund) = if game_escrow.gasless_mode {
        let total_costs = Utils::safe_add(game_escrow.accumulated_costs, abort_cost)?;
        let total_deposited = Utils::safe_add(player1_refund, player2_refund)?;
        
        if total_deposited > 0 {
            // Proportionally deduct costs
            let player1_cost_share = Utils::safe_mul(total_costs, player1_refund)?
                .checked_div(total_deposited)
                .unwrap_or(0);
            let player2_cost_share = Utils::safe_sub(total_costs, player1_cost_share)?;
            
            (
                Utils::safe_sub(player1_refund, player1_cost_share)?,
                Utils::safe_sub(player2_refund, player2_cost_share)?,
            )
        } else {
            (0, 0)
        }
    } else {
        (player1_refund, player2_refund)
    };
    
    // PDA signing seeds
    let authority_seeds = &[
        b"game_authority",
        &game_escrow.game_id.to_le_bytes(),
        &[game_escrow.authority_bump],
    ];
    let authority_signer = &[&authority_seeds[..]];
    
    // Refund player 1 if they deposited
    if final_player1_refund > 0 {
        let transfer_instruction = system_program::Transfer {
            from: game_escrow.to_account_info(),
            to: ctx.accounts.player1_account.to_account_info(),
        };
        
        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            transfer_instruction,
            authority_signer,
        );
        
        system_program::transfer(cpi_context, final_player1_refund)?;
    }
    
    // Refund player 2 if they deposited
    if final_player2_refund > 0 {
        let transfer_instruction = system_program::Transfer {
            from: game_escrow.to_account_info(),
            to: ctx.accounts.player2_account.to_account_info(),
        };
        
        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            transfer_instruction,
            authority_signer,
        );
        
        system_program::transfer(cpi_context, final_player2_refund)?;
    }
    
    // Update game state
    game_escrow.game_state = GameState::Aborted;
    game_escrow.settled_at = Some(clock.unix_timestamp);
    game_escrow.add_cost(abort_cost)?;
    game_escrow.increment_signatures(1)?;
    
    // Update remaining balance
    let total_refunded = Utils::safe_add(final_player1_refund, final_player2_refund)?;
    game_escrow.total_amount = Utils::safe_sub(game_escrow.total_amount, total_refunded)?;
    
    msg!(
        "Game {} aborted! Player1 refund: {}, Player2 refund: {}", 
        game_escrow.game_id,
        final_player1_refund,
        final_player2_refund
    );
    
    Ok(())
}

/// Check if the game can be aborted under current conditions
fn check_abort_conditions(
    aborter: &Pubkey,
    game_escrow: &GameEscrow,
    current_time: i64,
) -> Result<bool> {
    // Players can always abort their own games
    if *aborter == game_escrow.player1 || *aborter == game_escrow.player2 {
        return Ok(true);
    }
    
    // Check for timeout conditions (24 hours)
    let is_timed_out = Utils::check_game_timeout(
        game_escrow.created_at,
        GameConstants::GAME_TIMEOUT_SECONDS,
    )?;
    
    if is_timed_out {
        return Ok(true);
    }
    
    // Additional conditions for abort:
    // - Game has been inactive for extended period
    // - Cost cap exceeded in gasless mode
    // - Other emergency conditions
    
    if game_escrow.gasless_mode {
        if let Some(max_cap) = game_escrow.max_cost_cap {
            if game_escrow.accumulated_costs >= max_cap {
                return Ok(true);
            }
        }
    }
    
    Ok(false)
}