use bolt_lang::*;
use anchor_lang::prelude::*;
use bytemuck::{Pod, Zeroable};

/// Combat component for managing battle state and actions
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(C)]
pub struct Combat {
    pub is_in_combat: bool,
    pub combat_started: i64,
    pub last_action: i64,
    pub action_cooldown: i64,
    pub global_cooldown: i64,
    pub target: Option<Pubkey>,
    pub last_attacker: Option<Pubkey>,
    pub damage_dealt: u32,
    pub damage_taken: u32,
    pub kills: u16,
    pub deaths: u16,
    pub combo_count: u8,
    pub last_combo_time: i64,
    pub is_stunned: bool,
    pub stunned_until: i64,
    pub is_silenced: bool,
    pub silenced_until: i64,
    pub attack_power: u16,
    pub armor: u16,
    pub critical_chance: u8,  // 0-100 percentage
    pub critical_damage: u16, // Percentage multiplier
    pub attack_speed: u16,    // Actions per minute
    pub accuracy: u8,         // 0-100 percentage
}

unsafe impl Pod for Combat {}
unsafe impl Zeroable for Combat {}

impl Default for Combat {
    fn default() -> Self {
        Self {
            is_in_combat: false,
            combat_started: 0,
            last_action: 0,
            action_cooldown: 2000, // 2 seconds default
            global_cooldown: 1000, // 1 second GCD
            target: None,
            last_attacker: None,
            damage_dealt: 0,
            damage_taken: 0,
            kills: 0,
            deaths: 0,
            combo_count: 0,
            last_combo_time: 0,
            is_stunned: false,
            stunned_until: 0,
            is_silenced: false,
            silenced_until: 0,
            attack_power: 10,
            armor: 0,
            critical_chance: 5,
            critical_damage: 150,
            attack_speed: 60,
            accuracy: 85,
        }
    }
}

/// Combat action types
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum CombatAction {
    BasicAttack = 0,
    HeavyAttack = 1,
    Defend = 2,
    Spell = 3,
    Ability = 4,
    Item = 5,
}

impl From<u8> for CombatAction {
    fn from(value: u8) -> Self {
        match value {
            0 => CombatAction::BasicAttack,
            1 => CombatAction::HeavyAttack,
            2 => CombatAction::Defend,
            3 => CombatAction::Spell,
            4 => CombatAction::Ability,
            5 => CombatAction::Item,
            _ => CombatAction::BasicAttack,
        }
    }
}

impl Combat {
    pub const SIZE: usize = 1 + 8 + 8 + 8 + 8 + 33 + 33 + 4 + 4 + 2 + 2 + 1 + 8 + 1 + 8 + 1 + 8 + 2 + 2 + 1 + 2 + 2 + 1; // ~108 bytes
    
    /// Create new combat component with base stats
    pub fn new(
        attack_power: u16,
        armor: u16,
        critical_chance: u8,
        attack_speed: u16,
        clock: &Clock,
    ) -> Self {
        Self {
            attack_power,
            armor,
            critical_chance: critical_chance.min(100),
            attack_speed,
            action_cooldown: (60000 / attack_speed.max(1) as i64), // Convert APM to milliseconds
            last_action: clock.unix_timestamp,
            ..Default::default()
        }
    }
    
    /// Check if entity can perform an action
    pub fn can_act(&self, clock: &Clock) -> bool {
        let now = clock.unix_timestamp;
        !self.is_stunned_now(clock) &&
        !self.is_silenced_now(clock) &&
        now >= (self.last_action + self.action_cooldown / 1000) && // Convert to seconds
        now >= (self.last_action + self.global_cooldown / 1000)
    }
    
    /// Start combat with target
    pub fn enter_combat(&mut self, target: Option<Pubkey>, clock: &Clock) {
        if !self.is_in_combat {
            self.is_in_combat = true;
            self.combat_started = clock.unix_timestamp;
        }
        self.target = target;
    }
    
    /// Exit combat
    pub fn exit_combat(&mut self) {
        self.is_in_combat = false;
        self.target = None;
        self.combo_count = 0;
        self.combat_started = 0;
    }
    
    /// Execute an action with cooldown management
    pub fn execute_action(
        &mut self,
        action: CombatAction,
        clock: &Clock,
    ) -> Result<bool> {
        if !self.can_act(clock) {
            return Ok(false);
        }
        
        // Set action-specific cooldowns
        self.action_cooldown = match action {
            CombatAction::BasicAttack => 60000 / self.attack_speed.max(1) as i64,
            CombatAction::HeavyAttack => (60000 / self.attack_speed.max(1) as i64) * 2,
            CombatAction::Defend => 500,  // Quick defensive action
            CombatAction::Spell => 3000,  // Longer cooldown for spells
            CombatAction::Ability => 5000, // Longest cooldown for abilities
            CombatAction::Item => 1000,   // Moderate cooldown for items
        };
        
        self.last_action = clock.unix_timestamp;
        
        // Manage combo system
        if matches!(action, CombatAction::BasicAttack | CombatAction::HeavyAttack) {
            if clock.unix_timestamp - self.last_combo_time <= 3 {
                self.combo_count = self.combo_count.saturating_add(1).min(10);
            } else {
                self.combo_count = 1;
            }
            self.last_combo_time = clock.unix_timestamp;
        }
        
        Ok(true)
    }
    
    /// Calculate damage output including critical hits
    pub fn calculate_damage(&self, base_damage: u32, rng_seed: u64) -> u32 {
        let mut damage = base_damage + self.attack_power as u32;
        
        // Add combo bonus
        if self.combo_count > 1 {
            let combo_bonus = (damage * (self.combo_count as u32 - 1) * 5) / 100; // 5% per combo
            damage += combo_bonus;
        }
        
        // Simple RNG for critical hits using seed
        let crit_roll = (rng_seed % 100) as u8;
        if crit_roll < self.critical_chance {
            damage = (damage * self.critical_damage as u32) / 100;
        }
        
        damage
    }
    
    /// Calculate damage reduction from armor
    pub fn calculate_damage_reduction(&self, incoming_damage: u32) -> u32 {
        if self.armor == 0 {
            return incoming_damage;
        }
        
        // Armor reduces damage: reduction% = armor / (armor + 100)
        let reduction_percent = (self.armor as u32 * 100) / (self.armor as u32 + 100);
        let reduction = (incoming_damage * reduction_percent) / 100;
        incoming_damage.saturating_sub(reduction)
    }
    
    /// Apply stun effect
    pub fn stun(&mut self, duration_seconds: i64, clock: &Clock) {
        self.is_stunned = true;
        self.stunned_until = clock.unix_timestamp + duration_seconds;
    }
    
    /// Apply silence effect
    pub fn silence(&mut self, duration_seconds: i64, clock: &Clock) {
        self.is_silenced = true;
        self.silenced_until = clock.unix_timestamp + duration_seconds;
    }
    
    /// Check if currently stunned
    pub fn is_stunned_now(&self, clock: &Clock) -> bool {
        if !self.is_stunned {
            return false;
        }
        
        if clock.unix_timestamp >= self.stunned_until {
            // Stun has expired, but we can't mutate here
            return false;
        }
        
        true
    }
    
    /// Check if currently silenced
    pub fn is_silenced_now(&self, clock: &Clock) -> bool {
        if !self.is_silenced {
            return false;
        }
        
        if clock.unix_timestamp >= self.silenced_until {
            // Silence has expired, but we can't mutate here
            return false;
        }
        
        true
    }
    
    /// Clear expired effects
    pub fn update_effects(&mut self, clock: &Clock) {
        if self.is_stunned && clock.unix_timestamp >= self.stunned_until {
            self.is_stunned = false;
            self.stunned_until = 0;
        }
        
        if self.is_silenced && clock.unix_timestamp >= self.silenced_until {
            self.is_silenced = false;
            self.silenced_until = 0;
        }
        
        // Reset combo if too much time has passed
        if clock.unix_timestamp - self.last_combo_time > 5 {
            self.combo_count = 0;
        }
    }
    
    /// Record damage dealt
    pub fn record_damage_dealt(&mut self, damage: u32) -> Result<()> {
        self.damage_dealt = self.damage_dealt.checked_add(damage)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        Ok(())
    }
    
    /// Record damage taken
    pub fn record_damage_taken(&mut self, damage: u32) -> Result<()> {
        self.damage_taken = self.damage_taken.checked_add(damage)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        Ok(())
    }
    
    /// Record a kill
    pub fn record_kill(&mut self) -> Result<()> {
        self.kills = self.kills.checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        Ok(())
    }
    
    /// Record a death
    pub fn record_death(&mut self) -> Result<()> {
        self.deaths = self.deaths.checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.combo_count = 0; // Reset combo on death
        Ok(())
    }
    
    /// Get KDA ratio
    pub fn kda_ratio(&self) -> f32 {
        if self.deaths == 0 {
            self.kills as f32
        } else {
            self.kills as f32 / self.deaths as f32
        }
    }
    
    /// Update combat stats
    pub fn update_stats(
        &mut self,
        attack_power: Option<u16>,
        armor: Option<u16>,
        critical_chance: Option<u8>,
        attack_speed: Option<u16>,
    ) {
        if let Some(ap) = attack_power {
            self.attack_power = ap;
        }
        if let Some(ar) = armor {
            self.armor = ar;
        }
        if let Some(cc) = critical_chance {
            self.critical_chance = cc.min(100);
        }
        if let Some(as_val) = attack_speed {
            self.attack_speed = as_val;
            self.action_cooldown = 60000 / as_val.max(1) as i64;
        }
    }
    
    /// Reset combat stats for new match
    pub fn reset_for_match(&mut self) {
        self.damage_dealt = 0;
        self.damage_taken = 0;
        self.combo_count = 0;
        self.is_stunned = false;
        self.is_silenced = false;
        self.stunned_until = 0;
        self.silenced_until = 0;
        self.target = None;
        self.last_attacker = None;
        self.is_in_combat = false;
        self.combat_started = 0;
    }
}