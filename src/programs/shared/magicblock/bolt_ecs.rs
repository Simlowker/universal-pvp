use anchor_lang::prelude::*;
use bolt_lang::*;

/// Core game state components for BOLT ECS
#[component]
#[derive(Default)]
pub struct Position {
    pub x: i32,
    pub y: i32,
    pub z: i32,
}

#[component]
#[derive(Default)]
pub struct Health {
    pub current: u32,
    pub max: u32,
    pub regeneration_rate: u32,
}

#[component]
#[derive(Default)]
pub struct Mana {
    pub current: u32,
    pub max: u32,
    pub regeneration_rate: u32,
}

#[component]
#[derive(Default)]
pub struct PlayerStats {
    pub attack: u32,
    pub defense: u32,
    pub speed: u32,
    pub level: u32,
    pub experience: u64,
}

#[component]
#[derive(Default)]
pub struct MatchState {
    pub match_id: u64,
    pub current_turn: u8,
    pub turn_deadline: i64,
    pub state: u8, // GameState enum as u8
    pub players_count: u8,
    pub winner: Option<Pubkey>,
}

#[component]
#[derive(Default)]
pub struct PlayerInMatch {
    pub player_id: Pubkey,
    pub match_id: u64,
    pub is_alive: bool,
    pub actions_taken: u32,
    pub damage_dealt: u32,
    pub damage_taken: u32,
    pub joined_at: i64,
}

#[component]
#[derive(Default)]
pub struct Combat {
    pub is_in_combat: bool,
    pub last_action: i64,
    pub action_cooldown: i64,
    pub target: Option<Pubkey>,
}

#[component]
#[derive(Default)]
pub struct Equipment {
    pub main_hand: Option<Pubkey>,
    pub off_hand: Option<Pubkey>,
    pub head: Option<Pubkey>,
    pub chest: Option<Pubkey>,
    pub legs: Option<Pubkey>,
    pub feet: Option<Pubkey>,
    pub ring: Option<Pubkey>,
    pub necklace: Option<Pubkey>,
}

#[component]
#[derive(Default)]
pub struct ItemBonus {
    pub attack_bonus: u32,
    pub defense_bonus: u32,
    pub health_bonus: u32,
    pub speed_bonus: u32,
    pub mana_bonus: u32,
    pub special_effect: u8,
}

/// Systems for BOLT ECS
#[system]
pub mod health_system {
    use super::*;

    pub fn regenerate_health(
        ctx: Context<Components>,
        _args: u8,
    ) -> Result<Components> {
        let position = Position::from_account_info(&ctx.accounts.position)?;
        let mut health = Health::from_account_info_mut(&ctx.accounts.health)?;

        // Regenerate health over time
        let current_time = Clock::get()?.unix_timestamp;
        let time_delta = current_time; // Simplified - should track last update
        
        if health.current < health.max {
            let regen_amount = health.regeneration_rate * (time_delta as u32 / 60); // per minute
            health.current = (health.current + regen_amount).min(health.max);
        }

        health.exit(ctx.program_id)?;

        Ok(ctx.accounts)
    }
}

#[system]
pub mod mana_system {
    use super::*;

    pub fn regenerate_mana(
        ctx: Context<Components>,
        _args: u8,
    ) -> Result<Components> {
        let mut mana = Mana::from_account_info_mut(&ctx.accounts.mana)?;

        // Regenerate mana over time
        let current_time = Clock::get()?.unix_timestamp;
        let time_delta = current_time; // Simplified - should track last update
        
        if mana.current < mana.max {
            let regen_amount = mana.regeneration_rate * (time_delta as u32 / 60); // per minute
            mana.current = (mana.current + regen_amount).min(mana.max);
        }

        mana.exit(ctx.program_id)?;

        Ok(ctx.accounts)
    }
}

#[system]
pub mod combat_system {
    use super::*;

    pub fn execute_attack(
        ctx: Context<Components>,
        damage: u32,
    ) -> Result<Components> {
        let mut attacker_combat = Combat::from_account_info_mut(&ctx.accounts.attacker_combat)?;
        let mut target_health = Health::from_account_info_mut(&ctx.accounts.target_health)?;
        let attacker_stats = PlayerStats::from_account_info(&ctx.accounts.attacker_stats)?;

        // Check if attacker can act
        let current_time = Clock::get()?.unix_timestamp;
        if attacker_combat.last_action + attacker_combat.action_cooldown > current_time {
            return Err(crate::shared::GameError::CooldownNotMet.into());
        }

        // Calculate damage with stats
        let final_damage = damage + attacker_stats.attack;
        target_health.current = target_health.current.saturating_sub(final_damage);

        // Update combat state
        attacker_combat.last_action = current_time;
        attacker_combat.action_cooldown = 3; // 3 second cooldown

        attacker_combat.exit(ctx.program_id)?;
        target_health.exit(ctx.program_id)?;

        Ok(ctx.accounts)
    }
}

#[derive(Accounts)]
pub struct Components<'info> {
    pub position: AccountInfo<'info>,
    pub health: AccountInfo<'info>,
    pub mana: AccountInfo<'info>,
    pub player_stats: AccountInfo<'info>,
    pub match_state: AccountInfo<'info>,
    pub player_in_match: AccountInfo<'info>,
    pub combat: AccountInfo<'info>,
    pub equipment: AccountInfo<'info>,
    pub attacker_combat: AccountInfo<'info>,
    pub target_health: AccountInfo<'info>,
    pub attacker_stats: AccountInfo<'info>,
}