use anchor_lang::prelude::*;
use crate::state::Match;
use crate::shared::{GameState, GameError};

pub fn handler(ctx: Context<crate::StartMatch>) -> Result<()> {
    let match_account = &mut ctx.accounts.match_account;
    let clock = Clock::get()?;
    
    // Validate match state
    if match_account.state != GameState::WaitingForPlayers {
        return Err(GameError::InvalidGameState.into());
    }
    
    // Validate minimum players (at least 2)
    if match_account.players.len() < 2 {
        return Err(GameError::InvalidMatchConfig.into());
    }
    
    // Only creator or authority can manually start match
    if match_account.creator != ctx.accounts.authority.key() {
        return Err(GameError::UnauthorizedPlayer.into());
    }
    
    // Start the match
    match_account.state = GameState::InProgress;
    match_account.started_at = Some(clock.unix_timestamp);
    match_account.current_turn = 0;
    match_account.turn_deadline = clock.unix_timestamp + match_account.config.turn_timeout;
    
    emit!(MatchStarted {
        match_id: match_account.match_id,
        players_count: match_account.players.len() as u8,
        first_player: match_account.players[0].player,
        timestamp: clock.unix_timestamp,
    });
    
    msg!(
        "Match {} manually started with {} players. First player: {}",
        match_account.match_id,
        match_account.players.len(),
        match_account.players[0].player
    );
    
    Ok(())
}

#[event]
pub struct MatchStarted {
    pub match_id: u64,
    pub players_count: u8,
    pub first_player: Pubkey,
    pub timestamp: i64,
}