use anchor_lang::prelude::*;
use crate::shared::ReentrancyState;

#[account]
pub struct TokenVault {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub total_supply: u64,
    pub total_burned: u64,
    pub total_staked: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl TokenVault {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // mint
        8 + // total_supply
        8 + // total_burned
        8 + // total_staked
        8 + // created_at
        1; // bump
}

#[account]
pub struct StakeAccount {
    pub staker: Pubkey,
    pub amount: u64,
    pub staked_at: i64,
    pub duration: i64,
    pub last_claim_at: i64,
    pub total_rewards_claimed: u64,
    pub is_active: bool,
    // SECURITY: Reentrancy guard to prevent reentrant calls
    pub reentrancy_guard: ReentrancyState,
    pub bump: u8,
}

impl StakeAccount {
    pub const LEN: usize = 8 + // discriminator
        32 + // staker
        8 + // amount
        8 + // staked_at
        8 + // duration
        8 + // last_claim_at
        8 + // total_rewards_claimed
        1 + // is_active
        1 + // reentrancy_guard
        1; // bump

    pub fn calculate_pending_rewards(&self, current_time: i64) -> Result<u64> {
        if !self.is_active {
            return Ok(0);
        }

        let time_since_last_claim = current_time - self.last_claim_at;
        if time_since_last_claim <= 0 {
            return Ok(0);
        }

        // APY calculation: 10% annual return
        // Rewards = (staked_amount * time_elapsed * APY) / (365 * 24 * 3600)
        let annual_rate = 0.10; // 10% APY
        let seconds_per_year = 365 * 24 * 3600;
        
        let rewards = (self.amount as f64 * time_since_last_claim as f64 * annual_rate) 
            / seconds_per_year as f64;
        
        Ok(rewards as u64)
    }

    pub fn can_unstake(&self, current_time: i64) -> bool {
        self.is_active && current_time >= self.staked_at + self.duration
    }

    pub fn time_until_unlock(&self, current_time: i64) -> i64 {
        if self.can_unstake(current_time) {
            0
        } else {
            (self.staked_at + self.duration) - current_time
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum RewardDistributionType {
    Winner,         // Winner takes all
    TopThree,       // 1st: 50%, 2nd: 30%, 3rd: 20%
    Proportional,   // Based on performance/ranking
    Equal,          // Equal distribution among participants
}

#[account]
pub struct RewardPool {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub total_amount: u64,
    pub distributed_amount: u64,
    pub distribution_type: RewardDistributionType,
    pub max_recipients: u8,
    pub created_at: i64,
    pub expires_at: Option<i64>,
    pub is_active: bool,
    pub bump: u8,
}

impl RewardPool {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // mint
        8 + // total_amount
        8 + // distributed_amount
        1 + // distribution_type
        1 + // max_recipients
        8 + // created_at
        1 + 8 + // expires_at (Option<i64>)
        1 + // is_active
        1; // bump

    pub fn remaining_amount(&self) -> u64 {
        self.total_amount.saturating_sub(self.distributed_amount)
    }

    pub fn is_expired(&self, current_time: i64) -> bool {
        if let Some(expires_at) = self.expires_at {
            current_time > expires_at
        } else {
            false
        }
    }

    pub fn calculate_distribution(&self, recipients_count: u8) -> Result<Vec<u64>> {
        if recipients_count == 0 || !self.is_active {
            return Ok(vec![]);
        }

        let remaining = self.remaining_amount();
        if remaining == 0 {
            return Ok(vec![0; recipients_count as usize]);
        }

        match self.distribution_type {
            RewardDistributionType::Winner => {
                let mut distribution = vec![0; recipients_count as usize];
                if recipients_count > 0 {
                    distribution[0] = remaining; // Winner takes all
                }
                Ok(distribution)
            },
            RewardDistributionType::TopThree => {
                let mut distribution = vec![0; recipients_count as usize];
                match recipients_count {
                    1 => distribution[0] = remaining,
                    2 => {
                        distribution[0] = (remaining * 70) / 100;
                        distribution[1] = (remaining * 30) / 100;
                    },
                    _ => {
                        distribution[0] = (remaining * 50) / 100;
                        distribution[1] = (remaining * 30) / 100;
                        distribution[2] = (remaining * 20) / 100;
                        // Rest get 0
                    }
                }
                Ok(distribution)
            },
            RewardDistributionType::Proportional => {
                // For proportional, external logic should provide weights
                // For now, fall back to equal distribution
                self.equal_distribution(recipients_count, remaining)
            },
            RewardDistributionType::Equal => {
                self.equal_distribution(recipients_count, remaining)
            }
        }
    }

    fn equal_distribution(&self, recipients_count: u8, total: u64) -> Result<Vec<u64>> {
        let per_recipient = total / recipients_count as u64;
        let remainder = total % recipients_count as u64;
        
        let mut distribution = vec![per_recipient; recipients_count as usize];
        
        // Distribute remainder to first few recipients
        for i in 0..(remainder as usize).min(recipients_count as usize) {
            distribution[i] = distribution[i].saturating_add(1);
        }
        
        Ok(distribution)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RewardDistribution {
    pub recipient: Pubkey,
    pub amount: u64,
    pub distributed_at: i64,
}

impl RewardDistribution {
    pub const LEN: usize = 32 + // recipient
        8 + // amount
        8; // distributed_at
}

// Token metrics for analytics
#[account]
pub struct TokenMetrics {
    pub mint: Pubkey,
    pub total_holders: u64,
    pub total_transactions: u64,
    pub total_volume: u64,
    pub daily_active_users: u32,
    pub last_updated: i64,
}

impl TokenMetrics {
    pub const LEN: usize = 8 + // discriminator
        32 + // mint
        8 + // total_holders
        8 + // total_transactions
        8 + // total_volume
        4 + // daily_active_users
        8; // last_updated
}