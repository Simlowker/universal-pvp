use anchor_lang::prelude::*;
use crate::{
    World, Entity, ComponentTypeId, MatchComponent, MatchState,
    System, SystemExecutionResult, SystemPriority, SystemPhase, ComponentQuery,
    EntityType
};

/// MatchmakingSystem handles player pairing, match creation, and lobby management
pub struct MatchmakingSystem;

impl System for MatchmakingSystem {
    fn execute(&self, world: &mut World, entities: &[Entity]) -> Result<SystemExecutionResult> {
        let mut result = SystemExecutionResult::default();
        let start_time = Clock::get()?.unix_timestamp;

        // Process waiting matches and available players
        let match_result = process_matchmaking(world, entities)?;
        
        result.entities_processed = match_result.matches_processed;
        result.components_modified = match_result.players_matched;
        
        let end_time = Clock::get()?.unix_timestamp;
        result.execution_time_ms = ((end_time - start_time) * 1000) as u32;

        Ok(result)
    }

    fn can_run_parallel(&self) -> bool {
        false // Matchmaking requires coordinated state management
    }

    fn get_required_components(&self) -> Vec<ComponentTypeId> {
        vec![ComponentTypeId::Match]
    }

    fn get_modified_components(&self) -> Vec<ComponentTypeId> {
        vec![ComponentTypeId::Match]
    }

    fn get_priority(&self) -> SystemPriority {
        SystemPriority::High
    }

    fn get_phase(&self) -> SystemPhase {
        SystemPhase::PreUpdate
    }
}

pub fn handler(ctx: Context<crate::ExecuteMatchmakingSystem>) -> Result<()> {
    let world = &mut ctx.accounts.world;
    let matchmaking_system = MatchmakingSystem;

    let entities: Vec<Entity> = Vec::new();
    let result = matchmaking_system.execute(world, &entities)?;

    emit!(MatchmakingSystemExecuted {
        matches_processed: result.entities_processed,
        players_matched: result.components_modified,
        execution_time_ms: result.execution_time_ms,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

fn process_matchmaking(world: &mut World, entities: &[Entity]) -> Result<MatchmakingResult> {
    let mut result = MatchmakingResult {
        matches_processed: 0,
        players_matched: 0,
        new_matches_created: 0,
    };

    // In a real implementation, this would:
    // 1. Find all players in matchmaking queue
    // 2. Find all matches waiting for players
    // 3. Apply matchmaking algorithms
    // 4. Create new matches or fill existing ones
    // 5. Update match states and player assignments

    world.last_updated = Clock::get()?.unix_timestamp;
    
    Ok(result)
}

/// Matchmaking algorithm types
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum MatchmakingMode {
    Skill,      // Skill-based matchmaking
    Random,     // Random matchmaking
    Balanced,   // Balanced team composition
    Tournament, // Tournament brackets
    Custom,     // Custom game rules
}

/// Player in matchmaking queue
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MatchmakingPlayer {
    pub player_id: u64,
    pub player_key: Pubkey,
    pub skill_rating: u32,
    pub preferred_modes: Vec<MatchmakingMode>,
    pub queue_time: i64,
    pub max_wait_time: i64,
    pub player_class: crate::shared::PlayerClass,
    pub level: u32,
    pub win_rate: f32,
}

impl MatchmakingPlayer {
    pub fn new(
        player_id: u64,
        player_key: Pubkey,
        skill_rating: u32,
        player_class: crate::shared::PlayerClass,
        level: u32,
    ) -> Self {
        let current_time = Clock::get().unwrap().unix_timestamp;
        
        Self {
            player_id,
            player_key,
            skill_rating,
            preferred_modes: vec![MatchmakingMode::Skill],
            queue_time: current_time,
            max_wait_time: 300, // 5 minutes default
            player_class,
            level,
            win_rate: 0.5, // Default 50% win rate
        }
    }

    pub fn get_wait_time(&self, current_time: i64) -> i64 {
        current_time - self.queue_time
    }

    pub fn is_expired(&self, current_time: i64) -> bool {
        self.get_wait_time(current_time) > self.max_wait_time
    }
}

/// Matchmaking queue management
pub struct MatchmakingQueue {
    pub players: Vec<MatchmakingPlayer>,
    pub mode: MatchmakingMode,
    pub max_size: u32,
    pub skill_tolerance: u32,
    pub level_tolerance: u32,
}

impl MatchmakingQueue {
    pub fn new(mode: MatchmakingMode) -> Self {
        Self {
            players: Vec::new(),
            mode,
            max_size: 100,
            skill_tolerance: 200, // ±200 skill rating
            level_tolerance: 10,  // ±10 levels
        }
    }

    pub fn add_player(&mut self, player: MatchmakingPlayer) -> Result<()> {
        if self.players.len() >= self.max_size as usize {
            return Err(ErrorCode::QueueFull.into());
        }
        
        self.players.push(player);
        Ok(())
    }

    pub fn remove_player(&mut self, player_id: u64) -> Option<MatchmakingPlayer> {
        if let Some(pos) = self.players.iter().position(|p| p.player_id == player_id) {
            Some(self.players.remove(pos))
        } else {
            None
        }
    }

    pub fn find_matches(&mut self, match_size: u32) -> Vec<Vec<MatchmakingPlayer>> {
        let mut matches = Vec::new();
        
        match self.mode {
            MatchmakingMode::Skill => {
                matches.extend(self.skill_based_matching(match_size));
            }
            MatchmakingMode::Random => {
                matches.extend(self.random_matching(match_size));
            }
            MatchmakingMode::Balanced => {
                matches.extend(self.balanced_matching(match_size));
            }
            MatchmakingMode::Tournament => {
                matches.extend(self.tournament_matching(match_size));
            }
            MatchmakingMode::Custom => {
                matches.extend(self.custom_matching(match_size));
            }
        }

        matches
    }

    fn skill_based_matching(&mut self, match_size: u32) -> Vec<Vec<MatchmakingPlayer>> {
        let mut matches = Vec::new();
        
        // Sort players by skill rating
        self.players.sort_by_key(|p| p.skill_rating);
        
        // Group players with similar skill levels
        let mut current_match = Vec::new();
        let mut base_skill = 0u32;
        
        for player in self.players.drain(..) {
            if current_match.is_empty() {
                base_skill = player.skill_rating;
                current_match.push(player);
            } else if current_match.len() < match_size as usize {
                let skill_diff = if player.skill_rating > base_skill {
                    player.skill_rating - base_skill
                } else {
                    base_skill - player.skill_rating
                };
                
                if skill_diff <= self.skill_tolerance {
                    current_match.push(player);
                } else {
                    // Start new match group
                    if current_match.len() >= 2 {
                        matches.push(current_match.clone());
                    } else {
                        // Return unmatched players to queue
                        self.players.extend(current_match.drain(..));
                    }
                    current_match.clear();
                    base_skill = player.skill_rating;
                    current_match.push(player);
                }
            } else {
                // Current match is full
                matches.push(current_match.clone());
                current_match.clear();
                base_skill = player.skill_rating;
                current_match.push(player);
            }
        }
        
        // Handle remaining players
        if current_match.len() >= 2 {
            matches.push(current_match);
        } else {
            self.players.extend(current_match);
        }
        
        matches
    }

    fn random_matching(&mut self, match_size: u32) -> Vec<Vec<MatchmakingPlayer>> {
        let mut matches = Vec::new();
        
        // Shuffle players randomly (simplified - would use proper randomization)
        let mut players = self.players.drain(..).collect::<Vec<_>>();
        
        while players.len() >= match_size as usize {
            let match_players = players.drain(..match_size as usize).collect();
            matches.push(match_players);
        }
        
        // Return remaining players to queue
        self.players.extend(players);
        
        matches
    }

    fn balanced_matching(&mut self, match_size: u32) -> Vec<Vec<MatchmakingPlayer>> {
        let mut matches = Vec::new();
        
        // Group players by class for balanced teams
        let mut warriors = Vec::new();
        let mut mages = Vec::new();
        let mut archers = Vec::new();
        let mut rogues = Vec::new();
        
        for player in self.players.drain(..) {
            match player.player_class {
                crate::shared::PlayerClass::Warrior => warriors.push(player),
                crate::shared::PlayerClass::Mage => mages.push(player),
                crate::shared::PlayerClass::Archer => archers.push(player),
                crate::shared::PlayerClass::Rogue => rogues.push(player),
            }
        }
        
        // Try to create balanced matches
        while !warriors.is_empty() && !mages.is_empty() && 
              !archers.is_empty() && !rogues.is_empty() {
            
            let mut match_players = Vec::new();
            
            // Take one of each class (for 4-player matches)
            if match_size >= 4 {
                match_players.push(warriors.pop().unwrap());
                match_players.push(mages.pop().unwrap());
                match_players.push(archers.pop().unwrap());
                match_players.push(rogues.pop().unwrap());
                
                // Fill remaining slots if match_size > 4
                for _ in 4..match_size {
                    if let Some(player) = [&mut warriors, &mut mages, &mut archers, &mut rogues]
                        .iter_mut()
                        .find(|v| !v.is_empty())
                        .and_then(|v| v.pop()) {
                        match_players.push(player);
                    } else {
                        break;
                    }
                }
                
                if match_players.len() >= 4 {
                    matches.push(match_players);
                } else {
                    // Return players if we can't make a full match
                    for player in match_players {
                        match player.player_class {
                            crate::shared::PlayerClass::Warrior => warriors.push(player),
                            crate::shared::PlayerClass::Mage => mages.push(player),
                            crate::shared::PlayerClass::Archer => archers.push(player),
                            crate::shared::PlayerClass::Rogue => rogues.push(player),
                        }
                    }
                    break;
                }
            } else {
                break;
            }
        }
        
        // Return remaining players to queue
        self.players.extend(warriors);
        self.players.extend(mages);
        self.players.extend(archers);
        self.players.extend(rogues);
        
        matches
    }

    fn tournament_matching(&mut self, match_size: u32) -> Vec<Vec<MatchmakingPlayer>> {
        // Tournament matching would create brackets
        // For now, use skill-based matching
        self.skill_based_matching(match_size)
    }

    fn custom_matching(&mut self, match_size: u32) -> Vec<Vec<MatchmakingPlayer>> {
        // Custom matching logic would go here
        self.random_matching(match_size)
    }

    pub fn cleanup_expired_players(&mut self, current_time: i64) -> Vec<MatchmakingPlayer> {
        let mut expired = Vec::new();
        
        self.players.retain(|player| {
            if player.is_expired(current_time) {
                expired.push(player.clone());
                false
            } else {
                true
            }
        });
        
        expired
    }
}

/// Match creation utilities
pub struct MatchCreator;

impl MatchCreator {
    pub fn create_match_from_players(
        players: Vec<MatchmakingPlayer>,
        mode: MatchmakingMode,
    ) -> Result<MatchComponent> {
        let current_time = Clock::get()?.unix_timestamp;
        let player_keys: Vec<Pubkey> = players.iter().map(|p| p.player_key).collect();
        
        Ok(MatchComponent {
            match_id: current_time as u64, // Simple ID generation
            participants: player_keys,
            current_turn: 0,
            turn_deadline: current_time + 60, // 1 minute turns
            state: MatchState::Waiting,
            configuration: crate::MatchConfiguration {
                max_players: players.len() as u32,
                turn_timeout: 60,
                match_duration: 1800, // 30 minutes
                entry_fee: 0,
                reward_pool: 0,
            },
            results: Vec::new(),
        })
    }

    pub fn calculate_skill_adjustment(
        winner_skill: u32,
        loser_skill: u32,
        k_factor: u32,
    ) -> (i32, i32) {
        let skill_diff = winner_skill as i32 - loser_skill as i32;
        let expected_winner = 1.0 / (1.0 + 10.0_f32.powf(-skill_diff as f32 / 400.0));
        
        let winner_change = (k_factor as f32 * (1.0 - expected_winner)) as i32;
        let loser_change = -(k_factor as f32 * expected_winner) as i32;
        
        (winner_change, loser_change)
    }
}

/// Result of matchmaking processing
#[derive(Debug)]
pub struct MatchmakingResult {
    pub matches_processed: u32,
    pub players_matched: u32,
    pub new_matches_created: u32,
}

#[event]
pub struct MatchmakingSystemExecuted {
    pub matches_processed: u32,
    pub players_matched: u32,
    pub execution_time_ms: u32,
    pub timestamp: i64,
}

#[event]
pub struct MatchCreated {
    pub match_id: u64,
    pub participants: Vec<Pubkey>,
    pub mode: MatchmakingMode,
    pub timestamp: i64,
}

#[event]
pub struct PlayerMatched {
    pub player: Pubkey,
    pub match_id: u64,
    pub queue_time: i64,
    pub timestamp: i64,
}

#[error_code]
pub enum MatchmakingError {
    #[msg("Queue is full")]
    QueueFull,
    #[msg("Player not found in queue")]
    PlayerNotInQueue,
    #[msg("Invalid match configuration")]
    InvalidMatchConfig,
    #[msg("Insufficient players")]
    InsufficientPlayers,
}

use crate::shared;