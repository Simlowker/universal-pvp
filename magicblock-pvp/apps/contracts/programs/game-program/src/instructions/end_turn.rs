use anchor_lang::prelude::*;
use crate::state::Match;
use crate::shared::{GameState, GameError};

pub fn handler(ctx: Context<crate::EndTurn>) -> Result<()> {
    let match_account = &mut ctx.accounts.match_account;
    let clock = Clock::get()?;
    
    // Validate match state
    if match_account.state != GameState::InProgress {
        return Err(GameError::InvalidGameState.into());
    }
    
    // Check if it's player's turn
    if !match_account.is_player_turn(&ctx.accounts.player.key()) {
        return Err(GameError::NotPlayerTurn.into());
    }
    
    // Restore some mana at end of turn
    if let Some(current_player) = match_account.get_player_mut(&ctx.accounts.player.key()) {
        current_player.restore_mana(10); // Restore 10 mana each turn
    }
    
    // Move to next turn
    match_account.next_turn()?;
    
    emit!(TurnEnded {
        match_id: match_account.match_id,
        player: ctx.accounts.player.key(),
        next_player: match_account.players[match_account.current_turn as usize].player,
        timestamp: clock.unix_timestamp,
    });
    
    msg!(
        "Turn ended for player {}, next player: {}",
        ctx.accounts.player.key(),
        match_account.players[match_account.current_turn as usize].player
    );
    
    Ok(())
}

#[event]
pub struct TurnEnded {
    pub match_id: u64,
    pub player: Pubkey,
    pub next_player: Pubkey,
    pub timestamp: i64,
}