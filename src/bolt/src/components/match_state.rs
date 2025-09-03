use bolt_lang::*;

/// Match configuration and state component
#[component]
#[derive(Clone, Copy)]
pub struct MatchState {
    pub match_id: u64,
    pub creator: Pubkey,
    pub state: GameState,
    pub max_players: u8,
    pub current_players: u8,
    pub current_turn: u8,
    pub turn_deadline: i64,
    pub entry_fee: u64,
    pub reward_pool: u64,
    pub winner: Option<Pubkey>,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub turn_timeout: i64,
    pub match_duration: i64,
}

impl Default for MatchState {
    fn default() -> Self {
        Self {
            match_id: 0,
            creator: Pubkey::default(),
            state: GameState::WaitingForPlayers,
            max_players: 4,
            current_players: 0,
            current_turn: 0,
            turn_deadline: 0,
            entry_fee: 0,
            reward_pool: 0,
            winner: None,
            created_at: 0,
            started_at: None,
            ended_at: None,
            turn_timeout: 60,    // 60 seconds per turn
            match_duration: 1800, // 30 minutes max
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum GameState {
    WaitingForPlayers = 0,
    InProgress = 1,
    Completed = 2,
    Cancelled = 3,
    Paused = 4,
}

impl Default for GameState {
    fn default() -> Self {
        GameState::WaitingForPlayers
    }
}

/// Match participants component
#[component]
#[derive(Clone, Copy)]
pub struct MatchParticipants {
    pub players: [Option<Pubkey>; 8], // Max 8 players
    pub player_count: u8,
    pub alive_players: u8,
    pub turn_order: [u8; 8], // Indices into players array
    pub joined_at: [i64; 8], // Timestamps when each player joined
}

impl Default for MatchParticipants {
    fn default() -> Self {
        Self {
            players: [None; 8],
            player_count: 0,
            alive_players: 0,
            turn_order: [0; 8],
            joined_at: [0; 8],
        }
    }
}

impl MatchParticipants {
    pub fn add_player(&mut self, player: Pubkey, timestamp: i64) -> Result<u8> {
        if (self.player_count as usize) >= self.players.len() {
            return Err(crate::GameError::MatchFull.into());
        }

        let index = self.player_count;
        self.players[index as usize] = Some(player);
        self.turn_order[index as usize] = index;
        self.joined_at[index as usize] = timestamp;
        self.player_count += 1;
        self.alive_players += 1;

        Ok(index)
    }

    pub fn remove_player(&mut self, player: &Pubkey) -> bool {
        for i in 0..(self.player_count as usize) {
            if let Some(p) = self.players[i] {
                if p == *player {
                    // Shift remaining players down
                    for j in i..(self.player_count as usize - 1) {
                        self.players[j] = self.players[j + 1];
                        self.turn_order[j] = self.turn_order[j + 1];
                        self.joined_at[j] = self.joined_at[j + 1];
                    }
                    
                    // Clear last position
                    let last_index = (self.player_count as usize) - 1;
                    self.players[last_index] = None;
                    self.turn_order[last_index] = 0;
                    self.joined_at[last_index] = 0;
                    
                    self.player_count -= 1;
                    self.alive_players -= 1;
                    return true;
                }
            }
        }
        false
    }

    pub fn get_player_index(&self, player: &Pubkey) -> Option<u8> {
        for i in 0..(self.player_count as usize) {
            if let Some(p) = self.players[i] {
                if p == *player {
                    return Some(i as u8);
                }
            }
        }
        None
    }

    pub fn is_player_in_match(&self, player: &Pubkey) -> bool {
        self.get_player_index(player).is_some()
    }

    pub fn get_turn_player(&self, current_turn: u8) -> Option<Pubkey> {
        if (current_turn as usize) < self.player_count as usize {
            let player_index = self.turn_order[current_turn as usize];
            self.players[player_index as usize]
        } else {
            None
        }
    }

    pub fn player_eliminated(&mut self, player: &Pubkey) -> bool {
        if self.is_player_in_match(player) && self.alive_players > 0 {
            self.alive_players -= 1;
            return true;
        }
        false
    }

    pub fn is_match_over(&self) -> bool {
        self.alive_players <= 1
    }

    pub fn get_winner(&self) -> Option<Pubkey> {
        if self.alive_players == 1 {
            // Find the last alive player
            for i in 0..(self.player_count as usize) {
                if let Some(player) = self.players[i] {
                    // This would need to check player health status
                    // For now, return first player if only one alive
                    return Some(player);
                }
            }
        }
        None
    }
}

/// Match rewards and distribution component
#[component]
#[derive(Clone, Copy)]
pub struct MatchRewards {
    pub total_pool: u64,
    pub distribution: [u8; 8], // Percentage for each placement (1st, 2nd, etc.)
    pub rewards_distributed: bool,
    pub winner_reward: u64,
    pub runner_up_reward: u64,
    pub participation_rewards: [u64; 8],
    pub experience_multiplier: f32,
}

impl Default for MatchRewards {
    fn default() -> Self {
        Self {
            total_pool: 0,
            distribution: [50, 30, 15, 5, 0, 0, 0, 0], // Default distribution
            rewards_distributed: false,
            winner_reward: 0,
            runner_up_reward: 0,
            participation_rewards: [0; 8],
            experience_multiplier: 1.0,
        }
    }
}

impl MatchRewards {
    pub fn calculate_rewards(&mut self, total_pool: u64, player_count: u8) {
        self.total_pool = total_pool;
        
        // Calculate individual rewards based on distribution
        if player_count > 0 {
            self.winner_reward = (total_pool * self.distribution[0] as u64) / 100;
            
            if player_count > 1 {
                self.runner_up_reward = (total_pool * self.distribution[1] as u64) / 100;
            }
            
            // Calculate participation rewards for remaining players
            let remaining_pool = total_pool - self.winner_reward - self.runner_up_reward;
            let remaining_players = if player_count > 2 { player_count - 2 } else { 0 };
            
            if remaining_players > 0 {
                let participation_reward = remaining_pool / remaining_players as u64;
                for i in 0..(remaining_players as usize) {
                    self.participation_rewards[i] = participation_reward;
                }
            }
        }
    }

    pub fn get_reward_for_placement(&self, placement: u8) -> u64 {
        match placement {
            0 => self.winner_reward,
            1 => self.runner_up_reward,
            _ => {
                let index = (placement as usize).saturating_sub(2);
                if index < self.participation_rewards.len() {
                    self.participation_rewards[index]
                } else {
                    0
                }
            }
        }
    }
}

/// Match statistics and analytics component
#[component]
#[derive(Clone, Copy)]
pub struct MatchAnalytics {
    pub total_actions: u32,
    pub total_damage: u32,
    pub total_healing: u32,
    pub critical_hits: u32,
    pub longest_turn: i64,
    pub shortest_turn: i64,
    pub average_turn_time: f32,
    pub most_active_player: Option<Pubkey>,
    pub mvp: Option<Pubkey>,
    pub match_quality_score: f32, // 0.0 to 10.0
}

impl Default for MatchAnalytics {
    fn default() -> Self {
        Self {
            total_actions: 0,
            total_damage: 0,
            total_healing: 0,
            critical_hits: 0,
            longest_turn: 0,
            shortest_turn: i64::MAX,
            average_turn_time: 0.0,
            most_active_player: None,
            mvp: None,
            match_quality_score: 5.0,
        }
    }
}

impl MatchAnalytics {
    pub fn record_action(&mut self, damage: u32, healing: u32, is_critical: bool) {
        self.total_actions += 1;
        self.total_damage += damage;
        self.total_healing += healing;
        if is_critical {
            self.critical_hits += 1;
        }
    }

    pub fn record_turn_time(&mut self, turn_duration: i64) {
        if turn_duration > self.longest_turn {
            self.longest_turn = turn_duration;
        }
        if turn_duration < self.shortest_turn {
            self.shortest_turn = turn_duration;
        }
        
        // Update running average
        let total_turns = self.total_actions as f32;
        if total_turns > 0.0 {
            self.average_turn_time = (self.average_turn_time * (total_turns - 1.0) + turn_duration as f32) / total_turns;
        }
    }

    pub fn calculate_quality_score(&mut self, match_duration: i64, player_count: u8) {
        let base_score = 5.0;
        let mut adjustments = 0.0;

        // Reward active matches with more actions
        if self.total_actions > 0 {
            let actions_per_minute = self.total_actions as f32 / (match_duration as f32 / 60.0);
            adjustments += (actions_per_minute - 10.0).clamp(-2.0, 3.0); // Ideal ~10 actions/min
        }

        // Reward balanced damage and healing
        if self.total_damage > 0 && self.total_healing > 0 {
            let heal_to_damage_ratio = self.total_healing as f32 / self.total_damage as f32;
            if heal_to_damage_ratio > 0.1 && heal_to_damage_ratio < 0.5 {
                adjustments += 1.0; // Good balance
            }
        }

        // Bonus for critical hits (excitement factor)
        let crit_rate = if self.total_actions > 0 {
            self.critical_hits as f32 / self.total_actions as f32
        } else { 0.0 };
        adjustments += crit_rate * 2.0; // Up to +2.0 for high crit games

        self.match_quality_score = (base_score + adjustments).clamp(0.0, 10.0);
    }
}