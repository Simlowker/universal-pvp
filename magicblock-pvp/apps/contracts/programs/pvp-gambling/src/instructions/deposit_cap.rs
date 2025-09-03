use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::error::PvpGamblingError;
use crate::state::{GameEscrow, GameState, PlayerState, CostModel};
use crate::utils::{Utils, GameConstants};

/// Deposit SOL into the game escrow with cost cap validation
#[derive(Accounts)]
pub struct DepositCap<'info> {
    /// Player making the deposit
    #[account(mut)]
    pub player: Signer<'info>,
    
    /// Game escrow account receiving the deposit
    #[account(
        mut,
        constraint = game_escrow.game_state == GameState::WaitingForDeposits @ PvpGamblingError::InvalidStateTransition,
        constraint = game_escrow.player1 == player.key() || game_escrow.player2 == player.key() @ PvpGamblingError::InvalidPlayer
    )]
    pub game_escrow: Account<'info, GameEscrow>,
    
    /// Player's state account
    #[account(
        mut,
        seeds = [
            b"player_state",
            player.key().as_ref(),
            game_escrow.key().as_ref(),
        ],
        bump,
        constraint = player_state.player == player.key() @ PvpGamblingError::InvalidPlayer
    )]
    pub player_state: Account<'info, PlayerState>,
    
    /// System program for transferring SOL
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositCap>, amount: u64) -> Result<()> {
    let game_escrow = &mut ctx.accounts.game_escrow;
    let player_state = &mut ctx.accounts.player_state;
    let player = &ctx.accounts.player;
    
    // Validate deposit amount
    require!(
        amount == game_escrow.bet_amount,
        PvpGamblingError::InvalidBetAmount
    );
    
    // Prevent double deposits
    require!(
        !player_state.has_deposited,
        PvpGamblingError::InvalidStateTransition
    );
    
    // Calculate deposit transaction cost
    let deposit_cost = CostModel::calculate_transaction_cost(1, 0)?; // Base cost for 1 signature
    
    // Check if cost cap would be exceeded before proceeding
    if game_escrow.gasless_mode {
        let projected_cost = Utils::safe_add(game_escrow.accumulated_costs, deposit_cost)?;
        if let Some(max_cap) = game_escrow.max_cost_cap {
            require!(
                projected_cost <= max_cap,
                PvpGamblingError::CostCapExceeded
            );
        }
    }
    
    // Transfer SOL from player to game escrow
    let transfer_instruction = system_program::Transfer {
        from: player.to_account_info(),
        to: game_escrow.to_account_info(),
    };
    
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        transfer_instruction,
    );
    
    system_program::transfer(cpi_context, amount)?;
    
    // Update game escrow state
    game_escrow.total_amount = Utils::safe_add(game_escrow.total_amount, amount)?;
    game_escrow.add_cost(deposit_cost)?;
    game_escrow.increment_signatures(1)?;
    
    // Update player state
    player_state.deposited_amount = amount;
    player_state.has_deposited = true;
    player_state.add_cost(if game_escrow.gasless_mode { 0 } else { deposit_cost })?;
    player_state.update_activity();
    
    // Check if both players have deposited
    if game_escrow.both_players_ready() {
        // Validate state transition
        require!(
            game_escrow.can_transition_to(&GameState::ReadyToSettle),
            PvpGamblingError::InvalidStateTransition
        );
        
        game_escrow.game_state = GameState::ReadyToSettle;
        
        msg!(
            "Both players deposited. Game {} ready to settle. Total amount: {}",
            game_escrow.game_id,
            game_escrow.total_amount
        );
    } else {
        msg!(
            "Player {} deposited {} lamports. Waiting for opponent.",
            player.key(),
            amount
        );
    }
    
    // Final cost cap check for gasless mode
    if game_escrow.gasless_mode {
        game_escrow.check_cost_cap()?;
    }
    
    Ok(())
}