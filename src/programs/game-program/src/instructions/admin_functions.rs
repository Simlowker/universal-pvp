use anchor_lang::prelude::*;
use crate::state::{Match, PlayerProfile};
use crate::shared::{GameError, GameState, AdminConfig, AdminRole};

// Access control macro for admin functions
macro_rules! require_admin {
    ($admin_config:expr, $admin:expr, $required_role:expr) => {
        if !verify_admin_access($admin_config, $admin, $required_role)? {
            return Err(GameError::AccessDenied.into());
        }
    };
}

/// Emergency stop a match - Only SuperAdmin or GameAdmin
#[access_control(admin_only)]
pub fn emergency_stop_match(
    ctx: Context<EmergencyStopMatch>,
    match_id: u64,
    reason: String
) -> Result<()> {
    let admin_config = &ctx.accounts.admin_config;
    let admin = &ctx.accounts.admin.key();
    
    // SECURITY: Verify admin privileges
    require_admin!(admin_config, admin, AdminRole::GameAdmin);
    
    let match_account = &mut ctx.accounts.match_account;
    
    // Verify match is in progress
    if match_account.state != GameState::InProgress {
        return Err(GameError::InvalidGameState.into());
    }
    
    // Emergency stop the match
    match_account.state = GameState::Cancelled;
    match_account.ended_at = Some(Clock::get()?.unix_timestamp);
    match_account.cancel_reason = Some(reason.clone());
    
    emit!(MatchEmergencyStopped {
        match_id,
        admin: *admin,
        reason,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Emergency stop executed on match {} by admin {}", match_id, admin);
    
    Ok(())
}

/// Update admin configuration - Only SuperAdmin
#[access_control(super_admin_only)]
pub fn update_admin_config(
    ctx: Context<UpdateAdminConfig>,
    new_admins: Vec<Pubkey>,
    role_updates: Vec<(Pubkey, AdminRole)>
) -> Result<()> {
    let admin_config = &mut ctx.accounts.admin_config;
    let admin = &ctx.accounts.admin.key();
    
    // SECURITY: Only super admin can modify admin configuration
    if admin_config.super_admin != *admin {
        return Err(GameError::AccessDenied.into());
    }
    
    // Validate admin signature
    if !ctx.accounts.admin.is_signer {
        return Err(GameError::InvalidAdminSignature.into());
    }
    
    // Update admin whitelist
    admin_config.admin_whitelist.extend(new_admins.iter().cloned());
    
    // Update role assignments
    for (admin_key, role) in role_updates {
        // Remove existing role assignment if any
        admin_config.role_assignments.retain(|(key, _)| *key != admin_key);
        // Add new role assignment
        admin_config.role_assignments.push((admin_key, role));
    }
    
    emit!(AdminConfigUpdated {
        super_admin: *admin,
        new_admins,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

/// Force end a match - GameAdmin only
#[access_control(admin_only)]
pub fn force_end_match(
    ctx: Context<ForceEndMatch>,
    match_id: u64,
    winner: Option<Pubkey>
) -> Result<()> {
    let admin_config = &ctx.accounts.admin_config;
    let admin = &ctx.accounts.admin.key();
    
    // SECURITY: Verify admin privileges
    require_admin!(admin_config, admin, AdminRole::GameAdmin);
    
    let match_account = &mut ctx.accounts.match_account;
    let clock = Clock::get()?;
    
    // Can only force end matches that are in progress or waiting
    if match_account.state == GameState::Completed || match_account.state == GameState::Cancelled {
        return Err(GameError::InvalidGameState.into());
    }
    
    // Force end the match
    match_account.state = GameState::Completed;
    match_account.ended_at = Some(clock.unix_timestamp);
    match_account.winner = winner;
    match_account.force_ended = true;
    match_account.force_ended_by = Some(*admin);
    
    emit!(MatchForceEnded {
        match_id,
        admin: *admin,
        winner,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

/// Reset player statistics - GameAdmin only
#[access_control(admin_only)]
pub fn reset_player_stats(
    ctx: Context<ResetPlayerStats>,
    player: Pubkey,
    reset_type: StatResetType
) -> Result<()> {
    let admin_config = &ctx.accounts.admin_config;
    let admin = &ctx.accounts.admin.key();
    
    // SECURITY: Verify admin privileges
    require_admin!(admin_config, admin, AdminRole::GameAdmin);
    
    let player_profile = &mut ctx.accounts.player_profile;
    
    match reset_type {
        StatResetType::All => {
            player_profile.matches_won = 0;
            player_profile.matches_lost = 0;
            player_profile.total_damage_dealt = 0;
            player_profile.total_experience = 0;
            player_profile.level = 1;
        },
        StatResetType::MatchHistory => {
            player_profile.matches_won = 0;
            player_profile.matches_lost = 0;
        },
        StatResetType::Experience => {
            player_profile.total_experience = 0;
            player_profile.level = 1;
        },
    }
    
    emit!(PlayerStatsReset {
        player,
        admin: *admin,
        reset_type,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

/// Toggle emergency stop mode - SuperAdmin only
#[access_control(super_admin_only)]
pub fn toggle_emergency_stop(
    ctx: Context<ToggleEmergencyStop>,
    enabled: bool
) -> Result<()> {
    let admin_config = &mut ctx.accounts.admin_config;
    let admin = &ctx.accounts.admin.key();
    
    // SECURITY: Only super admin can toggle emergency stop
    if admin_config.super_admin != *admin {
        return Err(GameError::AccessDenied.into());
    }
    
    admin_config.emergency_stop_enabled = enabled;
    
    emit!(EmergencyStopToggled {
        admin: *admin,
        enabled,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Emergency stop mode {} by super admin", if enabled { "enabled" } else { "disabled" });
    
    Ok(())
}

/// Verify admin access for specific role
fn verify_admin_access(
    admin_config: &AdminConfig,
    admin: &Pubkey,
    required_role: AdminRole
) -> Result<bool> {
    // Super admin has access to everything
    if admin_config.super_admin == *admin {
        return Ok(true);
    }
    
    // Check if admin is in whitelist
    if !admin_config.admin_whitelist.contains(admin) {
        return Err(GameError::AdminNotWhitelisted.into());
    }
    
    // Check role assignments
    let has_required_role = admin_config.role_assignments
        .iter()
        .any(|(key, role)| key == admin && (*role == required_role || *role == AdminRole::SuperAdmin));
    
    Ok(has_required_role)
}

// Context structs
#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct EmergencyStopMatch<'info> {
    #[account(mut)]
    pub match_account: Account<'info, Match>,
    
    #[account(constraint = admin_config.admin_whitelist.contains(&admin.key()) || admin_config.super_admin == admin.key())]
    pub admin_config: Account<'info, AdminConfig>,
    
    #[account(signer)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateAdminConfig<'info> {
    #[account(mut, constraint = admin_config.super_admin == admin.key())]
    pub admin_config: Account<'info, AdminConfig>,
    
    #[account(signer)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct ForceEndMatch<'info> {
    #[account(mut)]
    pub match_account: Account<'info, Match>,
    
    #[account(constraint = admin_config.admin_whitelist.contains(&admin.key()) || admin_config.super_admin == admin.key())]
    pub admin_config: Account<'info, AdminConfig>,
    
    #[account(signer)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(player: Pubkey)]
pub struct ResetPlayerStats<'info> {
    #[account(mut)]
    pub player_profile: Account<'info, PlayerProfile>,
    
    #[account(constraint = admin_config.admin_whitelist.contains(&admin.key()) || admin_config.super_admin == admin.key())]
    pub admin_config: Account<'info, AdminConfig>,
    
    #[account(signer)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct ToggleEmergencyStop<'info> {
    #[account(mut, constraint = admin_config.super_admin == admin.key())]
    pub admin_config: Account<'info, AdminConfig>,
    
    #[account(signer)]
    pub admin: Signer<'info>,
}

// Enums and Types
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub enum StatResetType {
    All,
    MatchHistory,
    Experience,
}

// Events
#[event]
pub struct MatchEmergencyStopped {
    pub match_id: u64,
    pub admin: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}

#[event]
pub struct AdminConfigUpdated {
    pub super_admin: Pubkey,
    pub new_admins: Vec<Pubkey>,
    pub timestamp: i64,
}

#[event]
pub struct MatchForceEnded {
    pub match_id: u64,
    pub admin: Pubkey,
    pub winner: Option<Pubkey>,
    pub timestamp: i64,
}

#[event]
pub struct PlayerStatsReset {
    pub player: Pubkey,
    pub admin: Pubkey,
    pub reset_type: StatResetType,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyStopToggled {
    pub admin: Pubkey,
    pub enabled: bool,
    pub timestamp: i64,
}