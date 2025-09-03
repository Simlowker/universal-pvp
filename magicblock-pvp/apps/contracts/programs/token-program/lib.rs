use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, Token, TokenAccount, Mint, MintTo, Transfer, Burn},
    associated_token::AssociatedToken,
};

pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

// Import shared modules
use crate::shared::{GameError};

declare_id!("TOKExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

#[program]
pub mod sol_duel_token {
    use super::*;

    /// Initialize the game token mint and vault
    pub fn initialize_token(
        ctx: Context<InitializeToken>,
        decimals: u8,
        initial_supply: u64,
    ) -> Result<()> {
        instructions::initialize_token::handler(ctx, decimals, initial_supply)
    }

    /// Mint tokens to a player (for rewards, purchases, etc.)
    pub fn mint_tokens(
        ctx: Context<MintTokens>,
        amount: u64,
    ) -> Result<()> {
        instructions::mint_tokens::handler(ctx, amount)
    }

    /// Transfer tokens between players
    pub fn transfer_tokens(
        ctx: Context<TransferTokens>,
        amount: u64,
    ) -> Result<()> {
        instructions::transfer_tokens::handler(ctx, amount)
    }

    /// Burn tokens (for deflationary mechanisms)
    pub fn burn_tokens(
        ctx: Context<BurnTokens>,
        amount: u64,
    ) -> Result<()> {
        instructions::burn_tokens::handler(ctx, amount)
    }

    /// Stake tokens for rewards
    pub fn stake_tokens(
        ctx: Context<StakeTokens>,
        amount: u64,
        duration: i64,
    ) -> Result<()> {
        instructions::stake_tokens::handler(ctx, amount, duration)
    }

    /// Unstake tokens and claim rewards
    pub fn unstake_tokens(ctx: Context<UnstakeTokens>) -> Result<()> {
        instructions::unstake_tokens::handler(ctx)
    }

    /// Claim staking rewards
    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        instructions::claim_rewards::handler(ctx)
    }

    /// Create reward pool for tournaments
    pub fn create_reward_pool(
        ctx: Context<CreateRewardPool>,
        pool_size: u64,
        distribution_type: RewardDistributionType,
    ) -> Result<()> {
        instructions::create_reward_pool::handler(ctx, pool_size, distribution_type)
    }

    /// Distribute rewards from pool
    pub fn distribute_rewards(
        ctx: Context<DistributeRewards>,
        recipients: Vec<Pubkey>,
        amounts: Vec<u64>,
    ) -> Result<()> {
        instructions::distribute_rewards::handler(ctx, recipients, amounts)
    }
}

#[derive(Accounts)]
#[instruction(decimals: u8)]
pub struct InitializeToken<'info> {
    #[account(
        init,
        payer = authority,
        mint::decimals = decimals,
        mint::authority = mint_authority,
        mint::freeze_authority = mint_authority,
    )]
    pub mint: Account<'info, Mint>,
    
    /// CHECK: This is the mint authority PDA
    #[account(
        seeds = [b"mint_authority"],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,
    
    #[account(
        init,
        payer = authority,
        space = TokenVault::LEN,
        seeds = [b"token_vault"],
        bump
    )]
    pub token_vault: Account<'info, TokenVault>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    
    /// CHECK: This is the mint authority PDA
    #[account(
        seeds = [b"mint_authority"],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,
    
    #[account(
        mut,
        seeds = [b"token_vault"],
        bump
    )]
    pub token_vault: Account<'info, TokenVault>,
    
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = recipient
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: This is the recipient of the tokens
    pub recipient: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferTokens<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = sender
    )]
    pub sender_token_account: Account<'info, TokenAccount>,
    
    #[account(
        init_if_needed,
        payer = sender,
        associated_token::mint = mint,
        associated_token::authority = recipient
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: This is the recipient of the tokens
    pub recipient: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub sender: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = owner
    )]
    pub token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"token_vault"],
        bump
    )]
    pub token_vault: Account<'info, TokenVault>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct StakeTokens<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = staker
    )]
    pub staker_token_account: Account<'info, TokenAccount>,
    
    #[account(
        init,
        payer = staker,
        space = StakeAccount::LEN,
        seeds = [b"stake", staker.key().as_ref()],
        bump
    )]
    pub stake_account: Account<'info, StakeAccount>,
    
    #[account(
        init,
        payer = staker,
        associated_token::mint = mint,
        associated_token::authority = stake_vault_authority
    )]
    pub stake_vault: Account<'info, TokenAccount>,
    
    /// CHECK: This is the stake vault authority PDA
    #[account(
        seeds = [b"stake_vault_authority"],
        bump
    )]
    pub stake_vault_authority: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub staker: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnstakeTokens<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = staker
    )]
    pub staker_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"stake", staker.key().as_ref()],
        bump,
        close = staker
    )]
    pub stake_account: Account<'info, StakeAccount>,
    
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = stake_vault_authority
    )]
    pub stake_vault: Account<'info, TokenAccount>,
    
    /// CHECK: This is the stake vault authority PDA
    #[account(
        seeds = [b"stake_vault_authority"],
        bump
    )]
    pub stake_vault_authority: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub staker: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = staker
    )]
    pub staker_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"stake", staker.key().as_ref()],
        bump
    )]
    pub stake_account: Account<'info, StakeAccount>,
    
    /// CHECK: This is the mint authority PDA
    #[account(
        seeds = [b"mint_authority"],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub staker: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CreateRewardPool<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = authority,
        space = RewardPool::LEN,
        seeds = [b"reward_pool", authority.key().as_ref(), &Clock::get()?.unix_timestamp.to_le_bytes()],
        bump
    )]
    pub reward_pool: Account<'info, RewardPool>,
    
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = pool_vault_authority
    )]
    pub pool_vault: Account<'info, TokenAccount>,
    
    /// CHECK: This is the pool vault authority PDA
    #[account(
        seeds = [b"pool_vault_authority", reward_pool.key().as_ref()],
        bump
    )]
    pub pool_vault_authority: UncheckedAccount<'info>,
    
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = authority
    )]
    pub authority_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributeRewards<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    
    #[account(
        mut,
        seeds = [b"reward_pool", reward_pool.authority.as_ref(), &reward_pool.created_at.to_le_bytes()],
        bump = reward_pool.bump
    )]
    pub reward_pool: Account<'info, RewardPool>,
    
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = pool_vault_authority
    )]
    pub pool_vault: Account<'info, TokenAccount>,
    
    /// CHECK: This is the pool vault authority PDA
    #[account(
        seeds = [b"pool_vault_authority", reward_pool.key().as_ref()],
        bump
    )]
    pub pool_vault_authority: UncheckedAccount<'info>,
    
    #[account(
        mut,
        constraint = authority.key() == reward_pool.authority
    )]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}