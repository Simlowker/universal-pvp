// BOLT Components Module for SolDuel PvP Game

pub mod player;
pub mod health;
pub mod position;
pub mod combat;
pub mod match_state;
pub mod session;

// Re-export components for easier importing
pub use player::Player;
pub use health::Health;
pub use position::Position;
pub use combat::Combat;
pub use match_state::{MatchState, PlayerInMatch};
pub use session::SessionKey;

use bolt_lang::*;
use anchor_lang::prelude::*;
use bytemuck::{Pod, Zeroable};

/// Component registry for BOLT ECS system
pub struct ComponentRegistry;

impl ComponentRegistry {
    /// Get all component types supported by SolDuel
    pub fn get_component_types() -> Vec<&'static str> {
        vec![
            "Player",
            "Health",
            "Position", 
            "Combat",
            "MatchState",
            "PlayerInMatch",
            "SessionKey"
        ]
    }
    
    /// Get component size by type name
    pub fn get_component_size(component_type: &str) -> Option<usize> {
        match component_type {
            "Player" => Some(Player::SIZE),
            "Health" => Some(Health::SIZE),
            "Position" => Some(Position::SIZE),
            "Combat" => Some(Combat::SIZE),
            "MatchState" => Some(MatchState::SIZE),
            "PlayerInMatch" => Some(PlayerInMatch::SIZE), 
            "SessionKey" => Some(SessionKey::SIZE),
            _ => None,
        }
    }
    
    /// Check if component type is high-frequency (updates often)
    pub fn is_high_frequency(component_type: &str) -> bool {
        matches!(component_type, "Position" | "Health" | "Combat")
    }
    
    /// Check if component should be replicated across clients
    pub fn should_replicate(component_type: &str) -> bool {
        // All game components should be replicated for PvP
        true
    }
    
    /// Get replication priority (higher = more important)
    pub fn get_replication_priority(component_type: &str) -> u8 {
        match component_type {
            "Health" => 255,      // Critical - health changes
            "Combat" => 240,      // High - combat state
            "Position" => 220,    // High - movement
            "Player" => 100,      // Medium - player info
            "MatchState" => 200,  // High - match state
            "PlayerInMatch" => 180, // Medium-high - match participation
            "SessionKey" => 50,   // Low - session management
            _ => 128,             // Default medium priority
        }
    }
}

/// Utility functions for component operations
pub mod utils {
    use super::*;
    
    /// Serialize component data to bytes
    pub fn serialize_component<T: Pod>(component: &T) -> Vec<u8> {
        bytemuck::bytes_of(component).to_vec()
    }
    
    /// Deserialize component data from bytes
    pub fn deserialize_component<T: Pod + Zeroable>(data: &[u8]) -> Result<T> {
        if data.len() != std::mem::size_of::<T>() {
            return Err(ProgramError::InvalidAccountData.into());
        }
        
        Ok(*bytemuck::from_bytes(data))
    }
    
    /// Create component update data structure
    pub fn create_component_update(
        component_type: String,
        entity_id: Pubkey,
        data: Vec<u8>
    ) -> ComponentUpdate {
        ComponentUpdate {
            component_type,
            entity_id,
            data,
            timestamp: Clock::get().unwrap().unix_timestamp,
        }
    }
    
    /// Validate component data integrity
    pub fn validate_component_data(
        component_type: &str,
        data: &[u8]
    ) -> Result<bool> {
        let expected_size = ComponentRegistry::get_component_size(component_type)
            .ok_or(ProgramError::InvalidInstructionData)?;
            
        if data.len() != expected_size {
            return Ok(false);
        }
        
        // Additional validation can be added here
        Ok(true)
    }
}

/// Component update data structure for state synchronization
#[derive(Clone, Debug)]
pub struct ComponentUpdate {
    pub component_type: String,
    pub entity_id: Pubkey,
    pub data: Vec<u8>,
    pub timestamp: i64,
}

/// Batch component updates for efficient processing
#[derive(Clone, Debug)]
pub struct BatchComponentUpdate {
    pub entity_id: Pubkey,
    pub updates: Vec<ComponentUpdate>,
    pub batch_timestamp: i64,
}

impl BatchComponentUpdate {
    pub fn new(entity_id: Pubkey) -> Self {
        Self {
            entity_id,
            updates: Vec::new(),
            batch_timestamp: Clock::get().unwrap().unix_timestamp,
        }
    }
    
    pub fn add_update(&mut self, component_type: String, data: Vec<u8>) {
        self.updates.push(ComponentUpdate {
            component_type,
            entity_id: self.entity_id,
            data,
            timestamp: Clock::get().unwrap().unix_timestamp,
        });
    }
    
    pub fn is_empty(&self) -> bool {
        self.updates.is_empty()
    }
    
    pub fn len(&self) -> usize {
        self.updates.len()
    }
}