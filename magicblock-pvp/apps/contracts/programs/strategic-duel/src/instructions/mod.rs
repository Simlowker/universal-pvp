use anchor_lang::prelude::*;
use bolt_lang::*;
use crate::components::*;

pub mod create_duel;
pub mod join_duel;
pub mod make_action;
pub mod advance_round;
pub mod resolve_game;
pub mod settle_game;

pub use create_duel::*;
pub use join_duel::*;
pub use make_action::*;
pub use advance_round::*;
pub use resolve_game::*;
pub use settle_game::*;

/// CreateDuel - Initialize a new duel game
#[derive(Accounts)]
pub struct CreateDuel<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: World PDA
    #[account(mut)]
    pub world: AccountInfo<'info>,

    /// CHECK: Entity for the duel
    #[account(mut)]
    pub entity: AccountInfo<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + std::mem::size_of::<DuelComponent>(),
        seeds = [b"duel", entity.key().as_ref()],
        bump
    )]
    pub duel: Account<'info, ComponentData<DuelComponent>>,

    #[account(
        init,
        payer = creator,
        space = 8 + std::mem::size_of::<BettingComponent>(),
        seeds = [b"betting", entity.key().as_ref()],
        bump
    )]
    pub betting: Account<'info, ComponentData<BettingComponent>>,

    #[account(
        init,
        payer = creator,
        space = 8 + std::mem::size_of::<PlayerComponent>(),
        seeds = [b"player", creator.key().as_ref(), entity.key().as_ref()],
        bump
    )]
    pub creator_player: Account<'info, ComponentData<PlayerComponent>>,

    #[account(
        init,
        payer = creator,
        space = 8 + std::mem::size_of::<PsychProfileComponent>(),
        seeds = [b"psych", creator.key().as_ref()],
        bump
    )]
    pub creator_psych: Account<'info, ComponentData<PsychProfileComponent>>,

    pub system_program: Program<'info, System>,
}

/// JoinDuel - Player joins an existing duel
#[derive(Accounts)]
pub struct JoinDuel<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    /// CHECK: World PDA
    #[account(mut)]
    pub world: AccountInfo<'info>,

    /// CHECK: Entity for the duel
    #[account(mut)]
    pub entity: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"duel", entity.key().as_ref()],
        bump
    )]
    pub duel: Account<'info, ComponentData<DuelComponent>>,

    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<PlayerComponent>(),
        seeds = [b"player", player.key().as_ref(), entity.key().as_ref()],
        bump
    )]
    pub player_component: Account<'info, ComponentData<PlayerComponent>>,

    #[account(
        init_if_needed,
        payer = player,
        space = 8 + std::mem::size_of::<PsychProfileComponent>(),
        seeds = [b"psych", player.key().as_ref()],
        bump
    )]
    pub player_psych: Account<'info, ComponentData<PsychProfileComponent>>,

    pub system_program: Program<'info, System>,
}

/// ActionProcessing - Process player actions
#[derive(Accounts)]
pub struct ActionProcessing<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    /// CHECK: World PDA
    #[account(mut)]
    pub world: AccountInfo<'info>,

    /// CHECK: Entity for the action
    #[account(mut)]
    pub entity: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"duel", entity.key().as_ref()],
        bump
    )]
    pub duel: Account<'info, ComponentData<DuelComponent>>,

    #[account(
        mut,
        seeds = [b"player", player.key().as_ref(), entity.key().as_ref()],
        bump
    )]
    pub player: Account<'info, ComponentData<PlayerComponent>>,

    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<ActionComponent>(),
        seeds = [b"action", player.key().as_ref(), entity.key().as_ref()],
        bump
    )]
    pub action: Account<'info, ComponentData<ActionComponent>>,

    #[account(
        mut,
        seeds = [b"betting", entity.key().as_ref()],
        bump
    )]
    pub betting: Account<'info, ComponentData<BettingComponent>>,

    #[account(
        mut,
        seeds = [b"psych", player.key().as_ref()],
        bump
    )]
    pub psych_profile: Account<'info, ComponentData<PsychProfileComponent>>,

    pub system_program: Program<'info, System>,
}

/// RoundProgression - Advance game rounds
#[derive(Accounts)]
pub struct RoundProgression<'info> {
    /// CHECK: Authority to advance rounds (could be any player or automated)
    pub authority: Signer<'info>,

    /// CHECK: World PDA
    #[account(mut)]
    pub world: AccountInfo<'info>,

    /// CHECK: Entity for the duel
    #[account(mut)]
    pub entity: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"duel", entity.key().as_ref()],
        bump
    )]
    pub duel: Account<'info, ComponentData<DuelComponent>>,

    #[account(
        mut,
        seeds = [b"betting", entity.key().as_ref()],
        bump
    )]
    pub betting: Account<'info, ComponentData<BettingComponent>>,
}

/// VrfResolution - Resolve game with VRF
#[derive(Accounts)]
pub struct VrfResolution<'info> {
    /// CHECK: VRF authority
    pub vrf_authority: Signer<'info>,

    /// CHECK: World PDA
    #[account(mut)]
    pub world: AccountInfo<'info>,

    /// CHECK: Entity for the duel
    #[account(mut)]
    pub entity: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"duel", entity.key().as_ref()],
        bump
    )]
    pub duel: Account<'info, ComponentData<DuelComponent>>,

    #[account(
        mut,
        seeds = [b"betting", entity.key().as_ref()],
        bump
    )]
    pub betting: Account<'info, ComponentData<BettingComponent>>,
}

/// PsychologicalAnalysis - Analyze player behavior
#[derive(Accounts)]
pub struct PsychologicalAnalysis<'info> {
    /// CHECK: Analysis authority
    pub authority: Signer<'info>,

    /// CHECK: World PDA
    #[account(mut)]
    pub world: AccountInfo<'info>,

    /// CHECK: Entity for analysis
    #[account(mut)]
    pub entity: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"psych", entity.key().as_ref()],
        bump
    )]
    pub psych_profile: Account<'info, ComponentData<PsychProfileComponent>>,

    #[account(
        seeds = [b"player", entity.key().as_ref()],
        bump
    )]
    pub player: Account<'info, ComponentData<PlayerComponent>>,

    #[account(
        seeds = [b"betting", entity.key().as_ref()],
        bump
    )]
    pub betting: Account<'info, ComponentData<BettingComponent>>,
}

/// Settlement - Settle completed game
#[derive(Accounts)]
pub struct Settlement<'info> {
    /// CHECK: Settlement authority
    pub authority: Signer<'info>,

    /// CHECK: World PDA
    #[account(mut)]
    pub world: AccountInfo<'info>,

    /// CHECK: Entity for the duel
    #[account(mut)]
    pub entity: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"duel", entity.key().as_ref()],
        bump
    )]
    pub duel: Account<'info, ComponentData<DuelComponent>>,

    #[account(
        mut,
        seeds = [b"betting", entity.key().as_ref()],
        bump
    )]
    pub betting: Account<'info, ComponentData<BettingComponent>>,

    #[account(
        mut,
        seeds = [b"player", duel.load()?.winner.unwrap().as_ref(), entity.key().as_ref()],
        bump
    )]
    pub winner_player: Account<'info, ComponentData<PlayerComponent>>,

    #[account(
        mut,
        seeds = [b"player", get_loser_key(&duel.load()?).as_ref(), entity.key().as_ref()],
        bump
    )]
    pub loser_player: Account<'info, ComponentData<PlayerComponent>>,

    /// CHECK: Treasury account for rake collection
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

// Helper function to get loser key
fn get_loser_key(duel: &DuelComponent) -> Pubkey {
    if let Some(winner) = duel.winner {
        if winner == duel.player_one {
            duel.player_two
        } else {
            duel.player_one
        }
    } else {
        Pubkey::default()
    }
}

/// Instruction parameters
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateDuelParams {
    pub max_rounds: u8,
    pub min_bet: u64,
    pub max_bet: u64,
    pub timeout_duration: i64,
    pub entry_fee: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct JoinDuelParams {
    pub entry_fee: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ActionParams {
    pub action_type: ActionType,
    pub bet_amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct VrfParams {
    pub vrf_proof: [u8; 64],
    pub vrf_randomness: [u8; 32],
}

/// Instruction implementations
impl<'info> CreateDuel<'info> {
    pub fn process(&mut self, params: CreateDuelParams) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Generate unique duel ID
        let duel_id = clock.unix_timestamp as u64;

        // Initialize duel component
        let mut duel = self.duel.load_init()?;
        duel.duel_id = duel_id;
        duel.player_one = self.creator.key();
        duel.player_two = Pubkey::default(); // Will be set when second player joins
        duel.current_round = 0;
        duel.max_rounds = params.max_rounds;
        duel.game_state = GameState::WaitingForPlayers;
        duel.start_time = current_time;
        duel.last_action_time = current_time;
        duel.timeout_duration = params.timeout_duration;
        duel.vrf_seed = generate_vrf_seed(duel_id);

        // Initialize betting component
        let mut betting = self.betting.load_init()?;
        betting.duel_id = duel_id;
        betting.min_bet = params.min_bet;
        betting.max_bet = params.max_bet;
        betting.total_pot = params.entry_fee;

        // Initialize creator's player component
        let mut player = self.creator_player.load_init()?;
        player.player_id = self.creator.key();
        player.duel_id = duel_id;
        player.chip_count = 10000; // Starting chips
        player.is_active = true;
        player.position = PlayerPosition::Small;
        player.last_seen = current_time;

        // Initialize psychological profile
        let mut psych = self.creator_psych.load_init()?;
        psych.player = self.creator.key();
        psych.avg_decision_time = 5000; // 5 seconds default
        psych.consistency_rating = 500; // Neutral starting rating

        Ok(())
    }
}

impl<'info> JoinDuel<'info> {
    pub fn process(&mut self, params: JoinDuelParams) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Load and update duel
        let mut duel = self.duel.load_mut()?;
        require!(duel.game_state == GameState::WaitingForPlayers, GameError::InvalidGameState);
        require!(duel.player_two == Pubkey::default(), GameError::DuelAlreadyFull);

        duel.player_two = self.player.key();
        duel.game_state = GameState::InProgress;

        // Initialize joining player's component
        let mut player = self.player_component.load_init()?;
        player.player_id = self.player.key();
        player.duel_id = duel.duel_id;
        player.chip_count = 10000; // Starting chips
        player.is_active = true;
        player.position = PlayerPosition::Big;
        player.last_seen = current_time;

        // Initialize or load psychological profile
        let mut psych = self.player_psych.load_init()?;
        if psych.player == Pubkey::default() {
            psych.player = self.player.key();
            psych.avg_decision_time = 5000;
            psych.consistency_rating = 500;
        }

        Ok(())
    }
}

/// Helper functions
fn generate_vrf_seed(duel_id: u64) -> [u8; 32] {
    let mut seed = [0u8; 32];
    let clock = Clock::get().unwrap();
    let timestamp_bytes = clock.unix_timestamp.to_le_bytes();
    let duel_bytes = duel_id.to_le_bytes();
    
    seed[0..8].copy_from_slice(&timestamp_bytes);
    seed[8..16].copy_from_slice(&duel_bytes);
    
    // Fill remaining with pseudo-random data
    for i in 16..32 {
        seed[i] = ((duel_id + i as u64) % 256) as u8;
    }
    
    seed
}

#[error_code]
pub enum GameError {
    #[msg("Invalid game state for this action")]
    InvalidGameState,
    #[msg("Duel is already full")]
    DuelAlreadyFull,
    #[msg("Player is not active")]
    PlayerInactive,
    #[msg("Action timeout exceeded")]
    ActionTimeout,
    #[msg("Cannot check - must call or raise")]
    CannotCheck,
    #[msg("Insufficient chips for this action")]
    InsufficientChips,
    #[msg("Invalid raise amount")]
    InvalidRaise,
    #[msg("Invalid action type")]
    InvalidActionType,
    #[msg("No chips available for all-in")]
    NoChipsToAllIn,
    #[msg("No resolution pending")]
    NoResolutionPending,
    #[msg("No winner determined")]
    NoWinnerDetermined,
    #[msg("Game already settled")]
    AlreadySettled,
}