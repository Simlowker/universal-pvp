use bolt_lang::*;
use anchor_lang::prelude::*;

pub mod duel;
pub mod player;
pub mod action;
pub mod psych_profile;
pub mod betting;

pub use duel::*;
pub use player::*;
pub use action::*;
pub use psych_profile::*;
pub use betting::*;

/// DuelComponent - Core game state management
#[component]
#[derive(Default)]
pub struct DuelComponent {
    pub duel_id: u64,
    pub player_one: Pubkey,
    pub player_two: Pubkey,
    pub current_round: u8,
    pub max_rounds: u8,
    pub game_state: GameState,
    pub winner: Option<Pubkey>,
    pub start_time: i64,
    pub last_action_time: i64,
    pub timeout_duration: i64,
    pub vrf_seed: [u8; 32],
    pub resolution_pending: bool,
    // MagicBlock specific fields
    pub vrf_verified: bool,
    pub ready_for_settlement: bool,
    pub rollup_delegated: bool,
    pub rollup_finalized: bool,
    pub rollup_id: Option<[u8; 32]>,
    pub weights_validated: bool,
    pub transcript_validated: bool,
}

/// PlayerComponent - Individual player statistics and state
#[component]
#[derive(Default)]
pub struct PlayerComponent {
    pub player_id: Pubkey,
    pub duel_id: u64,
    pub chip_count: u64,
    pub total_bet: u64,
    pub actions_taken: u16,
    pub is_active: bool,
    pub position: PlayerPosition,
    pub skill_rating: u32,
    pub games_played: u64,
    pub games_won: u64,
    pub total_winnings: u64,
    pub last_seen: i64,
}

/// ActionComponent - Player action tracking and validation
#[component]
#[derive(Default)]
pub struct ActionComponent {
    pub entity_id: u64,
    pub player: Pubkey,
    pub action_type: ActionType,
    pub bet_amount: u64,
    pub timestamp: i64,
    pub round_number: u8,
    pub sequence_number: u16,
    pub is_processed: bool,
    pub processing_time: Option<i64>,
}

/// PsychProfileComponent - Psychological analysis from timing data
#[component]
#[derive(Default)]
pub struct PsychProfileComponent {
    pub player: Pubkey,
    pub avg_decision_time: u32,
    pub decision_variance: u32,
    pub bluff_frequency: u16,
    pub fold_frequency: u16,
    pub aggression_score: u16,
    pub consistency_rating: u16,
    pub pressure_response: u16,
    pub late_game_behavior: u16,
    pub sample_size: u32,
    pub last_updated: i64,
}

/// BettingComponent - Pot and betting state management
#[component]
#[derive(Default)]
pub struct BettingComponent {
    pub duel_id: u64,
    pub total_pot: u64,
    pub current_bet: u64,
    pub min_bet: u64,
    pub max_bet: u64,
    pub last_raise_amount: u64,
    pub betting_round: u8,
    pub side_pots: Vec<SidePot>,
    pub rake_amount: u64,
    pub is_settled: bool,
}

/// Game state enumeration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum GameState {
    WaitingForPlayers,
    InProgress,
    AwaitingAction,
    ResolutionPending,
    Completed,
    Cancelled,
}

impl Default for GameState {
    fn default() -> Self {
        GameState::WaitingForPlayers
    }
}

/// Player position enumeration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum PlayerPosition {
    None,
    Small,
    Big,
}

impl Default for PlayerPosition {
    fn default() -> Self {
        PlayerPosition::None
    }
}

/// Action type enumeration
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum ActionType {
    Check,
    Raise,
    Call,
    Fold,
    AllIn,
    Timeout,
}

impl Default for ActionType {
    fn default() -> Self {
        ActionType::Check
    }
}

/// Side pot structure for all-in scenarios
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SidePot {
    pub amount: u64,
    pub eligible_players: Vec<Pubkey>,
    pub is_main_pot: bool,
}

impl Default for SidePot {
    fn default() -> Self {
        SidePot {
            amount: 0,
            eligible_players: Vec::new(),
            is_main_pot: true,
        }
    }
}

/// Component validation traits
impl DuelComponent {
    pub fn is_valid_state_transition(&self, new_state: GameState) -> bool {
        match (self.game_state, new_state) {
            (GameState::WaitingForPlayers, GameState::InProgress) => true,
            (GameState::InProgress, GameState::AwaitingAction) => true,
            (GameState::AwaitingAction, GameState::InProgress) => true,
            (GameState::InProgress, GameState::ResolutionPending) => true,
            (GameState::ResolutionPending, GameState::Completed) => true,
            (_, GameState::Cancelled) => true,
            _ => false,
        }
    }

    pub fn is_timeout_exceeded(&self, current_time: i64) -> bool {
        current_time > self.last_action_time + self.timeout_duration
    }
}

impl PlayerComponent {
    pub fn can_bet(&self, amount: u64) -> bool {
        self.is_active && self.chip_count >= amount
    }

    pub fn win_rate(&self) -> f64 {
        if self.games_played == 0 {
            0.0
        } else {
            self.games_won as f64 / self.games_played as f64
        }
    }
}

impl PsychProfileComponent {
    pub fn update_decision_time(&mut self, new_time: u32) {
        if self.sample_size == 0 {
            self.avg_decision_time = new_time;
            self.decision_variance = 0;
        } else {
            // Running average calculation
            let old_avg = self.avg_decision_time as f64;
            let new_avg = (old_avg * self.sample_size as f64 + new_time as f64) / (self.sample_size + 1) as f64;
            
            // Update variance using Welford's online algorithm
            let delta = new_time as f64 - old_avg;
            let delta2 = new_time as f64 - new_avg;
            self.decision_variance = ((self.decision_variance as f64 * self.sample_size as f64 + delta * delta2) / (self.sample_size + 1) as f64) as u32;
            
            self.avg_decision_time = new_avg as u32;
        }
        self.sample_size += 1;
    }

    pub fn calculate_pressure_score(&self, pot_size: u64, time_pressure: bool) -> u16 {
        let base_score = if time_pressure { 100 } else { 0 };
        let pot_factor = (pot_size / 1000).min(100) as u16; // Scale pot influence
        let consistency_factor = self.consistency_rating / 10;
        
        (base_score + pot_factor - consistency_factor).min(1000)
    }
}

impl BettingComponent {
    pub fn can_raise(&self, player_chips: u64, raise_amount: u64) -> bool {
        !self.is_settled && 
        player_chips >= raise_amount && 
        raise_amount >= self.min_bet &&
        raise_amount <= self.max_bet
    }

    pub fn add_to_pot(&mut self, amount: u64) {
        self.total_pot += amount;
    }

    pub fn calculate_rake(&self, rake_percentage: u8) -> u64 {
        (self.total_pot * rake_percentage as u64) / 10000 // basis points
    }
}