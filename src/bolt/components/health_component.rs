use bolt_lang::*;
use anchor_lang::prelude::*;
use bytemuck::{Pod, Zeroable};

/// Health component for entities in combat
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(C)]
pub struct Health {
    pub current: u32,
    pub max: u32,
    pub base_max: u32,
    pub regeneration_rate: u32,
    pub last_regen: i64,
    pub damage_reduction: u16,
    pub is_invulnerable: bool,
    pub invulnerable_until: i64,
    pub shield: u32,
    pub shield_max: u32,
    pub temp_hp: u32,
    pub healing_modifier: u16, // Percentage modifier (100 = 100%)
}

unsafe impl Pod for Health {}
unsafe impl Zeroable for Health {}

impl Default for Health {
    fn default() -> Self {
        Self {
            current: 100,
            max: 100,
            base_max: 100,
            regeneration_rate: 1,
            last_regen: 0,
            damage_reduction: 0,
            is_invulnerable: false,
            invulnerable_until: 0,
            shield: 0,
            shield_max: 0,
            temp_hp: 0,
            healing_modifier: 100,
        }
    }
}

impl Health {
    pub const SIZE: usize = 4 + 4 + 4 + 4 + 8 + 2 + 1 + 8 + 4 + 4 + 4 + 2; // 49 bytes
    
    /// Create new health component with specified max HP
    pub fn new(max_hp: u32, regen_rate: u32, clock: &Clock) -> Self {
        Self {
            current: max_hp,
            max: max_hp,
            base_max: max_hp,
            regeneration_rate: regen_rate,
            last_regen: clock.unix_timestamp,
            damage_reduction: 0,
            is_invulnerable: false,
            invulnerable_until: 0,
            shield: 0,
            shield_max: 0,
            temp_hp: 0,
            healing_modifier: 100,
        }
    }
    
    /// Check if entity is dead
    pub fn is_dead(&self) -> bool {
        self.current == 0 && self.shield == 0 && self.temp_hp == 0
    }
    
    /// Check if entity is at full health
    pub fn is_full(&self) -> bool {
        self.current >= self.max && self.shield >= self.shield_max
    }
    
    /// Apply damage with resistance calculations
    pub fn take_damage(&mut self, mut damage: u32, clock: &Clock) -> Result<u32> {
        // Check invulnerability
        if self.is_invulnerable && clock.unix_timestamp < self.invulnerable_until {
            return Ok(0);
        }
        
        // Clear invulnerability if expired
        if self.is_invulnerable && clock.unix_timestamp >= self.invulnerable_until {
            self.is_invulnerable = false;
            self.invulnerable_until = 0;
        }
        
        // Apply damage reduction percentage
        if self.damage_reduction > 0 {
            let reduction = (damage * self.damage_reduction as u32) / 100;
            damage = damage.saturating_sub(reduction);
        }
        
        let original_damage = damage;
        
        // Damage shields first
        if self.shield > 0 {
            let shield_damage = damage.min(self.shield);
            self.shield -= shield_damage;
            damage -= shield_damage;
        }
        
        // Then temporary HP
        if damage > 0 && self.temp_hp > 0 {
            let temp_damage = damage.min(self.temp_hp);
            self.temp_hp -= temp_damage;
            damage -= temp_damage;
        }
        
        // Finally main HP
        if damage > 0 {
            self.current = self.current.saturating_sub(damage);
        }
        
        Ok(original_damage)
    }
    
    /// Apply healing with modifiers
    pub fn heal(&mut self, amount: u32) -> Result<u32> {
        if self.current >= self.max {
            return Ok(0);
        }
        
        // Apply healing modifier
        let modified_amount = (amount * self.healing_modifier as u32) / 100;
        let healed = (self.max - self.current).min(modified_amount);
        
        self.current = self.current.checked_add(healed)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        
        Ok(healed)
    }
    
    /// Process regeneration based on time elapsed
    pub fn regenerate(&mut self, clock: &Clock) -> Result<u32> {
        if self.regeneration_rate == 0 || self.current >= self.max {
            return Ok(0);
        }
        
        let time_diff = clock.unix_timestamp - self.last_regen;
        if time_diff <= 0 {
            return Ok(0);
        }
        
        // Regenerate every 5 seconds
        let regen_ticks = (time_diff / 5) as u32;
        if regen_ticks == 0 {
            return Ok(0);
        }
        
        let regen_amount = regen_ticks * self.regeneration_rate;
        let healed = self.heal(regen_amount)?;
        
        self.last_regen = clock.unix_timestamp;
        Ok(healed)
    }
    
    /// Add shield points
    pub fn add_shield(&mut self, amount: u32) -> Result<()> {
        self.shield = self.shield.checked_add(amount)
            .ok_or(ProgramError::ArithmeticOverflow)?
            .min(self.shield_max);
        Ok(())
    }
    
    /// Add temporary HP
    pub fn add_temp_hp(&mut self, amount: u32) -> Result<()> {
        self.temp_hp = self.temp_hp.checked_add(amount)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        Ok(())
    }
    
    /// Set maximum health and update current if needed
    pub fn set_max_health(&mut self, new_max: u32) -> Result<()> {
        self.max = new_max;
        if self.current > self.max {
            self.current = self.max;
        }
        Ok(())
    }
    
    /// Apply invulnerability for a duration
    pub fn set_invulnerable(&mut self, duration_seconds: i64, clock: &Clock) {
        self.is_invulnerable = true;
        self.invulnerable_until = clock.unix_timestamp + duration_seconds;
    }
    
    /// Set damage reduction percentage (0-100)
    pub fn set_damage_reduction(&mut self, percentage: u16) -> Result<()> {
        if percentage > 100 {
            return Err(ProgramError::InvalidArgument);
        }
        self.damage_reduction = percentage;
        Ok(())
    }
    
    /// Get effective total HP (current + shield + temp)
    pub fn total_effective_hp(&self) -> u32 {
        self.current + self.shield + self.temp_hp
    }
    
    /// Get health percentage (0-100)
    pub fn health_percentage(&self) -> u8 {
        if self.max == 0 {
            return 0;
        }
        ((self.current as u64 * 100) / self.max as u64) as u8
    }
    
    /// Reset to full health
    pub fn reset_full(&mut self) {
        self.current = self.max;
        self.shield = self.shield_max;
        self.temp_hp = 0;
        self.is_invulnerable = false;
        self.invulnerable_until = 0;
    }
}