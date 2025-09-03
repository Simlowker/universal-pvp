use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use crate::state::{Match, PlayerProfile};
use crate::shared::{GameState, GameError, validate_entry_fee};

pub fn handler(ctx: Context<crate::JoinMatch>) -> Result<()> {
    let match_account = &mut ctx.accounts.match_account;
    let player_profile = &mut ctx.accounts.player_profile;
    let clock = Clock::get()?;
    
    // Validate match state
    if match_account.state != GameState::WaitingForPlayers {
        return Err(GameError::InvalidGameState.into());
    }
    
    // Check if player is already in the match
    for existing_player in &match_account.players {
        if existing_player.player == ctx.accounts.player.key() {
            return Err(GameError::PlayerAlreadyRegistered.into());
        }
    }
    
    // Check if match is full
    if match_account.players.len() >= match_account.config.max_players as usize {
        return Err(GameError::MatchFull.into());
    }
    
    // Validate entry fee payment
    validate_entry_fee(
        ctx.accounts.player_token_account.amount,
        match_account.config.entry_fee,
    )?;
    
    // Transfer entry fee to match reward pool
    if match_account.config.entry_fee > 0 {
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.player_token_account.to_account_info(),
                to: ctx.accounts.player_token_account.to_account_info(), // Temporary, will be match vault
                authority: ctx.accounts.player.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, match_account.config.entry_fee)?;
    }
    
    // Add player to match
    let player_stats = player_profile.get_current_stats();
    match_account.add_player(ctx.accounts.player.key(), player_stats)?;
    match_account.reward_pool = match_account.reward_pool
        .checked_add(match_account.config.entry_fee)
        .ok_or(GameError::ArithmeticOverflow)?;
    
    // Update player's last match timestamp
    player_profile.last_match_at = clock.unix_timestamp;
    
    emit!(PlayerJoinedMatch {
        match_id: match_account.match_id,
        player: ctx.accounts.player.key(),
        players_count: match_account.players.len() as u8,
        timestamp: clock.unix_timestamp,
    });
    
    // Auto-start match if full
    if match_account.players.len() == match_account.config.max_players as usize {
        match_account.state = GameState::InProgress;
        match_account.started_at = Some(clock.unix_timestamp);
        match_account.turn_deadline = clock.unix_timestamp + match_account.config.turn_timeout;
        
        emit!(MatchStarted {
            match_id: match_account.match_id,
            players_count: match_account.players.len() as u8,
            timestamp: clock.unix_timestamp,
        });
        
        msg!("Match {} auto-started with {} players", match_account.match_id, match_account.players.len());
    }
    
    msg!(
        "Player {} joined match {} ({}/{} players)",
        ctx.accounts.player.key(),
        match_account.match_id,
        match_account.players.len(),
        match_account.config.max_players
    );
    
    Ok(())
}

#[event]
pub struct PlayerJoinedMatch {
    pub match_id: u64,
    pub player: Pubkey,
    pub players_count: u8,
    pub timestamp: i64,
}

#[event]
pub struct MatchStarted {
    pub match_id: u64,
    pub players_count: u8,
    pub timestamp: i64,
}