use bolt_lang::*;
use crate::components::*;

pub mod execute_action {
    use super::*;

    pub fn handler(
        ctx: Context<ExecuteCombatAction>,
        action_type: u8,
        target_entity: Pubkey,
        power: u32,
    ) -> Result<()> {
        let clock = Clock::get()?;
        
        // Validate attacker is alive and can act
        let attacker_health = &ctx.accounts.attacker_health;
        if !attacker_health.is_alive {
            return Err(crate::GameError::PlayerAlreadyDead.into());
        }

        // Check ability cooldowns
        let cooldowns = &mut ctx.accounts.attacker_cooldowns;
        let ability_type = match action_type {
            0 => AbilityType::BasicAttack,
            1 => AbilityType::SpecialAbility,
            2 => AbilityType::DefensiveStance,
            3 => AbilityType::Heal,
            4 => AbilityType::Ultimate,
            _ => return Err(crate::GameError::InvalidCombatAction.into()),
        };

        if !cooldowns.can_use_ability(ability_type, clock.unix_timestamp) {
            return Err(crate::GameError::InvalidCombatAction.into());
        }

        // Execute action based on type
        let result = match action_type {
            0 => execute_basic_attack(ctx, target_entity, power)?,
            1 => execute_special_ability(ctx, target_entity, power)?,
            2 => execute_defensive_stance(ctx, power)?,
            3 => execute_heal_action(ctx, target_entity, power)?,
            4 => execute_ultimate_ability(ctx, target_entity, power)?,
            _ => return Err(crate::GameError::InvalidCombatAction.into()),
        };

        // Update cooldowns
        cooldowns.use_ability(ability_type, clock.unix_timestamp);

        // Update combat analytics
        let match_analytics = &mut ctx.accounts.match_analytics;
        match_analytics.record_action(
            result.damage_dealt,
            result.healing_done,
            result.critical_hit,
        );

        // Record combat result
        ctx.accounts.combat_result.set_inner(result);

        Ok(())
    }

    fn execute_basic_attack(
        ctx: Context<ExecuteCombatAction>,
        target_entity: Pubkey,
        power: u32,
    ) -> Result<CombatResult> {
        let attacker_stats = &ctx.accounts.attacker_stats;
        let attacker_equipment = &ctx.accounts.attacker_equipment;
        let target_health = &mut ctx.accounts.target_health;
        let target_stats = &ctx.accounts.target_stats;
        let clock = Clock::get()?;

        // Calculate effective stats with equipment bonuses
        let effective_attack = attacker_stats.attack + attacker_equipment.equipment_bonus.attack;
        let effective_defense = target_stats.defense;

        // Calculate damage with critical chance
        let critical_hit = calculate_critical_chance(
            attacker_stats.speed + attacker_equipment.equipment_bonus.speed,
            target_stats.speed,
        );

        let mut damage = calculate_base_damage(effective_attack, effective_defense, power);
        
        if critical_hit {
            damage = (damage as f32 * 1.5) as u32; // 50% critical bonus
        }

        // Apply damage
        let target_defeated = target_health.take_damage(damage, clock.unix_timestamp);

        // Calculate experience based on damage dealt
        let experience_gained = (damage / 5).max(1); // Min 1 exp per action

        Ok(CombatResult {
            attacker: ctx.accounts.attacker.key(),
            target: target_entity,
            action_type: 0,
            damage_dealt: damage,
            healing_done: 0,
            critical_hit,
            target_defeated,
            experience_gained,
            timestamp: clock.unix_timestamp,
            effects_applied: [EffectType::None; 4],
            effect_count: 0,
        })
    }

    fn execute_special_ability(
        ctx: Context<ExecuteCombatAction>,
        target_entity: Pubkey,
        power: u32,
    ) -> Result<CombatResult> {
        let attacker_stats = &ctx.accounts.attacker_stats;
        let attacker_profile = &ctx.accounts.attacker_profile;
        let attacker_health = &mut ctx.accounts.attacker_health;
        let target_health = &mut ctx.accounts.target_health;
        let target_effects = &mut ctx.accounts.target_effects;
        let clock = Clock::get()?;

        // Mana cost for special ability
        let mana_cost = 25;
        if !attacker_health.use_mana(mana_cost) {
            return Err(crate::GameError::InsufficientMana.into());
        }

        // Class-specific special abilities
        let (damage, effect) = match attacker_profile.player_class {
            0 => { // Warrior - Berserker Strike
                let damage = calculate_base_damage(
                    attacker_stats.attack * 2, // Double attack damage
                    ctx.accounts.target_stats.defense,
                    power,
                );
                (damage, Some(StatusEffect {
                    effect_type: EffectType::AttackBoost,
                    strength: 1.2,
                    duration: 10,
                    expires_at: clock.unix_timestamp + 10,
                    caster: ctx.accounts.attacker.key(),
                }))
            },
            1 => { // Mage - Fireball
                let damage = calculate_base_damage(
                    attacker_stats.attack + attacker_stats.mana / 4,
                    ctx.accounts.target_stats.defense / 2, // Magic bypasses some defense
                    power,
                );
                (damage, Some(StatusEffect {
                    effect_type: EffectType::Burn,
                    strength: 10.0, // 10 damage per turn
                    duration: 15,
                    expires_at: clock.unix_timestamp + 15,
                    caster: ctx.accounts.attacker.key(),
                }))
            },
            2 => { // Archer - Piercing Shot
                let damage = calculate_base_damage(
                    attacker_stats.attack + attacker_stats.speed / 2,
                    0, // Piercing ignores defense
                    power,
                );
                (damage, Some(StatusEffect {
                    effect_type: EffectType::SpeedDebuff,
                    strength: 0.7, // 30% speed reduction
                    duration: 12,
                    expires_at: clock.unix_timestamp + 12,
                    caster: ctx.accounts.attacker.key(),
                }))
            },
            3 => { // Rogue - Poison Strike
                let damage = calculate_base_damage(
                    attacker_stats.attack,
                    ctx.accounts.target_stats.defense,
                    power,
                ) + 20; // Bonus poison damage
                (damage, Some(StatusEffect {
                    effect_type: EffectType::Poison,
                    strength: 15.0, // 15 damage per turn
                    duration: 20,
                    expires_at: clock.unix_timestamp + 20,
                    caster: ctx.accounts.attacker.key(),
                }))
            },
            _ => (0, None),
        };

        // Apply damage
        let target_defeated = target_health.take_damage(damage, clock.unix_timestamp);

        // Apply status effect
        let mut effect_count = 0;
        let mut effects_applied = [EffectType::None; 4];
        if let Some(status_effect) = effect {
            if target_effects.add_effect(status_effect) {
                effects_applied[0] = status_effect.effect_type;
                effect_count = 1;
            }
        }

        let experience_gained = (damage / 3).max(5); // Better exp for special abilities

        Ok(CombatResult {
            attacker: ctx.accounts.attacker.key(),
            target: target_entity,
            action_type: 1,
            damage_dealt: damage,
            healing_done: 0,
            critical_hit: false, // Special abilities don't crit
            target_defeated,
            experience_gained,
            timestamp: clock.unix_timestamp,
            effects_applied,
            effect_count,
        })
    }

    fn execute_defensive_stance(
        ctx: Context<ExecuteCombatAction>,
        _power: u32,
    ) -> Result<CombatResult> {
        let attacker_health = &mut ctx.accounts.attacker_health;
        let attacker_effects = &mut ctx.accounts.attacker_effects;
        let clock = Clock::get()?;

        // Restore mana and add defensive buff
        attacker_health.restore_mana(20);
        
        let defensive_effect = StatusEffect {
            effect_type: EffectType::DefenseBoost,
            strength: 1.5, // 50% defense boost
            duration: 15,
            expires_at: clock.unix_timestamp + 15,
            caster: ctx.accounts.attacker.key(),
        };

        let mut effects_applied = [EffectType::None; 4];
        let mut effect_count = 0;
        
        if attacker_effects.add_effect(defensive_effect) {
            effects_applied[0] = EffectType::DefenseBoost;
            effect_count = 1;
        }

        Ok(CombatResult {
            attacker: ctx.accounts.attacker.key(),
            target: ctx.accounts.attacker.key(),
            action_type: 2,
            damage_dealt: 0,
            healing_done: 0,
            critical_hit: false,
            target_defeated: false,
            experience_gained: 3, // Small exp for defensive play
            timestamp: clock.unix_timestamp,
            effects_applied,
            effect_count,
        })
    }

    fn execute_heal_action(
        ctx: Context<ExecuteCombatAction>,
        target_entity: Pubkey,
        power: u32,
    ) -> Result<CombatResult> {
        let attacker_health = &mut ctx.accounts.attacker_health;
        let target_health = if target_entity == ctx.accounts.attacker.key() {
            &mut ctx.accounts.attacker_health
        } else {
            &mut ctx.accounts.target_health
        };
        let clock = Clock::get()?;

        // Mana cost for heal
        let mana_cost = 20;
        if !attacker_health.use_mana(mana_cost) {
            return Err(crate::GameError::InsufficientMana.into());
        }

        // Calculate heal amount based on attacker's stats and power
        let heal_amount = (power + ctx.accounts.attacker_stats.mana / 8).min(50); // Max 50 HP heal
        
        target_health.heal(heal_amount, clock.unix_timestamp);

        Ok(CombatResult {
            attacker: ctx.accounts.attacker.key(),
            target: target_entity,
            action_type: 3,
            damage_dealt: 0,
            healing_done: heal_amount,
            critical_hit: false,
            target_defeated: false,
            experience_gained: (heal_amount / 5).max(2), // Exp for support
            timestamp: clock.unix_timestamp,
            effects_applied: [EffectType::None; 4],
            effect_count: 0,
        })
    }

    fn execute_ultimate_ability(
        ctx: Context<ExecuteCombatAction>,
        target_entity: Pubkey,
        power: u32,
    ) -> Result<CombatResult> {
        let attacker_stats = &ctx.accounts.attacker_stats;
        let attacker_profile = &ctx.accounts.attacker_profile;
        let attacker_health = &mut ctx.accounts.attacker_health;
        let target_health = &mut ctx.accounts.target_health;
        let clock = Clock::get()?;

        // Ultimate abilities cost significant mana
        let mana_cost = 50;
        if !attacker_health.use_mana(mana_cost) {
            return Err(crate::GameError::InsufficientMana.into());
        }

        // Class-specific ultimate abilities with massive damage
        let damage = match attacker_profile.player_class {
            0 => { // Warrior - Devastating Blow
                calculate_base_damage(
                    attacker_stats.attack * 3, // Triple damage
                    ctx.accounts.target_stats.defense,
                    power * 2,
                )
            },
            1 => { // Mage - Meteor
                calculate_base_damage(
                    attacker_stats.attack + attacker_stats.mana / 2,
                    0, // Ignores defense completely
                    power * 2,
                )
            },
            2 => { // Archer - Rain of Arrows
                calculate_base_damage(
                    attacker_stats.attack + attacker_stats.speed,
                    ctx.accounts.target_stats.defense / 3, // Mostly bypasses defense
                    power * 2,
                )
            },
            3 => { // Rogue - Assassinate
                let crit_damage = calculate_base_damage(
                    attacker_stats.attack * 4, // Massive crit multiplier
                    ctx.accounts.target_stats.defense / 2,
                    power * 2,
                );
                crit_damage
            },
            _ => 0,
        };

        // Apply damage
        let target_defeated = target_health.take_damage(damage, clock.unix_timestamp);

        let experience_gained = (damage / 2).max(20); // Significant exp for ultimates

        Ok(CombatResult {
            attacker: ctx.accounts.attacker.key(),
            target: target_entity,
            action_type: 4,
            damage_dealt: damage,
            healing_done: 0,
            critical_hit: true, // Ultimates are always "critical"
            target_defeated,
            experience_gained,
            timestamp: clock.unix_timestamp,
            effects_applied: [EffectType::None; 4],
            effect_count: 0,
        })
    }

    fn calculate_critical_chance(attacker_speed: u32, target_speed: u32) -> bool {
        let speed_diff = attacker_speed.saturating_sub(target_speed) as f32;
        let crit_chance = (speed_diff / 100.0).min(0.4); // Max 40% crit chance
        
        // Simple RNG using clock (not cryptographically secure, but good enough for games)
        let rng_seed = Clock::get().unwrap().unix_timestamp as u32;
        let random_value = (rng_seed.wrapping_mul(1103515245).wrapping_add(12345) >> 16) as f32 / u16::MAX as f32;
        
        random_value < crit_chance
    }

    fn calculate_base_damage(attack: u32, defense: u32, power: u32) -> u32 {
        let base_damage = attack + power;
        let effective_defense = defense.min(base_damage * 3 / 4); // Defense can't reduce damage by more than 75%
        base_damage.saturating_sub(effective_defense).max(1) // Minimum 1 damage
    }
}

pub mod process_effects {
    use super::*;

    pub fn handler(ctx: Context<ProcessEffects>) -> Result<()> {
        let player_health = &mut ctx.accounts.player_health;
        let active_effects = &mut ctx.accounts.active_effects;
        let clock = Clock::get()?;

        // Update effects (remove expired ones)
        active_effects.update_effects(clock.unix_timestamp);

        // Process damage/healing effects
        let mut total_dot_damage = 0u32;
        let mut total_hot_healing = 0u32;

        for i in 0..(active_effects.effect_count as usize) {
            let effect = active_effects.effects[i];
            
            match effect.effect_type {
                EffectType::Poison | EffectType::Burn => {
                    total_dot_damage += effect.strength as u32;
                }
                EffectType::Regeneration => {
                    total_hot_healing += effect.strength as u32;
                }
                _ => {} // Other effects are passive
            }
        }

        // Apply damage over time
        if total_dot_damage > 0 {
            player_health.take_damage(total_dot_damage, clock.unix_timestamp);
        }

        // Apply healing over time
        if total_hot_healing > 0 {
            player_health.heal(total_hot_healing, clock.unix_timestamp);
        }

        Ok(())
    }
}

// Context definitions
#[derive(Accounts)]
pub struct ExecuteCombatAction<'info> {
    #[account(mut)]
    pub attacker: Signer<'info>,
    
    #[account(mut)]
    pub attacker_profile: Account<'info, PlayerProfile>,
    
    #[account(mut)]
    pub attacker_stats: Account<'info, PlayerStats>,
    
    #[account(mut)]
    pub attacker_health: Account<'info, PlayerHealth>,
    
    #[account(mut)]
    pub attacker_equipment: Account<'info, PlayerEquipment>,
    
    #[account(mut)]
    pub attacker_effects: Account<'info, ActiveEffects>,
    
    #[account(mut)]
    pub attacker_cooldowns: Account<'info, AbilityCooldowns>,
    
    #[account(mut)]
    pub target_stats: Account<'info, PlayerStats>,
    
    #[account(mut)]
    pub target_health: Account<'info, PlayerHealth>,
    
    #[account(mut)]
    pub target_effects: Account<'info, ActiveEffects>,
    
    #[account(
        init,
        payer = attacker,
        space = 8 + std::mem::size_of::<CombatResult>(),
    )]
    pub combat_result: Account<'info, CombatResult>,
    
    #[account(mut)]
    pub match_analytics: Account<'info, MatchAnalytics>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProcessEffects<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(mut)]
    pub player_health: Account<'info, PlayerHealth>,
    
    #[account(mut)]
    pub active_effects: Account<'info, ActiveEffects>,
}