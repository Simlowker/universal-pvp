use anchor_lang::prelude::*;
use bolt_lang::*;

pub mod components;
pub mod systems;
pub mod instructions;

pub use components::*;
pub use systems::*;
pub use instructions::*;

declare_id!("4afPz2WpaejNd2TrnneC4ybC7Us86WBqkJyQa7pnkkdr");

#[program]
pub mod strategic_duel {
    use super::*;

    /// Initialize a new Strategic Duel game
    pub fn create_duel(
        ctx: Context<CreateDuel>,
        params: CreateDuelParams,
    ) -> Result<()> {
        msg!("Creating new Strategic Duel with ID: {}", Clock::get()?.unix_timestamp);
        
        // Validate parameters
        require!(params.max_rounds > 0 && params.max_rounds <= 10, GameError::InvalidGameState);
        require!(params.min_bet > 0 && params.min_bet <= params.max_bet, GameError::InvalidRaise);
        require!(params.timeout_duration >= 30 && params.timeout_duration <= 300, GameError::ActionTimeout);
        
        ctx.accounts.process(params)
    }

    /// Join an existing duel as the second player
    pub fn join_duel(
        ctx: Context<JoinDuel>,
        params: JoinDuelParams,
    ) -> Result<()> {
        msg!("Player joining duel: {}", ctx.accounts.player.key());
        ctx.accounts.process(params)
    }

    /// Process a player action (CHECK, RAISE, CALL, FOLD)
    pub fn make_action(
        ctx: Context<ActionProcessing>,
        action_type: ActionType,
        bet_amount: u64,
    ) -> Result<()> {
        msg!("Processing action: {:?} with amount: {}", action_type, bet_amount);
        
        // Validate action parameters
        match action_type {
            ActionType::Raise => {
                require!(bet_amount > 0, GameError::InvalidRaise);
            },
            ActionType::Call | ActionType::Check | ActionType::Fold => {
                // These actions don't require bet validation
            },
            ActionType::AllIn => {
                // All-in doesn't need amount validation as it uses all chips
            },
            _ => return Err(GameError::InvalidActionType.into()),
        }

        action_processing::execute(ctx, action_type, bet_amount)
    }

    /// Advance to the next round
    pub fn advance_round(ctx: Context<RoundProgression>) -> Result<()> {
        msg!("Advancing round for duel");
        round_progression::execute(ctx)
    }

    /// Resolve game using VRF for fair randomness
    pub fn resolve_with_vrf(
        ctx: Context<VrfResolution>,
        vrf_proof: [u8; 64],
    ) -> Result<()> {
        msg!("Resolving game with VRF");
        vrf_resolution::execute(ctx, vrf_proof)
    }

    /// VRF attestation with TEE verification for MagicBlock
    pub fn attest_vrf(
        ctx: Context<VrfAttestation>,
        vrf_proof: [u8; 64],
        vrf_randomness: [u8; 32],
        tee_attestation: [u8; 256],
        weights_hash: [u8; 32],
        transcript_hash: [u8; 32],
    ) -> Result<()> {
        msg!("Processing VRF attestation with TEE verification");
        ctx.accounts.process(vrf_proof, vrf_randomness, tee_attestation, weights_hash, transcript_hash)
    }

    /// Rollup settlement with L1 mapping
    pub fn settle_rollup(
        ctx: Context<RollupSettlement>,
        rollup_block_height: u64,
        l1_block_height: u64,
        winner_proof: [u8; 256],
        validator_signatures: Vec<[u8; 64]>,
    ) -> Result<()> {
        msg!("Processing rollup settlement");
        ctx.accounts.process(rollup_block_height, l1_block_height, winner_proof, validator_signatures)
    }

    /// Delegate state to Ephemeral Rollup
    pub fn delegate_to_rollup(
        ctx: Context<EphemeralRollupDelegation>,
        rollup_duration: i64,
        delegation_proof: [u8; 256],
    ) -> Result<()> {
        msg!("Delegating state to ephemeral rollup");
        ctx.accounts.delegate_to_rollup(rollup_duration, delegation_proof)
    }

    /// Create state transition in rollup
    pub fn create_state_transition(
        ctx: Context<EphemeralRollupDelegation>,
        from_state: GameState,
        to_state: GameState,
        transition_data: [u8; 256],
        merkle_proof: [u8; 256],
    ) -> Result<()> {
        msg!("Creating state transition in rollup");
        ctx.accounts.create_state_transition(from_state, to_state, transition_data, merkle_proof)
    }

    /// Finalize ephemeral rollup
    pub fn finalize_rollup(ctx: Context<EphemeralRollupDelegation>) -> Result<()> {
        msg!("Finalizing ephemeral rollup");
        ctx.accounts.finalize_rollup()
    }

    /// Emergency exit from rollup
    pub fn emergency_exit_rollup(ctx: Context<EphemeralRollupDelegation>) -> Result<()> {
        msg!("Emergency exit from rollup");
        ctx.accounts.emergency_exit()
    }

    /// Update psychological analysis for a player
    pub fn analyze_psychology(ctx: Context<PsychologicalAnalysis>) -> Result<()> {
        msg!("Updating psychological analysis");
        psychological_analysis::execute(ctx)
    }

    /// Settle the completed game and distribute payouts
    pub fn settle_game(ctx: Context<Settlement>) -> Result<()> {
        msg!("Settling completed game");
        settlement::execute(ctx)
    }

    /// Emergency functions for game management
    
    /// Cancel a duel (only if still waiting for players)
    pub fn cancel_duel(ctx: Context<CancelDuel>) -> Result<()> {
        let mut duel = ctx.accounts.duel.load_mut()?;
        require!(duel.game_state == GameState::WaitingForPlayers, GameError::InvalidGameState);
        
        duel.game_state = GameState::Cancelled;
        
        emit!(DuelCancelledEvent {
            duel_id: duel.duel_id,
            cancelled_by: ctx.accounts.authority.key(),
        });
        
        Ok(())
    }

    /// Handle timeout scenarios
    pub fn handle_timeout(ctx: Context<HandleTimeout>) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        
        let mut duel = ctx.accounts.duel.load_mut()?;
        let mut player = ctx.accounts.player.load_mut()?;
        
        require!(duel.is_timeout_exceeded(current_time), GameError::ActionTimeout);
        require!(player.is_active, GameError::PlayerInactive);
        
        // Timeout defaults to FOLD
        player.is_active = false;
        duel.game_state = GameState::ResolutionPending;
        duel.last_action_time = current_time;
        
        emit!(TimeoutEvent {
            duel_id: duel.duel_id,
            player: player.player_id,
            timeout_at: current_time,
        });
        
        Ok(())
    }

    /// Get game statistics for analytics
    pub fn get_game_stats(ctx: Context<GetGameStats>) -> Result<GameStatsResult> {
        let duel = ctx.accounts.duel.load()?;
        let betting = ctx.accounts.betting.load()?;
        let player_one = ctx.accounts.player_one.load()?;
        let player_two = ctx.accounts.player_two.load()?;
        
        Ok(GameStatsResult {
            duel_id: duel.duel_id,
            current_round: duel.current_round,
            game_state: duel.game_state,
            total_pot: betting.total_pot,
            player_one_chips: player_one.chip_count,
            player_two_chips: player_two.chip_count,
            winner: duel.winner,
        })
    }
}

/// BOLT ECS Integration - World initialization
pub fn initialize_bolt_world(ctx: Context<InitializeBoltWorld>) -> Result<()> {
    msg!("Initializing BOLT ECS World for Strategic Duel");
    
    let mut world = ctx.accounts.world.load_init()?;
    world.entity_counter = 0;
    world.component_registry = ComponentRegistry::new();
    world.system_registry = SystemRegistry::new();
    world.authority = ctx.accounts.authority.key();
    world.max_entities = 10000;
    world.is_active = true;
    
    emit!(BoltWorldInitializedEvent {
        world: ctx.accounts.world.key(),
        authority: world.authority,
        max_entities: world.max_entities,
    });
    
    Ok()
}

/// Additional account contexts for new instructions

#[derive(Accounts)]
pub struct InitializeBoltWorld<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<BoltWorldComponent>(),
        seeds = [b"world"],
        bump
    )]
    pub world: Account<'info, ComponentData<BoltWorldComponent>>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelDuel<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"duel", entity.key().as_ref()],
        bump
    )]
    pub duel: Account<'info, ComponentData<DuelComponent>>,

    /// CHECK: Entity reference
    pub entity: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct HandleTimeout<'info> {
    /// CHECK: Can be any signer to handle timeout
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"duel", entity.key().as_ref()],
        bump
    )]
    pub duel: Account<'info, ComponentData<DuelComponent>>,

    #[account(
        mut,
        seeds = [b"player", player_key.as_ref(), entity.key().as_ref()],
        bump
    )]
    pub player: Account<'info, ComponentData<PlayerComponent>>,

    /// CHECK: Entity reference
    pub entity: AccountInfo<'info>,
    
    /// CHECK: Player key for seeds
    pub player_key: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct GetGameStats<'info> {
    #[account(
        seeds = [b"duel", entity.key().as_ref()],
        bump
    )]
    pub duel: Account<'info, ComponentData<DuelComponent>>,

    #[account(
        seeds = [b"betting", entity.key().as_ref()],
        bump
    )]
    pub betting: Account<'info, ComponentData<BettingComponent>>,

    #[account(
        seeds = [b"player", duel.load()?.player_one.as_ref(), entity.key().as_ref()],
        bump
    )]
    pub player_one: Account<'info, ComponentData<PlayerComponent>>,

    #[account(
        seeds = [b"player", duel.load()?.player_two.as_ref(), entity.key().as_ref()],
        bump
    )]
    pub player_two: Account<'info, ComponentData<PlayerComponent>>,

    /// CHECK: Entity reference
    pub entity: AccountInfo<'info>,
}

/// Return types and additional events

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct GameStatsResult {
    pub duel_id: u64,
    pub current_round: u8,
    pub game_state: GameState,
    pub total_pot: u64,
    pub player_one_chips: u64,
    pub player_two_chips: u64,
    pub winner: Option<Pubkey>,
}

/// BOLT ECS World Component
#[component]
#[derive(Default)]
pub struct BoltWorldComponent {
    pub entity_counter: u64,
    pub component_registry: ComponentRegistry,
    pub system_registry: SystemRegistry,
    pub authority: Pubkey,
    pub max_entities: u64,
    pub is_active: bool,
    pub last_updated: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ComponentRegistry {
    pub registered_components: Vec<ComponentInfo>,
    pub total_components: u32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SystemRegistry {
    pub registered_systems: Vec<SystemInfo>,
    pub total_systems: u32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ComponentInfo {
    pub component_id: u32,
    pub component_name: String,
    pub size: usize,
    pub is_active: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SystemInfo {
    pub system_id: u32,
    pub system_name: String,
    pub dependencies: Vec<u32>,
    pub is_active: bool,
}

impl ComponentRegistry {
    pub fn new() -> Self {
        Self {
            registered_components: vec![
                ComponentInfo {
                    component_id: 1,
                    component_name: "DuelComponent".to_string(),
                    size: std::mem::size_of::<DuelComponent>(),
                    is_active: true,
                },
                ComponentInfo {
                    component_id: 2,
                    component_name: "PlayerComponent".to_string(),
                    size: std::mem::size_of::<PlayerComponent>(),
                    is_active: true,
                },
                ComponentInfo {
                    component_id: 3,
                    component_name: "BettingComponent".to_string(),
                    size: std::mem::size_of::<BettingComponent>(),
                    is_active: true,
                },
                ComponentInfo {
                    component_id: 4,
                    component_name: "VrfAttestationComponent".to_string(),
                    size: std::mem::size_of::<VrfAttestationComponent>(),
                    is_active: true,
                },
                ComponentInfo {
                    component_id: 5,
                    component_name: "RollupSettlementComponent".to_string(),
                    size: std::mem::size_of::<RollupSettlementComponent>(),
                    is_active: true,
                },
                ComponentInfo {
                    component_id: 6,
                    component_name: "EphemeralRollupComponent".to_string(),
                    size: std::mem::size_of::<EphemeralRollupComponent>(),
                    is_active: true,
                },
            ],
            total_components: 6,
        }
    }
}

impl SystemRegistry {
    pub fn new() -> Self {
        Self {
            registered_systems: vec![
                SystemInfo {
                    system_id: 1,
                    system_name: "ActionProcessingSystem".to_string(),
                    dependencies: vec![1, 2, 3], // DuelComponent, PlayerComponent, BettingComponent
                    is_active: true,
                },
                SystemInfo {
                    system_id: 2,
                    system_name: "VrfResolutionSystem".to_string(),
                    dependencies: vec![1, 4], // DuelComponent, VrfAttestationComponent
                    is_active: true,
                },
                SystemInfo {
                    system_id: 3,
                    system_name: "RollupSettlementSystem".to_string(),
                    dependencies: vec![1, 3, 4, 5], // DuelComponent, BettingComponent, VrfAttestationComponent, RollupSettlementComponent
                    is_active: true,
                },
                SystemInfo {
                    system_id: 4,
                    system_name: "EphemeralRollupSystem".to_string(),
                    dependencies: vec![1, 6], // DuelComponent, EphemeralRollupComponent
                    is_active: true,
                },
            ],
            total_systems: 4,
        }
    }
}

#[event]
pub struct DuelCancelledEvent {
    pub duel_id: u64,
    pub cancelled_by: Pubkey,
}

#[event]
pub struct TimeoutEvent {
    pub duel_id: u64,
    pub player: Pubkey,
    pub timeout_at: i64,
}

#[event]
pub struct BoltWorldInitializedEvent {
    pub world: Pubkey,
    pub authority: Pubkey,
    pub max_entities: u64,
}

/// World and Entity initialization helpers

pub fn initialize_world() -> Result<()> {
    msg!("Initializing Strategic Duel World");
    Ok(())
}

pub fn create_entity() -> Result<u64> {
    let clock = Clock::get()?;
    let entity_id = clock.unix_timestamp as u64;
    msg!("Creating entity with ID: {}", entity_id);
    Ok(entity_id)
}

/// Constants for game configuration
pub const MAX_PLAYERS_PER_DUEL: u8 = 2;
pub const DEFAULT_TIMEOUT_SECONDS: i64 = 60;
pub const MAX_ROUNDS: u8 = 10;
pub const DEFAULT_RAKE_BPS: u16 = 250; // 2.5%
pub const STARTING_CHIPS: u64 = 10000;
pub const MIN_BET: u64 = 100;
pub const MAX_BET: u64 = 1000000;

// MagicBlock specific constants
pub const VRF_PROOF_SIZE: usize = 64;
pub const VRF_RANDOMNESS_SIZE: usize = 32;
pub const TEE_ATTESTATION_SIZE: usize = 256;
pub const WEIGHTS_HASH_SIZE: usize = 32;
pub const TRANSCRIPT_HASH_SIZE: usize = 32;
pub const ROLLUP_PROOF_SIZE: usize = 256;
pub const OPTIMISTIC_TIMEOUT: i64 = 24 * 60 * 60; // 24 hours
pub const CHALLENGE_WINDOW: i64 = 5 * 60; // 5 minutes
pub const MAX_VALIDATOR_SIGNATURES: usize = 10;
pub const DEFAULT_SESSION_DURATION: i64 = 2 * 60 * 60; // 2 hours

/// Game configuration structure
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct GameConfig {
    pub max_rounds: u8,
    pub timeout_duration: i64,
    pub min_bet: u64,
    pub max_bet: u64,
    pub rake_bps: u16,
    pub starting_chips: u64,
}

impl Default for GameConfig {
    fn default() -> Self {
        Self {
            max_rounds: MAX_ROUNDS,
            timeout_duration: DEFAULT_TIMEOUT_SECONDS,
            min_bet: MIN_BET,
            max_bet: MAX_BET,
            rake_bps: DEFAULT_RAKE_BPS,
            starting_chips: STARTING_CHIPS,
        }
    }
}

/// Utility functions for game logic
pub mod utils {
    use super::*;

    pub fn calculate_pot_odds(pot_size: u64, bet_to_call: u64) -> f64 {
        if bet_to_call == 0 {
            return 0.0;
        }
        pot_size as f64 / (pot_size + bet_to_call) as f64
    }

    pub fn is_valid_bet_size(bet: u64, min_bet: u64, max_bet: u64, player_chips: u64) -> bool {
        bet >= min_bet && bet <= max_bet && bet <= player_chips
    }

    pub fn calculate_elo_change(winner_rating: u32, loser_rating: u32, k_factor: u32) -> (i32, i32) {
        let expected_winner = 1.0 / (1.0 + 10.0_f64.powf((loser_rating as f64 - winner_rating as f64) / 400.0));
        let expected_loser = 1.0 - expected_winner;

        let winner_change = (k_factor as f64 * (1.0 - expected_winner)) as i32;
        let loser_change = (k_factor as f64 * (0.0 - expected_loser)) as i32;

        (winner_change, loser_change)
    }

    pub fn generate_secure_seed() -> [u8; 32] {
        let mut seed = [0u8; 32];
        let clock = Clock::get().unwrap();
        let slot = clock.slot;
        let timestamp = clock.unix_timestamp;

        // Use slot and timestamp for entropy
        seed[0..8].copy_from_slice(&slot.to_le_bytes());
        seed[8..16].copy_from_slice(&timestamp.to_le_bytes());

        // Fill remaining bytes with derived values
        for i in 16..32 {
            seed[i] = ((slot + timestamp as u64 + i as u64) % 256) as u8;
        }

        seed
    }
}

/// Tests module
#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::*;

    #[test]
    fn test_pot_odds_calculation() {
        assert_eq!(utils::calculate_pot_odds(100, 50), 100.0 / 150.0);
        assert_eq!(utils::calculate_pot_odds(0, 50), 0.0);
        assert_eq!(utils::calculate_pot_odds(100, 0), 0.0);
    }

    #[test]
    fn test_valid_bet_size() {
        assert!(utils::is_valid_bet_size(100, 50, 200, 150));
        assert!(!utils::is_valid_bet_size(25, 50, 200, 150)); // Below min
        assert!(!utils::is_valid_bet_size(250, 50, 200, 150)); // Above max
        assert!(!utils::is_valid_bet_size(200, 50, 250, 150)); // Above chips
    }

    #[test]
    fn test_elo_calculation() {
        let (winner_change, loser_change) = utils::calculate_elo_change(1200, 1200, 32);
        assert_eq!(winner_change, 16); // Expected win gives 16 points
        assert_eq!(loser_change, -16); // Expected loss loses 16 points
    }
}