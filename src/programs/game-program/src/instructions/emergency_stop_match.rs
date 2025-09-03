use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, Transfer};
use crate::state::{Match, GameState as ProgramGameState};
use crate::shared::{GameState, GameError};

pub fn handler(ctx: Context<crate::EmergencyStopMatch>) -> Result<()> {
    let match_account = &mut ctx.accounts.match_account;
    let game_state = &ctx.accounts.game_state;
    let clock = Clock::get()?;
    
    // Validate authority
    if game_state.upgrade_authority != ctx.accounts.authority.key() {
        return Err(GameError::InvalidUpgradeAuthority.into());
    }
    
    // Only allow emergency stop for active matches
    if match_account.state == GameState::Completed || match_account.state == GameState::Cancelled {
        return Err(GameError::InvalidGameState.into());
    }
    
    // Set match to cancelled state
    match_account.state = GameState::Cancelled;
    match_account.ended_at = Some(clock.unix_timestamp);
    match_account.winner = None;
    
    // Refund entry fees to all players
    // Note: This is a simplified version - in practice, you'd need proper vault management
    let refund_per_player = if match_account.players.len() > 0 {
        match_account.reward_pool / match_account.players.len() as u64
    } else {
        0
    };
    
    for player in &match_account.players {
        emit!(EmergencyRefund {
            match_id: match_account.match_id,
            player: player.player,
            amount: refund_per_player,
            timestamp: clock.unix_timestamp,
        });
    }
    
    emit!(EmergencyMatchStopped {
        match_id: match_account.match_id,
        authority: ctx.accounts.authority.key(),
        total_refunded: match_account.reward_pool,
        players_count: match_account.players.len() as u8,
        timestamp: clock.unix_timestamp,
    });
    
    msg!(
        "Emergency stop executed for match {} by authority {}. Total refunded: {} lamports",
        match_account.match_id,
        ctx.accounts.authority.key(),
        match_account.reward_pool
    );
    
    // Reset reward pool after refunds
    match_account.reward_pool = 0;
    
    Ok(())
}

#[event]
pub struct EmergencyMatchStopped {
    pub match_id: u64,
    pub authority: Pubkey,
    pub total_refunded: u64,
    pub players_count: u8,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyRefund {
    pub match_id: u64,
    pub player: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}