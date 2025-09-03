use anchor_lang::prelude::*;
use crate::state::{Match, PlayerProfile, CombatResult};
use crate::shared::{
    CombatAction, ActionType, GameState, GameError,
    calculate_damage, calculate_critical_chance, calculate_experience_gain
};

pub fn handler(ctx: Context<crate::ExecuteAction>, action: CombatAction) -> Result<()> {
    let match_account = &mut ctx.accounts.match_account;
    let player_profile = &mut ctx.accounts.player_profile;
    let clock = Clock::get()?;
    
    // Validate match state
    if match_account.state != GameState::InProgress {
        return Err(GameError::InvalidGameState.into());
    }
    
    // Check if it's player's turn
    if !match_account.is_player_turn(&ctx.accounts.player.key()) {
        return Err(GameError::NotPlayerTurn.into());
    }
    
    // Check turn timeout
    if clock.unix_timestamp > match_account.turn_deadline {
        return Err(GameError::CooldownNotMet.into());
    }
    
    // Get current player
    let current_player = match_account.get_player_mut(&ctx.accounts.player.key())
        .ok_or(GameError::PlayerNotFound)?;
    
    if !current_player.can_act() {
        return Err(GameError::InvalidMove.into());
    }
    
    // Validate action
    if action.mana_cost > current_player.current_mana {
        return Err(GameError::InvalidCombatParams.into());
    }
    
    // Execute action based on type
    let combat_result = match action.action_type {
        ActionType::BasicAttack => {
            execute_basic_attack(match_account, &ctx.accounts.player.key(), &action)?
        }
        ActionType::SpecialAbility => {
            execute_special_ability(match_account, &ctx.accounts.player.key(), &action)?
        }
        ActionType::DefensiveStance => {
            execute_defensive_stance(match_account, &ctx.accounts.player.key(), &action)?
        }
        ActionType::Heal => {
            execute_heal(match_account, &ctx.accounts.player.key(), &action)?
        }
    };
    
    // SECURITY: Update player stats with checked arithmetic to prevent overflow
    let acting_player = match_account.get_player_mut(&ctx.accounts.player.key()).unwrap();
    acting_player.use_mana(action.mana_cost);
    acting_player.actions_taken = acting_player.actions_taken
        .checked_add(1)
        .ok_or(GameError::ArithmeticOverflow)?;
    acting_player.damage_dealt = acting_player.damage_dealt
        .checked_add(combat_result.damage_dealt)
        .ok_or(GameError::ArithmeticOverflow)?;
    
    // SECURITY: Update player profile experience with checked arithmetic
    player_profile.experience = player_profile.experience
        .checked_add(combat_result.experience_gained as u64)
        .ok_or(GameError::ArithmeticOverflow)?;
    player_profile.level = player_profile.calculate_level();
    player_profile.total_damage_dealt = player_profile.total_damage_dealt
        .checked_add(combat_result.damage_dealt as u64)
        .ok_or(GameError::ArithmeticOverflow)?;
    
    emit!(ActionExecuted {
        match_id: match_account.match_id,
        player: ctx.accounts.player.key(),
        action: action.clone(),
        result: combat_result.clone(),
        timestamp: clock.unix_timestamp,
    });
    
    // Check if match should end
    if match_account.is_match_over() {
        match_account.state = GameState::Completed;
        match_account.ended_at = Some(clock.unix_timestamp);
        
        // Set winner
        let alive_players = match_account.get_alive_players();
        if let Some(winner) = alive_players.first() {
            match_account.winner = Some(winner.player);
        }
        
        emit!(MatchEnded {
            match_id: match_account.match_id,
            winner: match_account.winner,
            timestamp: clock.unix_timestamp,
        });
    }
    
    Ok(())
}

fn execute_basic_attack(
    match_account: &mut Match,
    attacker_key: &Pubkey,
    action: &CombatAction,
) -> Result<CombatResult> {
    // Find attacker and target
    let attacker_stats = match_account.players.iter()
        .find(|p| p.player == *attacker_key)
        .ok_or(GameError::PlayerNotFound)?
        .stats.clone();
    
    let target_player = match_account.get_player_mut(&action.target)
        .ok_or(GameError::PlayerNotFound)?;
    
    if !target_player.is_alive {
        return Err(GameError::InvalidMove.into());
    }
    
    // Calculate damage
    let critical_hit = calculate_critical_chance(attacker_stats.speed, target_player.stats.speed);
    let damage = calculate_damage(
        attacker_stats.attack,
        target_player.stats.defense,
        action.power,
        critical_hit,
    )?;
    
    // Apply damage
    target_player.take_damage(damage);
    let target_defeated = !target_player.is_alive;
    
    // Calculate experience
    let experience_gained = calculate_experience_gain(damage, target_defeated);
    
    Ok(CombatResult {
        attacker: *attacker_key,
        target: action.target,
        damage_dealt: damage,
        critical_hit,
        target_defeated,
        experience_gained,
    })
}

fn execute_special_ability(
    match_account: &mut Match,
    attacker_key: &Pubkey,
    action: &CombatAction,
) -> Result<CombatResult> {
    // Enhanced damage for special abilities
    let attacker_stats = match_account.players.iter()
        .find(|p| p.player == *attacker_key)
        .ok_or(GameError::PlayerNotFound)?
        .stats.clone();
    
    let target_player = match_account.get_player_mut(&action.target)
        .ok_or(GameError::PlayerNotFound)?;
    
    if !target_player.is_alive {
        return Err(GameError::InvalidMove.into());
    }
    
    let critical_hit = calculate_critical_chance(attacker_stats.speed, target_player.stats.speed);
    // SECURITY: Use checked multiplication to prevent overflow
    let enhanced_power = action.power
        .checked_mul(2)
        .ok_or(GameError::ArithmeticOverflow)?; // Special abilities do 2x damage
    let damage = calculate_damage(
        attacker_stats.attack,
        target_player.stats.defense,
        enhanced_power,
        critical_hit,
    )?;
    
    target_player.take_damage(damage);
    let target_defeated = !target_player.is_alive;
    // SECURITY: Use checked multiplication for experience calculation
    let experience_gained = calculate_experience_gain(damage, target_defeated)
        .checked_mul(2)
        .ok_or(GameError::ArithmeticOverflow)?;
    
    Ok(CombatResult {
        attacker: *attacker_key,
        target: action.target,
        damage_dealt: damage,
        critical_hit,
        target_defeated,
        experience_gained,
    })
}

fn execute_defensive_stance(
    match_account: &mut Match,
    player_key: &Pubkey,
    _action: &CombatAction,
) -> Result<CombatResult> {
    // Defensive stance increases defense for the turn and restores some mana
    let player = match_account.get_player_mut(player_key)
        .ok_or(GameError::PlayerNotFound)?;
    
    player.restore_mana(20); // Restore some mana
    let experience_gained = 10; // Small experience for defensive play
    
    Ok(CombatResult {
        attacker: *player_key,
        target: *player_key,
        damage_dealt: 0,
        critical_hit: false,
        target_defeated: false,
        experience_gained,
    })
}

fn execute_heal(
    match_account: &mut Match,
    player_key: &Pubkey,
    action: &CombatAction,
) -> Result<CombatResult> {
    let heal_target = if action.target == *player_key {
        player_key
    } else {
        &action.target
    };
    
    let target_player = match_account.get_player_mut(heal_target)
        .ok_or(GameError::PlayerNotFound)?;
    
    if !target_player.is_alive {
        return Err(GameError::InvalidMove.into());
    }
    
    target_player.heal(action.power);
    let experience_gained = 15; // Experience for support actions
    
    Ok(CombatResult {
        attacker: *player_key,
        target: *heal_target,
        damage_dealt: 0, // Healing doesn't deal damage
        critical_hit: false,
        target_defeated: false,
        experience_gained,
    })
}

#[event]
pub struct ActionExecuted {
    pub match_id: u64,
    pub player: Pubkey,
    pub action: CombatAction,
    pub result: CombatResult,
    pub timestamp: i64,
}

#[event]
pub struct MatchEnded {
    pub match_id: u64,
    pub winner: Option<Pubkey>,
    pub timestamp: i64,
}