use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::error::PvpGamblingError;
use crate::state::{GameEscrow, GameState, PlayerState, CostModel};
use crate::utils::{Utils, GameConstants};

/// Initialize a new PvP gambling game with escrow
#[derive(Accounts)]
#[instruction(game_id: u64, bet_amount: u64, player1: Pubkey, player2: Pubkey)]
pub struct InitializeGame<'info> {
    /// Game creator and payer
    #[account(mut)]
    pub initializer: Signer<'info>,
    
    /// Game escrow account (PDA)
    #[account(
        init,
        payer = initializer,
        space = GameEscrow::LEN,
        seeds = [
            b"game_escrow",
            &game_id.to_le_bytes(),
            game_authority.key().as_ref(),
        ],
        bump
    )]
    pub game_escrow: Account<'info, GameEscrow>,
    
    /// Game authority (PDA) for signing transactions
    /// CHECK: This is a PDA derived from game_id
    #[account(
        seeds = [
            b"game_authority",
            &game_id.to_le_bytes(),
        ],
        bump
    )]
    pub game_authority: UncheckedAccount<'info>,
    
    /// Player 1 state account (PDA)
    #[account(
        init,
        payer = initializer,
        space = PlayerState::LEN,
        seeds = [
            b"player_state",
            player1.as_ref(),
            game_escrow.key().as_ref(),
        ],
        bump
    )]
    pub player1_state: Account<'info, PlayerState>,
    
    /// Player 2 state account (PDA)
    #[account(
        init,
        payer = initializer,
        space = PlayerState::LEN,
        seeds = [
            b"player_state",
            player2.as_ref(),
            game_escrow.key().as_ref(),
        ],
        bump
    )]
    pub player2_state: Account<'info, PlayerState>,
    
    /// System program for account creation
    pub system_program: Program<'info, System>,
    
    /// Rent sysvar for rent calculations
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializeGame>,
    game_id: u64,
    bet_amount: u64,
    player1: Pubkey,
    player2: Pubkey,
    gasless_mode: bool,
    max_cost_cap: Option<u64>,
) -> Result<()> {
    let game_escrow = &mut ctx.accounts.game_escrow;
    let player1_state = &mut ctx.accounts.player1_state;
    let player2_state = &mut ctx.accounts.player2_state;
    let clock = Clock::get()?;
    
    // Validate inputs
    require!(player1 != player2, PvpGamblingError::InvalidPlayer);
    Utils::validate_amount(bet_amount, GameConstants::MIN_BET_AMOUNT, GameConstants::MAX_BET_AMOUNT)?;
    
    // Validate cost cap if gasless mode is enabled
    if gasless_mode {
        if let Some(cap) = max_cost_cap {
            require!(
                cap <= GameConstants::MAX_GASLESS_COST_CAP,
                PvpGamblingError::InvalidCostCap
            );
        }
    }
    
    // Get authority bump
    let authority_bump = ctx.bumps.game_authority;
    
    // Calculate initialization costs
    let initialization_cost = CostModel::calculate_transaction_cost(1, 0)?; // Base cost for 1 signature
    
    // Initialize game escrow
    game_escrow.game_id = game_id;
    game_escrow.player1 = player1;
    game_escrow.player2 = player2;
    game_escrow.bet_amount = bet_amount;
    game_escrow.game_state = GameState::Initialized;
    game_escrow.winner = None;
    game_escrow.total_amount = 0;
    game_escrow.created_at = clock.unix_timestamp;
    game_escrow.settled_at = None;
    game_escrow.authority = ctx.accounts.game_authority.key();
    game_escrow.authority_bump = authority_bump;
    game_escrow.gasless_mode = gasless_mode;
    game_escrow.max_cost_cap = max_cost_cap;
    game_escrow.accumulated_costs = initialization_cost;
    game_escrow.signature_count = 1;
    game_escrow.reserved = [0; 64];
    
    // Initialize player 1 state
    player1_state.player = player1;
    player1_state.game_escrow = game_escrow.key();
    player1_state.deposited_amount = 0;
    player1_state.has_deposited = false;
    player1_state.player_costs = 0;
    player1_state.last_activity = clock.unix_timestamp;
    player1_state.reserved = [0; 32];
    
    // Initialize player 2 state
    player2_state.player = player2;
    player2_state.game_escrow = game_escrow.key();
    player2_state.deposited_amount = 0;
    player2_state.has_deposited = false;
    player2_state.player_costs = 0;
    player2_state.last_activity = clock.unix_timestamp;
    player2_state.reserved = [0; 32];
    
    // Transition to waiting for deposits
    game_escrow.game_state = GameState::WaitingForDeposits;
    
    // Check cost cap if gasless mode
    if gasless_mode {
        game_escrow.check_cost_cap()?;
    }
    
    msg!(
        "Game initialized: ID={}, Player1={}, Player2={}, Bet={}, GaslessMode={}", 
        game_id, 
        player1, 
        player2, 
        bet_amount,
        gasless_mode
    );
    
    Ok(())
}