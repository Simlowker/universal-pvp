use anchor_lang::prelude::*;
use crate::state::PlayerProfile;
use crate::shared::GameError;

pub fn handler(
    ctx: Context<crate::UpdatePlayerStats>,
    experience_gained: u32,
) -> Result<()> {
    let player_profile = &mut ctx.accounts.player_profile;
    let clock = Clock::get()?;
    
    // Update experience and level
    let old_level = player_profile.level;
    player_profile.experience = player_profile.experience
        .saturating_add(experience_gained as u64);
    player_profile.level = player_profile.calculate_level();
    
    // Update match count
    player_profile.total_matches = player_profile.total_matches.saturating_add(1);
    player_profile.last_match_at = clock.unix_timestamp;
    
    // Check for level up
    if player_profile.level > old_level {
        emit!(PlayerLevelUp {
            player: ctx.accounts.player.key(),
            old_level,
            new_level: player_profile.level,
            total_experience: player_profile.experience,
            timestamp: clock.unix_timestamp,
        });
        
        msg!(
            "Player {} leveled up from {} to {}!",
            ctx.accounts.player.key(),
            old_level,
            player_profile.level
        );
    }
    
    emit!(PlayerStatsUpdated {
        player: ctx.accounts.player.key(),
        experience_gained,
        total_experience: player_profile.experience,
        level: player_profile.level,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

#[event]
pub struct PlayerStatsUpdated {
    pub player: Pubkey,
    pub experience_gained: u32,
    pub total_experience: u64,
    pub level: u32,
    pub timestamp: i64,
}

#[event]
pub struct PlayerLevelUp {
    pub player: Pubkey,
    pub old_level: u32,
    pub new_level: u32,
    pub total_experience: u64,
    pub timestamp: i64,
}