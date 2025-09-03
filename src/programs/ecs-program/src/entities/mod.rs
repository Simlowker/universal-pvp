use anchor_lang::prelude::*;
use bolt_lang::*;
use crate::components::ComponentTypeId;

pub mod create_entity;
pub use create_entity::*;

/// Entity types in the game
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum EntityType {
    Player,
    Match,
    Item,
    Effect,
    System,
}

/// Core Entity structure - lightweight identifier with component tracking
#[account]
#[derive(Default, Debug)]
pub struct Entity {
    pub id: u64,
    pub entity_type: EntityType,
    pub component_mask: u64, // Bitmask for fast component checks
    pub component_count: u8,
    pub is_active: bool,
    pub created_at: i64,
    pub last_updated: i64,
    pub owner: Pubkey, // Entity owner for permissions
    pub bump: u8,
}

impl Entity {
    pub const SIZE: usize = 8 + // discriminator
        8 + // id
        1 + // entity_type
        8 + // component_mask
        1 + // component_count
        1 + // is_active
        8 + // created_at
        8 + // last_updated
        32 + // owner
        1; // bump

    /// Check if entity has a specific component type
    pub fn has_component(&self, component_type: ComponentTypeId) -> bool {
        let bit_position = component_type as u64;
        if bit_position >= 64 {
            return false;
        }
        (self.component_mask & (1 << bit_position)) != 0
    }

    /// Add component to entity's mask
    pub fn add_component_mask(&mut self, component_type: ComponentTypeId) {
        let bit_position = component_type as u64;
        if bit_position < 64 {
            self.component_mask |= 1 << bit_position;
            self.component_count = self.component_count.saturating_add(1);
        }
    }

    /// Remove component from entity's mask
    pub fn remove_component_mask(&mut self, component_type: ComponentTypeId) {
        let bit_position = component_type as u64;
        if bit_position < 64 {
            self.component_mask &= !(1 << bit_position);
            self.component_count = self.component_count.saturating_sub(1);
        }
    }

    /// Check if entity matches a component query pattern
    pub fn matches_query(&self, required_mask: u64, excluded_mask: u64) -> bool {
        // Entity must have all required components
        let has_required = (self.component_mask & required_mask) == required_mask;
        // Entity must not have any excluded components
        let has_excluded = (self.component_mask & excluded_mask) != 0;
        
        self.is_active && has_required && !has_excluded
    }

    /// Update entity timestamp
    pub fn touch(&mut self) -> Result<()> {
        self.last_updated = Clock::get()?.unix_timestamp;
        Ok(())
    }
}

/// Entity archetype for performance optimization
/// Groups entities with same component signatures together
#[account]
#[derive(Default, Debug)]
pub struct EntityArchetype {
    pub component_mask: u64,
    pub entity_count: u32,
    pub entities: Vec<u64>, // Entity IDs with this archetype
    pub component_types: Vec<ComponentTypeId>,
    pub data_layout: ArchetypeLayout,
}

impl EntityArchetype {
    pub const SIZE: usize = 8 + // discriminator
        8 + // component_mask
        4 + // entity_count
        4 + (1000 * 8) + // entities vec (max 1000 entities per archetype)
        4 + (64 * 1) + // component_types vec (max 64 component types)
        64; // data_layout

    pub fn matches_signature(&self, component_mask: u64) -> bool {
        self.component_mask == component_mask
    }

    pub fn add_entity(&mut self, entity_id: u64) -> Result<()> {
        if self.entities.len() >= 1000 {
            return Err(ErrorCode::ArchetypeFull.into());
        }
        self.entities.push(entity_id);
        self.entity_count += 1;
        Ok(())
    }

    pub fn remove_entity(&mut self, entity_id: u64) -> Result<()> {
        if let Some(pos) = self.entities.iter().position(|&x| x == entity_id) {
            self.entities.remove(pos);
            self.entity_count = self.entity_count.saturating_sub(1);
        }
        Ok(())
    }
}

/// Memory layout for archetype data - cache-friendly structure
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct ArchetypeLayout {
    pub component_offsets: [u32; 64], // Byte offsets for each component type
    pub component_sizes: [u32; 64],   // Size of each component in bytes
    pub stride: u32,                  // Total size per entity in bytes
    pub alignment: u32,               // Memory alignment requirements
}

impl ArchetypeLayout {
    pub fn calculate_offset(&self, component_type: ComponentTypeId, entity_index: u32) -> u32 {
        let type_id = component_type as usize;
        if type_id >= 64 {
            return 0;
        }
        self.component_offsets[type_id] + (entity_index * self.stride)
    }

    pub fn get_component_size(&self, component_type: ComponentTypeId) -> u32 {
        let type_id = component_type as usize;
        if type_id >= 64 {
            return 0;
        }
        self.component_sizes[type_id]
    }
}

/// Entity query result for batch operations
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct EntityQueryResult {
    pub entities: Vec<u64>,
    pub archetype_mask: u64,
    pub count: u32,
}

/// Entity factory for creating common entity patterns
pub struct EntityFactory;

impl EntityFactory {
    pub fn create_player_entity(owner: Pubkey, clock: &Clock) -> Entity {
        Entity {
            id: 0, // Set by world
            entity_type: EntityType::Player,
            component_mask: 0,
            component_count: 0,
            is_active: true,
            created_at: clock.unix_timestamp,
            last_updated: clock.unix_timestamp,
            owner,
            bump: 0,
        }
    }

    pub fn create_match_entity(owner: Pubkey, clock: &Clock) -> Entity {
        Entity {
            id: 0, // Set by world
            entity_type: EntityType::Match,
            component_mask: 0,
            component_count: 0,
            is_active: true,
            created_at: clock.unix_timestamp,
            last_updated: clock.unix_timestamp,
            owner,
            bump: 0,
        }
    }

    pub fn create_item_entity(owner: Pubkey, clock: &Clock) -> Entity {
        Entity {
            id: 0, // Set by world
            entity_type: EntityType::Item,
            component_mask: 0,
            component_count: 0,
            is_active: true,
            created_at: clock.unix_timestamp,
            last_updated: clock.unix_timestamp,
            owner,
            bump: 0,
        }
    }
}

#[error_code]
pub enum EntityError {
    #[msg("Entity not found")]
    EntityNotFound,
    #[msg("Invalid entity type")]
    InvalidEntityType,
    #[msg("Entity is inactive")]
    EntityInactive,
    #[msg("Component not found on entity")]
    ComponentNotFound,
    #[msg("Archetype is full")]
    ArchetypeFull,
    #[msg("Invalid component mask")]
    InvalidComponentMask,
}