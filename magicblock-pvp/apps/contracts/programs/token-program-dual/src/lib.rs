use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, Token, TokenAccount, Mint, MintTo, Transfer, Burn},
    associated_token::AssociatedToken,
};

pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

// Import shared modules including MagicBlock integration
use shared::magicblock::{
    delegation::*,
    router::*,
    state_management::*,
};
use shared::GameError;

declare_id!("TOKDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

#[program]
pub mod sol_duel_token_dual {
    use super::*;

    /// Initialize token with dual-mode support
    pub fn initialize_token_dual(
        ctx: Context<InitializeTokenDual>,
        decimals: u8,
        initial_supply: u64,
        mainnet_program: Pubkey,
        er_program: Option<Pubkey>,
    ) -> Result<()> {
        instructions::initialize_token_dual::handler(ctx, decimals, initial_supply, mainnet_program, er_program)
    }

    /// Route token operation to appropriate environment
    pub fn route_token_operation(
        ctx: Context<RouteTokenOperation>,
        operation_type: TokenOperationType,
        amount: u64,
        target_environment: ExecutionEnvironment,
    ) -> Result<()> {
        instructions::route_token_operation::handler(ctx, operation_type, amount, target_environment)
    }

    /// Mint tokens (mainnet only for permanent supply)
    pub fn mint_tokens_mainnet(
        ctx: Context<MintTokensMainnet>,
        amount: u64,
    ) -> Result<()> {
        instructions::mint_tokens_mainnet::handler(ctx, amount)
    }

    /// Create temporary token allocation for ER gameplay
    pub fn allocate_tokens_er(
        ctx: Context<AllocateTokensEr>,
        amount: u64,
        er_session_id: String,
        expiry_timestamp: i64,
    ) -> Result<()> {
        instructions::allocate_tokens_er::handler(ctx, amount, er_session_id, expiry_timestamp)
    }

    /// Stake tokens on mainnet with ER gameplay integration
    pub fn stake_tokens_dual(
        ctx: Context<StakeTokensDual>,
        amount: u64,
        duration: i64,
        allow_er_usage: bool,
    ) -> Result<()> {
        instructions::stake_tokens_dual::handler(ctx, amount, duration, allow_er_usage)
    }

    /// Claim rewards from both mainnet and ER activities
    pub fn claim_rewards_dual(
        ctx: Context<ClaimRewardsDual>,
        include_er_rewards: bool,
    ) -> Result<()> {
        instructions::claim_rewards_dual::handler(ctx, include_er_rewards)
    }

    /// Settle ER token operations back to mainnet
    pub fn settle_er_operations(
        ctx: Context<SettleErOperations>,
        er_session_id: String,
        operations: Vec<ErTokenOperation>,
    ) -> Result<()> {
        instructions::settle_er_operations::handler(ctx, er_session_id, operations)
    }

    /// Emergency freeze for cross-chain operations
    pub fn emergency_freeze_dual(
        ctx: Context<EmergencyFreezeDual>,
        freeze_mainnet: bool,
        freeze_er: bool,
        reason: String,
    ) -> Result<()> {
        instructions::emergency_freeze_dual::handler(ctx, freeze_mainnet, freeze_er, reason)
    }

    /// Bridge tokens between mainnet and ER
    pub fn bridge_tokens(
        ctx: Context<BridgeTokens>,
        amount: u64,
        source_environment: ExecutionEnvironment,
        destination_environment: ExecutionEnvironment,
    ) -> Result<()> {
        instructions::bridge_tokens::handler(ctx, amount, source_environment, destination_environment)
    }

    /// Create game reward pool with dual-mode distribution
    pub fn create_reward_pool_dual(
        ctx: Context<CreateRewardPoolDual>,
        pool_size: u64,
        mainnet_percentage: u8,
        er_percentage: u8,
        distribution_type: RewardDistributionType,
    ) -> Result<()> {
        instructions::create_reward_pool_dual::handler(ctx, pool_size, mainnet_percentage, er_percentage, distribution_type)
    }

    /// Distribute rewards with environment routing
    pub fn distribute_rewards_dual(
        ctx: Context<DistributeRewardsDual>,
        recipients: Vec<RewardRecipient>,
        force_environment: Option<ExecutionEnvironment>,
    ) -> Result<()> {
        instructions::distribute_rewards_dual::handler(ctx, recipients, force_environment)
    }
}

/// Dual-mode token operation types
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum TokenOperationType {
    Transfer,
    Stake,
    Unstake,
    ClaimRewards,
    Mint,
    Burn,
    Bridge,
    Allocate,
    Settle,
}

/// ER token operation for settlement
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ErTokenOperation {
    pub operation_type: TokenOperationType,
    pub amount: u64,
    pub from_account: Pubkey,
    pub to_account: Option<Pubkey>,
    pub timestamp: i64,
    pub transaction_hash: String,
    pub gas_used: u64,
}

/// Reward recipient with environment preference
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RewardRecipient {
    pub recipient: Pubkey,
    pub amount: u64,
    pub preferred_environment: ExecutionEnvironment,
}

// Account contexts for dual-mode operations
#[derive(Accounts)]
#[instruction(decimals: u8)]
pub struct InitializeTokenDual<'info> {
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
        seeds = [b"mint_authority_dual"],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,
    
    #[account(
        init,
        payer = authority,
        space = TokenVaultDual::LEN,
        seeds = [b"token_vault_dual"],
        bump
    )]
    pub token_vault_dual: Account<'info, TokenVaultDual>,

    #[account(
        init,
        payer = authority,
        space = DualModeConfig::LEN,
        seeds = [b"dual_mode_config"],
        bump
    )]
    pub dual_mode_config: Account<'info, DualModeConfig>,

    #[account(
        init,
        payer = authority,
        space = RouterConfig::LEN,
        seeds = [b"token_router"],
        bump
    )]
    pub token_router: Account<'info, RouterConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RouteTokenOperation<'info> {
    #[account(
        seeds = [b"dual_mode_config"],
        bump = dual_mode_config.bump
    )]
    pub dual_mode_config: Account<'info, DualModeConfig>,

    #[account(
        mut,
        seeds = [b"token_router"],
        bump = token_router.bump
    )]
    pub token_router: Account<'info, RouterConfig>,

    #[account(
        init,
        payer = user,
        space = TransactionRoute::LEN,
        seeds = [b"token_route", user.key().as_ref(), &Clock::get()?.unix_timestamp.to_le_bytes()],
        bump
    )]
    pub transaction_route: Account<'info, TransactionRoute>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintTokensMainnet<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    
    /// CHECK: This is the mint authority PDA
    #[account(
        seeds = [b"mint_authority_dual"],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,
    
    #[account(
        mut,
        seeds = [b"token_vault_dual"],
        bump
    )]
    pub token_vault_dual: Account<'info, TokenVaultDual>,

    #[account(
        seeds = [b"dual_mode_config"],
        bump = dual_mode_config.bump,
        constraint = dual_mode_config.mainnet_enabled
    )]
    pub dual_mode_config: Account<'info, DualModeConfig>,
    
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
pub struct AllocateTokensEr<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"token_vault_dual"],
        bump
    )]
    pub token_vault_dual: Account<'info, TokenVaultDual>,

    #[account(
        seeds = [b"dual_mode_config"],
        bump = dual_mode_config.bump,
        constraint = dual_mode_config.er_enabled
    )]
    pub dual_mode_config: Account<'info, DualModeConfig>,

    #[account(
        init,
        payer = user,
        space = ErTokenAllocation::LEN,
        seeds = [b"er_allocation", user.key().as_ref(), er_session_id.as_bytes()],
        bump
    )]
    pub er_allocation: Account<'info, ErTokenAllocation>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeTokensDual<'info> {
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
        space = StakeAccountDual::LEN,
        seeds = [b"stake_dual", staker.key().as_ref()],
        bump
    )]
    pub stake_account_dual: Account<'info, StakeAccountDual>,
    
    #[account(
        init,
        payer = staker,
        associated_token::mint = mint,
        associated_token::authority = stake_vault_authority
    )]
    pub stake_vault: Account<'info, TokenAccount>,
    
    /// CHECK: This is the stake vault authority PDA
    #[account(
        seeds = [b"stake_vault_authority_dual"],
        bump
    )]
    pub stake_vault_authority: UncheckedAccount<'info>,

    #[account(
        seeds = [b"dual_mode_config"],
        bump = dual_mode_config.bump
    )]
    pub dual_mode_config: Account<'info, DualModeConfig>,
    
    #[account(mut)]
    pub staker: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRewardsDual<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = claimer
    )]
    pub claimer_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"stake_dual", claimer.key().as_ref()],
        bump
    )]
    pub stake_account_dual: Account<'info, StakeAccountDual>,

    #[account(
        mut,
        seeds = [b"token_vault_dual"],
        bump
    )]
    pub token_vault_dual: Account<'info, TokenVaultDual>,
    
    /// CHECK: This is the mint authority PDA
    #[account(
        seeds = [b"mint_authority_dual"],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub claimer: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SettleErOperations<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"token_vault_dual"],
        bump
    )]
    pub token_vault_dual: Account<'info, TokenVaultDual>,

    #[account(
        mut,
        seeds = [b"er_allocation", authority.key().as_ref(), er_session_id.as_bytes()],
        bump,
        close = authority
    )]
    pub er_allocation: Account<'info, ErTokenAllocation>,

    #[account(
        seeds = [b"dual_mode_config"],
        bump = dual_mode_config.bump
    )]
    pub dual_mode_config: Account<'info, DualModeConfig>,

    #[account(
        init,
        payer = authority,
        space = ErSettlement::LEN,
        seeds = [b"er_settlement", er_session_id.as_bytes()],
        bump
    )]
    pub er_settlement: Account<'info, ErSettlement>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BridgeTokens<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"token_vault_dual"],
        bump
    )]
    pub token_vault_dual: Account<'info, TokenVaultDual>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = user,
        space = TokenBridge::LEN,
        seeds = [b"token_bridge", user.key().as_ref(), &Clock::get()?.unix_timestamp.to_le_bytes()],
        bump
    )]
    pub token_bridge: Account<'info, TokenBridge>,

    #[account(
        seeds = [b"dual_mode_config"],
        bump = dual_mode_config.bump
    )]
    pub dual_mode_config: Account<'info, DualModeConfig>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EmergencyFreezeDual<'info> {
    #[account(
        mut,
        seeds = [b"token_vault_dual"],
        bump = token_vault_dual.bump,
        constraint = token_vault_dual.authority == authority.key()
    )]
    pub token_vault_dual: Account<'info, TokenVaultDual>,

    #[account(
        mut,
        seeds = [b"dual_mode_config"],
        bump = dual_mode_config.bump,
        constraint = dual_mode_config.authority == authority.key()
    )]
    pub dual_mode_config: Account<'info, DualModeConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreateRewardPoolDual<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = authority,
        space = RewardPoolDual::LEN,
        seeds = [b"reward_pool_dual", authority.key().as_ref(), &Clock::get()?.unix_timestamp.to_le_bytes()],
        bump
    )]
    pub reward_pool_dual: Account<'info, RewardPoolDual>,
    
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = pool_vault_authority
    )]
    pub pool_vault: Account<'info, TokenAccount>,
    
    /// CHECK: This is the pool vault authority PDA
    #[account(
        seeds = [b"pool_vault_authority_dual", reward_pool_dual.key().as_ref()],
        bump
    )]
    pub pool_vault_authority: UncheckedAccount<'info>,
    
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = authority
    )]
    pub authority_token_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"dual_mode_config"],
        bump = dual_mode_config.bump
    )]
    pub dual_mode_config: Account<'info, DualModeConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributeRewardsDual<'info> {
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    
    #[account(
        mut,
        seeds = [b"reward_pool_dual", reward_pool_dual.authority.as_ref(), &reward_pool_dual.created_at.to_le_bytes()],
        bump = reward_pool_dual.bump
    )]
    pub reward_pool_dual: Account<'info, RewardPoolDual>,
    
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = pool_vault_authority
    )]
    pub pool_vault: Account<'info, TokenAccount>,
    
    /// CHECK: This is the pool vault authority PDA
    #[account(
        seeds = [b"pool_vault_authority_dual", reward_pool_dual.key().as_ref()],
        bump
    )]
    pub pool_vault_authority: UncheckedAccount<'info>,

    #[account(
        seeds = [b"dual_mode_config"],
        bump = dual_mode_config.bump
    )]
    pub dual_mode_config: Account<'info, DualModeConfig>,
    
    #[account(
        mut,
        constraint = authority.key() == reward_pool_dual.authority
    )]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}