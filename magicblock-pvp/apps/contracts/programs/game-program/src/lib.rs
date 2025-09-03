use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

// Import shared modules
use crate::shared::{GameError, GameState, PlayerClass, PlayerStats, CombatAction, MatchConfig, MAX_PLAYERS_PER_MATCH};

declare_id!("GAMExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

#[program]
pub mod sol_duel_game {
    use super::*;

    /// Initialize the global game state
    pub fn initialize_game(ctx: Context<InitializeGame>, upgrade_authority: Pubkey) -> Result<()> {
        instructions::initialize_game::handler(ctx, upgrade_authority)
    }

    /// Register a new player
    pub fn register_player(
        ctx: Context<RegisterPlayer>,
        username: String,
        player_class: PlayerClass,
    ) -> Result<()> {
        instructions::register_player::handler(ctx, username, player_class)
    }

    /// Create a new match
    pub fn create_match(
        ctx: Context<CreateMatch>,
        match_config: MatchConfig,
    ) -> Result<()> {
        instructions::create_match::handler(ctx, match_config)
    }

    /// Join an existing match
    pub fn join_match(ctx: Context<JoinMatch>) -> Result<()> {
        instructions::join_match::handler(ctx)
    }

    /// Start a match when enough players have joined
    pub fn start_match(ctx: Context<StartMatch>) -> Result<()> {
        instructions::start_match::handler(ctx)
    }

    /// Execute a combat action during a match
    pub fn execute_action(
        ctx: Context<ExecuteAction>,
        action: CombatAction,
    ) -> Result<()> {
        instructions::execute_action::handler(ctx, action)
    }

    /// End turn and move to next player
    pub fn end_turn(ctx: Context<EndTurn>) -> Result<()> {
        instructions::end_turn::handler(ctx)
    }

    /// Finish match and distribute rewards
    pub fn finish_match(ctx: Context<FinishMatch>) -> Result<()> {
        instructions::finish_match::handler(ctx)
    }

    /// Update player stats after match completion
    pub fn update_player_stats(ctx: Context<UpdatePlayerStats>, experience_gained: u32) -> Result<()> {
        instructions::update_player_stats::handler(ctx, experience_gained)
    }

    /// Emergency functions for admin
    pub fn emergency_stop_match(ctx: Context<EmergencyStopMatch>) -> Result<()> {
        instructions::emergency_stop_match::handler(ctx)
    }
}

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(
        init,
        payer = authority,
        space = GameState::LEN,
        seeds = [b"game_state"],
        bump
    )]
    pub game_state: Account<'info, GameState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(username: String)]
pub struct RegisterPlayer<'info> {
    #[account(
        init,
        payer = player,
        space = PlayerProfile::LEN,
        seeds = [b"player", player.key().as_ref()],
        bump
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    
    #[account(mut)]
    pub player: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateMatch<'info> {
    #[account(
        init,
        payer = creator,
        space = Match::LEN,
        seeds = [b"match", creator.key().as_ref(), &Clock::get()?.unix_timestamp.to_le_bytes()],
        bump
    )]
    pub match_account: Account<'info, Match>,
    
    #[account(
        mut,
        seeds = [b"player", creator.key().as_ref()],
        bump
    )]
    pub creator_profile: Account<'info, PlayerProfile>,
    
    #[account(mut)]
    pub creator: Signer<'info>,
    
    #[account(
        mut,
        associated_token::mint = sol_mint,
        associated_token::authority = creator
    )]
    pub creator_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: SOL mint account
    pub sol_mint: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinMatch<'info> {
    #[account(
        mut,
        seeds = [b"match", match_account.creator.as_ref(), &match_account.created_at.to_le_bytes()],
        bump = match_account.bump
    )]
    pub match_account: Account<'info, Match>,
    
    #[account(
        mut,
        seeds = [b"player", player.key().as_ref()],
        bump
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(
        mut,
        associated_token::mint = sol_mint,
        associated_token::authority = player
    )]
    pub player_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: SOL mint account
    pub sol_mint: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct StartMatch<'info> {
    #[account(
        mut,
        seeds = [b"match", match_account.creator.as_ref(), &match_account.created_at.to_le_bytes()],
        bump = match_account.bump
    )]
    pub match_account: Account<'info, Match>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteAction<'info> {
    #[account(
        mut,
        seeds = [b"match", match_account.creator.as_ref(), &match_account.created_at.to_le_bytes()],
        bump = match_account.bump
    )]
    pub match_account: Account<'info, Match>,
    
    #[account(
        mut,
        seeds = [b"player", player.key().as_ref()],
        bump
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    
    #[account(mut)]
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct EndTurn<'info> {
    #[account(
        mut,
        seeds = [b"match", match_account.creator.as_ref(), &match_account.created_at.to_le_bytes()],
        bump = match_account.bump
    )]
    pub match_account: Account<'info, Match>,
    
    #[account(mut)]
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct FinishMatch<'info> {
    #[account(
        mut,
        seeds = [b"match", match_account.creator.as_ref(), &match_account.created_at.to_le_bytes()],
        bump = match_account.bump
    )]
    pub match_account: Account<'info, Match>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdatePlayerStats<'info> {
    #[account(
        mut,
        seeds = [b"player", player.key().as_ref()],
        bump
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    
    #[account(mut)]
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct EmergencyStopMatch<'info> {
    #[account(
        mut,
        seeds = [b"match", match_account.creator.as_ref(), &match_account.created_at.to_le_bytes()],
        bump = match_account.bump
    )]
    pub match_account: Account<'info, Match>,
    
    #[account(
        seeds = [b"game_state"],
        bump,
        constraint = game_state.upgrade_authority == authority.key()
    )]
    pub game_state: Account<'info, state::GameState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}