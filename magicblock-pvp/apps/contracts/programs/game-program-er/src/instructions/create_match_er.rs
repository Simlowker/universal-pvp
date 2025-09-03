use anchor_lang::prelude::*;
use crate::state::*;
use shared::magicblock::delegation::*;
use shared::{GameState as SharedGameState, MatchConfig};

pub fn handler(
    ctx: Context<super::CreateMatchEr>,
    match_config: MatchConfig,
    delegate_to_er: bool,
) -> Result<()> {
    let match_er = &mut ctx.accounts.match_er;
    let match_state = &mut ctx.accounts.match_state;
    let creator_profile = &mut ctx.accounts.creator_profile;
    let delegation_state = &mut ctx.accounts.delegation_state;
    let current_time = Clock::get()?.unix_timestamp;

    // Validate match configuration
    if match_config.max_players == 0 || match_config.max_players > 8 {
        return Err(shared::GameError::InvalidMatchConfig.into());
    }

    if match_config.entry_fee > 100_000_000 { // Max 0.1 SOL
        return Err(shared::GameError::InvalidMatchConfig.into());
    }

    // Initialize ER match
    match_er.creator = ctx.accounts.creator.key();
    match_er.match_id = current_time as u64;
    match_er.config = match_config.clone();
    match_er.state = SharedGameState::WaitingForPlayers;
    match_er.players = Vec::new();
    match_er.current_turn = 0;
    match_er.turn_deadline = 0;
    match_er.reward_pool = match_config.entry_fee;
    match_er.winner = None;
    match_er.created_at = current_time;
    match_er.started_at = None;
    match_er.ended_at = None;
    
    // ER-specific initialization
    match_er.is_delegated_to_er = delegate_to_er;
    match_er.delegation_state = if delegate_to_er {
        Some(delegation_state.key())
    } else {
        None
    };
    match_er.er_session_id = if delegate_to_er {
        Some(format!("er_session_{}", current_time))
    } else {
        None
    };
    match_er.pending_mainnet_commits = Vec::new();
    match_er.mainnet_sync_status = if delegate_to_er {
        MainnetSyncStatus::NotSynced
    } else {
        MainnetSyncStatus::Ready
    };
    match_er.last_component_update = current_time;
    
    // Admin fields
    match_er.force_ended = false;
    match_er.force_ended_by = None;
    match_er.cancel_reason = None;
    match_er.rollback_requested = false;
    match_er.rollback_reason = None;
    match_er.bump = ctx.bumps.match_er;

    // Initialize BOLT ECS MatchState component
    match_state.match_id = match_er.match_id;
    match_state.current_turn = 0;
    match_state.turn_deadline = 0;
    match_state.state = SharedGameState::WaitingForPlayers as u8;
    match_state.players_count = 0;
    match_state.winner = None;

    // Add creator as first player
    let creator_stats = creator_profile.get_current_stats();
    match_er.add_player(ctx.accounts.creator.key(), creator_stats)?;
    match_state.players_count = 1;

    // If delegating to ER, set up delegation
    if delegate_to_er {
        let delegated_account = DelegatedAccount {
            account_pubkey: match_er.key(),
            account_type: DelegatedAccountType::Match,
            original_data_hash: [0; 32], // Will be calculated properly
            current_data_hash: [0; 32],
            is_modified: false,
        };
        delegation_state.add_delegated_account(delegated_account)?;

        // Add match state component to delegation
        let match_state_delegated = DelegatedAccount {
            account_pubkey: match_state.key(),
            account_type: DelegatedAccountType::GameState,
            original_data_hash: [0; 32],
            current_data_hash: [0; 32],
            is_modified: false,
        };
        delegation_state.add_delegated_account(match_state_delegated)?;
    }

    // Update creator's profile
    creator_profile.total_matches = creator_profile.total_matches.saturating_add(1);
    creator_profile.last_match_at = current_time;
    if delegate_to_er {
        creator_profile.er_sessions_played = creator_profile.er_sessions_played.saturating_add(1);
        creator_profile.current_delegation_state = Some(delegation_state.key());
    }

    msg!("Match ER created with ID: {}, delegated to ER: {}", match_er.match_id, delegate_to_er);

    Ok(())
}

impl PlayerProfileEr {
    pub fn get_current_stats(&self) -> shared::PlayerStats {
        // Calculate effective stats based on level and ER bonuses
        let level_multiplier = self.level as f64 * 0.1 + 1.0;
        let er_multiplier = if self.er_sessions_played > 0 {
            1.0 + (self.er_sessions_played as f64 * 0.01) // 1% bonus per ER session
        } else {
            1.0
        };

        let combined_multiplier = level_multiplier * er_multiplier;

        // Base stats from player class
        let base_stats = match shared::PlayerClass::Warrior { // Simplified - should get from actual class
            shared::PlayerClass::Warrior => shared::PlayerStats::new_warrior(),
            shared::PlayerClass::Mage => shared::PlayerStats::new_mage(),
            shared::PlayerClass::Archer => shared::PlayerStats::new_archer(),
            shared::PlayerClass::Rogue => shared::PlayerStats::new_rogue(),
        };

        shared::PlayerStats {
            health: (base_stats.health as f64 * combined_multiplier) as u32,
            attack: (base_stats.attack as f64 * combined_multiplier) as u32,
            defense: (base_stats.defense as f64 * combined_multiplier) as u32,
            speed: (base_stats.speed as f64 * combined_multiplier) as u32,
            mana: (base_stats.mana as f64 * combined_multiplier) as u32,
        }
    }
}