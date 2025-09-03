use anchor_lang::prelude::*;
use crate::error::GameError;

pub fn calculate_damage(
    attacker_attack: u32,
    defender_defense: u32,
    action_power: u32,
    critical_hit: bool,
) -> Result<u32> {
    let base_damage = attacker_attack
        .checked_add(action_power)
        .ok_or(GameError::ArithmeticOverflow)?;
    
    let defense_reduction = defender_defense / 2;
    let net_damage = base_damage.saturating_sub(defense_reduction);
    
    let final_damage = if critical_hit {
        net_damage.checked_mul(2).ok_or(GameError::ArithmeticOverflow)?
    } else {
        net_damage
    };
    
    Ok(final_damage.max(1)) // Minimum 1 damage
}

pub fn calculate_critical_chance(attacker_speed: u32, defender_speed: u32) -> bool {
    let speed_diff = attacker_speed.saturating_sub(defender_speed);
    let crit_chance = (speed_diff / 10).min(25); // Max 25% crit chance
    
    // Simple pseudo-random based on clock
    let seed = Clock::get().unwrap().unix_timestamp as u32;
    (seed % 100) < crit_chance
}

pub fn validate_turn_order(current_turn: u8, total_players: u8) -> Result<u8> {
    if total_players == 0 {
        return Err(GameError::InvalidMatchConfig.into());
    }
    Ok((current_turn + 1) % total_players)
}

pub fn calculate_experience_gain(damage_dealt: u32, victory: bool) -> u32 {
    let base_exp = damage_dealt / 10;
    if victory {
        base_exp.checked_mul(3).unwrap_or(base_exp)
    } else {
        base_exp
    }
}

pub fn validate_entry_fee(provided: u64, required: u64) -> Result<()> {
    if provided < required {
        return Err(GameError::InsufficientFunds.into());
    }
    Ok(())
}

pub fn calculate_reward_share(total_pool: u64, percentage: u8) -> Result<u64> {
    if percentage > 100 {
        return Err(GameError::InvalidRewardDistribution.into());
    }
    
    let share = (total_pool as u128)
        .checked_mul(percentage as u128)
        .ok_or(GameError::ArithmeticOverflow)?
        .checked_div(100)
        .ok_or(GameError::ArithmeticOverflow)?;
    
    Ok(share as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_damage_calculation() {
        let damage = calculate_damage(100, 50, 20, false).unwrap();
        assert!(damage > 0);
        
        let crit_damage = calculate_damage(100, 50, 20, true).unwrap();
        assert!(crit_damage > damage);
    }
    
    #[test]
    fn test_reward_calculation() {
        let total = 1000;
        let share = calculate_reward_share(total, 50).unwrap();
        assert_eq!(share, 500);
    }
    
    #[test]
    fn test_turn_validation() {
        let next_turn = validate_turn_order(0, 4).unwrap();
        assert_eq!(next_turn, 1);
        
        let wrap_turn = validate_turn_order(3, 4).unwrap();
        assert_eq!(wrap_turn, 0);
    }
}