use bolt_lang::*;
use anchor_lang::prelude::*;
use bytemuck::{Pod, Zeroable};

/// Player component containing player identity and state data
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(C)]
pub struct Player {
    pub authority: Pubkey,
    pub username: [u8; 32],
    pub player_class: u8,
    pub level: u32,
    pub experience: u64,
    pub wins: u32,
    pub losses: u32,
    pub is_alive: bool,
    pub session_key: Option<Pubkey>,
    pub session_expires: i64,
    pub created_at: i64,
    pub last_active: i64,
    pub reputation: u32,
    pub rank: u16,
}

unsafe impl Pod for Player {}
unsafe impl Zeroable for Player {}

impl Default for Player {
    fn default() -> Self {
        Self {
            authority: Pubkey::default(),
            username: [0; 32],
            player_class: 0,
            level: 1,
            experience: 0,
            wins: 0,
            losses: 0,
            is_alive: true,
            session_key: None,
            session_expires: 0,
            created_at: 0,
            last_active: 0,
            reputation: 1000,
            rank: 0,
        }
    }
}

impl Player {
    pub const SIZE: usize = 32 + 32 + 1 + 4 + 8 + 4 + 4 + 1 + 33 + 8 + 8 + 8 + 4 + 2; // 157 bytes
    
    /// Create a new player with the given data
    pub fn new(
        authority: Pubkey,
        username: String,
        player_class: u8,
        clock: &Clock,
    ) -> Result<Self> {
        let mut username_bytes = [0u8; 32];
        let username_str = username.as_bytes();
        let len = username_str.len().min(31); // Leave room for null terminator
        username_bytes[..len].copy_from_slice(&username_str[..len]);
        
        Ok(Self {
            authority,
            username: username_bytes,
            player_class,
            level: 1,
            experience: 0,
            wins: 0,
            losses: 0,
            is_alive: true,
            session_key: None,
            session_expires: 0,
            created_at: clock.unix_timestamp,
            last_active: clock.unix_timestamp,
            reputation: 1000,
            rank: 0,
        })
    }
    
    /// Set session key for gasless transactions
    pub fn set_session_key(&mut self, session_key: Pubkey, expires_at: i64) {
        self.session_key = Some(session_key);
        self.session_expires = expires_at;
    }
    
    /// Check if session key is valid
    pub fn is_session_valid(&self, clock: &Clock) -> bool {
        self.session_key.is_some() && self.session_expires > clock.unix_timestamp
    }
    
    /// Update activity timestamp
    pub fn update_activity(&mut self, clock: &Clock) {
        self.last_active = clock.unix_timestamp;
    }
    
    /// Add experience and handle level up
    pub fn add_experience(&mut self, exp: u64) -> Result<bool> {
        self.experience = self.experience.checked_add(exp)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        
        // Simple level calculation: level = sqrt(exp / 100)
        let new_level = ((self.experience / 100) as f64).sqrt() as u32 + 1;
        let leveled_up = new_level > self.level;
        self.level = new_level;
        
        Ok(leveled_up)
    }
    
    /// Record match result
    pub fn record_match_result(&mut self, won: bool, exp_gain: u64) -> Result<()> {
        if won {
            self.wins = self.wins.checked_add(1)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            self.reputation = self.reputation.checked_add(25)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        } else {
            self.losses = self.losses.checked_add(1)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            self.reputation = self.reputation.saturating_sub(10);
        }
        
        self.add_experience(exp_gain)?;
        Ok(())
    }
    
    /// Calculate win rate as percentage
    pub fn win_rate(&self) -> u8 {
        let total_matches = self.wins + self.losses;
        if total_matches == 0 {
            return 0;
        }
        ((self.wins as u64 * 100) / total_matches as u64) as u8
    }
    
    /// Get username as string
    pub fn username_str(&self) -> String {
        let null_pos = self.username.iter().position(|&x| x == 0).unwrap_or(32);
        String::from_utf8_lossy(&self.username[..null_pos]).to_string()
    }
}