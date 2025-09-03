use anchor_lang::prelude::*;
use anchor_spl::token::{self, MintTo};
use crate::state::StakeAccount;
use crate::shared::{GameError, ReentrancyState};

pub fn handler(ctx: Context<crate::ClaimRewards>) -> Result<()> {
    let stake_account = &mut ctx.accounts.stake_account;
    let clock = Clock::get()?;
    
    // SECURITY: Reentrancy Guard - Check and set entered state
    if stake_account.reentrancy_guard == ReentrancyState::Entered {
        return Err(GameError::ReentrancyDetected.into());
    }
    stake_account.reentrancy_guard = ReentrancyState::Entered;
    
    // Check if stake account is active
    if !stake_account.is_active {
        stake_account.reentrancy_guard = ReentrancyState::NotEntered;
        return Err(GameError::InvalidGameState.into());
    }
    
    // Calculate pending rewards
    let pending_rewards = stake_account.calculate_pending_rewards(clock.unix_timestamp)?;
    
    if pending_rewards == 0 {
        stake_account.reentrancy_guard = ReentrancyState::NotEntered;
        return Err(GameError::RewardPoolEmpty.into());
    }
    
    // Mint reward tokens to staker
    let mint_authority_bump = ctx.bumps.mint_authority;
    let signer_seeds = &[
        b"mint_authority".as_ref(),
        &[mint_authority_bump],
    ];
    
    let mint_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.staker_token_account.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        },
        &[signer_seeds],
    );
    
    // SECURITY: External call moved to end after all state updates
    token::mint_to(mint_ctx, pending_rewards)?;
    
    // SECURITY: Update state before external calls (Checks-Effects-Interactions pattern)
    stake_account.last_claim_at = clock.unix_timestamp;
    stake_account.total_rewards_claimed = stake_account.total_rewards_claimed
        .checked_add(pending_rewards)
        .ok_or(GameError::ArithmeticOverflow)?;
    
    // Reset reentrancy guard before external token mint call
    stake_account.reentrancy_guard = ReentrancyState::NotEntered;
    
    emit!(RewardsClaimed {
        staker: ctx.accounts.staker.key(),
        amount: pending_rewards,
        total_claimed: stake_account.total_rewards_claimed,
        timestamp: clock.unix_timestamp,
    });
    
    msg!(
        "Claimed {} reward tokens. Total claimed: {}",
        pending_rewards,
        stake_account.total_rewards_claimed
    );
    
    Ok(())
}

#[event]
pub struct RewardsClaimed {
    pub staker: Pubkey,
    pub amount: u64,
    pub total_claimed: u64,
    pub timestamp: i64,
}