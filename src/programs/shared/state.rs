use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum GameState {
    WaitingForPlayers,
    InProgress,
    Completed,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum PlayerClass {
    Warrior,
    Mage,
    Archer,
    Rogue,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct PlayerStats {
    pub health: u32,
    pub attack: u32,
    pub defense: u32,
    pub speed: u32,
    pub mana: u32,
}

impl PlayerStats {
    pub fn new_warrior() -> Self {
        Self {
            health: 120,
            attack: 85,
            defense: 90,
            speed: 60,
            mana: 30,
        }
    }
    
    pub fn new_mage() -> Self {
        Self {
            health: 80,
            attack: 100,
            defense: 50,
            speed: 70,
            mana: 150,
        }
    }
    
    pub fn new_archer() -> Self {
        Self {
            health: 90,
            attack: 95,
            defense: 60,
            speed: 110,
            mana: 80,
        }
    }
    
    pub fn new_rogue() -> Self {
        Self {
            health: 85,
            attack: 90,
            defense: 55,
            speed: 120,
            mana: 70,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct CombatAction {
    pub action_type: ActionType,
    pub target: Pubkey,
    pub power: u32,
    pub mana_cost: u32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ActionType {
    BasicAttack,
    SpecialAbility,
    DefensiveStance,
    Heal,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MatchConfig {
    pub max_players: u8,
    pub entry_fee: u64,
    pub turn_timeout: i64,
    pub match_duration: i64,
    pub reward_distribution: Vec<u8>, // Percentages for 1st, 2nd, etc.
}

impl Default for MatchConfig {
    fn default() -> Self {
        Self {
            max_players: 4,
            entry_fee: 1_000_000, // 0.001 SOL in lamports
            turn_timeout: 60, // 60 seconds
            match_duration: 1800, // 30 minutes
            reward_distribution: vec![50, 30, 20], // Winner gets 50%, 2nd gets 30%, 3rd gets 20%
        }
    }
}

pub const MAX_PLAYERS_PER_MATCH: usize = 8;
pub const MAX_USERNAME_LENGTH: usize = 32;
pub const MAX_MATCHES_PER_PLAYER: usize = 10;

// Reentrancy Guard State
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReentrancyState {
    NotEntered = 0,
    Entered = 1,
}

// Admin Role System
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum AdminRole {
    SuperAdmin,
    GameAdmin,
    TokenAdmin,
    SecurityAdmin,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct AdminConfig {
    pub super_admin: Pubkey,
    pub admin_whitelist: Vec<Pubkey>,
    pub role_assignments: Vec<(Pubkey, AdminRole)>,
    pub emergency_stop_enabled: bool,
}