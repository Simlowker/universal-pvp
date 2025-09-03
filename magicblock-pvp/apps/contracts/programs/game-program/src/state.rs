use anchor_lang::prelude::*;
use crate::shared::{GameState as SharedGameState, PlayerClass, PlayerStats, MatchConfig, MAX_PLAYERS_PER_MATCH, MAX_USERNAME_LENGTH, AdminConfig};

#[account]
pub struct GameState {
    pub upgrade_authority: Pubkey,
    pub total_matches: u64,
    pub total_players: u64,
    pub total_rewards_distributed: u64,
    pub paused: bool,
    pub bump: u8,
}

impl GameState {
    pub const LEN: usize = 8 + // discriminator
        32 + // upgrade_authority
        8 + // total_matches
        8 + // total_players
        8 + // total_rewards_distributed
        1 + // paused
        1; // bump
}

#[account]
pub struct PlayerProfile {
    pub owner: Pubkey,
    pub username: String,
    pub player_class: PlayerClass,
    pub base_stats: PlayerStats,
    pub level: u32,
    pub experience: u64,
    pub total_matches: u32,
    pub wins: u32,
    pub losses: u32,
    pub total_damage_dealt: u64,
    pub total_damage_taken: u64,
    pub created_at: i64,
    pub last_match_at: i64,
    pub is_active: bool,
    pub bump: u8,
}

impl PlayerProfile {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        4 + MAX_USERNAME_LENGTH + // username
        1 + // player_class
        20 + // base_stats (5 * u32)
        4 + // level
        8 + // experience
        4 + // total_matches
        4 + // wins
        4 + // losses
        8 + // total_damage_dealt
        8 + // total_damage_taken
        8 + // created_at
        8 + // last_match_at
        1 + // is_active
        1; // bump

    pub fn calculate_level(&self) -> u32 {
        // Level formula: sqrt(experience / 1000)
        ((self.experience / 1000) as f64).sqrt() as u32 + 1
    }

    pub fn get_current_stats(&self) -> PlayerStats {
        let level_multiplier = self.level as f64 * 0.1 + 1.0;
        
        PlayerStats {
            health: (self.base_stats.health as f64 * level_multiplier) as u32,
            attack: (self.base_stats.attack as f64 * level_multiplier) as u32,
            defense: (self.base_stats.defense as f64 * level_multiplier) as u32,
            speed: (self.base_stats.speed as f64 * level_multiplier) as u32,
            mana: (self.base_stats.mana as f64 * level_multiplier) as u32,
        }
    }

    pub fn win_rate(&self) -> f64 {
        if self.total_matches == 0 {
            return 0.0;
        }
        self.wins as f64 / self.total_matches as f64
    }
}

#[account]
pub struct Match {
    pub creator: Pubkey,
    pub match_id: u64,
    pub config: MatchConfig,
    pub state: SharedGameState,
    pub players: Vec<MatchPlayer>,
    pub current_turn: u8,
    pub turn_deadline: i64,
    pub reward_pool: u64,
    pub winner: Option<Pubkey>,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    // SECURITY: Admin control fields
    pub force_ended: bool,
    pub force_ended_by: Option<Pubkey>,
    pub cancel_reason: Option<String>,
    pub bump: u8,
}

impl Match {
    pub const LEN: usize = 8 + // discriminator
        32 + // creator
        8 + // match_id
        64 + // config (MatchConfig size)
        1 + // state
        4 + (MAX_PLAYERS_PER_MATCH * MatchPlayer::LEN) + // players vec
        1 + // current_turn
        8 + // turn_deadline
        8 + // reward_pool
        1 + 32 + // winner (Option<Pubkey>)
        8 + // created_at
        1 + 8 + // started_at (Option<i64>)
        1 + 8 + // ended_at (Option<i64>)
        1 + // force_ended
        1 + 32 + // force_ended_by (Option<Pubkey>)
        4 + 256 + // cancel_reason (Option<String>, max 256 chars)
        1; // bump

    pub fn is_player_turn(&self, player: &Pubkey) -> bool {
        if let Some(current_player) = self.players.get(self.current_turn as usize) {
            current_player.player == *player && current_player.is_alive
        } else {
            false
        }
    }

    pub fn get_alive_players(&self) -> Vec<&MatchPlayer> {
        self.players.iter().filter(|p| p.is_alive).collect()
    }

    pub fn is_match_over(&self) -> bool {
        self.get_alive_players().len() <= 1
    }

    pub fn add_player(&mut self, player: Pubkey, stats: PlayerStats) -> Result<()> {
        if self.players.len() >= self.config.max_players as usize {
            return Err(crate::shared::GameError::MatchFull.into());
        }

        let match_player = MatchPlayer {
            player,
            stats,
            current_health: stats.health,
            current_mana: stats.mana,
            is_alive: true,
            actions_taken: 0,
            damage_dealt: 0,
            damage_taken: 0,
            joined_at: Clock::get()?.unix_timestamp,
        };

        self.players.push(match_player);
        Ok(())
    }

    pub fn get_player_mut(&mut self, player: &Pubkey) -> Option<&mut MatchPlayer> {
        self.players.iter_mut().find(|p| p.player == *player)
    }

    pub fn next_turn(&mut self) -> Result<()> {
        let alive_players = self.get_alive_players().len() as u8;
        if alive_players == 0 {
            return Err(crate::shared::GameError::InvalidGameState.into());
        }

        // Find next alive player
        let mut next_turn = (self.current_turn + 1) % self.players.len() as u8;
        let mut attempts = 0;
        
        while attempts < self.players.len() && !self.players[next_turn as usize].is_alive {
            next_turn = (next_turn + 1) % self.players.len() as u8;
            attempts += 1;
        }

        if attempts >= self.players.len() {
            return Err(crate::shared::GameError::InvalidGameState.into());
        }

        self.current_turn = next_turn;
        self.turn_deadline = Clock::get()?.unix_timestamp + self.config.turn_timeout;
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MatchPlayer {
    pub player: Pubkey,
    pub stats: PlayerStats,
    pub current_health: u32,
    pub current_mana: u32,
    pub is_alive: bool,
    pub actions_taken: u32,
    pub damage_dealt: u32,
    pub damage_taken: u32,
    pub joined_at: i64,
}

impl MatchPlayer {
    pub const LEN: usize = 32 + // player
        20 + // stats (5 * u32)
        4 + // current_health
        4 + // current_mana
        1 + // is_alive
        4 + // actions_taken
        4 + // damage_dealt
        4 + // damage_taken
        8; // joined_at

    pub fn take_damage(&mut self, damage: u32) {
        self.current_health = self.current_health.saturating_sub(damage);
        self.damage_taken = self.damage_taken.saturating_add(damage);
        
        if self.current_health == 0 {
            self.is_alive = false;
        }
    }

    pub fn heal(&mut self, amount: u32) {
        self.current_health = (self.current_health + amount).min(self.stats.health);
    }

    pub fn use_mana(&mut self, amount: u32) -> bool {
        if self.current_mana >= amount {
            self.current_mana -= amount;
            true
        } else {
            false
        }
    }

    pub fn restore_mana(&mut self, amount: u32) {
        self.current_mana = (self.current_mana + amount).min(self.stats.mana);
    }

    pub fn can_act(&self) -> bool {
        self.is_alive && self.current_mana > 0
    }

    pub fn health_percentage(&self) -> f64 {
        if self.stats.health == 0 {
            return 0.0;
        }
        self.current_health as f64 / self.stats.health as f64
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CombatResult {
    pub attacker: Pubkey,
    pub target: Pubkey,
    pub damage_dealt: u32,
    pub critical_hit: bool,
    pub target_defeated: bool,
    pub experience_gained: u32,
}

impl CombatResult {
    pub const LEN: usize = 32 + // attacker
        32 + // target
        4 + // damage_dealt
        1 + // critical_hit
        1 + // target_defeated
        4; // experience_gained
}