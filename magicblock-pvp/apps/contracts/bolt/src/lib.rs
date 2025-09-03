use bolt_lang::*;

mod components;
mod systems;
mod world;

pub use components::*;
pub use systems::*;
pub use world::*;

// Program ID for SolDuel BOLT implementation
declare_id!("BOLT11111111111111111111111111111111111111111");

#[program]
pub mod solduel_bolt {
    use super::*;

    /// Initialize the World and Component Registry
    pub fn initialize_world(ctx: Context<InitializeWorld>) -> Result<()> {
        world::initialize_world::handler(ctx)
    }

    /// Create a new player entity with components
    pub fn create_player(
        ctx: Context<CreatePlayer>,
        username: String,
        player_class: u8,
    ) -> Result<()> {
        systems::player_system::create_player::handler(ctx, username, player_class)
    }

    /// Create a new match entity with components  
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

    /// Execute combat action in match
    pub fn execute_combat_action(
        ctx: Context<ExecuteCombatAction>,
        action_type: u8,
        target_entity: Pubkey,
        power: u32,
    ) -> Result<()> {
        systems::combat_system::execute_action::handler(ctx, action_type, target_entity, power)
    }

    /// Process turn and update game state
    pub fn process_turn(ctx: Context<ProcessTurn>) -> Result<()> {
        systems::turn_system::process_turn::handler(ctx)
    }

    /// End match and distribute rewards
    pub fn end_match(ctx: Context<EndMatch>) -> Result<()> {
        systems::match_system::end_match::handler(ctx)
    }

    /// Session key delegation for gasless transactions
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
}

#[error_code]
pub enum GameError {
    #[msg("Invalid game state")]
    InvalidGameState,
    #[msg("Player not found")]
    PlayerNotFound,
    #[msg("Match is full")]
    MatchFull,
    #[msg("Not player's turn")]
    NotPlayerTurn,
    #[msg("Invalid combat action")]
    InvalidCombatAction,
    #[msg("Insufficient mana")]
    InsufficientMana,
    #[msg("Player already dead")]
    PlayerAlreadyDead,
    #[msg("Match not found")]
    MatchNotFound,
    #[msg("Unauthorized action")]
    UnauthorizedAction,
    #[msg("Session key expired")]
    SessionKeyExpired,
    #[msg("Invalid session key")]
    InvalidSessionKey,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}