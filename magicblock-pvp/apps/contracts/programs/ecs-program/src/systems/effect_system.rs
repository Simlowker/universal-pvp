use anchor_lang::prelude::*;
use crate::{
    World, Entity, ComponentTypeId, StatusComponent, HealthComponent, CombatComponent, TimerComponent,
    System, SystemExecutionResult, SystemPriority, SystemPhase, ComponentQuery, StatusEffect, StatusType
};

/// EffectSystem processes status effects, buffs, debuffs, and DOT/HOT effects
pub struct EffectSystem;

impl System for EffectSystem {
    fn execute(&self, world: &mut World, entities: &[Entity]) -> Result<SystemExecutionResult> {
        let mut result = SystemExecutionResult::default();
        let start_time = Clock::get()?.unix_timestamp;

        // Query entities with Status components
        let query = ComponentQuery::new()
            .require_component(ComponentTypeId::Status);

        let mut entities_processed = 0u32;
        let mut components_modified = 0u32;

        for entity in entities {
            if !query.matches_entity(entity) {
                continue;
            }

            match process_entity_effects(world, entity, start_time) {
                Ok(modified_count) => {
                    entities_processed += 1;
                    components_modified += modified_count;
                }
                Err(e) => {
                    result.errors.push(crate::SystemError {
                        entity_id: entity.id,
                        error_type: crate::SystemErrorType::InvalidState,
                        message: format!("Effect processing failed: {}", e),
                    });
                }
            }
        }

        let end_time = Clock::get()?.unix_timestamp;
        result.entities_processed = entities_processed;
        result.components_modified = components_modified;
        result.execution_time_ms = ((end_time - start_time) * 1000) as u32;

        Ok(result)
    }

    fn can_run_parallel(&self) -> bool {
        true // Effects can be processed independently per entity
    }

    fn get_required_components(&self) -> Vec<ComponentTypeId> {
        vec![ComponentTypeId::Status]
    }

    fn get_modified_components(&self) -> Vec<ComponentTypeId> {
        vec![ComponentTypeId::Status, ComponentTypeId::Health, ComponentTypeId::Combat]
    }

    fn get_priority(&self) -> SystemPriority {
        SystemPriority::Normal
    }

    fn get_phase(&self) -> SystemPhase {
        SystemPhase::PostUpdate
    }
}

pub fn handler(ctx: Context<crate::ExecuteEffectSystem>) -> Result<()> {
    let world = &mut ctx.accounts.world;
    let effect_system = EffectSystem;

    let entities: Vec<Entity> = Vec::new();
    let result = effect_system.execute(world, &entities)?;

    emit!(EffectSystemExecuted {
        entities_processed: result.entities_processed,
        effects_processed: result.components_modified,
        execution_time_ms: result.execution_time_ms,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

fn process_entity_effects(world: &mut World, entity: &Entity, current_time: i64) -> Result<u32> {
    // In a real implementation, this would:
    // 1. Load StatusComponent from storage
    // 2. Process each active effect
    // 3. Apply damage/healing/stat modifications
    // 4. Remove expired effects
    // 5. Handle effect interactions and stacking

    let mut components_modified = 0u32;

    // Simulate effect processing
    world.last_updated = current_time;
    components_modified += 1;

    Ok(components_modified)
}

/// Effect processor for different status effect types
pub struct EffectProcessor;

impl EffectProcessor {
    /// Process all effects on an entity
    pub fn process_all_effects(
        status: &mut StatusComponent,
        health: Option<&mut HealthComponent>,
        combat: Option<&mut CombatComponent>,
        current_time: i64,
    ) -> Vec<EffectEvent> {
        let mut events = Vec::new();

        // Update effects and remove expired ones
        status.update_effects(current_time);

        // Process each active effect
        let active_effects = status.effects.clone();
        for effect in active_effects {
            if let Some(event) = Self::process_effect(&effect, health.as_deref_mut(), combat.as_deref_mut()) {
                events.push(event);
            }
        }

        events
    }

    /// Process a single status effect
    pub fn process_effect(
        effect: &StatusEffect,
        health: Option<&mut HealthComponent>,
        combat: Option<&mut CombatComponent>,
    ) -> Option<EffectEvent> {
        match effect.effect_type {
            StatusType::Poisoned => {
                if let Some(health_comp) = health {
                    let damage = effect.strength * effect.stacks;
                    health_comp.take_damage(damage, Clock::get().ok()?.unix_timestamp);
                    return Some(EffectEvent {
                        effect_type: effect.effect_type,
                        target: health_comp.maximum as u64, // Placeholder
                        value: damage,
                        event_type: EffectEventType::DamageDealt,
                    });
                }
            }
            StatusType::Regenerating => {
                if let Some(health_comp) = health {
                    let healing = effect.strength * effect.stacks;
                    health_comp.heal(healing);
                    return Some(EffectEvent {
                        effect_type: effect.effect_type,
                        target: health_comp.maximum as u64, // Placeholder
                        value: healing,
                        event_type: EffectEventType::HealingDone,
                    });
                }
            }
            StatusType::Blessed => {
                if let Some(combat_comp) = combat {
                    // Temporarily boost attack (this would need more sophisticated state management)
                    let boost = effect.strength * effect.stacks;
                    return Some(EffectEvent {
                        effect_type: effect.effect_type,
                        target: 0, // Placeholder
                        value: boost,
                        event_type: EffectEventType::StatModified,
                    });
                }
            }
            StatusType::Cursed => {
                if let Some(combat_comp) = combat {
                    // Temporarily reduce attack
                    let reduction = effect.strength * effect.stacks;
                    return Some(EffectEvent {
                        effect_type: effect.effect_type,
                        target: 0, // Placeholder
                        value: reduction,
                        event_type: EffectEventType::StatModified,
                    });
                }
            }
            StatusType::Stunned => {
                // Stunned entities can't act - this would be handled by other systems
                return Some(EffectEvent {
                    effect_type: effect.effect_type,
                    target: 0,
                    value: 0,
                    event_type: EffectEventType::ActionBlocked,
                });
            }
            _ => {
                // Handle other effect types
            }
        }

        None
    }

    /// Apply a new effect to an entity
    pub fn apply_effect(
        status: &mut StatusComponent,
        effect: StatusEffect,
    ) -> Result<EffectApplicationResult> {
        // Check immunities
        if status.is_immune(effect.effect_type) {
            return Ok(EffectApplicationResult::Immune);
        }

        // Check resistances
        let resistance = status.get_resistance(effect.effect_type);
        if resistance >= 100 {
            return Ok(EffectApplicationResult::Resisted);
        }

        // Apply resistance reduction
        let mut modified_effect = effect;
        if resistance > 0 {
            modified_effect.strength = (modified_effect.strength * (100 - resistance)) / 100;
            modified_effect.duration = (modified_effect.duration * (100 - resistance) as i64) / 100;
        }

        // Check for existing effect of same type
        if let Some(existing_effect) = status.effects.iter_mut()
            .find(|e| e.effect_type == modified_effect.effect_type) {
            
            // Handle stacking or refreshing
            match Self::get_stacking_behavior(modified_effect.effect_type) {
                StackingBehavior::Stack => {
                    existing_effect.add_stack(modified_effect.duration, Clock::get()?.unix_timestamp);
                    Ok(EffectApplicationResult::Stacked)
                }
                StackingBehavior::Refresh => {
                    existing_effect.expires_at = Clock::get()?.unix_timestamp + modified_effect.duration;
                    existing_effect.strength = modified_effect.strength.max(existing_effect.strength);
                    Ok(EffectApplicationResult::Refreshed)
                }
                StackingBehavior::Replace => {
                    *existing_effect = modified_effect;
                    Ok(EffectApplicationResult::Replaced)
                }
                StackingBehavior::Ignore => {
                    Ok(EffectApplicationResult::Ignored)
                }
            }
        } else {
            // Add new effect
            status.add_effect(modified_effect)?;
            Ok(EffectApplicationResult::Applied)
        }
    }

    /// Get stacking behavior for different effect types
    fn get_stacking_behavior(effect_type: StatusType) -> StackingBehavior {
        match effect_type {
            StatusType::Poisoned => StackingBehavior::Stack,
            StatusType::Burning => StackingBehavior::Stack,
            StatusType::Regenerating => StackingBehavior::Refresh,
            StatusType::Blessed => StackingBehavior::Refresh,
            StatusType::Cursed => StackingBehavior::Refresh,
            StatusType::Stunned => StackingBehavior::Refresh,
            StatusType::Frozen => StackingBehavior::Replace,
            StatusType::Shielded => StackingBehavior::Stack,
            StatusType::Hasted => StackingBehavior::Replace,
            StatusType::Slowed => StackingBehavior::Replace,
            StatusType::Invisible => StackingBehavior::Replace,
            StatusType::Vulnerable => StackingBehavior::Refresh,
        }
    }

    /// Calculate effect interaction (buff/debuff cancellation, etc.)
    pub fn calculate_interactions(effects: &[StatusEffect]) -> Vec<EffectInteraction> {
        let mut interactions = Vec::new();

        for (i, effect1) in effects.iter().enumerate() {
            for (j, effect2) in effects.iter().enumerate() {
                if i >= j {
                    continue;
                }

                if let Some(interaction) = Self::get_effect_interaction(effect1.effect_type, effect2.effect_type) {
                    interactions.push(EffectInteraction {
                        effect1_index: i,
                        effect2_index: j,
                        interaction_type: interaction,
                    });
                }
            }
        }

        interactions
    }

    /// Define interactions between different effect types
    fn get_effect_interaction(effect1: StatusType, effect2: StatusType) -> Option<InteractionType> {
        match (effect1, effect2) {
            (StatusType::Blessed, StatusType::Cursed) => Some(InteractionType::Cancel),
            (StatusType::Cursed, StatusType::Blessed) => Some(InteractionType::Cancel),
            (StatusType::Hasted, StatusType::Slowed) => Some(InteractionType::Cancel),
            (StatusType::Slowed, StatusType::Hasted) => Some(InteractionType::Cancel),
            (StatusType::Frozen, StatusType::Burning) => Some(InteractionType::Cancel),
            (StatusType::Burning, StatusType::Frozen) => Some(InteractionType::Cancel),
            (StatusType::Shielded, StatusType::Vulnerable) => Some(InteractionType::Reduce),
            (StatusType::Vulnerable, StatusType::Shielded) => Some(InteractionType::Reduce),
            (StatusType::Poisoned, StatusType::Regenerating) => Some(InteractionType::Compete),
            (StatusType::Regenerating, StatusType::Poisoned) => Some(InteractionType::Compete),
            _ => None,
        }
    }
}

/// Effect stacking behaviors
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StackingBehavior {
    Stack,    // Effects stack (increase potency)
    Refresh,  // Duration refreshes, keep strongest
    Replace,  // New effect replaces old one
    Ignore,   // New effect is ignored
}

/// Result of applying an effect
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EffectApplicationResult {
    Applied,
    Stacked,
    Refreshed,
    Replaced,
    Ignored,
    Immune,
    Resisted,
}

/// Effect events for logging and UI
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct EffectEvent {
    pub effect_type: StatusType,
    pub target: u64,
    pub value: u32,
    pub event_type: EffectEventType,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum EffectEventType {
    DamageDealt,
    HealingDone,
    StatModified,
    ActionBlocked,
    EffectApplied,
    EffectRemoved,
}

/// Effect interactions between different status types
#[derive(Clone, Debug)]
pub struct EffectInteraction {
    pub effect1_index: usize,
    pub effect2_index: usize,
    pub interaction_type: InteractionType,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InteractionType {
    Cancel,    // Effects cancel each other out
    Reduce,    // Effects reduce each other's potency
    Amplify,   // Effects amplify each other
    Compete,   // Effects compete (strongest wins)
}

/// Damage over time and healing over time processor
pub struct DOTProcessor;

impl DOTProcessor {
    /// Process damage over time effects
    pub fn process_dot(
        effect: &StatusEffect,
        health: &mut HealthComponent,
        current_time: i64,
    ) -> Option<u32> {
        if !Self::is_dot_effect(effect.effect_type) {
            return None;
        }

        let damage = Self::calculate_dot_damage(effect);
        health.take_damage(damage, current_time);
        Some(damage)
    }

    /// Process healing over time effects
    pub fn process_hot(
        effect: &StatusEffect,
        health: &mut HealthComponent,
    ) -> Option<u32> {
        if !Self::is_hot_effect(effect.effect_type) {
            return None;
        }

        let healing = Self::calculate_hot_healing(effect);
        health.heal(healing);
        Some(healing)
    }

    /// Check if effect is damage over time
    fn is_dot_effect(effect_type: StatusType) -> bool {
        matches!(effect_type, StatusType::Poisoned | StatusType::Burning)
    }

    /// Check if effect is healing over time
    fn is_hot_effect(effect_type: StatusType) -> bool {
        matches!(effect_type, StatusType::Regenerating)
    }

    /// Calculate DOT damage per tick
    fn calculate_dot_damage(effect: &StatusEffect) -> u32 {
        let base_damage = effect.strength;
        let stacks = effect.stacks;
        
        match effect.effect_type {
            StatusType::Poisoned => base_damage * stacks,
            StatusType::Burning => (base_damage * stacks * 3) / 2, // Burning does more damage
            _ => 0,
        }
    }

    /// Calculate HOT healing per tick
    fn calculate_hot_healing(effect: &StatusEffect) -> u32 {
        let base_healing = effect.strength;
        let stacks = effect.stacks;
        
        match effect.effect_type {
            StatusType::Regenerating => base_healing * stacks,
            _ => 0,
        }
    }
}

#[event]
pub struct EffectSystemExecuted {
    pub entities_processed: u32,
    pub effects_processed: u32,
    pub execution_time_ms: u32,
    pub timestamp: i64,
}

#[event]
pub struct EffectApplied {
    pub target: u64,
    pub effect_type: StatusType,
    pub strength: u32,
    pub duration: i64,
    pub source: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct EffectExpired {
    pub target: u64,
    pub effect_type: StatusType,
    pub timestamp: i64,
}