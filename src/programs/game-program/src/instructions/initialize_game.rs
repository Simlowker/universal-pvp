use anchor_lang::prelude::*;
use crate::state::GameState;

pub fn handler(ctx: Context<crate::InitializeGame>, upgrade_authority: Pubkey) -> Result<()> {
    let game_state = &mut ctx.accounts.game_state;
    
    game_state.upgrade_authority = upgrade_authority;
    game_state.total_matches = 0;
    game_state.total_players = 0;
    game_state.total_rewards_distributed = 0;
    game_state.paused = false;
    game_state.bump = ctx.bumps.game_state;
    
    emit!(GameInitialized {
        upgrade_authority,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    Ok(())
}

#[event]
pub struct GameInitialized {
    pub upgrade_authority: Pubkey,
    pub timestamp: i64,
}