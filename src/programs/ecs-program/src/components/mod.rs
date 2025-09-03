use anchor_lang::prelude::*;
use bolt_lang::*;
use bytemuck::{Pod, Zeroable};

pub mod add_component;
pub mod update_component;
pub mod remove_component;

pub use add_component::*;
pub use update_component::*;
pub use remove_component::*;

/// Component type identifiers for bitmask operations
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum ComponentTypeId {
    Position = 0,
    Health = 1,
    Combat = 2,
    Status = 3,
    Inventory = 4,
    Match = 5,
    Timer = 6,
    Movement = 7,
    Effect = 8,
    Stats = 9,
    Experience = 10,
    Equipment = 11,
    Ability = 12,
    Cooldown = 13,
    Buff = 14,
    Debuff = 15,
    // Reserve more slots for future components
}

/// Generic component wrapper for type-safe storage
#[account]
#[derive(Debug)]
pub struct Component {
    pub entity_id: u64,
    pub component_type: ComponentTypeId,
    pub data: Vec<u8>, // Serialized component data
    pub size: u16,
    pub version: u32, // For optimistic updates
    pub last_updated: i64,
    pub bump: u8,
}

impl Component {
    pub const SIZE: usize = 8 + // discriminator
        8 + // entity_id
        1 + // component_type
        4 + 1024 + // data vec (max 1024 bytes per component)
        2 + // size
        4 + // version
        8 + // last_updated
        1; // bump

    pub fn new(entity_id: u64, component_type: ComponentTypeId, data: Vec<u8>) -> Result<Self> {
        let clock = Clock::get()?;
        Ok(Self {
            entity_id,
            component_type,
            size: data.len() as u16,
            data,
            version: 1,
            last_updated: clock.unix_timestamp,
            bump: 0,
        })
    }

    pub fn update_data(&mut self, new_data: Vec<u8>) -> Result<()> {
        let clock = Clock::get()?;
        self.data = new_data;
        self.size = self.data.len() as u16;
        self.version = self.version.checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        self.last_updated = clock.unix_timestamp;
        Ok(())
    }

    pub fn deserialize_data<T: AnchorDeserialize>(&self) -> Result<T> {
        T::try_from_slice(&self.data)
            .map_err(|_| ErrorCode::AccountDidNotDeserialize.into())
    }
}

/// Position Component - tracks entity coordinates
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, Pod, Zeroable)]
#[repr(C)]
pub struct PositionComponent {
    pub x: f32,
    pub y: f32,
    pub z: f32, // For future 3D support
    pub facing: f32, // Direction in radians
}

impl PositionComponent {
    pub const SIZE: usize = 16; // 4 * f32

    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y, z: 0.0, facing: 0.0 }
    }

    pub fn distance_to(&self, other: &PositionComponent) -> f32 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        let dz = self.z - other.z;
        (dx * dx + dy * dy + dz * dz).sqrt()
    }

    pub fn move_towards(&mut self, target: &PositionComponent, speed: f32) {
        let distance = self.distance_to(target);
        if distance > speed {
            let ratio = speed / distance;
            self.x += (target.x - self.x) * ratio;
            self.y += (target.y - self.y) * ratio;
            self.z += (target.z - self.z) * ratio;
        } else {
            *self = *target;
        }
    }
}

/// Health Component - tracks HP and related stats
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, Pod, Zeroable)]
#[repr(C)]
pub struct HealthComponent {
    pub current: u32,
    pub maximum: u32,
    pub regeneration: u32, // HP per turn
    pub last_damage_time: i64,
    pub damage_taken_this_turn: u32,
    pub healing_received_this_turn: u32,
}

impl HealthComponent {
    pub const SIZE: usize = 28; // 5 * u32 + i64

    pub fn new(max_health: u32) -> Self {
        Self {
            current: max_health,
            maximum: max_health,
            regeneration: max_health / 20, // 5% regen per turn
            last_damage_time: 0,
            damage_taken_this_turn: 0,
            healing_received_this_turn: 0,
        }
    }

    pub fn is_alive(&self) -> bool {
        self.current > 0
    }

    pub fn health_percentage(&self) -> f32 {
        if self.maximum == 0 {
            return 0.0;
        }
        self.current as f32 / self.maximum as f32
    }

    pub fn take_damage(&mut self, damage: u32, timestamp: i64) -> bool {
        self.current = self.current.saturating_sub(damage);
        self.damage_taken_this_turn = self.damage_taken_this_turn.saturating_add(damage);
        self.last_damage_time = timestamp;
        !self.is_alive()
    }

    pub fn heal(&mut self, amount: u32) {
        self.current = (self.current + amount).min(self.maximum);
        self.healing_received_this_turn = self.healing_received_this_turn.saturating_add(amount);
    }

    pub fn regenerate(&mut self) {
        if self.regeneration > 0 && self.is_alive() {
            self.heal(self.regeneration);
        }
    }

    pub fn reset_turn_stats(&mut self) {
        self.damage_taken_this_turn = 0;
        self.healing_received_this_turn = 0;
    }
}

/// Combat Component - attack and defense capabilities
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, Pod, Zeroable)]
#[repr(C)]
pub struct CombatComponent {
    pub attack: u32,
    pub defense: u32,
    pub critical_chance: u32, // Percentage (0-100)
    pub critical_multiplier: u32, // Multiplier * 100 (e.g., 150 = 1.5x)
    pub accuracy: u32, // Percentage (0-100)
    pub evasion: u32, // Percentage (0-100)
    pub attack_speed: u32, // Actions per turn
    pub last_attack_time: i64,
}

impl CombatComponent {
    pub const SIZE: usize = 32; // 7 * u32 + i64

    pub fn new(attack: u32, defense: u32, speed: u32) -> Self {
        Self {
            attack,
            defense,
            critical_chance: speed / 5, // Higher speed = more crits
            critical_multiplier: 150, // 1.5x damage
            accuracy: 85 + (speed / 10), // Base 85% + speed bonus
            evasion: speed / 8, // Speed affects dodge chance
            attack_speed: if speed > 100 { 2 } else { 1 }, // Fast units get extra attacks
            last_attack_time: 0,
        }
    }

    pub fn can_attack(&self, current_time: i64, cooldown: i64) -> bool {
        current_time >= self.last_attack_time + cooldown
    }

    pub fn calculate_damage(&self, target_defense: u32, is_critical: bool) -> u32 {
        let base_damage = if self.attack > target_defense {
            self.attack - (target_defense / 2)
        } else {
            1 // Minimum damage
        };

        if is_critical {
            (base_damage * self.critical_multiplier) / 100
        } else {
            base_damage
        }
    }

    pub fn roll_critical(&self, rng_seed: u64) -> bool {
        let roll = (rng_seed % 100) as u32;
        roll < self.critical_chance
    }

    pub fn roll_accuracy(&self, target_evasion: u32, rng_seed: u64) -> bool {
        let hit_chance = if self.accuracy > target_evasion {
            self.accuracy - target_evasion
        } else {
            5 // Minimum 5% hit chance
        };
        let roll = (rng_seed % 100) as u32;
        roll < hit_chance
    }
}

/// Status Component - temporary effects and conditions
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct StatusComponent {
    pub effects: Vec<StatusEffect>,
    pub immunities: Vec<StatusType>,
    pub resistances: Vec<(StatusType, u32)>, // Type and resistance percentage
}

impl StatusComponent {
    pub const SIZE: usize = 4 + (16 * 32) + // effects vec (max 16 effects)
        4 + (8 * 32) + // immunities vec (max 8 immunities)
        4 + (16 * 8); // resistances vec (max 8 resistances)

    pub fn add_effect(&mut self, effect: StatusEffect) -> Result<()> {
        if self.effects.len() >= 16 {
            // Remove oldest effect if at capacity
            self.effects.remove(0);
        }
        self.effects.push(effect);
        Ok(())
    }

    pub fn remove_effect(&mut self, effect_type: StatusType) {
        self.effects.retain(|e| e.effect_type != effect_type);
    }

    pub fn has_effect(&self, effect_type: StatusType) -> bool {
        self.effects.iter().any(|e| e.effect_type == effect_type)
    }

    pub fn is_immune(&self, effect_type: StatusType) -> bool {
        self.immunities.contains(&effect_type)
    }

    pub fn get_resistance(&self, effect_type: StatusType) -> u32 {
        self.resistances.iter()
            .find(|(t, _)| *t == effect_type)
            .map(|(_, r)| *r)
            .unwrap_or(0)
    }

    pub fn update_effects(&mut self, current_time: i64) {
        self.effects.retain(|e| current_time < e.expires_at);
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatusType {
    Stunned,
    Poisoned,
    Burning,
    Frozen,
    Blessed,
    Cursed,
    Shielded,
    Hasted,
    Slowed,
    Invisible,
    Vulnerable,
    Regenerating,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct StatusEffect {
    pub effect_type: StatusType,
    pub duration: i64,
    pub expires_at: i64,
    pub strength: u32, // Effect intensity
    pub source: Pubkey, // Who applied this effect
    pub stacks: u32, // For stackable effects
}

impl StatusEffect {
    pub fn new(effect_type: StatusType, duration: i64, strength: u32, source: Pubkey, current_time: i64) -> Self {
        Self {
            effect_type,
            duration,
            expires_at: current_time + duration,
            strength,
            source,
            stacks: 1,
        }
    }

    pub fn is_expired(&self, current_time: i64) -> bool {
        current_time >= self.expires_at
    }

    pub fn add_stack(&mut self, additional_duration: i64, current_time: i64) {
        self.stacks = self.stacks.saturating_add(1);
        self.expires_at = self.expires_at.max(current_time + additional_duration);
    }
}

/// Inventory Component - manages equipped items and storage
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct InventoryComponent {
    pub equipped_items: Vec<EquippedItem>,
    pub inventory_slots: Vec<InventorySlot>,
    pub capacity: u32,
    pub total_weight: u32,
    pub max_weight: u32,
}

impl InventoryComponent {
    pub const SIZE: usize = 4 + (8 * 40) + // equipped_items (max 8 equipment slots)
        4 + (32 * 64) + // inventory_slots (max 32 inventory slots)
        4 + // capacity
        4 + // total_weight
        4; // max_weight

    pub fn new(capacity: u32, max_weight: u32) -> Self {
        Self {
            equipped_items: Vec::new(),
            inventory_slots: Vec::new(),
            capacity,
            total_weight: 0,
            max_weight,
        }
    }

    pub fn can_equip(&self, slot: EquipmentSlot) -> bool {
        !self.equipped_items.iter().any(|item| item.slot == slot)
    }

    pub fn equip_item(&mut self, item: EquippedItem) -> Result<()> {
        if !self.can_equip(item.slot) {
            return Err(ErrorCode::InvalidOperation.into());
        }
        self.equipped_items.push(item);
        Ok(())
    }

    pub fn unequip_item(&mut self, slot: EquipmentSlot) -> Option<EquippedItem> {
        if let Some(pos) = self.equipped_items.iter().position(|item| item.slot == slot) {
            Some(self.equipped_items.remove(pos))
        } else {
            None
        }
    }

    pub fn add_item(&mut self, item: InventorySlot) -> Result<()> {
        if self.inventory_slots.len() >= self.capacity as usize {
            return Err(ErrorCode::InventoryFull.into());
        }
        if self.total_weight + item.weight > self.max_weight {
            return Err(ErrorCode::TooHeavy.into());
        }
        self.total_weight += item.weight;
        self.inventory_slots.push(item);
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum EquipmentSlot {
    Weapon,
    Shield,
    Helmet,
    Armor,
    Gloves,
    Boots,
    Ring,
    Amulet,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct EquippedItem {
    pub item_id: u64,
    pub slot: EquipmentSlot,
    pub stats_bonus: CombatComponent,
    pub durability: u32,
    pub max_durability: u32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InventorySlot {
    pub item_id: u64,
    pub quantity: u32,
    pub weight: u32,
    pub item_type: ItemType,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemType {
    Equipment,
    Consumable,
    Material,
    Quest,
}

/// Match Component - manages game session data
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct MatchComponent {
    pub match_id: u64,
    pub participants: Vec<Pubkey>,
    pub current_turn: u32,
    pub turn_deadline: i64,
    pub state: MatchState,
    pub configuration: MatchConfiguration,
    pub results: Vec<MatchResult>,
}

impl MatchComponent {
    pub const SIZE: usize = 8 + // match_id
        4 + (8 * 32) + // participants (max 8 players)
        4 + // current_turn
        8 + // turn_deadline
        1 + // state
        64 + // configuration
        4 + (32 * 32); // results (max 8 results)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum MatchState {
    Waiting,
    InProgress,
    Completed,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MatchConfiguration {
    pub max_players: u32,
    pub turn_timeout: i64,
    pub match_duration: i64,
    pub entry_fee: u64,
    pub reward_pool: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MatchResult {
    pub player: Pubkey,
    pub rank: u32,
    pub reward: u64,
    pub experience_gained: u32,
}

/// Timer Component - manages cooldowns and durations
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct TimerComponent {
    pub cooldowns: Vec<Cooldown>,
    pub durations: Vec<Duration>,
}

impl TimerComponent {
    pub const SIZE: usize = 4 + (16 * 24) + // cooldowns (max 16)
        4 + (16 * 24); // durations (max 16)

    pub fn add_cooldown(&mut self, ability_id: u32, duration: i64, current_time: i64) {
        let cooldown = Cooldown {
            ability_id,
            expires_at: current_time + duration,
            remaining: duration,
        };
        self.cooldowns.push(cooldown);
    }

    pub fn is_on_cooldown(&self, ability_id: u32, current_time: i64) -> bool {
        self.cooldowns.iter().any(|cd| cd.ability_id == ability_id && cd.expires_at > current_time)
    }

    pub fn update_timers(&mut self, current_time: i64) {
        self.cooldowns.retain(|cd| cd.expires_at > current_time);
        self.durations.retain(|d| d.expires_at > current_time);
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Cooldown {
    pub ability_id: u32,
    pub expires_at: i64,
    pub remaining: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Duration {
    pub effect_id: u32,
    pub expires_at: i64,
    pub callback: DurationCallback,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum DurationCallback {
    RemoveEffect,
    ApplyDamage(u32),
    RestoreHealth(u32),
    TriggerAbility(u32),
}

/// Unified component data enum for serialization
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum ComponentData {
    Position(PositionComponent),
    Health(HealthComponent),
    Combat(CombatComponent),
    Status(StatusComponent),
    Inventory(InventoryComponent),
    Match(MatchComponent),
    Timer(TimerComponent),
}

impl ComponentData {
    pub fn get_type(&self) -> ComponentTypeId {
        match self {
            ComponentData::Position(_) => ComponentTypeId::Position,
            ComponentData::Health(_) => ComponentTypeId::Health,
            ComponentData::Combat(_) => ComponentTypeId::Combat,
            ComponentData::Status(_) => ComponentTypeId::Status,
            ComponentData::Inventory(_) => ComponentTypeId::Inventory,
            ComponentData::Match(_) => ComponentTypeId::Match,
            ComponentData::Timer(_) => ComponentTypeId::Timer,
        }
    }

    pub fn serialize(&self) -> Result<Vec<u8>> {
        self.try_to_vec()
            .map_err(|_| ErrorCode::AccountDidNotSerialize.into())
    }
}

#[error_code]
pub enum ComponentError {
    #[msg("Component type mismatch")]
    ComponentTypeMismatch,
    #[msg("Component data too large")]
    ComponentDataTooLarge,
    #[msg("Invalid component operation")]
    InvalidComponentOperation,
    #[msg("Inventory is full")]
    InventoryFull,
    #[msg("Item too heavy")]
    TooHeavy,
}