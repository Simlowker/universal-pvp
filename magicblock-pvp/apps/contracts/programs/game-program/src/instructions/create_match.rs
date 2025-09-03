use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use crate::state::{Match, PlayerProfile};
use crate::shared::{MatchConfig, GameState, GameError, validate_entry_fee};

pub fn handler(ctx: Context<crate::CreateMatch>, match_config: MatchConfig) -> Result<()> {
    let clock = Clock::get()?;
    let match_account = &mut ctx.accounts.match_account;
    let creator_profile = &mut ctx.accounts.creator_profile;
    
    // Validate match configuration
    if match_config.max_players == 0 || match_config.max_players > 8 {
        return Err(GameError::InvalidMatchConfig.into());
    }
    
    if match_config.turn_timeout <= 0 || match_config.match_duration <= 0 {
        return Err(GameError::InvalidMatchConfig.into());
    }
    
    // Validate entry fee payment
    validate_entry_fee(
        ctx.accounts.creator_token_account.amount,
        match_config.entry_fee,
    )?;
    
    // Transfer entry fee to match reward pool
    if match_config.entry_fee > 0 {
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.creator_token_account.to_account_info(),
                to: ctx.accounts.creator_token_account.to_account_info(), // Temporary, will be match vault
                authority: ctx.accounts.creator.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, match_config.entry_fee)?;
    }
    
    // Initialize match
    match_account.creator = ctx.accounts.creator.key();
    match_account.match_id = clock.unix_timestamp as u64;
    match_account.config = match_config.clone();
    match_account.state = GameState::WaitingForPlayers;
    match_account.players = Vec::new();
    match_account.current_turn = 0;
    match_account.turn_deadline = 0;
    match_account.reward_pool = match_config.entry_fee;
    match_account.winner = None;
    match_account.created_at = clock.unix_timestamp;
    match_account.started_at = None;
    match_account.ended_at = None;
    match_account.bump = ctx.bumps.match_account;
    
    // Add creator as first player
    let creator_stats = creator_profile.get_current_stats();
    match_account.add_player(ctx.accounts.creator.key(), creator_stats)?;
    
    // Update creator's last match timestamp
    creator_profile.last_match_at = clock.unix_timestamp;
    
    emit!(MatchCreated {
        match_id: match_account.match_id,
        creator: ctx.accounts.creator.key(),
        config: match_config,
        timestamp: clock.unix_timestamp,
    });
    
    msg!(
        "Match {} created by {} with entry fee {} lamports",
        match_account.match_id,
        ctx.accounts.creator.key(),
        match_config.entry_fee
    );
    
    Ok(())
}

#[event]
pub struct MatchCreated {
    pub match_id: u64,
    pub creator: Pubkey,
    pub config: MatchConfig,
    pub timestamp: i64,
}