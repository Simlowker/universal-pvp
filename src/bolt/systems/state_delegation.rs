use bolt_lang::*;
use anchor_lang::prelude::*;
use crate::components::*;
use crate::systems::session_system::SessionKey;

/// State Delegation System for Ephemeral Rollups Integration
pub struct StateDelegationSystem;

/// Delegation state for managing entity ownership in Ephemeral Rollups
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(C)]
pub struct DelegationState {
    pub entity_id: Pubkey,           // Entity being delegated
    pub original_owner: Pubkey,      // Original owner on mainnet
    pub delegated_to: Pubkey,        // Ephemeral Rollup authority
    pub delegation_type: u8,         // Type of delegation
    pub permissions: u32,            // Delegated permissions bitfield
    pub expires_at: i64,            // Delegation expiry timestamp
    pub created_at: i64,            // When delegation was created
    pub last_updated: i64,          // Last state update timestamp
    pub is_active: bool,            // Whether delegation is active
    pub rollup_id: Pubkey,          // Ephemeral Rollup identifier
    pub commit_frequency: u16,       // How often to commit back (seconds)
    pub last_commit: i64,           // Last commit to mainnet timestamp
    pub state_hash: [u8; 32],       // Hash of current state
    pub version: u64,               // State version for conflict resolution
    pub pending_commits: u16,       // Number of pending commits
}

unsafe impl Pod for DelegationState {}
unsafe impl Zeroable for DelegationState {}

impl Default for DelegationState {
    fn default() -> Self {
        Self {
            entity_id: Pubkey::default(),
            original_owner: Pubkey::default(),
            delegated_to: Pubkey::default(),
            delegation_type: DelegationType::Full as u8,
            permissions: 0,
            expires_at: 0,
            created_at: 0,
            last_updated: 0,
            is_active: false,
            rollup_id: Pubkey::default(),
            commit_frequency: 30, // Default 30 seconds
            last_commit: 0,
            state_hash: [0; 32],
            version: 0,
            pending_commits: 0,
        }
    }
}

/// Types of state delegation
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum DelegationType {
    Full = 0,        // Full control delegation
    Partial = 1,     // Limited permissions
    ReadOnly = 2,    // Read-only access
    Temporary = 3,   // Time-limited delegation
}

/// Permissions for delegated state operations
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u32)]
pub enum DelegationPermission {
    Read = 1 << 0,           // Read entity state
    UpdatePosition = 1 << 1,  // Update position component
    UpdateHealth = 1 << 2,    // Update health component
    UpdateCombat = 1 << 3,    // Update combat component
    CreateEntity = 1 << 4,    // Create new entities
    DeleteEntity = 1 << 5,    // Delete entities
    TransferOwnership = 1 << 6, // Transfer entity ownership
    CommitState = 1 << 7,     // Commit state to mainnet
}

impl DelegationPermission {
    /// Get all read permissions
    pub fn read_permissions() -> u32 {
        Self::Read as u32
    }
    
    /// Get basic game update permissions
    pub fn game_update_permissions() -> u32 {
        Self::Read as u32 |
        Self::UpdatePosition as u32 |
        Self::UpdateHealth as u32 |
        Self::UpdateCombat as u32
    }
    
    /// Get full permissions for Ephemeral Rollups
    pub fn full_er_permissions() -> u32 {
        Self::game_update_permissions() |
        Self::CreateEntity as u32 |
        Self::CommitState as u32
    }
}

impl DelegationState {
    pub const SIZE: usize = 32 + 32 + 32 + 1 + 4 + 8 + 8 + 8 + 1 + 32 + 2 + 8 + 32 + 8 + 2; // ~210 bytes
    
    /// Create a new delegation state
    pub fn new(
        entity_id: Pubkey,
        original_owner: Pubkey,
        delegated_to: Pubkey,
        rollup_id: Pubkey,
        delegation_type: DelegationType,
        permissions: u32,
        duration_seconds: i64,
        commit_frequency: u16,
        clock: &Clock,
    ) -> Self {
        let state_hash = Self::calculate_initial_hash(&entity_id, &original_owner, clock.unix_timestamp);
        
        Self {
            entity_id,
            original_owner,
            delegated_to,
            delegation_type: delegation_type as u8,
            permissions,
            expires_at: clock.unix_timestamp + duration_seconds,
            created_at: clock.unix_timestamp,
            last_updated: clock.unix_timestamp,
            is_active: true,
            rollup_id,
            commit_frequency,
            last_commit: clock.unix_timestamp,
            state_hash,
            version: 1,
            pending_commits: 0,
        }
    }
    
    /// Check if delegation is valid and active
    pub fn is_valid(&self, clock: &Clock) -> bool {
        self.is_active && 
        clock.unix_timestamp <= self.expires_at &&
        self.pending_commits < 1000 // Prevent too many pending commits
    }
    
    /// Check if operation is permitted
    pub fn has_permission(&self, permission: u32) -> bool {
        (self.permissions & permission) != 0
    }
    
    /// Update state and increment version
    pub fn update_state(
        &mut self,
        new_state_hash: [u8; 32],
        clock: &Clock,
    ) -> Result<()> {
        if !self.is_valid(clock) {
            return Err(ProgramError::InvalidAccountData);
        }
        
        self.state_hash = new_state_hash;
        self.version = self.version.checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.last_updated = clock.unix_timestamp;
        self.pending_commits = self.pending_commits.saturating_add(1);
        
        Ok(())
    }
    
    /// Check if state needs to be committed to mainnet
    pub fn needs_commit(&self, clock: &Clock) -> bool {
        if !self.is_active || self.pending_commits == 0 {
            return false;
        }
        
        // Commit if frequency interval has passed or too many pending commits
        (clock.unix_timestamp - self.last_commit) >= self.commit_frequency as i64 ||
        self.pending_commits >= 100
    }
    
    /// Mark state as committed to mainnet
    pub fn mark_committed(&mut self, committed_version: u64, clock: &Clock) -> Result<()> {
        if committed_version > self.version {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Calculate how many commits were processed
        let commits_processed = (self.version - committed_version + 1).min(self.pending_commits as u64);
        self.pending_commits = self.pending_commits.saturating_sub(commits_processed as u16);
        
        self.last_commit = clock.unix_timestamp;
        Ok(())
    }
    
    /// Extend delegation duration
    pub fn extend_delegation(
        &mut self,
        additional_seconds: i64,
        clock: &Clock,
    ) -> Result<()> {
        if !self.is_valid(clock) {
            return Err(ProgramError::InvalidAccountData);
        }
        
        self.expires_at = self.expires_at.checked_add(additional_seconds)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.last_updated = clock.unix_timestamp;
        
        Ok(())
    }
    
    /// Revoke delegation
    pub fn revoke(&mut self, clock: &Clock) {
        self.is_active = false;
        self.last_updated = clock.unix_timestamp;
    }
    
    /// Update delegation permissions
    pub fn update_permissions(&mut self, new_permissions: u32, clock: &Clock) -> Result<()> {
        if !self.is_valid(clock) {
            return Err(ProgramError::InvalidAccountData);
        }
        
        self.permissions = new_permissions;
        self.last_updated = clock.unix_timestamp;
        Ok(())
    }
    
    /// Calculate state hash for integrity verification
    fn calculate_initial_hash(entity_id: &Pubkey, owner: &Pubkey, timestamp: i64) -> [u8; 32] {
        use solana_program::hash::{hash, Hash};
        
        let mut data = Vec::new();
        data.extend_from_slice(entity_id.as_ref());
        data.extend_from_slice(owner.as_ref());
        data.extend_from_slice(&timestamp.to_le_bytes());
        
        let hash_result = hash(&data);
        hash_result.to_bytes()
    }
}

impl StateDelegationSystem {
    /// Create entity delegation for Ephemeral Rollup
    pub fn create_entity_delegation(
        entity_id: Pubkey,
        owner: Pubkey,
        rollup_authority: Pubkey,
        rollup_id: Pubkey,
        delegation_type: DelegationType,
        duration_seconds: i64,
        clock: &Clock,
    ) -> Result<DelegationState> {
        // Determine permissions based on delegation type
        let permissions = match delegation_type {
            DelegationType::Full => DelegationPermission::full_er_permissions(),
            DelegationType::Partial => DelegationPermission::game_update_permissions(),
            DelegationType::ReadOnly => DelegationPermission::read_permissions(),
            DelegationType::Temporary => DelegationPermission::game_update_permissions(),
        };
        
        // Set commit frequency based on type
        let commit_frequency = match delegation_type {
            DelegationType::Full => 30,      // 30 seconds for full delegation
            DelegationType::Partial => 15,   // 15 seconds for partial
            DelegationType::ReadOnly => 300, // 5 minutes for read-only
            DelegationType::Temporary => 10, // 10 seconds for temporary
        };
        
        let delegation = DelegationState::new(
            entity_id,
            owner,
            rollup_authority,
            rollup_id,
            delegation_type,
            permissions,
            duration_seconds,
            commit_frequency,
            clock,
        );
        
        Ok(delegation)
    }
    
    /// Delegate player entity to Ephemeral Rollup for gaming session
    pub fn delegate_player_for_match(
        player_entity: Pubkey,
        player_authority: Pubkey,
        rollup_authority: Pubkey,
        rollup_id: Pubkey,
        match_duration_seconds: i64,
        clock: &Clock,
    ) -> Result<DelegationState> {
        Self::create_entity_delegation(
            player_entity,
            player_authority,
            rollup_authority,
            rollup_id,
            DelegationType::Full, // Full delegation for matches
            match_duration_seconds,
            clock,
        )
    }
    
    /// Update delegated entity state
    pub fn update_delegated_state(
        delegation: &mut DelegationState,
        components: &[ComponentUpdate],
        clock: &Clock,
    ) -> Result<StateUpdateResult> {
        if !delegation.is_valid(clock) {
            return Ok(StateUpdateResult::failed("Delegation is not valid"));
        }
        
        // Check if rollup has permission to update
        let required_permission = Self::get_required_permission(components);
        if !delegation.has_permission(required_permission) {
            return Ok(StateUpdateResult::failed("Insufficient permissions"));
        }
        
        // Calculate new state hash
        let new_state_hash = Self::calculate_state_hash(components);
        
        // Update delegation state
        delegation.update_state(new_state_hash, clock)?;
        
        Ok(StateUpdateResult {
            success: true,
            new_version: delegation.version,
            state_hash: delegation.state_hash,
            pending_commits: delegation.pending_commits,
            needs_commit: delegation.needs_commit(clock),
            message: "State updated successfully".to_string(),
        })
    }
    
    /// Batch update multiple delegated entities
    pub fn batch_update_delegated_state(
        delegations: &mut [DelegationState],
        updates: &[BatchStateUpdate],
        clock: &Clock,
    ) -> Result<Vec<StateUpdateResult>> {
        let mut results = Vec::with_capacity(updates.len());
        
        for (i, update) in updates.iter().enumerate() {
            if i >= delegations.len() {
                results.push(StateUpdateResult::failed("No matching delegation"));
                continue;
            }
            
            let result = Self::update_delegated_state(
                &mut delegations[i],
                &update.components,
                clock,
            )?;
            
            results.push(result);
        }
        
        Ok(results)
    }
    
    /// Commit delegated state changes back to mainnet
    pub fn commit_state_to_mainnet(
        delegation: &mut DelegationState,
        committed_version: u64,
        clock: &Clock,
    ) -> Result<CommitResult> {
        if !delegation.is_valid(clock) {
            return Ok(CommitResult::failed("Delegation is not valid"));
        }
        
        if !delegation.has_permission(DelegationPermission::CommitState as u32) {
            return Ok(CommitResult::failed("No commit permission"));
        }
        
        if committed_version > delegation.version {
            return Ok(CommitResult::failed("Invalid commit version"));
        }
        
        delegation.mark_committed(committed_version, clock)?;
        
        Ok(CommitResult {
            success: true,
            committed_version,
            pending_commits: delegation.pending_commits,
            next_commit_time: delegation.last_commit + delegation.commit_frequency as i64,
            message: "State committed to mainnet".to_string(),
        })
    }
    
    /// Auto-commit states that need committing
    pub fn auto_commit_states(
        delegations: &mut [DelegationState],
        clock: &Clock,
    ) -> Result<Vec<CommitResult>> {
        let mut results = Vec::new();
        
        for delegation in delegations.iter_mut() {
            if delegation.needs_commit(clock) {
                let result = Self::commit_state_to_mainnet(
                    delegation,
                    delegation.version,
                    clock,
                )?;
                results.push(result);
            }
        }
        
        Ok(results)
    }
    
    /// Handle delegation conflicts (when multiple rollups try to update same entity)
    pub fn resolve_delegation_conflict(
        delegations: &mut [DelegationState],
        conflict_entity: Pubkey,
        clock: &Clock,
    ) -> Result<ConflictResolution> {
        let mut conflicting_delegations: Vec<_> = delegations
            .iter_mut()
            .filter(|d| d.entity_id == conflict_entity && d.is_valid(clock))
            .collect();
        
        if conflicting_delegations.len() <= 1 {
            return Ok(ConflictResolution::no_conflict());
        }
        
        // Resolve by timestamp - keep the most recent delegation
        conflicting_delegations.sort_by_key(|d| d.last_updated);
        
        let winner_idx = conflicting_delegations.len() - 1;
        let winner_version = conflicting_delegations[winner_idx].version;
        
        // Revoke other conflicting delegations
        for (i, delegation) in conflicting_delegations.iter_mut().enumerate() {
            if i != winner_idx {
                delegation.revoke(clock);
            }
        }
        
        Ok(ConflictResolution {
            resolved: true,
            winner_version,
            revoked_count: conflicting_delegations.len() - 1,
            resolution_method: "timestamp".to_string(),
        })
    }
    
    /// Clean up expired delegations
    pub fn cleanup_expired_delegations(
        delegations: &mut Vec<DelegationState>,
        clock: &Clock,
    ) -> usize {
        let initial_count = delegations.len();
        delegations.retain(|d| d.is_valid(clock));
        initial_count - delegations.len()
    }
    
    // Helper functions
    
    fn get_required_permission(components: &[ComponentUpdate]) -> u32 {
        let mut required = 0u32;
        
        for component in components {
            required |= match component.component_type.as_str() {
                "position" => DelegationPermission::UpdatePosition as u32,
                "health" => DelegationPermission::UpdateHealth as u32,
                "combat" => DelegationPermission::UpdateCombat as u32,
                _ => DelegationPermission::Read as u32,
            };
        }
        
        required
    }
    
    fn calculate_state_hash(components: &[ComponentUpdate]) -> [u8; 32] {
        use solana_program::hash::{hash, Hash};
        
        let mut data = Vec::new();
        for component in components {
            data.extend_from_slice(component.component_type.as_bytes());
            data.extend_from_slice(&component.data);
        }
        
        let hash_result = hash(&data);
        hash_result.to_bytes()
    }
}

// Supporting data structures

#[derive(Clone, Debug)]
pub struct ComponentUpdate {
    pub component_type: String,
    pub data: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct BatchStateUpdate {
    pub entity_id: Pubkey,
    pub components: Vec<ComponentUpdate>,
}

#[derive(Clone, Debug)]
pub struct StateUpdateResult {
    pub success: bool,
    pub new_version: u64,
    pub state_hash: [u8; 32],
    pub pending_commits: u16,
    pub needs_commit: bool,
    pub message: String,
}

impl StateUpdateResult {
    fn failed(message: &str) -> Self {
        Self {
            success: false,
            new_version: 0,
            state_hash: [0; 32],
            pending_commits: 0,
            needs_commit: false,
            message: message.to_string(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct CommitResult {
    pub success: bool,
    pub committed_version: u64,
    pub pending_commits: u16,
    pub next_commit_time: i64,
    pub message: String,
}

impl CommitResult {
    fn failed(message: &str) -> Self {
        Self {
            success: false,
            committed_version: 0,
            pending_commits: 0,
            next_commit_time: 0,
            message: message.to_string(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct ConflictResolution {
    pub resolved: bool,
    pub winner_version: u64,
    pub revoked_count: usize,
    pub resolution_method: String,
}

impl ConflictResolution {
    fn no_conflict() -> Self {
        Self {
            resolved: false,
            winner_version: 0,
            revoked_count: 0,
            resolution_method: "none".to_string(),
        }
    }
}