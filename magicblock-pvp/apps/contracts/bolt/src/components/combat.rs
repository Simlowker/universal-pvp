use bolt_lang::*;

/// Combat statistics component for tracking battle performance
#[component]
#[derive(Clone, Copy)]
pub struct CombatStats {
    pub damage_dealt: u32,
    pub damage_taken: u32,
    pub actions_taken: u32,
    pub critical_hits: u32,
    pub kills: u32,
    pub deaths: u32,
    pub assists: u32,
    pub match_mvp_count: u32,
}

impl Default for CombatStats {
    fn default() -> Self {
        Self {
            damage_dealt: 0,
            damage_taken: 0,
            actions_taken: 0,
            critical_hits: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
            match_mvp_count: 0,
        }
    }
}

/// Active effects component for buffs/debuffs
#[component]
#[derive(Clone, Copy)]
pub struct ActiveEffects {
    pub effects: [StatusEffect; 8], // Max 8 active effects
    pub effect_count: u8,
}

impl Default for ActiveEffects {
    fn default() -> Self {
        Self {
            effects: [StatusEffect::default(); 8],
            effect_count: 0,
        }
    }
}

impl ActiveEffects {
    pub fn add_effect(&mut self, effect: StatusEffect) -> bool {
        if (self.effect_count as usize) < self.effects.len() {
            self.effects[self.effect_count as usize] = effect;
            self.effect_count += 1;
            true
        } else {
            false // No space for new effect
        }
    }

    pub fn remove_effect(&mut self, effect_type: EffectType) -> bool {
        for i in 0..(self.effect_count as usize) {
            if self.effects[i].effect_type == effect_type {
                // Shift remaining effects down
                for j in i..(self.effect_count as usize - 1) {
                    self.effects[j] = self.effects[j + 1];
                }
                self.effects[(self.effect_count as usize) - 1] = StatusEffect::default();
                self.effect_count -= 1;
                return true;
            }
        }
        false
    }

    pub fn update_effects(&mut self, current_time: i64) {
        let mut active_effects = Vec::new();
        
        // Collect non-expired effects
        for i in 0..(self.effect_count as usize) {
            if self.effects[i].expires_at > current_time {
                active_effects.push(self.effects[i]);
            }
        }

        // Reset and repopulate
        self.effects = [StatusEffect::default(); 8];
        self.effect_count = 0;
        
        for effect in active_effects {
            if !self.add_effect(effect) {
                break; // Array full
            }
        }
    }

    pub fn has_effect(&self, effect_type: EffectType) -> bool {
        for i in 0..(self.effect_count as usize) {
            if self.effects[i].effect_type == effect_type {
                return true;
            }
        }
        false
    }

    pub fn get_effect_strength(&self, effect_type: EffectType) -> f32 {
        for i in 0..(self.effect_count as usize) {
            if self.effects[i].effect_type == effect_type {
                return self.effects[i].strength;
            }
        }
        0.0
    }
}

#[derive(Clone, Copy, Default)]
pub struct StatusEffect {
    pub effect_type: EffectType,
    pub strength: f32,      // Multiplier or flat bonus
    pub duration: i64,      // Duration in seconds
    pub expires_at: i64,    // Timestamp when effect expires
    pub caster: Pubkey,     // Who cast this effect
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum EffectType {
    None = 0,
    AttackBoost = 1,
    DefenseBoost = 2,
    SpeedBoost = 3,
    AttackDebuff = 4,
    DefenseDebuff = 5,
    SpeedDebuff = 6,
    Poison = 7,
    Burn = 8,
    Freeze = 9,
    Shield = 10,
    Regeneration = 11,
    ManaRegeneration = 12,
}

impl Default for EffectType {
    fn default() -> Self {
        EffectType::None
    }
}

/// Cooldown tracking component for abilities
#[component]
#[derive(Clone, Copy)]
pub struct AbilityCooldowns {
    pub basic_attack: i64,     // Last used timestamp
    pub special_ability: i64,  // Last used timestamp
    pub ultimate: i64,         // Last used timestamp
    pub defensive_stance: i64, // Last used timestamp
    pub heal: i64,            // Last used timestamp
    pub movement: i64,        // Last moved timestamp
}

impl Default for AbilityCooldowns {
    fn default() -> Self {
        Self {
            basic_attack: 0,
            special_ability: 0,
            ultimate: 0,
            defensive_stance: 0,
            heal: 0,
            movement: 0,
        }
    }
}

impl AbilityCooldowns {
    pub fn can_use_ability(&self, ability_type: AbilityType, current_time: i64) -> bool {
        let last_used = match ability_type {
            AbilityType::BasicAttack => self.basic_attack,
            AbilityType::SpecialAbility => self.special_ability,
            AbilityType::Ultimate => self.ultimate,
            AbilityType::DefensiveStance => self.defensive_stance,
            AbilityType::Heal => self.heal,
            AbilityType::Movement => self.movement,
        };

        let cooldown_duration = match ability_type {
            AbilityType::BasicAttack => 2,      // 2 seconds
            AbilityType::SpecialAbility => 10,  // 10 seconds
            AbilityType::Ultimate => 60,        // 60 seconds
            AbilityType::DefensiveStance => 15, // 15 seconds
            AbilityType::Heal => 20,           // 20 seconds
            AbilityType::Movement => 1,        // 1 second
        };

        current_time >= last_used + cooldown_duration
    }

    pub fn use_ability(&mut self, ability_type: AbilityType, current_time: i64) -> bool {
        if !self.can_use_ability(ability_type, current_time) {
            return false;
        }

        match ability_type {
            AbilityType::BasicAttack => self.basic_attack = current_time,
            AbilityType::SpecialAbility => self.special_ability = current_time,
            AbilityType::Ultimate => self.ultimate = current_time,
            AbilityType::DefensiveStance => self.defensive_stance = current_time,
            AbilityType::Heal => self.heal = current_time,
            AbilityType::Movement => self.movement = current_time,
        }

        true
    }

    pub fn get_remaining_cooldown(&self, ability_type: AbilityType, current_time: i64) -> i64 {
        let last_used = match ability_type {
            AbilityType::BasicAttack => self.basic_attack,
            AbilityType::SpecialAbility => self.special_ability,
            AbilityType::Ultimate => self.ultimate,
            AbilityType::DefensiveStance => self.defensive_stance,
            AbilityType::Heal => self.heal,
            AbilityType::Movement => self.movement,
        };

        let cooldown_duration = match ability_type {
            AbilityType::BasicAttack => 2,
            AbilityType::SpecialAbility => 10,
            AbilityType::Ultimate => 60,
            AbilityType::DefensiveStance => 15,
            AbilityType::Heal => 20,
            AbilityType::Movement => 1,
        };

        let elapsed = current_time - last_used;
        if elapsed >= cooldown_duration {
            0
        } else {
            cooldown_duration - elapsed
        }
    }
}

#[derive(Clone, Copy)]
pub enum AbilityType {
    BasicAttack,
    SpecialAbility,
    Ultimate,
    DefensiveStance,
    Heal,
    Movement,
}

/// Combat action result component for tracking outcomes
#[component]
#[derive(Clone, Copy)]
pub struct CombatResult {
    pub attacker: Pubkey,
    pub target: Pubkey,
    pub action_type: u8,
    pub damage_dealt: u32,
    pub healing_done: u32,
    pub critical_hit: bool,
    pub target_defeated: bool,
    pub experience_gained: u32,
    pub timestamp: i64,
    pub effects_applied: [EffectType; 4], // Up to 4 effects per action
    pub effect_count: u8,
}

impl Default for CombatResult {
    fn default() -> Self {
        Self {
            attacker: Pubkey::default(),
            target: Pubkey::default(),
            action_type: 0,
            damage_dealt: 0,
            healing_done: 0,
            critical_hit: false,
            target_defeated: false,
            experience_gained: 0,
            timestamp: 0,
            effects_applied: [EffectType::None; 4],
            effect_count: 0,
        }
    }
}