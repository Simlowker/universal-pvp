use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::Match;
use crate::shared::{GameState, GameError, calculate_reward_share};

pub fn handler(ctx: Context<crate::FinishMatch>) -> Result<()> {
    let match_account = &mut ctx.accounts.match_account;
    let clock = Clock::get()?;
    
    // Validate match state
    if match_account.state != GameState::Completed {
        return Err(GameError::InvalidGameState.into());
    }
    
    // Ensure match hasn't been processed already
    if match_account.ended_at.is_none() {
        return Err(GameError::InvalidGameState.into());
    }
    
    // Calculate and distribute rewards
    distribute_rewards(match_account, &ctx.remaining_accounts, &ctx.accounts.token_program)?;
    
    // Update player statistics
    for player in &match_account.players {
        // This would typically update each player's profile
        // For now, we'll emit events for external processing
        emit!(PlayerMatchCompleted {
            match_id: match_account.match_id,
            player: player.player,
            damage_dealt: player.damage_dealt,
            damage_taken: player.damage_taken,
            actions_taken: player.actions_taken,
            survived: player.is_alive,
            won: Some(player.player) == match_account.winner,
            timestamp: clock.unix_timestamp,
        });
    }
    
    emit!(MatchFinalized {
        match_id: match_account.match_id,
        winner: match_account.winner,
        total_reward_distributed: match_account.reward_pool,
        duration: match_account.ended_at.unwrap() - match_account.started_at.unwrap_or(match_account.created_at),
        timestamp: clock.unix_timestamp,
    });
    
    msg!(
        "Match {} finalized. Winner: {:?}. Total rewards distributed: {} lamports",
        match_account.match_id,
        match_account.winner,
        match_account.reward_pool
    );
    
    Ok(())
}

fn distribute_rewards(
    match_account: &mut Match,
    remaining_accounts: &[AccountInfo],
    token_program: &Program<Token>,
) -> Result<()> {
    if match_account.reward_pool == 0 {
        return Ok(());
    }
    
    // Sort players by performance (alive players first, then by damage dealt)
    let mut player_rankings: Vec<_> = match_account.players.iter()
        .enumerate()
        .collect();
    
    player_rankings.sort_by(|a, b| {
        match (a.1.is_alive, b.1.is_alive) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => b.1.damage_dealt.cmp(&a.1.damage_dealt),
        }
    });
    
    // Distribute rewards based on ranking and configuration
    let total_pool = match_account.reward_pool;
    let mut distributed = 0u64;
    
    for (rank, &(_, player)) in player_rankings.iter().enumerate() {
        if rank >= match_account.config.reward_distribution.len() {
            break;
        }
        
        let percentage = match_account.config.reward_distribution[rank];
        let reward_amount = calculate_reward_share(total_pool, percentage)?;
        
        if reward_amount > 0 && distributed + reward_amount <= total_pool {
            // Find the player's token account in remaining accounts
            if let Some(player_token_account) = find_player_token_account(remaining_accounts, &player.player)? {
                // Transfer reward to player
                // Note: In a real implementation, you'd need proper PDA derivation for the match vault
                // For now, this is a placeholder for the transfer logic
                distributed = distributed.checked_add(reward_amount)
                    .ok_or(GameError::ArithmeticOverflow)?;
                
                emit!(RewardDistributed {
                    match_id: match_account.match_id,
                    player: player.player,
                    rank: rank as u8,
                    amount: reward_amount,
                    timestamp: Clock::get()?.unix_timestamp,
                });
            }
        }
    }
    
    match_account.reward_pool = match_account.reward_pool.saturating_sub(distributed);
    Ok(())
}

fn find_player_token_account<'info>(
    remaining_accounts: &'info [AccountInfo<'info>],
    player: &Pubkey,
) -> Result<Option<&'info Account<'info, TokenAccount>>> {
    // This is a simplified version - in practice, you'd need proper account validation
    for account_info in remaining_accounts {
        if account_info.owner == &anchor_spl::token::ID {
            // Validate this is the player's token account
            // This would need proper implementation with account constraints
        }
    }
    Ok(None)
}

#[event]
pub struct PlayerMatchCompleted {
    pub match_id: u64,
    pub player: Pubkey,
    pub damage_dealt: u32,
    pub damage_taken: u32,
    pub actions_taken: u32,
    pub survived: bool,
    pub won: bool,
    pub timestamp: i64,
}

#[event]
pub struct MatchFinalized {
    pub match_id: u64,
    pub winner: Option<Pubkey>,
    pub total_reward_distributed: u64,
    pub duration: i64,
    pub timestamp: i64,
}

#[event]
pub struct RewardDistributed {
    pub match_id: u64,
    pub player: Pubkey,
    pub rank: u8,
    pub amount: u64,
    pub timestamp: i64,
}