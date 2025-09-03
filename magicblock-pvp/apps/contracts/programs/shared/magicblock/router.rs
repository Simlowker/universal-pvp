use anchor_lang::prelude::*;
use crate::shared::GameError;

/// Magic Router for directing transactions to appropriate execution environment
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum ExecutionEnvironment {
    Mainnet,
    EphemeralRollup,
    Both, // Requires coordination
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum TransactionType {
    // Game operations (ER)
    JoinMatch,
    StartMatch,
    ExecuteAction,
    EndTurn,
    FinishMatch,
    
    // Economic operations (Mainnet)
    TokenTransfer,
    StakeTokens,
    ClaimRewards,
    
    // NFT operations (Mixed)
    MintNft,
    UpdateNft,
    TransferNft,
    
    // Administrative (Mainnet)
    InitializeGame,
    EmergencyStop,
}

#[account]
pub struct RouterConfig {
    pub authority: Pubkey,
    pub default_er_program: Pubkey,
    pub mainnet_programs: Vec<MainnetProgram>,
    pub routing_rules: Vec<RoutingRule>,
    pub fee_config: FeeConfig,
    pub is_active: bool,
    pub bump: u8,
}

impl RouterConfig {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // default_er_program
        4 + (10 * MainnetProgram::LEN) + // mainnet_programs (max 10)
        4 + (20 * RoutingRule::LEN) + // routing_rules (max 20)
        FeeConfig::LEN + // fee_config
        1 + // is_active
        1; // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MainnetProgram {
    pub program_id: Pubkey,
    pub program_type: ProgramType,
    pub is_enabled: bool,
}

impl MainnetProgram {
    pub const LEN: usize = 32 + // program_id
        1 + // program_type
        1; // is_enabled
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum ProgramType {
    Game,
    Token,
    Nft,
    Staking,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RoutingRule {
    pub transaction_type: TransactionType,
    pub execution_environment: ExecutionEnvironment,
    pub min_stake_required: u64,
    pub gas_limit: u64,
    pub is_enabled: bool,
}

impl RoutingRule {
    pub const LEN: usize = 1 + // transaction_type
        1 + // execution_environment
        8 + // min_stake_required
        8 + // gas_limit
        1; // is_enabled
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct FeeConfig {
    pub er_base_fee: u64,
    pub mainnet_base_fee: u64,
    pub cross_chain_fee: u64,
    pub fee_collector: Pubkey,
}

impl FeeConfig {
    pub const LEN: usize = 8 + // er_base_fee
        8 + // mainnet_base_fee
        8 + // cross_chain_fee
        32; // fee_collector
}

#[account]
pub struct TransactionRoute {
    pub transaction_id: u64,
    pub transaction_type: TransactionType,
    pub execution_environment: ExecutionEnvironment,
    pub requester: Pubkey,
    pub target_program: Pubkey,
    pub status: RouteStatus,
    pub created_at: i64,
    pub executed_at: Option<i64>,
    pub gas_used: u64,
    pub fees_paid: u64,
    pub error_code: Option<u32>,
    pub bump: u8,
}

impl TransactionRoute {
    pub const LEN: usize = 8 + // discriminator
        8 + // transaction_id
        1 + // transaction_type
        1 + // execution_environment
        32 + // requester
        32 + // target_program
        1 + // status
        8 + // created_at
        1 + 8 + // executed_at (Option<i64>)
        8 + // gas_used
        8 + // fees_paid
        1 + 4 + // error_code (Option<u32>)
        1; // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum RouteStatus {
    Pending,
    Routed,
    Executing,
    Completed,
    Failed,
    Rollback,
}

/// Router instruction contexts
#[derive(Accounts)]
pub struct InitializeRouter<'info> {
    #[account(
        init,
        payer = authority,
        space = RouterConfig::LEN,
        seeds = [b"router_config"],
        bump
    )]
    pub router_config: Account<'info, RouterConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RouteTransaction<'info> {
    #[account(
        seeds = [b"router_config"],
        bump = router_config.bump,
        constraint = router_config.is_active
    )]
    pub router_config: Account<'info, RouterConfig>,

    #[account(
        init,
        payer = user,
        space = TransactionRoute::LEN,
        seeds = [b"transaction_route", user.key().as_ref(), &Clock::get()?.unix_timestamp.to_le_bytes()],
        bump
    )]
    pub transaction_route: Account<'info, TransactionRoute>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteRoute<'info> {
    #[account(
        mut,
        seeds = [b"transaction_route", transaction_route.requester.as_ref(), &transaction_route.created_at.to_le_bytes()],
        bump = transaction_route.bump
    )]
    pub transaction_route: Account<'info, TransactionRoute>,

    /// CHECK: Target program to execute on
    pub target_program: UncheckedAccount<'info>,

    #[account(mut)]
    pub executor: Signer<'info>,
}

/// Router implementation
pub mod router_handlers {
    use super::*;

    pub fn initialize_router(
        ctx: Context<InitializeRouter>,
        default_er_program: Pubkey,
        fee_config: FeeConfig,
    ) -> Result<()> {
        let router_config = &mut ctx.accounts.router_config;
        
        router_config.authority = ctx.accounts.authority.key();
        router_config.default_er_program = default_er_program;
        router_config.mainnet_programs = Vec::new();
        router_config.routing_rules = create_default_routing_rules();
        router_config.fee_config = fee_config;
        router_config.is_active = true;
        router_config.bump = ctx.bumps.router_config;

        Ok(())
    }

    pub fn route_transaction(
        ctx: Context<RouteTransaction>,
        transaction_type: TransactionType,
        target_program: Pubkey,
    ) -> Result<()> {
        let router_config = &ctx.accounts.router_config;
        let transaction_route = &mut ctx.accounts.transaction_route;
        let current_time = Clock::get()?.unix_timestamp;

        // Find routing rule for this transaction type
        let routing_rule = router_config.routing_rules
            .iter()
            .find(|rule| rule.transaction_type == transaction_type && rule.is_enabled)
            .ok_or(GameError::InvalidMove)?;

        // Calculate fees based on execution environment
        let fees = match routing_rule.execution_environment {
            ExecutionEnvironment::Mainnet => router_config.fee_config.mainnet_base_fee,
            ExecutionEnvironment::EphemeralRollup => router_config.fee_config.er_base_fee,
            ExecutionEnvironment::Both => {
                router_config.fee_config.mainnet_base_fee + router_config.fee_config.cross_chain_fee
            }
        };

        // Initialize transaction route
        transaction_route.transaction_id = current_time as u64; // Simple ID generation
        transaction_route.transaction_type = transaction_type;
        transaction_route.execution_environment = routing_rule.execution_environment;
        transaction_route.requester = ctx.accounts.user.key();
        transaction_route.target_program = target_program;
        transaction_route.status = RouteStatus::Pending;
        transaction_route.created_at = current_time;
        transaction_route.executed_at = None;
        transaction_route.gas_used = 0;
        transaction_route.fees_paid = fees;
        transaction_route.error_code = None;
        transaction_route.bump = ctx.bumps.transaction_route;

        Ok(())
    }

    pub fn execute_route(ctx: Context<ExecuteRoute>) -> Result<()> {
        let transaction_route = &mut ctx.accounts.transaction_route;
        let current_time = Clock::get()?.unix_timestamp;

        // Update route status
        transaction_route.status = RouteStatus::Executing;
        transaction_route.executed_at = Some(current_time);

        // Route logic would be implemented here
        // For now, mark as completed
        transaction_route.status = RouteStatus::Completed;

        Ok(())
    }

    fn create_default_routing_rules() -> Vec<RoutingRule> {
        vec![
            // Game operations go to ER
            RoutingRule {
                transaction_type: TransactionType::JoinMatch,
                execution_environment: ExecutionEnvironment::EphemeralRollup,
                min_stake_required: 0,
                gas_limit: 100_000,
                is_enabled: true,
            },
            RoutingRule {
                transaction_type: TransactionType::StartMatch,
                execution_environment: ExecutionEnvironment::EphemeralRollup,
                min_stake_required: 0,
                gas_limit: 200_000,
                is_enabled: true,
            },
            RoutingRule {
                transaction_type: TransactionType::ExecuteAction,
                execution_environment: ExecutionEnvironment::EphemeralRollup,
                min_stake_required: 0,
                gas_limit: 150_000,
                is_enabled: true,
            },
            RoutingRule {
                transaction_type: TransactionType::EndTurn,
                execution_environment: ExecutionEnvironment::EphemeralRollup,
                min_stake_required: 0,
                gas_limit: 50_000,
                is_enabled: true,
            },
            RoutingRule {
                transaction_type: TransactionType::FinishMatch,
                execution_environment: ExecutionEnvironment::Both,
                min_stake_required: 0,
                gas_limit: 300_000,
                is_enabled: true,
            },
            // Economic operations go to Mainnet
            RoutingRule {
                transaction_type: TransactionType::TokenTransfer,
                execution_environment: ExecutionEnvironment::Mainnet,
                min_stake_required: 0,
                gas_limit: 100_000,
                is_enabled: true,
            },
            RoutingRule {
                transaction_type: TransactionType::StakeTokens,
                execution_environment: ExecutionEnvironment::Mainnet,
                min_stake_required: 1_000_000, // 0.001 SOL minimum
                gas_limit: 200_000,
                is_enabled: true,
            },
            RoutingRule {
                transaction_type: TransactionType::ClaimRewards,
                execution_environment: ExecutionEnvironment::Mainnet,
                min_stake_required: 0,
                gas_limit: 150_000,
                is_enabled: true,
            },
            // NFT operations are mixed
            RoutingRule {
                transaction_type: TransactionType::MintNft,
                execution_environment: ExecutionEnvironment::Mainnet,
                min_stake_required: 5_000_000, // 0.005 SOL for minting
                gas_limit: 250_000,
                is_enabled: true,
            },
            RoutingRule {
                transaction_type: TransactionType::UpdateNft,
                execution_environment: ExecutionEnvironment::Both,
                min_stake_required: 0,
                gas_limit: 200_000,
                is_enabled: true,
            },
        ]
    }
}