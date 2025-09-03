use anchor_lang::prelude::*;
use crate::state::PlayerProfile;
use crate::shared::{PlayerClass, PlayerStats, GameError, MAX_USERNAME_LENGTH};

pub fn handler(
    ctx: Context<crate::RegisterPlayer>,
    username: String,
    player_class: PlayerClass,
) -> Result<()> {
    // Validate username length
    if username.len() > MAX_USERNAME_LENGTH {
        return Err(GameError::InvalidMatchConfig.into());
    }
    
    if username.trim().is_empty() {
        return Err(GameError::InvalidMatchConfig.into());
    }
    
    let player_profile = &mut ctx.accounts.player_profile;
    let clock = Clock::get()?;
    
    // Initialize base stats based on player class
    let base_stats = match player_class {
        PlayerClass::Warrior => PlayerStats::new_warrior(),
        PlayerClass::Mage => PlayerStats::new_mage(),
        PlayerClass::Archer => PlayerStats::new_archer(),
        PlayerClass::Rogue => PlayerStats::new_rogue(),
    };
    
    player_profile.owner = ctx.accounts.player.key();
    player_profile.username = username.clone();
    player_profile.player_class = player_class;
    player_profile.base_stats = base_stats;
    player_profile.level = 1;
    player_profile.experience = 0;
    player_profile.total_matches = 0;
    player_profile.wins = 0;
    player_profile.losses = 0;
    player_profile.total_damage_dealt = 0;
    player_profile.total_damage_taken = 0;
    player_profile.created_at = clock.unix_timestamp;
    player_profile.last_match_at = 0;
    player_profile.is_active = true;
    player_profile.bump = ctx.bumps.player_profile;
    
    emit!(PlayerRegistered {
        player: ctx.accounts.player.key(),
        username: username.clone(),
        player_class,
        timestamp: clock.unix_timestamp,
    });
    
    msg!("Player {} registered with class {:?}", username, player_class);
    Ok(())
}

#[event]
pub struct PlayerRegistered {
    pub player: Pubkey,
    pub username: String,
    pub player_class: PlayerClass,
    pub timestamp: i64,
}