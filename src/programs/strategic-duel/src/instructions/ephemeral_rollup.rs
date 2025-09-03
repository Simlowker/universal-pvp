use anchor_lang::prelude::*;
use bolt_lang::*;
use crate::components::*;

/// Ephemeral Rollup State Delegation for MagicBlock integration
#[derive(Accounts)]
pub struct EphemeralRollupDelegation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: MagicBlock validator authority
    pub validator: AccountInfo<'info>,

    /// CHECK: World PDA
    #[account(mut)]
    pub world: AccountInfo<'info>,

    /// CHECK: Entity for the duel
    #[account(mut)]
    pub entity: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"duel", entity.key().as_ref()],
        bump
    )]
    pub duel: Account<'info, ComponentData<DuelComponent>>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + std::mem::size_of::<EphemeralRollupComponent>(),
        seeds = [b"ephemeral_rollup", entity.key().as_ref()],
        bump
    )]
    pub ephemeral_rollup: Account<'info, ComponentData<EphemeralRollupComponent>>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + std::mem::size_of::<StateTransitionComponent>(),
        seeds = [b"state_transition", entity.key().as_ref()],
        bump
    )]
    pub state_transition: Account<'info, ComponentData<StateTransitionComponent>>,

    /// CHECK: Session token for rollup access
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + std::mem::size_of::<SessionTokenComponent>(),
        seeds = [b"session_token", entity.key().as_ref(), authority.key().as_ref()],
        bump
    )]
    pub session_token: Account<'info, ComponentData<SessionTokenComponent>>,

    pub system_program: Program<'info, System>,
}

/// Ephemeral Rollup Component for managing rollup state
#[component]
#[derive(Default)]
pub struct EphemeralRollupComponent {
    pub duel_id: u64,
    pub rollup_id: [u8; 32],
    pub delegation_timestamp: i64,
    pub expiration_timestamp: i64,
    pub validator_pubkey: Pubkey,
    pub rollup_status: RollupStatus,
    pub state_checkpoints: Vec<StateCheckpoint>,
    pub transaction_count: u64,
    pub gas_used: u64,
    pub delegation_proof: [u8; 256],
    pub is_active: bool,
    pub can_finalize: bool,
    pub emergency_exit_enabled: bool,
}

/// State Transition Component for tracking state changes
#[component]
#[derive(Default)]
pub struct StateTransitionComponent {
    pub duel_id: u64,
    pub transition_id: u64,
    pub from_state: GameState,
    pub to_state: GameState,
    pub transition_timestamp: i64,
    pub transition_data: [u8; 256],
    pub merkle_proof: [u8; 256],
    pub optimistic_confirmation: bool,
    pub challenge_window_end: i64,
    pub is_disputed: bool,
}

/// Session Token Component for secure rollup access
#[component]
#[derive(Default)]
pub struct SessionTokenComponent {
    pub session_id: [u8; 32],
    pub player: Pubkey,
    pub duel_id: u64,
    pub created_at: i64,
    pub expires_at: i64,
    pub permissions: SessionPermissions,
    pub nonce: u64,
    pub is_active: bool,
    pub delegated_to_rollup: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum RollupStatus {
    Initializing,
    Active,
    Finalizing,
    Finalized,
    Disputed,
    EmergencyExit,
}

impl Default for RollupStatus {
    fn default() -> Self {
        RollupStatus::Initializing
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StateCheckpoint {
    pub checkpoint_id: u64,
    pub state_root: [u8; 32],
    pub timestamp: i64,
    pub transaction_count: u64,
    pub merkle_root: [u8; 32],
}

impl Default for StateCheckpoint {
    fn default() -> Self {
        StateCheckpoint {
            checkpoint_id: 0,
            state_root: [0u8; 32],
            timestamp: 0,
            transaction_count: 0,
            merkle_root: [0u8; 32],
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub struct SessionPermissions {
    pub can_make_moves: bool,
    pub can_access_state: bool,
    pub can_initiate_settlement: bool,
    pub emergency_exit_allowed: bool,
}

impl Default for SessionPermissions {
    fn default() -> Self {
        SessionPermissions {
            can_make_moves: true,
            can_access_state: true,
            can_initiate_settlement: false,
            emergency_exit_allowed: true,
        }
    }
}

impl<'info> EphemeralRollupDelegation<'info> {
    pub fn delegate_to_rollup(
        &mut self,
        rollup_duration: i64,
        delegation_proof: [u8; 256],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        let mut duel = self.duel.load_mut()?;
        let mut rollup = self.ephemeral_rollup.load_mut()?;
        let mut session_token = self.session_token.load_mut()?;

        // Verify game state is suitable for rollup delegation
        require!(
            matches!(duel.game_state, GameState::InProgress | GameState::AwaitingAction),
            GameError::InvalidGameState
        );

        // Initialize rollup
        rollup.duel_id = duel.duel_id;
        rollup.rollup_id = self.generate_rollup_id(&duel, current_time);
        rollup.delegation_timestamp = current_time;
        rollup.expiration_timestamp = current_time + rollup_duration;
        rollup.validator_pubkey = self.validator.key();
        rollup.rollup_status = RollupStatus::Initializing;
        rollup.delegation_proof = delegation_proof;
        rollup.is_active = true;
        rollup.emergency_exit_enabled = true;

        // Create initial state checkpoint
        let initial_checkpoint = StateCheckpoint {
            checkpoint_id: 0,
            state_root: self.calculate_current_state_root(&duel)?,
            timestamp: current_time,
            transaction_count: 0,
            merkle_root: self.generate_initial_merkle_root(&duel)?,
        };
        rollup.state_checkpoints = vec![initial_checkpoint];

        // Initialize session token
        session_token.session_id = self.generate_session_id(&duel, current_time);
        session_token.player = self.authority.key();
        session_token.duel_id = duel.duel_id;
        session_token.created_at = current_time;
        session_token.expires_at = current_time + rollup_duration;
        session_token.permissions = SessionPermissions::default();
        session_token.nonce = 0;
        session_token.is_active = true;
        session_token.delegated_to_rollup = true;

        // Update duel to indicate rollup delegation
        duel.rollup_delegated = true;
        duel.rollup_id = Some(rollup.rollup_id);

        // Activate rollup
        rollup.rollup_status = RollupStatus::Active;

        emit!(RollupDelegatedEvent {
            duel_id: duel.duel_id,
            rollup_id: rollup.rollup_id,
            validator: rollup.validator_pubkey,
            expiration: rollup.expiration_timestamp,
            session_id: session_token.session_id,
        });

        Ok(())
    }

    pub fn create_state_transition(
        &mut self,
        from_state: GameState,
        to_state: GameState,
        transition_data: [u8; 256],
        merkle_proof: [u8; 256],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        let rollup = self.ephemeral_rollup.load()?;
        let mut transition = self.state_transition.load_mut()?;

        // Verify rollup is active
        require!(rollup.is_active, GameError::RollupNotActive);
        require!(rollup.rollup_status == RollupStatus::Active, GameError::InvalidRollupStatus);
        require!(current_time < rollup.expiration_timestamp, GameError::RollupExpired);

        // Generate unique transition ID
        let transition_id = self.generate_transition_id(current_time, rollup.transaction_count);

        // Initialize state transition
        transition.duel_id = rollup.duel_id;
        transition.transition_id = transition_id;
        transition.from_state = from_state;
        transition.to_state = to_state;
        transition.transition_timestamp = current_time;
        transition.transition_data = transition_data;
        transition.merkle_proof = merkle_proof;
        transition.optimistic_confirmation = true;
        transition.challenge_window_end = current_time + 300; // 5 minute challenge window
        transition.is_disputed = false;

        // Verify state transition is valid
        self.validate_state_transition(&transition)?;

        emit!(StateTransitionEvent {
            duel_id: transition.duel_id,
            transition_id,
            from_state,
            to_state,
            timestamp: current_time,
            optimistic: transition.optimistic_confirmation,
        });

        Ok(())
    }

    pub fn finalize_rollup(&mut self) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        let mut rollup = self.ephemeral_rollup.load_mut()?;
        let mut duel = self.duel.load_mut()?;
        let state_transition = self.state_transition.load()?;

        // Verify rollup can be finalized
        require!(rollup.is_active, GameError::RollupNotActive);
        require!(rollup.can_finalize, GameError::CannotFinalizeRollup);
        require!(!state_transition.is_disputed, GameError::TransitionDisputed);
        require!(current_time > state_transition.challenge_window_end, GameError::ChallengeWindowActive);

        // Create final checkpoint
        let final_checkpoint = StateCheckpoint {
            checkpoint_id: rollup.state_checkpoints.len() as u64,
            state_root: self.calculate_final_state_root(&duel, &rollup)?,
            timestamp: current_time,
            transaction_count: rollup.transaction_count,
            merkle_root: self.generate_final_merkle_root(&duel, &rollup)?,
        };
        rollup.state_checkpoints.push(final_checkpoint);

        // Finalize rollup
        rollup.rollup_status = RollupStatus::Finalized;
        rollup.is_active = false;
        rollup.can_finalize = false;

        // Update duel state
        duel.rollup_delegated = false;
        duel.rollup_finalized = true;
        duel.game_state = state_transition.to_state;

        emit!(RollupFinalizedEvent {
            duel_id: duel.duel_id,
            rollup_id: rollup.rollup_id,
            final_state: state_transition.to_state,
            transaction_count: rollup.transaction_count,
            gas_used: rollup.gas_used,
        });

        Ok(())
    }

    pub fn emergency_exit(&mut self) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        let mut rollup = self.ephemeral_rollup.load_mut()?;
        let mut duel = self.duel.load_mut()?;
        let mut session_token = self.session_token.load_mut()?;

        // Verify emergency exit is allowed
        require!(rollup.emergency_exit_enabled, GameError::EmergencyExitDisabled);
        require!(session_token.permissions.emergency_exit_allowed, GameError::EmergencyExitNotPermitted);

        // Perform emergency state recovery
        self.recover_state_from_last_checkpoint(&mut duel, &rollup)?;

        // Deactivate rollup
        rollup.rollup_status = RollupStatus::EmergencyExit;
        rollup.is_active = false;
        rollup.emergency_exit_enabled = false;

        // Deactivate session
        session_token.is_active = false;
        session_token.delegated_to_rollup = false;

        // Reset duel rollup state
        duel.rollup_delegated = false;
        duel.rollup_id = None;

        emit!(EmergencyExitEvent {
            duel_id: duel.duel_id,
            rollup_id: rollup.rollup_id,
            exit_timestamp: current_time,
            recovered_state: duel.game_state,
        });

        Ok(())
    }

    // Helper functions
    fn generate_rollup_id(&self, duel: &DuelComponent, timestamp: i64) -> [u8; 32] {
        let mut id_data = Vec::new();
        id_data.extend_from_slice(&duel.duel_id.to_le_bytes());
        id_data.extend_from_slice(&timestamp.to_le_bytes());
        id_data.extend_from_slice(self.validator.key().as_ref());
        self.hash_bytes(&id_data)
    }

    fn generate_session_id(&self, duel: &DuelComponent, timestamp: i64) -> [u8; 32] {
        let mut session_data = Vec::new();
        session_data.extend_from_slice(&duel.duel_id.to_le_bytes());
        session_data.extend_from_slice(self.authority.key().as_ref());
        session_data.extend_from_slice(&timestamp.to_le_bytes());
        self.hash_bytes(&session_data)
    }

    fn generate_transition_id(&self, timestamp: i64, tx_count: u64) -> u64 {
        ((timestamp as u64) << 32) | (tx_count & 0xFFFFFFFF)
    }

    fn calculate_current_state_root(&self, duel: &DuelComponent) -> Result<[u8; 32]> {
        let mut state_data = Vec::new();
        state_data.extend_from_slice(&duel.duel_id.to_le_bytes());
        state_data.push(duel.game_state as u8);
        state_data.extend_from_slice(&duel.current_round.to_le_bytes());
        state_data.extend_from_slice(&duel.last_action_time.to_le_bytes());
        Ok(self.hash_bytes(&state_data))
    }

    fn generate_initial_merkle_root(&self, duel: &DuelComponent) -> Result<[u8; 32]> {
        let leaves = vec![
            self.hash_bytes(&duel.duel_id.to_le_bytes()),
            self.hash_bytes(&[duel.game_state as u8]),
            self.hash_bytes(duel.player_one.as_ref()),
            self.hash_bytes(duel.player_two.as_ref()),
        ];
        self.compute_merkle_root(&leaves)
    }

    fn calculate_final_state_root(&self, duel: &DuelComponent, rollup: &EphemeralRollupComponent) -> Result<[u8; 32]> {
        let mut final_data = Vec::new();
        final_data.extend_from_slice(&duel.duel_id.to_le_bytes());
        final_data.push(duel.game_state as u8);
        final_data.extend_from_slice(&rollup.transaction_count.to_le_bytes());
        final_data.extend_from_slice(&rollup.gas_used.to_le_bytes());
        Ok(self.hash_bytes(&final_data))
    }

    fn generate_final_merkle_root(&self, duel: &DuelComponent, rollup: &EphemeralRollupComponent) -> Result<[u8; 32]> {
        let leaves = vec![
            self.calculate_final_state_root(duel, rollup)?,
            self.hash_bytes(&rollup.transaction_count.to_le_bytes()),
            self.hash_bytes(&rollup.gas_used.to_le_bytes()),
            self.hash_bytes(&rollup.delegation_timestamp.to_le_bytes()),
        ];
        self.compute_merkle_root(&leaves)
    }

    fn validate_state_transition(&self, transition: &StateTransitionComponent) -> Result<()> {
        // Validate transition is logical
        match (transition.from_state, transition.to_state) {
            (GameState::InProgress, GameState::AwaitingAction) => Ok(()),
            (GameState::AwaitingAction, GameState::InProgress) => Ok(()),
            (GameState::InProgress, GameState::ResolutionPending) => Ok(()),
            (GameState::ResolutionPending, GameState::Completed) => Ok(()),
            _ => Err(GameError::InvalidStateTransition.into()),
        }
    }

    fn recover_state_from_last_checkpoint(&self, duel: &mut DuelComponent, rollup: &EphemeralRollupComponent) -> Result<()> {
        if let Some(last_checkpoint) = rollup.state_checkpoints.last() {
            // Recover to last known good state
            // In a real implementation, this would deserialize the state from the checkpoint
            duel.game_state = GameState::InProgress; // Safe fallback state
            duel.last_action_time = last_checkpoint.timestamp;
        }
        Ok(())
    }

    fn compute_merkle_root(&self, leaves: &[[u8; 32]]) -> Result<[u8; 32]> {
        if leaves.is_empty() {
            return Ok([0u8; 32]);
        }
        
        let mut current_level = leaves.to_vec();
        
        while current_level.len() > 1 {
            let mut next_level = Vec::new();
            
            for chunk in current_level.chunks(2) {
                if chunk.len() == 2 {
                    let combined = self.combine_hashes(&[chunk[0], chunk[1]]);
                    next_level.push(combined);
                } else {
                    next_level.push(chunk[0]);
                }
            }
            
            current_level = next_level;
        }
        
        Ok(current_level[0])
    }

    fn hash_bytes(&self, input: &[u8]) -> [u8; 32] {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let mut hasher = DefaultHasher::new();
        input.hash(&mut hasher);
        let hash_u64 = hasher.finish();
        
        let mut result = [0u8; 32];
        result[0..8].copy_from_slice(&hash_u64.to_le_bytes());
        
        for i in 1..4 {
            let derived = hash_u64.wrapping_mul(i as u64 + 1);
            result[i * 8..(i + 1) * 8].copy_from_slice(&derived.to_le_bytes());
        }
        
        result
    }

    fn combine_hashes(&self, hashes: &[[u8; 32]]) -> [u8; 32] {
        let mut combined = [0u8; 32];
        for hash in hashes {
            for i in 0..32 {
                combined[i] ^= hash[i];
            }
        }
        combined
    }
}

// Events
#[event]
pub struct RollupDelegatedEvent {
    pub duel_id: u64,
    pub rollup_id: [u8; 32],
    pub validator: Pubkey,
    pub expiration: i64,
    pub session_id: [u8; 32],
}

#[event]
pub struct StateTransitionEvent {
    pub duel_id: u64,
    pub transition_id: u64,
    pub from_state: GameState,
    pub to_state: GameState,
    pub timestamp: i64,
    pub optimistic: bool,
}

#[event]
pub struct RollupFinalizedEvent {
    pub duel_id: u64,
    pub rollup_id: [u8; 32],
    pub final_state: GameState,
    pub transaction_count: u64,
    pub gas_used: u64,
}

#[event]
pub struct EmergencyExitEvent {
    pub duel_id: u64,
    pub rollup_id: [u8; 32],
    pub exit_timestamp: i64,
    pub recovered_state: GameState,
}

// Additional error codes
#[error_code]
pub enum RollupError {
    #[msg("Rollup not active")]
    RollupNotActive,
    #[msg("Invalid rollup status")]
    InvalidRollupStatus,
    #[msg("Rollup expired")]
    RollupExpired,
    #[msg("Cannot finalize rollup")]
    CannotFinalizeRollup,
    #[msg("State transition disputed")]
    TransitionDisputed,
    #[msg("Challenge window still active")]
    ChallengeWindowActive,
    #[msg("Emergency exit disabled")]
    EmergencyExitDisabled,
    #[msg("Emergency exit not permitted")]
    EmergencyExitNotPermitted,
    #[msg("Invalid state transition")]
    InvalidStateTransition,
}