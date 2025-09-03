use anchor_lang::prelude::*;
use shared::{GameState as SharedGameState, PlayerClass, PlayerStats, MatchConfig, MAX_PLAYERS_PER_MATCH, MAX_USERNAME_LENGTH, AdminConfig};
use shared::magicblock::delegation::{DelegatedAccountType, PendingCommit, CommitType};

/// Enhanced game state for Ephemeral Rollup integration
#[account]
pub struct GameStateEr {
    pub upgrade_authority: Pubkey,
    pub er_program_id: Pubkey,
    pub mainnet_program_id: Pubkey,
    pub total_matches: u64,
    pub total_players: u64,
    pub total_rewards_distributed: u64,
    pub total_er_sessions: u64,
    pub successful_commits: u64,
    pub failed_commits: u64,
    pub paused: bool,
    pub er_enabled: bool,
    pub delegation_expiry_default: i64, // Default delegation period in seconds
    pub max_concurrent_matches: u32,
    pub current_active_matches: u32,
    pub bump: u8,
}

impl GameStateEr {
    pub const LEN: usize = 8 + // discriminator
        32 + // upgrade_authority
        32 + // er_program_id
        32 + // mainnet_program_id
        8 + // total_matches
        8 + // total_players
        8 + // total_rewards_distributed
        8 + // total_er_sessions
        8 + // successful_commits
        8 + // failed_commits
        1 + // paused
        1 + // er_enabled
        8 + // delegation_expiry_default
        4 + // max_concurrent_matches
        4 + // current_active_matches
        1; // bump
}

/// Enhanced player profile for ER with component references
#[account]
pub struct PlayerProfileEr {
    pub owner: Pubkey,
    pub username: String,
    pub player_class: PlayerClass,
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
    
    // ER-specific fields
    pub er_sessions_played: u32,
    pub successful_er_commits: u32,
    pub failed_er_commits: u32,
    pub current_delegation_state: Option<Pubkey>,
    
    // Component references (BOLT ECS)
    pub position_component: Option<Pubkey>,
    pub health_component: Option<Pubkey>,
    pub mana_component: Option<Pubkey>,
    pub stats_component: Option<Pubkey>,
    pub equipment_component: Option<Pubkey>,
    pub combat_component: Option<Pubkey>,
    
    pub bump: u8,
}

impl PlayerProfileEr {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        4 + MAX_USERNAME_LENGTH + // username
        1 + // player_class
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
        4 + // er_sessions_played
        4 + // successful_er_commits
        4 + // failed_er_commits
        1 + 32 + // current_delegation_state
        6 * (1 + 32) + // component references (6 * Option<Pubkey>)
        1; // bump

    pub fn calculate_level(&self) -> u32 {
        // Enhanced level formula with ER bonuses
        let base_level = ((self.experience / 1000) as f64).sqrt() as u32 + 1;
        let er_bonus = (self.er_sessions_played / 10) as u32; // Bonus level per 10 ER sessions
        base_level + er_bonus
    }

    pub fn win_rate(&self) -> f64 {
        if self.total_matches == 0 {
            return 0.0;
        }
        self.wins as f64 / self.total_matches as f64
    }

    pub fn er_success_rate(&self) -> f64 {
        let total_er_commits = self.successful_er_commits + self.failed_er_commits;
        if total_er_commits == 0 {
            return 1.0; // No failures means 100% success
        }
        self.successful_er_commits as f64 / total_er_commits as f64
    }
}

/// Enhanced match state for ER with delegation tracking
#[account]
pub struct MatchEr {
    pub creator: Pubkey,
    pub match_id: u64,
    pub config: MatchConfig,
    pub state: SharedGameState,
    pub players: Vec<MatchPlayerEr>,
    pub current_turn: u8,
    pub turn_deadline: i64,
    pub reward_pool: u64,
    pub winner: Option<Pubkey>,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    
    // ER-specific fields
    pub is_delegated_to_er: bool,
    pub delegation_state: Option<Pubkey>,
    pub er_session_id: Option<String>,
    pub pending_mainnet_commits: Vec<PendingCommit>,
    pub mainnet_sync_status: MainnetSyncStatus,
    pub last_component_update: i64,
    
    // Admin control fields
    pub force_ended: bool,
    pub force_ended_by: Option<Pubkey>,
    pub cancel_reason: Option<String>,
    pub rollback_requested: bool,
    pub rollback_reason: Option<String>,
    
    pub bump: u8,
}

impl MatchEr {
    pub const LEN: usize = 8 + // discriminator
        32 + // creator
        8 + // match_id
        64 + // config
        1 + // state
        4 + (MAX_PLAYERS_PER_MATCH * MatchPlayerEr::LEN) + // players vec
        1 + // current_turn
        8 + // turn_deadline
        8 + // reward_pool
        1 + 32 + // winner
        8 + // created_at
        1 + 8 + // started_at
        1 + 8 + // ended_at
        1 + // is_delegated_to_er
        1 + 32 + // delegation_state
        1 + 4 + 64 + // er_session_id (Option<String> max 64 chars)
        4 + (50 * PendingCommit::LEN) + // pending_mainnet_commits (max 50)
        1 + // mainnet_sync_status
        8 + // last_component_update
        1 + // force_ended
        1 + 32 + // force_ended_by
        4 + 256 + // cancel_reason
        1 + // rollback_requested
        4 + 256 + // rollback_reason
        1; // bump

    pub fn is_player_turn(&self, player: &Pubkey) -> bool {
        if let Some(current_player) = self.players.get(self.current_turn as usize) {
            current_player.player == *player && current_player.is_alive
        } else {
            false
        }
    }

    pub fn get_alive_players(&self) -> Vec<&MatchPlayerEr> {
        self.players.iter().filter(|p| p.is_alive).collect()
    }

    pub fn is_match_over(&self) -> bool {
        self.get_alive_players().len() <= 1
    }

    pub fn add_player(&mut self, player: Pubkey, stats: PlayerStats) -> Result<()> {
        if self.players.len() >= self.config.max_players as usize {
            return Err(shared::GameError::MatchFull.into());
        }

        let match_player = MatchPlayerEr {
            player,
            stats,
            current_health: stats.health,
            current_mana: stats.mana,
            is_alive: true,
            actions_taken: 0,
            damage_dealt: 0,
            damage_taken: 0,
            joined_at: Clock::get()?.unix_timestamp,
            
            // ER-specific fields
            component_last_updated: Clock::get()?.unix_timestamp,
            pending_component_updates: Vec::new(),
            er_bonus_applied: false,
            nft_bonuses: Vec::new(),
        };

        self.players.push(match_player);
        Ok(())
    }

    pub fn get_player_mut(&mut self, player: &Pubkey) -> Option<&mut MatchPlayerEr> {
        self.players.iter_mut().find(|p| p.player == *player)
    }

    pub fn next_turn(&mut self) -> Result<()> {
        let alive_players = self.get_alive_players().len() as u8;
        if alive_players == 0 {
            return Err(shared::GameError::InvalidGameState.into());
        }

        // Find next alive player
        let mut next_turn = (self.current_turn + 1) % self.players.len() as u8;
        let mut attempts = 0;
        
        while attempts < self.players.len() && !self.players[next_turn as usize].is_alive {
            next_turn = (next_turn + 1) % self.players.len() as u8;
            attempts += 1;
        }

        if attempts >= self.players.len() {
            return Err(shared::GameError::InvalidGameState.into());
        }

        self.current_turn = next_turn;
        self.turn_deadline = Clock::get()?.unix_timestamp + self.config.turn_timeout;
        self.last_component_update = Clock::get()?.unix_timestamp;
        
        Ok(())
    }

    pub fn add_pending_commit(&mut self, commit: PendingCommit) -> Result<()> {
        if self.pending_mainnet_commits.len() >= 50 {
            return Err(shared::GameError::InvalidGameState.into());
        }
        self.pending_mainnet_commits.push(commit);
        Ok(())
    }

    pub fn is_ready_for_mainnet_commit(&self) -> bool {
        matches!(self.state, SharedGameState::Completed) && 
        self.is_delegated_to_er && 
        !self.pending_mainnet_commits.is_empty() &&
        matches!(self.mainnet_sync_status, MainnetSyncStatus::Ready)
    }
}

/// Enhanced match player for ER with component tracking
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MatchPlayerEr {
    pub player: Pubkey,
    pub stats: PlayerStats,
    pub current_health: u32,
    pub current_mana: u32,
    pub is_alive: bool,
    pub actions_taken: u32,
    pub damage_dealt: u32,
    pub damage_taken: u32,
    pub joined_at: i64,
    
    // ER-specific fields
    pub component_last_updated: i64,
    pub pending_component_updates: Vec<ComponentUpdate>,
    pub er_bonus_applied: bool,
    pub nft_bonuses: Vec<NftBonus>,
}

impl MatchPlayerEr {
    pub const LEN: usize = 32 + // player
        20 + // stats (5 * u32)
        4 + // current_health
        4 + // current_mana
        1 + // is_alive
        4 + // actions_taken
        4 + // damage_dealt
        4 + // damage_taken
        8 + // joined_at
        8 + // component_last_updated
        4 + (10 * ComponentUpdate::LEN) + // pending_component_updates (max 10)
        1 + // er_bonus_applied
        4 + (5 * NftBonus::LEN); // nft_bonuses (max 5)

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

    pub fn get_effective_stats(&self) -> PlayerStats {
        let mut effective_stats = self.stats;
        
        // Apply ER bonuses
        if self.er_bonus_applied {
            effective_stats.attack = effective_stats.attack.saturating_add(5);
            effective_stats.speed = effective_stats.speed.saturating_add(3);
        }
        
        // Apply NFT bonuses
        for bonus in &self.nft_bonuses {
            effective_stats.attack = effective_stats.attack.saturating_add(bonus.attack_bonus);
            effective_stats.defense = effective_stats.defense.saturating_add(bonus.defense_bonus);
            effective_stats.health = effective_stats.health.saturating_add(bonus.health_bonus);
            effective_stats.speed = effective_stats.speed.saturating_add(bonus.speed_bonus);
            effective_stats.mana = effective_stats.mana.saturating_add(bonus.mana_bonus);
        }
        
        effective_stats
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ComponentUpdate {
    pub component_type: ComponentType,
    pub update_data: Vec<u8>,
    pub timestamp: i64,
}

impl ComponentUpdate {
    pub const LEN: usize = 1 + // component_type
        4 + 256 + // update_data (max 256 bytes)
        8; // timestamp
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum ComponentType {
    Position,
    Health,
    Mana,
    Stats,
    Equipment,
    Combat,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct NftBonus {
    pub nft_mint: Pubkey,
    pub attack_bonus: u32,
    pub defense_bonus: u32,
    pub health_bonus: u32,
    pub speed_bonus: u32,
    pub mana_bonus: u32,
    pub special_effect: u8,
}

impl NftBonus {
    pub const LEN: usize = 32 + // nft_mint
        6 * 4 + // bonuses (6 * u32)
        1; // special_effect
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum MainnetSyncStatus {
    NotSynced,
    Pending,
    InProgress,
    Ready,
    Committed,
    Failed,
}

/// Combat result with ER enhancements
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CombatResultEr {
    pub attacker: Pubkey,
    pub target: Pubkey,
    pub damage_dealt: u32,
    pub critical_hit: bool,
    pub target_defeated: bool,
    pub experience_gained: u32,
    
    // ER-specific fields
    pub er_bonus_triggered: bool,
    pub nft_effects_applied: Vec<u8>, // Effect IDs
    pub component_updates_required: Vec<ComponentType>,
    pub timestamp: i64,
}

impl CombatResultEr {
    pub const LEN: usize = 32 + // attacker
        32 + // target
        4 + // damage_dealt
        1 + // critical_hit
        1 + // target_defeated
        4 + // experience_gained
        1 + // er_bonus_triggered
        4 + 20 + // nft_effects_applied (max 20 effects)
        4 + 10 + // component_updates_required (max 10 components)
        8; // timestamp
}

/// Session metadata for ER tracking
#[account]
pub struct ErSession {
    pub session_id: String,
    pub match_id: u64,
    pub participants: Vec<Pubkey>,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub status: ErSessionStatus,
    pub total_transactions: u32,
    pub gas_consumed: u64,
    pub successful_commits: u32,
    pub failed_commits: u32,
    pub final_state_hash: Option<[u8; 32]>,
    pub bump: u8,
}

impl ErSession {
    pub const LEN: usize = 8 + // discriminator
        4 + 64 + // session_id (max 64 chars)
        8 + // match_id
        4 + (8 * 32) + // participants (max 8 players)
        8 + // started_at
        1 + 8 + // ended_at
        1 + // status
        4 + // total_transactions
        8 + // gas_consumed
        4 + // successful_commits
        4 + // failed_commits
        1 + 32 + // final_state_hash
        1; // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum ErSessionStatus {
    Active,
    Completed,
    Failed,
    RolledBack,
}

/// Migration compatibility layer
pub struct LegacyMatchAdapter;

impl LegacyMatchAdapter {
    pub fn from_legacy_match(legacy_match: &shared::state::Match) -> MatchEr {
        MatchEr {
            creator: legacy_match.creator,
            match_id: legacy_match.match_id,
            config: legacy_match.config.clone(),
            state: legacy_match.state,
            players: legacy_match.players.iter().map(|p| MatchPlayerEr {
                player: p.player,
                stats: p.stats,
                current_health: p.current_health,
                current_mana: p.current_mana,
                is_alive: p.is_alive,
                actions_taken: p.actions_taken,
                damage_dealt: p.damage_dealt,
                damage_taken: p.damage_taken,
                joined_at: p.joined_at,
                component_last_updated: Clock::get().unwrap().unix_timestamp,
                pending_component_updates: Vec::new(),
                er_bonus_applied: false,
                nft_bonuses: Vec::new(),
            }).collect(),
            current_turn: legacy_match.current_turn,
            turn_deadline: legacy_match.turn_deadline,
            reward_pool: legacy_match.reward_pool,
            winner: legacy_match.winner,
            created_at: legacy_match.created_at,
            started_at: legacy_match.started_at,
            ended_at: legacy_match.ended_at,
            is_delegated_to_er: false,
            delegation_state: None,
            er_session_id: None,
            pending_mainnet_commits: Vec::new(),
            mainnet_sync_status: MainnetSyncStatus::NotSynced,
            last_component_update: Clock::get().unwrap().unix_timestamp,
            force_ended: legacy_match.force_ended,
            force_ended_by: legacy_match.force_ended_by,
            cancel_reason: legacy_match.cancel_reason.clone(),
            rollback_requested: false,
            rollback_reason: None,
            bump: 0, // Will be set properly when initializing
        }
    }

    pub fn to_legacy_match(er_match: &MatchEr) -> shared::state::Match {
        shared::state::Match {
            creator: er_match.creator,
            match_id: er_match.match_id,
            config: er_match.config.clone(),
            state: er_match.state,
            players: er_match.players.iter().map(|p| shared::state::MatchPlayer {
                player: p.player,
                stats: p.stats,
                current_health: p.current_health,
                current_mana: p.current_mana,
                is_alive: p.is_alive,
                actions_taken: p.actions_taken,
                damage_dealt: p.damage_dealt,
                damage_taken: p.damage_taken,
                joined_at: p.joined_at,
            }).collect(),
            current_turn: er_match.current_turn,
            turn_deadline: er_match.turn_deadline,
            reward_pool: er_match.reward_pool,
            winner: er_match.winner,
            created_at: er_match.created_at,
            started_at: er_match.started_at,
            ended_at: er_match.ended_at,
            force_ended: er_match.force_ended,
            force_ended_by: er_match.force_ended_by,
            cancel_reason: er_match.cancel_reason.clone(),
            bump: er_match.bump,
        }
    }
}