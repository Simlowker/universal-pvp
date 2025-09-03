use bolt_lang::*;
use crate::components::*;

pub mod create_player {
    use super::*;

    pub fn handler(
        ctx: Context<CreatePlayer>,
        username: String,
        player_class: u8,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let mut username_bytes = [0u8; 32];
        let username_len = username.len().min(31); // Reserve 1 byte for null terminator
        username_bytes[..username_len].copy_from_slice(&username.as_bytes()[..username_len]);

        // Validate player class
        if player_class > 3 {
            return Err(crate::GameError::InvalidCombatAction.into());
        }

        // Initialize player profile component
        let mut player_profile = PlayerProfile {
            owner: ctx.accounts.player.key(),
            username: username_bytes,
            player_class,
            level: 1,
            experience: 0,
            total_matches: 0,
            wins: 0,
            losses: 0,
            created_at: clock.unix_timestamp,
            last_match_at: 0,
            is_active: true,
        };

        // Add to world as component
        ctx.accounts.player_profile.set_inner(player_profile);

        // Initialize base stats component
        let base_stats = PlayerStats::for_class(player_class);
        ctx.accounts.player_stats.set_inner(base_stats);

        // Initialize health component
        let player_health = PlayerHealth::new(&base_stats);
        ctx.accounts.player_health.set_inner(player_health);

        // Initialize combat stats component
        let combat_stats = CombatStats::default();
        ctx.accounts.combat_stats.set_inner(combat_stats);

        // Initialize position component
        let position = PlayerPosition::default();
        ctx.accounts.player_position.set_inner(position);

        // Initialize equipment component
        let equipment = PlayerEquipment::default();
        ctx.accounts.player_equipment.set_inner(equipment);

        // Initialize active effects component
        let active_effects = ActiveEffects::default();
        ctx.accounts.active_effects.set_inner(active_effects);

        // Initialize cooldowns component
        let cooldowns = AbilityCooldowns::default();
        ctx.accounts.ability_cooldowns.set_inner(cooldowns);

        msg!(
            "Player {} created with class {} and base stats: HP={}, ATK={}, DEF={}, SPD={}, MANA={}",
            username,
            player_class,
            base_stats.health,
            base_stats.attack,
            base_stats.defense,
            base_stats.speed,
            base_stats.mana
        );

        Ok(())
    }
}

pub mod update_player_stats {
    use super::*;

    pub fn handler(
        ctx: Context<UpdatePlayerStats>,
        experience_gained: u32,
        damage_dealt: u32,
        damage_taken: u32,
    ) -> Result<()> {
        let player_profile = &mut ctx.accounts.player_profile;
        let combat_stats = &mut ctx.accounts.combat_stats;
        let clock = Clock::get()?;

        // Update experience with overflow protection
        player_profile.experience = player_profile.experience
            .checked_add(experience_gained as u64)
            .ok_or(crate::GameError::ArithmeticOverflow)?;

        // Calculate new level
        let old_level = player_profile.level;
        player_profile.level = calculate_level(player_profile.experience);
        
        // Update combat statistics
        combat_stats.damage_dealt = combat_stats.damage_dealt
            .checked_add(damage_dealt)
            .ok_or(crate::GameError::ArithmeticOverflow)?;
        
        combat_stats.damage_taken = combat_stats.damage_taken
            .checked_add(damage_taken)
            .ok_or(crate::GameError::ArithmeticOverflow)?;

        // If player leveled up, update base stats
        if player_profile.level > old_level {
            let base_stats = &mut ctx.accounts.player_stats;
            let level_multiplier = 1.0 + ((player_profile.level - 1) as f64) * 0.1;
            
            let original_stats = PlayerStats::for_class(player_profile.player_class);
            base_stats.health = (original_stats.health as f64 * level_multiplier) as u32;
            base_stats.attack = (original_stats.attack as f64 * level_multiplier) as u32;
            base_stats.defense = (original_stats.defense as f64 * level_multiplier) as u32;
            base_stats.speed = (original_stats.speed as f64 * level_multiplier) as u32;
            base_stats.mana = (original_stats.mana as f64 * level_multiplier) as u32;

            // Update max health and mana
            let player_health = &mut ctx.accounts.player_health;
            player_health.max_health = base_stats.health;
            player_health.max_mana = base_stats.mana;
            
            // Heal player on level up
            player_health.current_health = base_stats.health;
            player_health.current_mana = base_stats.mana;

            msg!(
                "Player leveled up! {} -> {} (EXP: {})",
                old_level,
                player_profile.level,
                player_profile.experience
            );
        }

        player_profile.last_match_at = clock.unix_timestamp;

        Ok(())
    }

    fn calculate_level(experience: u64) -> u32 {
        // Level formula: sqrt(experience / 1000) + 1
        ((experience / 1000) as f64).sqrt() as u32 + 1
    }
}

pub mod heal_player {
    use super::*;

    pub fn handler(
        ctx: Context<HealPlayer>,
        heal_amount: u32,
    ) -> Result<()> {
        let player_health = &mut ctx.accounts.player_health;
        let clock = Clock::get()?;

        if !player_health.is_alive {
            return Err(crate::GameError::PlayerAlreadyDead.into());
        }

        player_health.heal(heal_amount, clock.unix_timestamp);

        msg!(
            "Player healed for {} HP. Current: {}/{}",
            heal_amount,
            player_health.current_health,
            player_health.max_health
        );

        Ok(())
    }
}

pub mod equip_item {
    use super::*;

    pub fn handler(
        ctx: Context<EquipItem>,
        item_type: u8, // 0=weapon, 1=armor, 2=accessory
        item_pubkey: Pubkey,
        stat_bonuses: PlayerStats,
    ) -> Result<()> {
        let equipment = &mut ctx.accounts.player_equipment;

        match item_type {
            0 => {
                // Unequip previous weapon if exists
                if equipment.weapon.is_some() {
                    // Remove previous weapon bonuses
                    subtract_equipment_bonuses(&mut equipment.equipment_bonus, &equipment.equipment_bonus);
                }
                equipment.weapon = Some(item_pubkey);
            }
            1 => {
                if equipment.armor.is_some() {
                    subtract_equipment_bonuses(&mut equipment.equipment_bonus, &equipment.equipment_bonus);
                }
                equipment.armor = Some(item_pubkey);
            }
            2 => {
                if equipment.accessory.is_some() {
                    subtract_equipment_bonuses(&mut equipment.equipment_bonus, &equipment.equipment_bonus);
                }
                equipment.accessory = Some(item_pubkey);
            }
            _ => return Err(crate::GameError::InvalidCombatAction.into()),
        }

        // Add new item bonuses
        add_equipment_bonuses(&mut equipment.equipment_bonus, &stat_bonuses);

        msg!(
            "Item equipped! Type: {}, Bonuses: +{} HP, +{} ATK, +{} DEF, +{} SPD, +{} MANA",
            item_type,
            stat_bonuses.health,
            stat_bonuses.attack,
            stat_bonuses.defense,
            stat_bonuses.speed,
            stat_bonuses.mana
        );

        Ok(())
    }

    fn add_equipment_bonuses(total_bonus: &mut PlayerStats, new_bonus: &PlayerStats) {
        total_bonus.health = total_bonus.health.saturating_add(new_bonus.health);
        total_bonus.attack = total_bonus.attack.saturating_add(new_bonus.attack);
        total_bonus.defense = total_bonus.defense.saturating_add(new_bonus.defense);
        total_bonus.speed = total_bonus.speed.saturating_add(new_bonus.speed);
        total_bonus.mana = total_bonus.mana.saturating_add(new_bonus.mana);
    }

    fn subtract_equipment_bonuses(total_bonus: &mut PlayerStats, old_bonus: &PlayerStats) {
        total_bonus.health = total_bonus.health.saturating_sub(old_bonus.health);
        total_bonus.attack = total_bonus.attack.saturating_sub(old_bonus.attack);
        total_bonus.defense = total_bonus.defense.saturating_sub(old_bonus.defense);
        total_bonus.speed = total_bonus.speed.saturating_sub(old_bonus.speed);
        total_bonus.mana = total_bonus.mana.saturating_sub(old_bonus.mana);
    }
}

// Context definitions for BOLT ECS
#[derive(Accounts)]
pub struct CreatePlayer<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<PlayerProfile>(),
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    
    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<PlayerStats>(),
    )]
    pub player_stats: Account<'info, PlayerStats>,
    
    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<PlayerHealth>(),
    )]
    pub player_health: Account<'info, PlayerHealth>,
    
    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<CombatStats>(),
    )]
    pub combat_stats: Account<'info, CombatStats>,
    
    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<PlayerPosition>(),
    )]
    pub player_position: Account<'info, PlayerPosition>,
    
    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<PlayerEquipment>(),
    )]
    pub player_equipment: Account<'info, PlayerEquipment>,
    
    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<ActiveEffects>(),
    )]
    pub active_effects: Account<'info, ActiveEffects>,
    
    #[account(
        init,
        payer = player,
        space = 8 + std::mem::size_of::<AbilityCooldowns>(),
    )]
    pub ability_cooldowns: Account<'info, AbilityCooldowns>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePlayerStats<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(mut)]
    pub player_profile: Account<'info, PlayerProfile>,
    
    #[account(mut)]
    pub player_stats: Account<'info, PlayerStats>,
    
    #[account(mut)]
    pub player_health: Account<'info, PlayerHealth>,
    
    #[account(mut)]
    pub combat_stats: Account<'info, CombatStats>,
}

#[derive(Accounts)]
pub struct HealPlayer<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(mut)]
    pub player_health: Account<'info, PlayerHealth>,
}

#[derive(Accounts)]
pub struct EquipItem<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(mut)]
    pub player_equipment: Account<'info, PlayerEquipment>,
    
    /// CHECK: NFT token account validation handled in instruction
    pub item_token_account: UncheckedAccount<'info>,
}