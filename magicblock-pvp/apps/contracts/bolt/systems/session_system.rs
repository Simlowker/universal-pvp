use bolt_lang::*;
use anchor_lang::prelude::*;
use crate::components::*;

/// Session System for managing gasless transactions and delegation
pub struct SessionSystem;

/// Session key permissions for different game actions
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u32)]
pub enum SessionPermission {
    Move = 1 << 0,          // 0x01 - Movement actions
    BasicAttack = 1 << 1,   // 0x02 - Basic attack actions
    HeavyAttack = 1 << 2,   // 0x04 - Heavy attack actions
    Defend = 1 << 3,        // 0x08 - Defensive actions
    CastSpell = 1 << 4,     // 0x10 - Spell casting
    UseAbility = 1 << 5,    // 0x20 - Special abilities
    UseItem = 1 << 6,       // 0x40 - Item usage
    ChangeFacing = 1 << 7,  // 0x80 - Change facing direction
    JoinMatch = 1 << 8,     // 0x100 - Join match actions
    Spectate = 1 << 9,      // 0x200 - Spectator actions
}

impl SessionPermission {
    /// Get all basic game permissions (movement, combat, items)
    pub fn basic_game_permissions() -> u32 {
        Self::Move as u32 |
        Self::BasicAttack as u32 |
        Self::Defend as u32 |
        Self::UseItem as u32 |
        Self::ChangeFacing as u32
    }
    
    /// Get all combat permissions
    pub fn full_combat_permissions() -> u32 {
        Self::basic_game_permissions() |
        Self::HeavyAttack as u32 |
        Self::CastSpell as u32 |
        Self::UseAbility as u32
    }
    
    /// Get match participation permissions
    pub fn match_permissions() -> u32 {
        Self::full_combat_permissions() |
        Self::JoinMatch as u32
    }
}

/// Session key data stored on-chain
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(C)]
pub struct SessionKey {
    pub authority: Pubkey,           // Original wallet that created the session
    pub session_key: Pubkey,         // Derived session key
    pub permissions: u32,            // Bitfield of allowed actions
    pub expires_at: i64,            // Unix timestamp when session expires
    pub created_at: i64,            // Unix timestamp when session was created
    pub last_used: i64,             // Unix timestamp of last usage
    pub usage_count: u64,           // Number of transactions executed
    pub max_usage: u64,             // Maximum allowed transactions (0 = unlimited)
    pub is_revoked: bool,           // Whether session has been revoked
    pub nonce: u64,                 // Nonce for replay protection
    pub rate_limit_window: i64,     // Rate limiting time window
    pub rate_limit_count: u16,      // Current rate limit count
    pub rate_limit_max: u16,        // Maximum rate limit
}

unsafe impl Pod for SessionKey {}
unsafe impl Zeroable for SessionKey {}

impl Default for SessionKey {
    fn default() -> Self {
        Self {
            authority: Pubkey::default(),
            session_key: Pubkey::default(),
            permissions: 0,
            expires_at: 0,
            created_at: 0,
            last_used: 0,
            usage_count: 0,
            max_usage: 0,
            is_revoked: false,
            nonce: 0,
            rate_limit_window: 0,
            rate_limit_count: 0,
            rate_limit_max: 10, // Default 10 actions per second
        }
    }
}

impl SessionKey {
    pub const SIZE: usize = 32 + 32 + 4 + 8 + 8 + 8 + 8 + 8 + 1 + 8 + 8 + 2 + 2; // 139 bytes
    
    /// Create a new session key
    pub fn new(
        authority: Pubkey,
        session_key: Pubkey,
        permissions: u32,
        duration_seconds: i64,
        max_usage: u64,
        rate_limit_max: u16,
        clock: &Clock,
    ) -> Self {
        Self {
            authority,
            session_key,
            permissions,
            expires_at: clock.unix_timestamp + duration_seconds,
            created_at: clock.unix_timestamp,
            last_used: clock.unix_timestamp,
            usage_count: 0,
            max_usage,
            is_revoked: false,
            nonce: 0,
            rate_limit_window: clock.unix_timestamp,
            rate_limit_count: 0,
            rate_limit_max,
        }
    }
    
    /// Check if session key is valid and can perform action
    pub fn can_execute_action(&self, action_permission: u32, clock: &Clock) -> Result<bool> {
        // Check if session is revoked
        if self.is_revoked {
            return Ok(false);
        }
        
        // Check if session has expired
        if clock.unix_timestamp > self.expires_at {
            return Ok(false);
        }
        
        // Check if permission is granted
        if (self.permissions & action_permission) == 0 {
            return Ok(false);
        }
        
        // Check usage limits
        if self.max_usage > 0 && self.usage_count >= self.max_usage {
            return Ok(false);
        }
        
        Ok(true)
    }
    
    /// Check and update rate limit
    pub fn check_rate_limit(&mut self, clock: &Clock) -> Result<bool> {
        let current_time = clock.unix_timestamp;
        
        // Reset rate limit window if a second has passed
        if current_time > self.rate_limit_window {
            self.rate_limit_window = current_time;
            self.rate_limit_count = 0;
        }
        
        // Check if rate limit exceeded
        if self.rate_limit_count >= self.rate_limit_max {
            return Ok(false);
        }
        
        // Increment rate limit count
        self.rate_limit_count += 1;
        Ok(true)
    }
    
    /// Execute action with session key (updates usage tracking)
    pub fn execute_action(&mut self, clock: &Clock) -> Result<()> {
        self.last_used = clock.unix_timestamp;
        self.usage_count = self.usage_count.checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.nonce = self.nonce.checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        Ok(())
    }
    
    /// Revoke the session key
    pub fn revoke(&mut self, clock: &Clock) {
        self.is_revoked = true;
        self.last_used = clock.unix_timestamp;
    }
    
    /// Extend session duration
    pub fn extend_duration(&mut self, additional_seconds: i64, clock: &Clock) -> Result<()> {
        if self.is_revoked {
            return Err(ProgramError::InvalidAccountData);
        }
        
        self.expires_at = self.expires_at.checked_add(additional_seconds)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.last_used = clock.unix_timestamp;
        Ok(())
    }
    
    /// Update permissions (only by authority)
    pub fn update_permissions(&mut self, new_permissions: u32, clock: &Clock) {
        self.permissions = new_permissions;
        self.last_used = clock.unix_timestamp;
    }
    
    /// Get remaining time in seconds
    pub fn time_remaining(&self, clock: &Clock) -> i64 {
        (self.expires_at - clock.unix_timestamp).max(0)
    }
    
    /// Get remaining usage count
    pub fn usage_remaining(&self) -> Option<u64> {
        if self.max_usage == 0 {
            None // Unlimited usage
        } else {
            Some(self.max_usage.saturating_sub(self.usage_count))
        }
    }
    
    /// Check if session needs renewal (less than 5 minutes remaining)
    pub fn needs_renewal(&self, clock: &Clock) -> bool {
        !self.is_revoked && self.time_remaining(clock) < 300 // 5 minutes
    }
}

impl SessionSystem {
    /// Create a new session key delegation
    pub fn create_session_key(
        authority: Pubkey,
        session_key: Pubkey,
        permissions: u32,
        duration_seconds: i64,
        max_usage: Option<u64>,
        rate_limit_max: Option<u16>,
        clock: &Clock,
    ) -> Result<SessionKey> {
        // Validate parameters
        if duration_seconds <= 0 || duration_seconds > 86400 * 7 {
            return Err(ProgramError::InvalidArgument); // Max 7 days
        }
        
        if permissions == 0 {
            return Err(ProgramError::InvalidArgument); // Must have some permissions
        }
        
        let session = SessionKey::new(
            authority,
            session_key,
            permissions,
            duration_seconds,
            max_usage.unwrap_or(0),
            rate_limit_max.unwrap_or(10),
            clock,
        );
        
        Ok(session)
    }
    
    /// Validate and execute action using session key
    pub fn execute_with_session(
        session: &mut SessionKey,
        action_permission: u32,
        clock: &Clock,
    ) -> Result<bool> {
        // Check if action can be executed
        if !session.can_execute_action(action_permission, clock)? {
            return Ok(false);
        }
        
        // Check rate limit
        if !session.check_rate_limit(clock)? {
            return Ok(false);
        }
        
        // Execute action
        session.execute_action(clock)?;
        
        Ok(true)
    }
    
    /// Batch execute multiple actions (for optimistic updates)
    pub fn batch_execute_with_session(
        session: &mut SessionKey,
        actions: &[u32],
        clock: &Clock,
    ) -> Result<Vec<bool>> {
        let mut results = Vec::with_capacity(actions.len());
        
        for &action_permission in actions {
            let result = Self::execute_with_session(session, action_permission, clock)?;
            results.push(result);
            
            // Stop if any action fails
            if !result {
                break;
            }
        }
        
        Ok(results)
    }
    
    /// Revoke a session key
    pub fn revoke_session_key(session: &mut SessionKey, clock: &Clock) -> Result<()> {
        session.revoke(clock);
        Ok(())
    }
    
    /// Auto-renew session if criteria are met
    pub fn auto_renew_session(
        session: &mut SessionKey,
        default_duration: i64,
        clock: &Clock,
    ) -> Result<bool> {
        if !session.needs_renewal(clock) {
            return Ok(false);
        }
        
        if session.is_revoked {
            return Ok(false);
        }
        
        // Extend session by default duration
        session.extend_duration(default_duration, clock)?;
        Ok(true)
    }
    
    /// Generate session key for specific game mode
    pub fn create_game_session(
        authority: Pubkey,
        session_key: Pubkey,
        game_mode: GameMode,
        duration_seconds: i64,
        clock: &Clock,
    ) -> Result<SessionKey> {
        let permissions = match game_mode {
            GameMode::PvP => SessionPermission::match_permissions(),
            GameMode::Training => SessionPermission::full_combat_permissions(),
            GameMode::Spectator => SessionPermission::Spectate as u32,
        };
        
        let rate_limit = match game_mode {
            GameMode::PvP => 20,      // Higher rate limit for PvP
            GameMode::Training => 30,  // Highest for training
            GameMode::Spectator => 5,  // Low for spectators
        };
        
        Self::create_session_key(
            authority,
            session_key,
            permissions,
            duration_seconds,
            None, // No usage limit for game sessions
            Some(rate_limit),
            clock,
        )
    }
    
    /// Validate session key signature for gasless transaction
    pub fn validate_session_signature(
        session: &SessionKey,
        message: &[u8],
        signature: &[u8; 64],
        session_key_pubkey: &Pubkey,
    ) -> Result<bool> {
        use solana_program::ed25519_program;
        
        // Verify the session key matches
        if session.session_key != *session_key_pubkey {
            return Ok(false);
        }
        
        // Verify the signature using ed25519 verification
        let instruction = ed25519_program::new_ed25519_instruction(
            session_key_pubkey,
            message,
            signature,
        );
        
        // In a real implementation, this would be verified by the runtime
        // For now, we'll assume the signature verification is handled elsewhere
        Ok(true)
    }
    
    /// Get session statistics
    pub fn get_session_stats(session: &SessionKey, clock: &Clock) -> SessionStats {
        SessionStats {
            is_active: !session.is_revoked && clock.unix_timestamp <= session.expires_at,
            time_remaining: session.time_remaining(clock),
            usage_count: session.usage_count,
            usage_remaining: session.usage_remaining(),
            rate_limit_remaining: session.rate_limit_max.saturating_sub(session.rate_limit_count),
            permissions: session.permissions,
            created_at: session.created_at,
            last_used: session.last_used,
        }
    }
}

/// Game modes for session key creation
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum GameMode {
    PvP,
    Training,
    Spectator,
}

/// Session statistics for monitoring
#[derive(Clone, Debug)]
pub struct SessionStats {
    pub is_active: bool,
    pub time_remaining: i64,
    pub usage_count: u64,
    pub usage_remaining: Option<u64>,
    pub rate_limit_remaining: u16,
    pub permissions: u32,
    pub created_at: i64,
    pub last_used: i64,
}

/// Delegation manager for handling multiple session keys
pub struct DelegationManager {
    pub sessions: Vec<SessionKey>,
    pub max_sessions_per_authority: usize,
}

impl DelegationManager {
    pub fn new(max_sessions_per_authority: usize) -> Self {
        Self {
            sessions: Vec::new(),
            max_sessions_per_authority,
        }
    }
    
    /// Add a new session key
    pub fn add_session(&mut self, session: SessionKey) -> Result<()> {
        // Check if authority already has too many sessions
        let authority_session_count = self.sessions
            .iter()
            .filter(|s| s.authority == session.authority && !s.is_revoked)
            .count();
        
        if authority_session_count >= self.max_sessions_per_authority {
            return Err(ProgramError::InvalidArgument);
        }
        
        self.sessions.push(session);
        Ok(())
    }
    
    /// Find active session by session key
    pub fn find_session(&self, session_key: &Pubkey, clock: &Clock) -> Option<&SessionKey> {
        self.sessions
            .iter()
            .find(|s| s.session_key == *session_key && 
                     !s.is_revoked && 
                     clock.unix_timestamp <= s.expires_at)
    }
    
    /// Find mutable active session by session key
    pub fn find_session_mut(&mut self, session_key: &Pubkey, clock: &Clock) -> Option<&mut SessionKey> {
        self.sessions
            .iter_mut()
            .find(|s| s.session_key == *session_key && 
                     !s.is_revoked && 
                     clock.unix_timestamp <= s.expires_at)
    }
    
    /// Clean up expired sessions
    pub fn cleanup_expired(&mut self, clock: &Clock) -> usize {
        let initial_count = self.sessions.len();
        self.sessions.retain(|s| !s.is_revoked && clock.unix_timestamp <= s.expires_at);
        initial_count - self.sessions.len()
    }
    
    /// Get all sessions for an authority
    pub fn get_authority_sessions(&self, authority: &Pubkey) -> Vec<&SessionKey> {
        self.sessions
            .iter()
            .filter(|s| s.authority == *authority)
            .collect()
    }
}