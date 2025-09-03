use anchor_lang::prelude::*;
use crate::{
    World, Entity, ComponentTypeId, HealthComponent, CombatComponent, PositionComponent, StatusComponent,
    System, SystemExecutionResult, SystemPriority, SystemPhase, ComponentQuery
};

/// CombatSystem processes attacks, damage calculation, and combat resolution
pub struct CombatSystem;

impl System for CombatSystem {
    fn execute(&self, world: &mut World, entities: &[Entity]) -> Result<SystemExecutionResult> {
        let mut result = SystemExecutionResult::default();
        let start_time = Clock::get()?.unix_timestamp;

        // Query entities with Combat and Health components
        let query = ComponentQuery::new()
            .require_component(ComponentTypeId::Combat)
            .require_component(ComponentTypeId::Health);

        let mut entities_processed = 0u32;
        let mut components_modified = 0u32;

        for entity in entities {
            if !query.matches_entity(entity) {
                continue;
            }

            // Process combat for this entity
            if let Err(e) = process_entity_combat(world, entity) {
                result.errors.push(crate::SystemError {
                    entity_id: entity.id,
                    error_type: crate::SystemErrorType::InvalidState,
                    message: format!("Combat processing failed: {}", e),
                });
                continue;
            }

            entities_processed += 1;
            components_modified += 2; // Health and Combat components
        }

        let end_time = Clock::get()?.unix_timestamp;
        result.entities_processed = entities_processed;
        result.components_modified = components_modified;
        result.execution_time_ms = ((end_time - start_time) * 1000) as u32;

        Ok(result)
    }

    fn can_run_parallel(&self) -> bool {
        false // Combat requires careful sequencing to avoid race conditions
    }

    fn get_required_components(&self) -> Vec<ComponentTypeId> {
        vec![ComponentTypeId::Combat, ComponentTypeId::Health]
    }

    fn get_modified_components(&self) -> Vec<ComponentTypeId> {
        vec![ComponentTypeId::Health, ComponentTypeId::Combat, ComponentTypeId::Status]
    }

    fn get_priority(&self) -> SystemPriority {
        SystemPriority::High
    }

    fn get_phase(&self) -> SystemPhase {
        SystemPhase::Update
    }
}

pub fn handler(ctx: Context<crate::ExecuteCombatSystem>) -> Result<()> {
    let world = &mut ctx.accounts.world;
    let combat_system = CombatSystem;

    // This would typically query entities from the world
    let entities: Vec<Entity> = Vec::new();

    let result = combat_system.execute(world, &entities)?;

    emit!(CombatSystemExecuted {
        entities_processed: result.entities_processed,
        combats_resolved: result.entities_processed / 2, // Approximate combats
        execution_time_ms: result.execution_time_ms,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

fn process_entity_combat(world: &mut World, entity: &Entity) -> Result<()> {
    // In a real implementation, this would:
    // 1. Check for pending combat actions
    // 2. Validate targets and range
    // 3. Calculate damage and effects
    // 4. Apply damage to targets
    // 5. Handle combat events and status effects
    
    world.last_updated = Clock::get()?.unix_timestamp;
    Ok(())
}

/// Combat action types for different attack patterns
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum CombatActionType {
    BasicAttack,
    HeavyAttack,
    RangedAttack,
    AreaOfEffect,
    Heal,
    Buff,
    Debuff,
    Block,
    Dodge,
    Counter,
}

/// Combat action with timing and targeting information
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CombatAction {
    pub action_type: CombatActionType,
    pub attacker: u64,
    pub targets: Vec<u64>,
    pub power: u32,
    pub range: f32,
    pub mana_cost: u32,
    pub cooldown: i64,
    pub execute_at: i64,
    pub modifiers: Vec<CombatModifier>,
}

/// Combat modifiers for special effects
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CombatModifier {
    pub modifier_type: ModifierType,
    pub value: f32,
    pub duration: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModifierType {
    DamageMultiplier,
    AccuracyBonus,
    CriticalChance,
    ArmorPenetration,
    LifeSteal,
    ManaSteal,
    Knockback,
    Stun,
    Slow,
}

/// Combat result with detailed outcome information
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CombatResult {
    pub action: CombatAction,
    pub outcomes: Vec<CombatOutcome>,
    pub timestamp: i64,
    pub random_seed: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CombatOutcome {
    pub target: u64,
    pub hit: bool,
    pub critical: bool,
    pub damage_dealt: u32,
    pub healing_done: u32,
    pub effects_applied: Vec<crate::StatusEffect>,
    pub target_died: bool,
}

/// Damage calculation utilities
pub struct DamageCalculator;

impl DamageCalculator {
    /// Calculate base damage with attack vs defense
    pub fn calculate_base_damage(attack: u32, defense: u32, power: u32) -> u32 {
        let raw_damage = (attack * power) / 100;
        let mitigated_damage = if raw_damage > defense {
            raw_damage - (defense / 2)
        } else {
            raw_damage / 4 // Minimum damage when defense is high
        };
        mitigated_damage.max(1) // Always at least 1 damage
    }

    /// Apply critical hit multiplier
    pub fn apply_critical(damage: u32, multiplier: u32) -> u32 {
        (damage * multiplier) / 100
    }

    /// Calculate damage with all modifiers
    pub fn calculate_final_damage(
        base_damage: u32,
        modifiers: &[CombatModifier],
        target_resistances: &[(ModifierType, u32)]
    ) -> u32 {
        let mut final_damage = base_damage as f32;

        // Apply damage modifiers
        for modifier in modifiers {
            if modifier.modifier_type == ModifierType::DamageMultiplier {
                final_damage *= modifier.value;
            }
        }

        // Apply target resistances
        for (resistance_type, resistance_value) in target_resistances {
            if *resistance_type == ModifierType::DamageMultiplier {
                final_damage *= 1.0 - (*resistance_value as f32 / 100.0);
            }
        }

        final_damage.max(1.0) as u32
    }

    /// Determine if attack hits based on accuracy and evasion
    pub fn calculate_hit_chance(accuracy: u32, evasion: u32, random_seed: u64) -> bool {
        let hit_chance = if accuracy > evasion {
            accuracy - evasion
        } else {
            5 // Minimum 5% hit chance
        };
        
        let roll = (random_seed % 100) as u32;
        roll < hit_chance.min(95) // Maximum 95% hit chance
    }

    /// Determine critical hit based on chance and random seed
    pub fn calculate_critical_hit(critical_chance: u32, random_seed: u64) -> bool {
        let roll = ((random_seed >> 8) % 100) as u32;
        roll < critical_chance.min(50) // Cap at 50% crit chance
    }
}

/// Combat range and area of effect utilities
pub struct RangeCalculator;

impl RangeCalculator {
    /// Check if target is within range for an attack
    pub fn is_in_range(
        attacker_pos: &PositionComponent,
        target_pos: &PositionComponent,
        range: f32
    ) -> bool {
        attacker_pos.distance_to(target_pos) <= range
    }

    /// Get all entities within area of effect
    pub fn get_entities_in_aoe(
        center: &PositionComponent,
        radius: f32,
        entities: &[(u64, PositionComponent)]
    ) -> Vec<u64> {
        entities.iter()
            .filter_map(|(id, pos)| {
                if center.distance_to(pos) <= radius {
                    Some(*id)
                } else {
                    None
                }
            })
            .collect()
    }

    /// Calculate optimal positioning for combat
    pub fn calculate_optimal_position(
        attacker_pos: &PositionComponent,
        target_pos: &PositionComponent,
        preferred_range: f32
    ) -> PositionComponent {
        let distance = attacker_pos.distance_to(target_pos);
        
        if distance <= preferred_range {
            return *attacker_pos; // Already in good position
        }

        // Move towards target to get in range
        let direction_x = (target_pos.x - attacker_pos.x) / distance;
        let direction_y = (target_pos.y - attacker_pos.y) / distance;
        
        let move_distance = distance - preferred_range;
        
        PositionComponent {
            x: attacker_pos.x + direction_x * move_distance,
            y: attacker_pos.y + direction_y * move_distance,
            z: attacker_pos.z,
            facing: direction_x.atan2(direction_y),
        }
    }
}

/// Combat AI for automated decision making
pub struct CombatAI;

impl CombatAI {
    /// Choose best action for an entity
    pub fn choose_action(
        entity: &Entity,
        combat_comp: &CombatComponent,
        health_comp: &HealthComponent,
        available_targets: &[u64],
        current_time: i64
    ) -> Option<CombatActionType> {
        // Simple AI decision tree
        let health_percentage = health_comp.health_percentage();
        
        // Low health - prioritize healing or defensive actions
        if health_percentage < 0.3 {
            if health_comp.current < health_comp.maximum / 2 {
                return Some(CombatActionType::Heal);
            } else {
                return Some(CombatActionType::Block);
            }
        }
        
        // High health - aggressive actions
        if health_percentage > 0.7 && !available_targets.is_empty() {
            // Use special attacks if available
            if combat_comp.can_attack(current_time, 30) { // 30 second cooldown
                return Some(CombatActionType::HeavyAttack);
            } else {
                return Some(CombatActionType::BasicAttack);
            }
        }
        
        // Medium health - balanced approach
        if !available_targets.is_empty() {
            if available_targets.len() > 1 {
                Some(CombatActionType::AreaOfEffect)
            } else {
                Some(CombatActionType::BasicAttack)
            }
        } else {
            Some(CombatActionType::Block)
        }
    }

    /// Evaluate threat level of potential targets
    pub fn evaluate_threat_level(
        target_combat: &CombatComponent,
        target_health: &HealthComponent,
        distance: f32
    ) -> f32 {
        let damage_potential = target_combat.attack as f32;
        let survivability = target_health.health_percentage();
        let proximity_factor = 1.0 / (1.0 + distance);
        
        damage_potential * survivability * proximity_factor
    }

    /// Select best target from available options
    pub fn select_target(
        attacker_pos: &PositionComponent,
        potential_targets: &[(u64, PositionComponent, CombatComponent, HealthComponent)]
    ) -> Option<u64> {
        potential_targets.iter()
            .map(|(id, pos, combat, health)| {
                let distance = attacker_pos.distance_to(pos);
                let threat_level = Self::evaluate_threat_level(combat, health, distance);
                (*id, threat_level)
            })
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(id, _)| id)
    }
}

#[event]
pub struct CombatSystemExecuted {
    pub entities_processed: u32,
    pub combats_resolved: u32,
    pub execution_time_ms: u32,
    pub timestamp: i64,
}

#[event]
pub struct CombatResolved {
    pub attacker: u64,
    pub target: u64,
    pub damage_dealt: u32,
    pub action_type: CombatActionType,
    pub critical_hit: bool,
    pub timestamp: i64,
}