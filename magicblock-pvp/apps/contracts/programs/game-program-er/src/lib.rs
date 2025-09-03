use anchor_lang::prelude::*;
use bolt_lang::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

// Import shared modules including MagicBlock integration
use shared::magicblock::{
    bolt_ecs::*,
    delegation::*,
    router::*,
    state_management::*,
};
use shared::{GameError, GameState as SharedGameState, PlayerClass, PlayerStats, CombatAction, MatchConfig, MAX_PLAYERS_PER_MATCH};

declare_id!("ERGMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

#[program]
pub mod sol_duel_game_er {
    use super::*;

    /// Initialize the game with BOLT ECS support and ER integration
    pub fn initialize_game_er(
        ctx: Context<InitializeGameEr>,
        upgrade_authority: Pubkey,
        er_program_id: Pubkey,
    ) -> Result<()> {
        instructions::initialize_game_er::handler(ctx, upgrade_authority, er_program_id)
    }

    /// Register player with component-based architecture
    pub fn register_player_er(
        ctx: Context<RegisterPlayerEr>,
        username: String,
        player_class: PlayerClass,
    ) -> Result<()> {
        instructions::register_player_er::handler(ctx, username, player_class)
    }

    /// Create match with delegation to ER
    pub fn create_match_er(
        ctx: Context<CreateMatchEr>,
        match_config: MatchConfig,
        delegate_to_er: bool,
    ) -> Result<()> {
        instructions::create_match_er::handler(ctx, match_config, delegate_to_er)
    }

    /// Join match in ER environment
    pub fn join_match_er(ctx: Context<JoinMatchEr>) -> Result<()> {
        instructions::join_match_er::handler(ctx)
    }

    /// Start match with BOLT ECS initialization
    pub fn start_match_er(ctx: Context<StartMatchEr>) -> Result<()> {
        instructions::start_match_er::handler(ctx)
    }

    /// Execute combat action using BOLT ECS systems
    pub fn execute_action_er(
        ctx: Context<ExecuteActionEr>,
        action: CombatAction,
    ) -> Result<()> {
        instructions::execute_action_er::handler(ctx, action)
    }

    /// End turn with component updates
    pub fn end_turn_er(ctx: Context<EndTurnEr>) -> Result<()> {
        instructions::end_turn_er::handler(ctx)
    }

    /// Finish match and prepare for mainnet commit
    pub fn finish_match_er(
        ctx: Context<FinishMatchEr>,
        commit_to_mainnet: bool,
    ) -> Result<()> {
        instructions::finish_match_er::handler(ctx, commit_to_mainnet)
    }

    /// Delegate game state to ER
    pub fn delegate_game_state(
        ctx: Context<DelegateGameState>,
        accounts_to_delegate: Vec<DelegatedAccountType>,
        expiry_timestamp: Option<i64>,
    ) -> Result<()> {
        instructions::delegate_game_state::handler(ctx, accounts_to_delegate, expiry_timestamp)
    }

    /// Commit ER results back to mainnet
    pub fn commit_er_results(
        ctx: Context<CommitErResults>,
        match_results: MatchResults,
    ) -> Result<()> {
        instructions::commit_er_results::handler(ctx, match_results)
    }

    /// Rollback ER state if needed
    pub fn rollback_er_state(ctx: Context<RollbackErState>) -> Result<()> {
        instructions::rollback_er_state::handler(ctx)
    }

    /// Initialize BOLT ECS components for a player
    pub fn initialize_player_components(
        ctx: Context<InitializePlayerComponents>,
        initial_stats: PlayerStats,
    ) -> Result<()> {
        instructions::initialize_player_components::handler(ctx, initial_stats)
    }

    /// Update player stats using ECS
    pub fn update_player_stats_ecs(
        ctx: Context<UpdatePlayerStatsEcs>,
        experience_gained: u32,
    ) -> Result<()> {
        instructions::update_player_stats_ecs::handler(ctx, experience_gained)
    }

    /// Emergency stop with cross-chain coordination
    pub fn emergency_stop_match_er(ctx: Context<EmergencyStopMatchEr>) -> Result<()> {
        instructions::emergency_stop_match_er::handler(ctx)
    }
}

#[derive(Accounts)]
pub struct InitializeGameEr<'info> {
    #[account(
        init,
        payer = authority,
        space = GameStateEr::LEN,
        seeds = [b"game_state_er"],
        bump
    )]
    pub game_state_er: Account<'info, GameStateEr>,
    
    #[account(
        init,
        payer = authority,
        space = DelegationState::LEN,
        seeds = [b"delegation", authority.key().as_ref()],
        bump
    )]
    pub delegation_state: Account<'info, DelegationState>,

    #[account(
        init,
        payer = authority,
        space = RouterConfig::LEN,
        seeds = [b"router_config"],
        bump
    )]
    pub router_config: Account<'info, RouterConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(username: String)]
pub struct RegisterPlayerEr<'info> {
    #[account(
        init,
        payer = player,
        space = PlayerProfileEr::LEN,
        seeds = [b"player_er", player.key().as_ref()],
        bump
    )]
    pub player_profile_er: Account<'info, PlayerProfileEr>,

    // BOLT ECS Components
    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<Position>(),
        seeds = [b"position", player.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<Health>(),
        seeds = [b"health", player.key().as_ref()],
        bump
    )]
    pub health: Account<'info, Health>,

    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<Mana>(),
        seeds = [b"mana", player.key().as_ref()],
        bump
    )]
    pub mana: Account<'info, Mana>,

    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<PlayerStats>(),
        seeds = [b"player_stats", player.key().as_ref()],
        bump
    )]
    pub player_stats: Account<'info, PlayerStats>,
    
    #[account(mut)]
    pub player: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateMatchEr<'info> {
    #[account(
        init,
        payer = creator,
        space = MatchEr::LEN,
        seeds = [b"match_er", creator.key().as_ref(), &Clock::get()?.unix_timestamp.to_le_bytes()],
        bump
    )]
    pub match_er: Account<'info, MatchEr>,

    #[account(
        init,
        payer = creator,
        space = 8 + std::mem::size_of::<MatchState>(),
        seeds = [b"match_state", match_er.key().as_ref()],
        bump
    )]
    pub match_state: Account<'info, MatchState>,
    
    #[account(
        mut,
        seeds = [b"player_er", creator.key().as_ref()],
        bump
    )]
    pub creator_profile: Account<'info, PlayerProfileEr>,
    
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"delegation", creator.key().as_ref()],
        bump
    )]
    pub delegation_state: Account<'info, DelegationState>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinMatchEr<'info> {
    #[account(
        mut,
        seeds = [b"match_er", match_er.creator.as_ref(), &match_er.created_at.to_le_bytes()],
        bump = match_er.bump
    )]
    pub match_er: Account<'info, MatchEr>,

    #[account(
        mut,
        seeds = [b"match_state", match_er.key().as_ref()],
        bump
    )]
    pub match_state: Account<'info, MatchState>,

    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<PlayerInMatch>(),
        seeds = [b"player_in_match", match_er.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_in_match: Account<'info, PlayerInMatch>,
    
    #[account(
        mut,
        seeds = [b"player_er", player.key().as_ref()],
        bump
    )]
    pub player_profile: Account<'info, PlayerProfileEr>,
    
    #[account(mut)]
    pub player: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteActionEr<'info> {
    #[account(
        mut,
        seeds = [b"match_er", match_er.creator.as_ref(), &match_er.created_at.to_le_bytes()],
        bump = match_er.bump
    )]
    pub match_er: Account<'info, MatchEr>,

    #[account(
        mut,
        seeds = [b"match_state", match_er.key().as_ref()],
        bump
    )]
    pub match_state: Account<'info, MatchState>,

    // Attacker components
    #[account(
        mut,
        seeds = [b"health", player.key().as_ref()],
        bump
    )]
    pub attacker_health: Account<'info, Health>,

    #[account(
        mut,
        seeds = [b"mana", player.key().as_ref()],
        bump
    )]
    pub attacker_mana: Account<'info, Mana>,

    #[account(
        mut,
        seeds = [b"player_stats", player.key().as_ref()],
        bump
    )]
    pub attacker_stats: Account<'info, PlayerStats>,

    #[account(
        init_if_needed,
        payer = player,
        space = 8 + std::mem::size_of::<Combat>(),
        seeds = [b"combat", player.key().as_ref()],
        bump
    )]
    pub attacker_combat: Account<'info, Combat>,

    // Target components (when applicable)
    /// CHECK: Target player for combat
    pub target_player: UncheckedAccount<'info>,

    #[account(mut)]
    pub player: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

// Additional account contexts...
#[derive(Accounts)]
pub struct StartMatchEr<'info> {
    #[account(
        mut,
        seeds = [b"match_er", match_er.creator.as_ref(), &match_er.created_at.to_le_bytes()],
        bump = match_er.bump
    )]
    pub match_er: Account<'info, MatchEr>,

    #[account(
        mut,
        seeds = [b"match_state", match_er.key().as_ref()],
        bump
    )]
    pub match_state: Account<'info, MatchState>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct EndTurnEr<'info> {
    #[account(
        mut,
        seeds = [b"match_er", match_er.creator.as_ref(), &match_er.created_at.to_le_bytes()],
        bump = match_er.bump
    )]
    pub match_er: Account<'info, MatchEr>,

    #[account(
        mut,
        seeds = [b"match_state", match_er.key().as_ref()],
        bump
    )]
    pub match_state: Account<'info, MatchState>,

    #[account(mut)]
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct FinishMatchEr<'info> {
    #[account(
        mut,
        seeds = [b"match_er", match_er.creator.as_ref(), &match_er.created_at.to_le_bytes()],
        bump = match_er.bump
    )]
    pub match_er: Account<'info, MatchEr>,

    #[account(
        mut,
        seeds = [b"match_state", match_er.key().as_ref()],
        bump
    )]
    pub match_state: Account<'info, MatchState>,

    #[account(
        mut,
        seeds = [b"delegation", match_er.creator.as_ref()],
        bump
    )]
    pub delegation_state: Account<'info, DelegationState>,

    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DelegateGameState<'info> {
    #[account(
        mut,
        seeds = [b"delegation", delegator.key().as_ref()],
        bump = delegation_state.bump
    )]
    pub delegation_state: Account<'info, DelegationState>,

    /// CHECK: Ephemeral rollup program
    pub ephemeral_rollup: UncheckedAccount<'info>,

    #[account(mut)]
    pub delegator: Signer<'info>,
}

#[derive(Accounts)]
pub struct CommitErResults<'info> {
    #[account(
        mut,
        seeds = [b"delegation", delegator.key().as_ref()],
        bump = delegation_state.bump
    )]
    pub delegation_state: Account<'info, DelegationState>,

    /// CHECK: Mainnet game program
    pub mainnet_game_program: UncheckedAccount<'info>,

    #[account(mut)]
    pub delegator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RollbackErState<'info> {
    #[account(
        mut,
        seeds = [b"delegation", delegator.key().as_ref()],
        bump = delegation_state.bump
    )]
    pub delegation_state: Account<'info, DelegationState>,

    #[account(mut)]
    pub delegator: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializePlayerComponents<'info> {
    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<Position>(),
        seeds = [b"position", player.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<Health>(),
        seeds = [b"health", player.key().as_ref()],
        bump
    )]
    pub health: Account<'info, Health>,

    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<Mana>(),
        seeds = [b"mana", player.key().as_ref()],
        bump
    )]
    pub mana: Account<'info, Mana>,

    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<PlayerStats>(),
        seeds = [b"player_stats", player.key().as_ref()],
        bump
    )]
    pub player_stats: Account<'info, PlayerStats>,

    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<Equipment>(),
        seeds = [b"equipment", player.key().as_ref()],
        bump
    )]
    pub equipment: Account<'info, Equipment>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePlayerStatsEcs<'info> {
    #[account(
        mut,
        seeds = [b"player_stats", player.key().as_ref()],
        bump
    )]
    pub player_stats: Account<'info, PlayerStats>,

    #[account(
        mut,
        seeds = [b"player_er", player.key().as_ref()],
        bump
    )]
    pub player_profile: Account<'info, PlayerProfileEr>,

    #[account(mut)]
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct EmergencyStopMatchEr<'info> {
    #[account(
        mut,
        seeds = [b"match_er", match_er.creator.as_ref(), &match_er.created_at.to_le_bytes()],
        bump = match_er.bump
    )]
    pub match_er: Account<'info, MatchEr>,

    #[account(
        mut,
        seeds = [b"match_state", match_er.key().as_ref()],
        bump
    )]
    pub match_state: Account<'info, MatchState>,

    #[account(
        seeds = [b"game_state_er"],
        bump,
        constraint = game_state_er.upgrade_authority == authority.key()
    )]
    pub game_state_er: Account<'info, GameStateEr>,

    #[account(
        mut,
        seeds = [b"delegation", match_er.creator.as_ref()],
        bump
    )]
    pub delegation_state: Account<'info, DelegationState>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Data structures for ER results
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MatchResults {
    pub match_id: u64,
    pub winner: Option<Pubkey>,
    pub final_players: Vec<FinalPlayerResult>,
    pub total_damage_dealt: u64,
    pub match_duration: i64,
    pub experience_rewards: Vec<(Pubkey, u32)>,
    pub token_rewards: Vec<(Pubkey, u64)>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct FinalPlayerResult {
    pub player: Pubkey,
    pub final_health: u32,
    pub damage_dealt: u32,
    pub damage_taken: u32,
    pub actions_taken: u32,
    pub placement: u8,
}