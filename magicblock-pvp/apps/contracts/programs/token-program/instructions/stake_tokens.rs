use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use crate::state::StakeAccount;
use crate::shared::GameError;

pub fn handler(
    ctx: Context<crate::StakeTokens>,
    amount: u64,
    duration: i64,
) -> Result<()> {
    if amount == 0 {
        return Err(GameError::InvalidCombatParams.into());
    }
    
    // Minimum staking duration: 7 days
    const MIN_DURATION: i64 = 7 * 24 * 3600; // 7 days in seconds
    if duration < MIN_DURATION {
        return Err(GameError::CooldownNotMet.into());
    }
    
    let clock = Clock::get()?;
    
    // Transfer tokens to stake vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.staker_token_account.to_account_info(),
            to: ctx.accounts.stake_vault.to_account_info(),
            authority: ctx.accounts.staker.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;
    
    // Initialize stake account
    let stake_account = &mut ctx.accounts.stake_account;
    stake_account.staker = ctx.accounts.staker.key();
    stake_account.amount = amount;
    stake_account.staked_at = clock.unix_timestamp;
    stake_account.duration = duration;
    stake_account.last_claim_at = clock.unix_timestamp;
    stake_account.total_rewards_claimed = 0;
    stake_account.is_active = true;
    stake_account.bump = ctx.bumps.stake_account;
    
    emit!(TokensStaked {
        staker: ctx.accounts.staker.key(),
        amount,
        duration,
        unlock_time: clock.unix_timestamp + duration,
        timestamp: clock.unix_timestamp,
    });
    
    msg!(
        "Staked {} tokens for {} seconds. Unlock at: {}",
        amount,
        duration,
        clock.unix_timestamp + duration
    );
    
    Ok(())
}

#[event]
pub struct TokensStaked {
    pub staker: Pubkey,
    pub amount: u64,
    pub duration: i64,
    pub unlock_time: i64,
    pub timestamp: i64,
}