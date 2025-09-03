use bolt_lang::*;
use anchor_lang::prelude::*;
use crate::components::*;

/// Combat System for handling real-time PvP battles
pub struct CombatSystem;

impl CombatSystem {
    /// Execute a combat action between two entities
    pub fn execute_action(
        attacker_combat: &mut Combat,
        attacker_health: &Health,
        attacker_position: &Position,
        target_combat: &mut Combat,
        target_health: &mut Health,
        target_position: &Position,
        action_type: u8,
        power: u32,
        clock: &Clock,
    ) -> Result<CombatResult> {
        let action = CombatAction::from(action_type);
        
        // Validate action can be performed
        if !attacker_combat.can_act(clock) {
            return Ok(CombatResult {
                success: false,
                damage_dealt: 0,
                critical_hit: false,
                action_type: action_type,
                message: "Action on cooldown".to_string(),
            });
        }
        
        // Check if target is in range for melee attacks
        if matches!(action, CombatAction::BasicAttack | CombatAction::HeavyAttack) {
            let distance = attacker_position.distance_to(target_position);
            let max_range = if matches!(action, CombatAction::HeavyAttack) { 150.0 } else { 100.0 };
            
            if distance > max_range {
                return Ok(CombatResult {
                    success: false,
                    damage_dealt: 0,
                    critical_hit: false,
                    action_type: action_type,
                    message: "Target out of range".to_string(),
                });
            }
        }
        
        // Check if target is already dead
        if target_health.is_dead() {
            return Ok(CombatResult {
                success: false,
                damage_dealt: 0,
                critical_hit: false,
                action_type: action_type,
                message: "Target is already dead".to_string(),
            });
        }
        
        // Execute the action
        let mut result = match action {
            CombatAction::BasicAttack => Self::execute_basic_attack(
                attacker_combat, target_combat, target_health, power, clock
            )?,
            CombatAction::HeavyAttack => Self::execute_heavy_attack(
                attacker_combat, target_combat, target_health, power, clock
            )?,
            CombatAction::Defend => Self::execute_defend(attacker_combat, clock)?,
            CombatAction::Spell => Self::execute_spell(
                attacker_combat, target_combat, target_health, power, clock
            )?,
            CombatAction::Ability => Self::execute_ability(
                attacker_combat, target_combat, target_health, power, clock
            )?,
            CombatAction::Item => Self::execute_item_use(attacker_combat, power, clock)?,
        };
        
        // Update combat states
        if result.success && result.damage_dealt > 0 {
            attacker_combat.enter_combat(Some(Pubkey::default()), clock); // TODO: Use actual target pubkey
            target_combat.enter_combat(Some(Pubkey::default()), clock);   // TODO: Use actual attacker pubkey
            
            attacker_combat.record_damage_dealt(result.damage_dealt)?;
            target_combat.record_damage_taken(result.damage_dealt)?;
            
            // Check if target died
            if target_health.is_dead() {
                attacker_combat.record_kill()?;
                target_combat.record_death()?;
                result.message = "Target eliminated!".to_string();
            }
        }
        
        Ok(result)
    }
    
    /// Execute basic attack
    fn execute_basic_attack(
        attacker: &mut Combat,
        target: &mut Combat,
        target_health: &mut Health,
        power: u32,
        clock: &Clock,
    ) -> Result<CombatResult> {
        if !attacker.execute_action(CombatAction::BasicAttack, clock)? {
            return Ok(CombatResult::failed("Cannot perform basic attack"));
        }
        
        // Calculate damage with RNG seed based on clock
        let rng_seed = (clock.unix_timestamp as u64).wrapping_mul(31) % 100;
        let base_damage = power.max(5); // Minimum 5 damage
        let calculated_damage = attacker.calculate_damage(base_damage, rng_seed);
        
        // Apply target's damage reduction
        let final_damage = target.calculate_damage_reduction(calculated_damage);
        
        // Apply damage to target health
        let actual_damage = target_health.take_damage(final_damage, clock)?;
        
        let critical_hit = rng_seed < attacker.critical_chance as u64;
        
        Ok(CombatResult {
            success: true,
            damage_dealt: actual_damage,
            critical_hit,
            action_type: CombatAction::BasicAttack as u8,
            message: if critical_hit { "Critical hit!" } else { "Basic attack" }.to_string(),
        })
    }
    
    /// Execute heavy attack with longer cooldown but more damage
    fn execute_heavy_attack(
        attacker: &mut Combat,
        target: &mut Combat,
        target_health: &mut Health,
        power: u32,
        clock: &Clock,
    ) -> Result<CombatResult> {
        if !attacker.execute_action(CombatAction::HeavyAttack, clock)? {
            return Ok(CombatResult::failed("Cannot perform heavy attack"));
        }
        
        let rng_seed = (clock.unix_timestamp as u64).wrapping_mul(37) % 100;
        let base_damage = (power * 2).max(10); // 2x damage, minimum 10
        let calculated_damage = attacker.calculate_damage(base_damage, rng_seed);
        
        let final_damage = target.calculate_damage_reduction(calculated_damage);
        let actual_damage = target_health.take_damage(final_damage, clock)?;
        
        let critical_hit = rng_seed < (attacker.critical_chance + 10) as u64; // +10% crit for heavy attack
        
        Ok(CombatResult {
            success: true,
            damage_dealt: actual_damage,
            critical_hit,
            action_type: CombatAction::HeavyAttack as u8,
            message: if critical_hit { "Devastating critical!" } else { "Heavy attack" }.to_string(),
        })
    }
    
    /// Execute defend action to reduce incoming damage
    fn execute_defend(attacker: &mut Combat, clock: &Clock) -> Result<CombatResult> {
        if !attacker.execute_action(CombatAction::Defend, clock)? {
            return Ok(CombatResult::failed("Cannot defend"));
        }
        
        // Defending increases armor temporarily (would need additional component state)
        // For now, just consume the action
        
        Ok(CombatResult {
            success: true,
            damage_dealt: 0,
            critical_hit: false,
            action_type: CombatAction::Defend as u8,
            message: "Defensive stance".to_string(),
        })
    }
    
    /// Execute spell attack with longer range but cooldown
    fn execute_spell(
        attacker: &mut Combat,
        target: &mut Combat,
        target_health: &mut Health,
        power: u32,
        clock: &Clock,
    ) -> Result<CombatResult> {
        if !attacker.execute_action(CombatAction::Spell, clock)? {
            return Ok(CombatResult::failed("Cannot cast spell"));
        }
        
        // Check if silenced
        if attacker.is_silenced_now(clock) {
            return Ok(CombatResult::failed("Silenced - cannot cast spells"));
        }
        
        let rng_seed = (clock.unix_timestamp as u64).wrapping_mul(41) % 100;
        let base_damage = (power * 15 / 10).max(8); // 1.5x damage, minimum 8
        let calculated_damage = attacker.calculate_damage(base_damage, rng_seed);
        
        // Spells may bypass some armor (magical damage)
        let armor_bypass = target.armor / 2;
        let effective_armor = target.armor.saturating_sub(armor_bypass);
        let final_damage = if effective_armor == 0 {
            calculated_damage
        } else {
            let reduction_percent = (effective_armor as u32 * 100) / (effective_armor as u32 + 100);
            let reduction = (calculated_damage * reduction_percent) / 100;
            calculated_damage.saturating_sub(reduction)
        };
        
        let actual_damage = target_health.take_damage(final_damage, clock)?;
        
        let critical_hit = rng_seed < attacker.critical_chance as u64;
        
        Ok(CombatResult {
            success: true,
            damage_dealt: actual_damage,
            critical_hit,
            action_type: CombatAction::Spell as u8,
            message: if critical_hit { "Spell critical!" } else { "Spell cast" }.to_string(),
        })
    }
    
    /// Execute special ability with unique effects
    fn execute_ability(
        attacker: &mut Combat,
        target: &mut Combat,
        target_health: &mut Health,
        power: u32,
        clock: &Clock,
    ) -> Result<CombatResult> {
        if !attacker.execute_action(CombatAction::Ability, clock)? {
            return Ok(CombatResult::failed("Cannot use ability"));
        }
        
        let rng_seed = (clock.unix_timestamp as u64).wrapping_mul(43) % 100;
        
        // Abilities can have special effects based on power parameter
        let ability_effect = power % 5;
        let mut result = match ability_effect {
            0 => {
                // Stun ability
                target.stun(2, clock); // 2 second stun
                CombatResult {
                    success: true,
                    damage_dealt: 0,
                    critical_hit: false,
                    action_type: CombatAction::Ability as u8,
                    message: "Target stunned!".to_string(),
                }
            },
            1 => {
                // Damage over time ability
                let damage = attacker.calculate_damage(power * 2, rng_seed);
                let final_damage = target.calculate_damage_reduction(damage);
                let actual_damage = target_health.take_damage(final_damage, clock)?;
                
                CombatResult {
                    success: true,
                    damage_dealt: actual_damage,
                    critical_hit: rng_seed < attacker.critical_chance as u64,
                    action_type: CombatAction::Ability as u8,
                    message: "Burning strike!".to_string(),
                }
            },
            2 => {
                // Silence ability
                target.silence(3, clock); // 3 second silence
                CombatResult {
                    success: true,
                    damage_dealt: 0,
                    critical_hit: false,
                    action_type: CombatAction::Ability as u8,
                    message: "Target silenced!".to_string(),
                }
            },
            3 => {
                // High damage ability
                let damage = attacker.calculate_damage(power * 3, rng_seed);
                let final_damage = target.calculate_damage_reduction(damage);
                let actual_damage = target_health.take_damage(final_damage, clock)?;
                
                CombatResult {
                    success: true,
                    damage_dealt: actual_damage,
                    critical_hit: rng_seed < (attacker.critical_chance + 20) as u64,
                    action_type: CombatAction::Ability as u8,
                    message: "Devastating blow!".to_string(),
                }
            },
            _ => {
                // Combo finisher
                let combo_multiplier = attacker.combo_count.max(1) as u32;
                let damage = attacker.calculate_damage(power * combo_multiplier, rng_seed);
                let final_damage = target.calculate_damage_reduction(damage);
                let actual_damage = target_health.take_damage(final_damage, clock)?;
                
                CombatResult {
                    success: true,
                    damage_dealt: actual_damage,
                    critical_hit: rng_seed < attacker.critical_chance as u64,
                    action_type: CombatAction::Ability as u8,
                    message: format!("Combo finisher x{}!", combo_multiplier),
                }
            }
        };
        
        Ok(result)
    }
    
    /// Execute item use (healing, buffs, etc.)
    fn execute_item_use(attacker: &mut Combat, power: u32, clock: &Clock) -> Result<CombatResult> {
        if !attacker.execute_action(CombatAction::Item, clock)? {
            return Ok(CombatResult::failed("Cannot use item"));
        }
        
        // Items could modify stats temporarily or provide healing
        // For now, just consume the action
        Ok(CombatResult {
            success: true,
            damage_dealt: 0,
            critical_hit: false,
            action_type: CombatAction::Item as u8,
            message: "Item used".to_string(),
        })
    }
    
    /// Update combat effects and cooldowns
    pub fn update_combat_effects(combat: &mut Combat, clock: &Clock) {
        combat.update_effects(clock);
    }
    
    /// Check if combat should end (e.g., one participant dead or left combat area)
    pub fn should_end_combat(
        combat1: &Combat,
        health1: &Health,
        combat2: &Combat,
        health2: &Health,
        clock: &Clock,
    ) -> bool {
        // End combat if either participant is dead
        if health1.is_dead() || health2.is_dead() {
            return true;
        }
        
        // End combat if no combat action in last 30 seconds
        let inactive_time = 30;
        let now = clock.unix_timestamp;
        if (now - combat1.last_action > inactive_time) && (now - combat2.last_action > inactive_time) {
            return true;
        }
        
        false
    }
    
    /// End combat state for an entity
    pub fn end_combat(combat: &mut Combat) {
        combat.exit_combat();
    }
}

/// Result of a combat action
#[derive(Debug, Clone)]
pub struct CombatResult {
    pub success: bool,
    pub damage_dealt: u32,
    pub critical_hit: bool,
    pub action_type: u8,
    pub message: String,
}

impl CombatResult {
    fn failed(message: &str) -> Self {
        Self {
            success: false,
            damage_dealt: 0,
            critical_hit: false,
            action_type: 0,
            message: message.to_string(),
        }
    }
}