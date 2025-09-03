use bolt_lang::*;
use anchor_lang::prelude::*;

mod components;
mod systems;
mod world;

pub use components::*;
pub use systems::*;
pub use world::*;

// Program ID for SolDuel BOLT implementation
declare_id!("BOLT11111111111111111111111111111111111111111");

/// SolDuel BOLT Program - Real-time PvP gaming with MagicBlock integration
#[program]
pub mod solduel_bolt {
    use super::*;

    // ========================================
    // World Management Instructions
    // ========================================

    /// Initialize the BOLT World and Component Registry
    pub fn initialize_world(ctx: Context<InitializeWorld>) -> Result<()> {
        world::initialize_world::handler(ctx)
    }

    /// Register a new component type
    pub fn register_component(
        ctx: Context<RegisterComponent>,
        component_name: String,
        component_size: u32,
    ) -> Result<()> {
        world::register_component::handler(ctx, component_name, component_size)
    }

    // ========================================
    // Entity Management Instructions
    // ========================================

    /// Create a new entity with initial components
    pub fn create_entity(
        ctx: Context<CreateEntity>,
        entity_type: EntityType,
    ) -> Result<()> {
        world::create_entity::handler(ctx, entity_type)
    }

    /// Add a component to an existing entity
    pub fn add_component(
        ctx: Context<AddComponent>,
        component_data: ComponentData,
    ) -> Result<()> {
        components::add_component::handler(ctx, component_data)
    }

    /// Update component data
    pub fn update_component(
        ctx: Context<UpdateComponent>,
        component_data: ComponentData,
    ) -> Result<()> {
        components::update_component::handler(ctx, component_data)
    }

    /// Remove a component from an entity
    pub fn remove_component(ctx: Context<RemoveComponent>) -> Result<()> {
        components::remove_component::handler(ctx)
    }

    // ========================================
    // Player Management Instructions
    // ========================================

    /// Create a new player entity with components
    pub fn create_player(
        ctx: Context<CreatePlayer>,
        username: String,
        player_class: u8,
    ) -> Result<()> {
        systems::player_system::create_player::handler(ctx, username, player_class)
    }

    /// Update player stats and information
    pub fn update_player_stats(
        ctx: Context<UpdatePlayerStats>,
        level: Option<u32>,
        experience: Option<u64>,
    ) -> Result<()> {
        systems::player_system::update_stats::handler(ctx, level, experience)
    }

    // ========================================
    // Match Management Instructions
    // ========================================

    /// Create a new match instance
    pub fn create_match(
        ctx: Context<CreateMatch>,
        max_players: u8,
        entry_fee: u64,
        turn_timeout: i64,
    ) -> Result<()> {
        systems::match_system::create_match::handler(ctx, max_players, entry_fee, turn_timeout)
    }

    /// Join an existing match
    pub fn join_match(ctx: Context<JoinMatch>) -> Result<()> {
        systems::match_system::join_match::handler(ctx)
    }

    /// Start a match when ready
    pub fn start_match(ctx: Context<StartMatch>) -> Result<()> {
        systems::match_system::start_match::handler(ctx)
    }

    /// End a match and distribute rewards
    pub fn end_match(ctx: Context<EndMatch>, winner: Option<Pubkey>) -> Result<()> {
        systems::match_system::end_match::handler(ctx, winner)
    }

    // ========================================
    // Combat System Instructions
    // ========================================

    /// Execute combat action in match
    pub fn execute_combat_action(
        ctx: Context<ExecuteCombatAction>,
        action_type: u8,
        target_entity: Pubkey,
        power: u32,
    ) -> Result<()> {
        systems::combat_system::execute_action::handler(ctx, action_type, target_entity, power)
    }

    /// Process damage and effects
    pub fn process_damage(
        ctx: Context<ProcessDamage>,
        damage: u32,
        damage_type: u8,
    ) -> Result<()> {
        systems::combat_system::process_damage::handler(ctx, damage, damage_type)
    }

    /// Apply healing to entity
    pub fn apply_healing(ctx: Context<ApplyHealing>, heal_amount: u32) -> Result<()> {
        systems::combat_system::apply_healing::handler(ctx, heal_amount)
    }

    // ========================================
    // Movement System Instructions
    // ========================================

    /// Process movement command
    pub fn process_movement(
        ctx: Context<ProcessMovement>,
        target_x: i32,
        target_y: i32,
        target_z: i32,
    ) -> Result<()> {
        systems::movement_system::process_movement::handler(ctx, target_x, target_y, target_z)
    }

    /// Teleport entity to new position
    pub fn teleport_entity(
        ctx: Context<TeleportEntity>,
        target_x: i32,
        target_y: i32,
        target_z: i32,
    ) -> Result<()> {
        systems::movement_system::teleport::handler(ctx, target_x, target_y, target_z)
    }

    /// Update facing direction
    pub fn set_facing_direction(
        ctx: Context<SetFacingDirection>,
        direction: u8,
    ) -> Result<()> {
        systems::movement_system::set_facing::handler(ctx, direction)
    }

    // ========================================
    // Session Key Instructions
    // ========================================

    /// Create session key delegation for gasless transactions
    pub fn delegate_session_key(
        ctx: Context<DelegateSessionKey>,
        session_key: Pubkey,
        permissions: u32,
        expiry: i64,
    ) -> Result<()> {
        systems::session_system::delegate_session_key::handler(ctx, session_key, permissions, expiry)
    }

    /// Revoke session key delegation
    pub fn revoke_session_key(ctx: Context<RevokeSessionKey>) -> Result<()> {
        systems::session_system::revoke_session_key::handler(ctx)
    }

    /// Execute action with session key
    pub fn execute_with_session(
        ctx: Context<ExecuteWithSession>,
        action_type: u8,
        action_data: Vec<u8>,
    ) -> Result<()> {
        systems::session_system::execute_with_session::handler(ctx, action_type, action_data)
    }

    // ========================================
    // State Delegation Instructions
    // ========================================

    /// Delegate entity state to Ephemeral Rollup
    pub fn delegate_to_ephemeral_rollup(
        ctx: Context<DelegateToER>,
        rollup_id: Pubkey,
        duration_seconds: i64,
        permissions: u32,
    ) -> Result<()> {
        systems::state_delegation::delegate_to_er::handler(ctx, rollup_id, duration_seconds, permissions)
    }

    /// Commit state changes back to mainnet
    pub fn commit_state_to_mainnet(
        ctx: Context<CommitStateToMainnet>,
        state_hash: [u8; 32],
        version: u64,
    ) -> Result<()> {
        systems::state_delegation::commit_to_mainnet::handler(ctx, state_hash, version)
    }

    /// Revoke delegation and reclaim control
    pub fn revoke_delegation(ctx: Context<RevokeDelegation>) -> Result<()> {
        systems::state_delegation::revoke_delegation::handler(ctx)
    }

    // ========================================
    // Optimistic Update Instructions
    // ========================================

    /// Create optimistic update for immediate responsiveness
    pub fn create_optimistic_update(
        ctx: Context<CreateOptimisticUpdate>,
        action_type: String,
        update_data: Vec<u8>,
        priority: u8,
    ) -> Result<()> {
        systems::optimistic_system::create_update::handler(ctx, action_type, update_data, priority)
    }

    /// Confirm optimistic update with ER result
    pub fn confirm_optimistic_update(
        ctx: Context<ConfirmOptimisticUpdate>,
        update_id: u64,
        confirmation_hash: [u8; 32],
    ) -> Result<()> {
        systems::optimistic_system::confirm_update::handler(ctx, update_id, confirmation_hash)
    }

    /// Rollback failed optimistic update
    pub fn rollback_optimistic_update(
        ctx: Context<RollbackOptimisticUpdate>,
        update_id: u64,
    ) -> Result<()> {
        systems::optimistic_system::rollback_update::handler(ctx, update_id)
    }

    // ========================================
    // System Execution Instructions
    // ========================================

    /// Execute movement system tick
    pub fn execute_movement_system(ctx: Context<ExecuteMovementSystem>) -> Result<()> {
        systems::movement_system::execute_tick::handler(ctx)
    }

    /// Execute combat system tick
    pub fn execute_combat_system(ctx: Context<ExecuteCombatSystem>) -> Result<()> {
        systems::combat_system::execute_tick::handler(ctx)
    }

    /// Execute health regeneration system
    pub fn execute_health_system(ctx: Context<ExecuteHealthSystem>) -> Result<()> {
        systems::health_system::execute_tick::handler(ctx)
    }

    /// Execute cleanup system
    pub fn execute_cleanup_system(ctx: Context<ExecuteCleanupSystem>) -> Result<()> {
        systems::cleanup_system::execute_tick::handler(ctx)
    }

    // ========================================
    // Query Instructions
    // ========================================

    /// Query entities with specific components
    pub fn query_entities(
        ctx: Context<QueryEntities>,
        component_filter: Vec<String>,
        limit: Option<u32>,
    ) -> Result<()> {
        world::query_system::handler(ctx, component_filter, limit)
    }

    /// Get entity component data
    pub fn get_entity_components(
        ctx: Context<GetEntityComponents>,
        entity_id: Pubkey,
    ) -> Result<()> {
        world::get_components::handler(ctx, entity_id)
    }
}

// ========================================
// Error Codes
// ========================================

#[error_code]
pub enum GameError {
    #[msg("Invalid game state")]
    InvalidGameState,
    
    #[msg("Player not found")]
    PlayerNotFound,
    
    #[msg("Match is full")]
    MatchFull,
    
    #[msg("Match not found")]
    MatchNotFound,
    
    #[msg("Not player's turn")]
    NotPlayerTurn,
    
    #[msg("Invalid combat action")]
    InvalidCombatAction,
    
    #[msg("Insufficient mana")]
    InsufficientMana,
    
    #[msg("Player already dead")]
    PlayerAlreadyDead,
    
    #[msg("Target out of range")]
    TargetOutOfRange,
    
    #[msg("Unauthorized action")]
    UnauthorizedAction,
    
    #[msg("Session key expired")]
    SessionKeyExpired,
    
    #[msg("Invalid session key")]
    InvalidSessionKey,
    
    #[msg("Insufficient permissions")]
    InsufficientPermissions,
    
    #[msg("Delegation not found")]
    DelegationNotFound,
    
    #[msg("Delegation expired")]
    DelegationExpired,
    
    #[msg("State version mismatch")]
    StateVersionMismatch,
    
    #[msg("Optimistic update conflict")]
    OptimisticUpdateConflict,
    
    #[msg("Update already confirmed")]
    UpdateAlreadyConfirmed,
    
    #[msg("Component not found")]
    ComponentNotFound,
    
    #[msg("Entity not found")]
    EntityNotFound,
    
    #[msg("World not initialized")]
    WorldNotInitialized,
    
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    
    #[msg("Movement restricted")]
    MovementRestricted,
    
    #[msg("Rate limit exceeded")]
    RateLimitExceeded,
    
    #[msg("Match timeout")]
    MatchTimeout,
    
    #[msg("Invalid component data")]
    InvalidComponentData,
    
    #[msg("System execution failed")]
    SystemExecutionFailed,
}

// ========================================
// Component and Entity Types
// ========================================

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum EntityType {
    Player = 0,
    Match = 1,
    Projectile = 2,
    Item = 3,
    Effect = 4,
}

#[derive(Clone, Debug)]
pub struct ComponentData {
    pub component_type: String,
    pub data: Vec<u8>,
}

// ========================================
// Constants
// ========================================

/// Maximum number of entities per world
pub const MAX_ENTITIES: u32 = 100_000;

/// Maximum number of components per entity
pub const MAX_COMPONENTS_PER_ENTITY: u32 = 32;

/// Maximum number of concurrent matches
pub const MAX_CONCURRENT_MATCHES: u32 = 10_000;

/// Default match duration in seconds
pub const DEFAULT_MATCH_DURATION: i64 = 300; // 5 minutes

/// Default turn timeout in seconds
pub const DEFAULT_TURN_TIMEOUT: i64 = 30;

/// Maximum session key duration in seconds
pub const MAX_SESSION_DURATION: i64 = 3600; // 1 hour

/// Default optimistic update expiry in seconds
pub const DEFAULT_OPTIMISTIC_EXPIRY: i64 = 10;

/// Target tick rate for real-time systems (ticks per second)
pub const TARGET_TICK_RATE: u32 = 33; // ~30ms per tick