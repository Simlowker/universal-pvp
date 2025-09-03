use bolt_lang::*;
use anchor_lang::prelude::*;
use crate::components::*;
use crate::systems::session_system::SessionKey;
use std::collections::{HashMap, VecDeque};

/// Optimistic Update System for instant client-side responses
pub struct OptimisticSystem;

/// Optimistic transaction state
#[derive(Clone, Debug, PartialEq)]
pub enum OptimisticState {
    Pending,      // Applied locally, waiting for confirmation
    Confirmed,    // Confirmed by Ephemeral Rollup
    Conflicted,   // Conflicted with another transaction
    Rolled_Back,  // Rolled back due to failure
    Expired,      // Expired without confirmation
}

/// Optimistic update record
#[derive(Clone, Debug)]
pub struct OptimisticUpdate {
    pub id: u64,                    // Unique update ID
    pub entity_id: Pubkey,          // Entity being updated
    pub session_key: Pubkey,        // Session key that initiated update
    pub action_type: String,        // Type of action (MOVE, ATTACK, etc.)
    pub timestamp: i64,             // When update was created
    pub expires_at: i64,           // When update expires
    pub state: OptimisticState,     // Current state of update
    pub original_data: Vec<u8>,     // Original component data before update
    pub updated_data: Vec<u8>,      // New component data after update
    pub dependencies: Vec<u64>,     // Updates this depends on
    pub conflicts_with: Vec<u64>,   // Updates that conflict with this one
    pub confirmation_hash: Option<[u8; 32]>, // Hash from ER confirmation
    pub retry_count: u8,           // Number of retry attempts
    pub priority: u8,              // Update priority (0-255)
}

/// Optimistic update manager
pub struct OptimisticUpdateManager {
    pub pending_updates: HashMap<u64, OptimisticUpdate>,
    pub update_queue: VecDeque<u64>,
    pub confirmed_updates: VecDeque<u64>,
    pub next_id: u64,
    pub max_pending: usize,
    pub default_expiry: i64,
}

impl OptimisticUpdateManager {
    pub fn new(max_pending: usize, default_expiry: i64) -> Self {
        Self {
            pending_updates: HashMap::new(),
            update_queue: VecDeque::new(),
            confirmed_updates: VecDeque::new(),
            next_id: 1,
            max_pending,
            default_expiry,
        }
    }
    
    /// Create a new optimistic update
    pub fn create_update(
        &mut self,
        entity_id: Pubkey,
        session_key: Pubkey,
        action_type: String,
        original_data: Vec<u8>,
        updated_data: Vec<u8>,
        priority: u8,
        clock: &Clock,
    ) -> Result<u64> {
        // Check if we have too many pending updates
        if self.pending_updates.len() >= self.max_pending {
            self.cleanup_expired(clock);
            if self.pending_updates.len() >= self.max_pending {
                return Err(ProgramError::AccountDataTooSmall); // Too many pending updates
            }
        }
        
        let update_id = self.next_id;
        self.next_id += 1;
        
        let update = OptimisticUpdate {
            id: update_id,
            entity_id,
            session_key,
            action_type,
            timestamp: clock.unix_timestamp,
            expires_at: clock.unix_timestamp + self.default_expiry,
            state: OptimisticState::Pending,
            original_data,
            updated_data,
            dependencies: Vec::new(),
            conflicts_with: Vec::new(),
            confirmation_hash: None,
            retry_count: 0,
            priority,
        };
        
        self.pending_updates.insert(update_id, update);
        self.update_queue.push_back(update_id);
        
        Ok(update_id)
    }
    
    /// Apply optimistic update immediately
    pub fn apply_optimistic_update(
        &mut self,
        update_id: u64,
        position: Option<&mut Position>,
        health: Option<&mut Health>,
        combat: Option<&mut Combat>,
        clock: &Clock,
    ) -> Result<bool> {
        let update = self.pending_updates.get_mut(&update_id)
            .ok_or(ProgramError::InvalidArgument)?;
        
        if update.state != OptimisticState::Pending {
            return Ok(false);
        }
        
        // Apply update based on action type
        match update.action_type.as_str() {
            "MOVE" => {
                if let Some(pos) = position {
                    Self::apply_movement_update(pos, &update.updated_data, clock)?;
                }
            },
            "ATTACK" | "HEAVY_ATTACK" => {
                if let (Some(combat_comp), Some(health_comp)) = (combat, health) {
                    Self::apply_combat_update(combat_comp, health_comp, &update.updated_data, clock)?;
                }
            },
            "HEAL" | "USE_ITEM" => {
                if let Some(health_comp) = health {
                    Self::apply_health_update(health_comp, &update.updated_data, clock)?;
                }
            },
            _ => {
                return Err(ProgramError::InvalidInstructionData);
            }
        }
        
        Ok(true)
    }
    
    /// Confirm an optimistic update
    pub fn confirm_update(
        &mut self,
        update_id: u64,
        confirmation_hash: [u8; 32],
        clock: &Clock,
    ) -> Result<bool> {
        if let Some(update) = self.pending_updates.get_mut(&update_id) {
            if update.state == OptimisticState::Pending {
                update.state = OptimisticState::Confirmed;
                update.confirmation_hash = Some(confirmation_hash);
                self.confirmed_updates.push_back(update_id);
                
                // Keep only last 100 confirmed updates
                if self.confirmed_updates.len() > 100 {
                    if let Some(old_id) = self.confirmed_updates.pop_front() {
                        self.pending_updates.remove(&old_id);
                    }
                }
                
                return Ok(true);
            }
        }
        Ok(false)
    }
    
    /// Handle update conflict
    pub fn handle_conflict(
        &mut self,
        update_id: u64,
        conflicting_update_id: u64,
        resolution_strategy: ConflictResolution,
        clock: &Clock,
    ) -> Result<ConflictResult> {
        let (update1_exists, update2_exists) = (
            self.pending_updates.contains_key(&update_id),
            self.pending_updates.contains_key(&conflicting_update_id),
        );
        
        if !update1_exists || !update2_exists {
            return Ok(ConflictResult {
                resolved: false,
                winner_id: None,
                loser_id: None,
                reason: "One or both updates not found".to_string(),
            });
        }
        
        let winner_id = match resolution_strategy {
            ConflictResolution::Timestamp => {
                // Keep the earlier update
                let update1_time = self.pending_updates[&update_id].timestamp;
                let update2_time = self.pending_updates[&conflicting_update_id].timestamp;
                
                if update1_time <= update2_time { update_id } else { conflicting_update_id }
            },
            ConflictResolution::Priority => {
                // Keep the higher priority update
                let update1_priority = self.pending_updates[&update_id].priority;
                let update2_priority = self.pending_updates[&conflicting_update_id].priority;
                
                if update1_priority >= update2_priority { update_id } else { conflicting_update_id }
            },
            ConflictResolution::SessionAuthority => {
                // In a real implementation, this would check session authority
                update_id // Default to first update for now
            },
        };
        
        let loser_id = if winner_id == update_id { conflicting_update_id } else { update_id };
        
        // Mark conflicted updates
        if let Some(winner) = self.pending_updates.get_mut(&winner_id) {
            winner.conflicts_with.push(loser_id);
        }
        
        if let Some(loser) = self.pending_updates.get_mut(&loser_id) {
            loser.state = OptimisticState::Conflicted;
            loser.conflicts_with.push(winner_id);
        }
        
        Ok(ConflictResult {
            resolved: true,
            winner_id: Some(winner_id),
            loser_id: Some(loser_id),
            reason: format!("Resolved using {:?} strategy", resolution_strategy),
        })
    }
    
    /// Rollback an optimistic update
    pub fn rollback_update(
        &mut self,
        update_id: u64,
        position: Option<&mut Position>,
        health: Option<&mut Health>,
        combat: Option<&mut Combat>,
        clock: &Clock,
    ) -> Result<bool> {
        if let Some(update) = self.pending_updates.get_mut(&update_id) {
            if update.state == OptimisticState::Pending || update.state == OptimisticState::Conflicted {
                // Restore original data
                match update.action_type.as_str() {
                    "MOVE" => {
                        if let Some(pos) = position {
                            Self::apply_movement_update(pos, &update.original_data, clock)?;
                        }
                    },
                    "ATTACK" | "HEAVY_ATTACK" => {
                        if let (Some(combat_comp), Some(health_comp)) = (combat, health) {
                            Self::apply_combat_update(combat_comp, health_comp, &update.original_data, clock)?;
                        }
                    },
                    "HEAL" | "USE_ITEM" => {
                        if let Some(health_comp) = health {
                            Self::apply_health_update(health_comp, &update.original_data, clock)?;
                        }
                    },
                    _ => {}
                }
                
                update.state = OptimisticState::Rolled_Back;
                return Ok(true);
            }
        }
        Ok(false)
    }
    
    /// Retry a failed optimistic update
    pub fn retry_update(
        &mut self,
        update_id: u64,
        max_retries: u8,
        clock: &Clock,
    ) -> Result<bool> {
        if let Some(update) = self.pending_updates.get_mut(&update_id) {
            if update.retry_count < max_retries {
                update.state = OptimisticState::Pending;
                update.retry_count += 1;
                update.expires_at = clock.unix_timestamp + self.default_expiry;
                return Ok(true);
            }
        }
        Ok(false)
    }
    
    /// Get all pending updates for an entity
    pub fn get_entity_pending_updates(&self, entity_id: &Pubkey) -> Vec<&OptimisticUpdate> {
        self.pending_updates
            .values()
            .filter(|update| &update.entity_id == entity_id && update.state == OptimisticState::Pending)
            .collect()
    }
    
    /// Clean up expired updates
    pub fn cleanup_expired(&mut self, clock: &Clock) -> usize {
        let initial_count = self.pending_updates.len();
        
        let expired_ids: Vec<u64> = self.pending_updates
            .iter()
            .filter(|(_, update)| {
                clock.unix_timestamp > update.expires_at ||
                matches!(update.state, OptimisticState::Rolled_Back | OptimisticState::Confirmed)
            })
            .map(|(id, _)| *id)
            .collect();
        
        for id in expired_ids {
            self.pending_updates.remove(&id);
        }
        
        // Clean up queues
        self.update_queue.retain(|id| self.pending_updates.contains_key(id));
        self.confirmed_updates.retain(|id| self.pending_updates.contains_key(id));
        
        initial_count - self.pending_updates.len()
    }
    
    /// Get update statistics
    pub fn get_statistics(&self) -> OptimisticStats {
        let mut stats = OptimisticStats::default();
        
        for update in self.pending_updates.values() {
            match update.state {
                OptimisticState::Pending => stats.pending += 1,
                OptimisticState::Confirmed => stats.confirmed += 1,
                OptimisticState::Conflicted => stats.conflicted += 1,
                OptimisticState::Rolled_Back => stats.rolled_back += 1,
                OptimisticState::Expired => stats.expired += 1,
            }
        }
        
        stats.total = self.pending_updates.len();
        stats
    }
    
    // Helper functions for applying updates
    
    fn apply_movement_update(position: &mut Position, data: &[u8], clock: &Clock) -> Result<()> {
        if data.len() >= 12 { // 3 * i32 for x, y, z
            let x = i32::from_le_bytes([data[0], data[1], data[2], data[3]]);
            let y = i32::from_le_bytes([data[4], data[5], data[6], data[7]]);
            let z = i32::from_le_bytes([data[8], data[9], data[10], data[11]]);
            
            position.move_to(x, y, z, clock).map_err(|_| ProgramError::InvalidInstructionData)?;
        }
        Ok(())
    }
    
    fn apply_combat_update(combat: &mut Combat, health: &mut Health, data: &[u8], clock: &Clock) -> Result<()> {
        if data.len() >= 4 {
            let damage = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
            health.take_damage(damage, clock).map_err(|_| ProgramError::InvalidInstructionData)?;
            combat.record_damage_dealt(damage).map_err(|_| ProgramError::InvalidInstructionData)?;
        }
        Ok(())
    }
    
    fn apply_health_update(health: &mut Health, data: &[u8], _clock: &Clock) -> Result<()> {
        if data.len() >= 4 {
            let heal_amount = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
            health.heal(heal_amount).map_err(|_| ProgramError::InvalidInstructionData)?;
        }
        Ok(())
    }
}

impl OptimisticSystem {
    /// Create optimistic movement update
    pub fn create_movement_update(
        manager: &mut OptimisticUpdateManager,
        entity_id: Pubkey,
        session_key: Pubkey,
        position: &Position,
        new_x: i32,
        new_y: i32,
        new_z: i32,
        clock: &Clock,
    ) -> Result<u64> {
        // Serialize current position data
        let mut original_data = Vec::new();
        original_data.extend_from_slice(&position.x.to_le_bytes());
        original_data.extend_from_slice(&position.y.to_le_bytes());
        original_data.extend_from_slice(&position.z.to_le_bytes());
        
        // Serialize new position data
        let mut updated_data = Vec::new();
        updated_data.extend_from_slice(&new_x.to_le_bytes());
        updated_data.extend_from_slice(&new_y.to_le_bytes());
        updated_data.extend_from_slice(&new_z.to_le_bytes());
        
        manager.create_update(
            entity_id,
            session_key,
            "MOVE".to_string(),
            original_data,
            updated_data,
            128, // Medium priority
            clock,
        )
    }
    
    /// Create optimistic combat update
    pub fn create_combat_update(
        manager: &mut OptimisticUpdateManager,
        entity_id: Pubkey,
        session_key: Pubkey,
        health: &Health,
        damage: u32,
        action_type: &str,
        clock: &Clock,
    ) -> Result<u64> {
        // Serialize current health
        let mut original_data = Vec::new();
        original_data.extend_from_slice(&health.current.to_le_bytes());
        
        // Calculate new health
        let new_health = health.current.saturating_sub(damage);
        let mut updated_data = Vec::new();
        updated_data.extend_from_slice(&new_health.to_le_bytes());
        
        let priority = match action_type {
            "ATTACK" => 192,      // High priority
            "HEAVY_ATTACK" => 255, // Maximum priority
            _ => 128,             // Medium priority
        };
        
        manager.create_update(
            entity_id,
            session_key,
            action_type.to_string(),
            original_data,
            updated_data,
            priority,
            clock,
        )
    }
    
    /// Process optimistic updates for real-time responsiveness
    pub fn process_optimistic_batch(
        manager: &mut OptimisticUpdateManager,
        position: Option<&mut Position>,
        health: Option<&mut Health>,
        combat: Option<&mut Combat>,
        max_updates_per_batch: usize,
        clock: &Clock,
    ) -> Result<BatchResult> {
        let mut processed = 0;
        let mut successful = 0;
        let mut failed = 0;
        
        while processed < max_updates_per_batch {
            if let Some(update_id) = manager.update_queue.pop_front() {
                match manager.apply_optimistic_update(
                    update_id,
                    position.as_deref_mut(),
                    health.as_deref_mut(),
                    combat.as_deref_mut(),
                    clock,
                ) {
                    Ok(true) => successful += 1,
                    Ok(false) => {}, // Update was not applicable
                    Err(_) => {
                        failed += 1;
                        // Try to rollback failed update
                        let _ = manager.rollback_update(
                            update_id,
                            position.as_deref_mut(),
                            health.as_deref_mut(),
                            combat.as_deref_mut(),
                            clock,
                        );
                    }
                }
                processed += 1;
            } else {
                break; // No more updates to process
            }
        }
        
        Ok(BatchResult {
            processed,
            successful,
            failed,
        })
    }
    
    /// Handle network confirmation of optimistic updates
    pub fn handle_confirmation_batch(
        manager: &mut OptimisticUpdateManager,
        confirmations: &[(u64, [u8; 32])], // (update_id, hash)
        clock: &Clock,
    ) -> Result<ConfirmationResult> {
        let mut confirmed = 0;
        let mut conflicts = 0;
        
        for &(update_id, hash) in confirmations {
            if manager.confirm_update(update_id, hash, clock)? {
                confirmed += 1;
            } else {
                // Update might be conflicted or expired
                if manager.pending_updates.get(&update_id)
                    .map(|u| u.state == OptimisticState::Conflicted)
                    .unwrap_or(false) {
                    conflicts += 1;
                }
            }
        }
        
        Ok(ConfirmationResult {
            confirmed,
            conflicts,
            total_processed: confirmations.len(),
        })
    }
}

// Supporting data structures

#[derive(Clone, Copy, Debug)]
pub enum ConflictResolution {
    Timestamp,        // Earliest update wins
    Priority,         // Higher priority wins
    SessionAuthority, // Session with higher authority wins
}

#[derive(Clone, Debug)]
pub struct ConflictResult {
    pub resolved: bool,
    pub winner_id: Option<u64>,
    pub loser_id: Option<u64>,
    pub reason: String,
}

#[derive(Clone, Debug)]
pub struct BatchResult {
    pub processed: usize,
    pub successful: usize,
    pub failed: usize,
}

#[derive(Clone, Debug)]
pub struct ConfirmationResult {
    pub confirmed: usize,
    pub conflicts: usize,
    pub total_processed: usize,
}

#[derive(Clone, Debug, Default)]
pub struct OptimisticStats {
    pub total: usize,
    pub pending: usize,
    pub confirmed: usize,
    pub conflicted: usize,
    pub rolled_back: usize,
    pub expired: usize,
}