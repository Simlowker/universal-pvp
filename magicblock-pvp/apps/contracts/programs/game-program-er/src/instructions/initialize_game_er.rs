use anchor_lang::prelude::*;
use crate::state::*;
use shared::magicblock::{delegation::*, router::*, state_management::*};

pub fn handler(
    ctx: Context<super::InitializeGameEr>,
    upgrade_authority: Pubkey,
    er_program_id: Pubkey,
) -> Result<()> {
    let game_state_er = &mut ctx.accounts.game_state_er;
    let delegation_state = &mut ctx.accounts.delegation_state;
    let router_config = &mut ctx.accounts.router_config;
    let current_time = Clock::get()?.unix_timestamp;

    // Initialize enhanced game state
    game_state_er.upgrade_authority = upgrade_authority;
    game_state_er.er_program_id = er_program_id;
    game_state_er.mainnet_program_id = crate::ID; // This program can also run on mainnet
    game_state_er.total_matches = 0;
    game_state_er.total_players = 0;
    game_state_er.total_rewards_distributed = 0;
    game_state_er.total_er_sessions = 0;
    game_state_er.successful_commits = 0;
    game_state_er.failed_commits = 0;
    game_state_er.paused = false;
    game_state_er.er_enabled = true;
    game_state_er.delegation_expiry_default = 3600; // 1 hour default
    game_state_er.max_concurrent_matches = 100;
    game_state_er.current_active_matches = 0;
    game_state_er.bump = ctx.bumps.game_state_er;

    // Initialize delegation state
    delegation_state.delegator = ctx.accounts.authority.key();
    delegation_state.ephemeral_rollup = er_program_id;
    delegation_state.original_owner = ctx.accounts.authority.key();
    delegation_state.delegated_accounts = Vec::new();
    delegation_state.delegation_timestamp = current_time;
    delegation_state.expiry_timestamp = Some(current_time + game_state_er.delegation_expiry_default);
    delegation_state.is_active = true;
    delegation_state.pending_commits = Vec::new();
    delegation_state.bump = ctx.bumps.delegation_state;

    // Initialize router config
    let fee_config = FeeConfig {
        er_base_fee: 5_000, // 0.000005 SOL
        mainnet_base_fee: 50_000, // 0.00005 SOL
        cross_chain_fee: 25_000, // 0.000025 SOL
        fee_collector: upgrade_authority,
    };

    router_config.authority = ctx.accounts.authority.key();
    router_config.default_er_program = er_program_id;
    router_config.mainnet_programs = vec![
        MainnetProgram {
            program_id: game_state_er.mainnet_program_id,
            program_type: ProgramType::Game,
            is_enabled: true,
        }
    ];
    router_config.routing_rules = create_default_routing_rules();
    router_config.fee_config = fee_config;
    router_config.is_active = true;
    router_config.bump = ctx.bumps.router_config;

    msg!("Game ER initialized with authority: {}, ER program: {}", upgrade_authority, er_program_id);

    Ok(())
}

fn create_default_routing_rules() -> Vec<RoutingRule> {
    vec![
        // Game operations go to ER by default
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
    ]
}