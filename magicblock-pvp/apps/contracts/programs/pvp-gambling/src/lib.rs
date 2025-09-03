use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

pub mod error;
pub mod instructions;
pub mod state;
pub mod vrf;
pub mod utils;

use error::*;
use instructions::*;
use state::*;

declare_id!("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHfC");

/// PvP Gambling Program with VRF-based winner selection
#[program]
pub mod pvp_gambling {
    use super::*;

    /// Initialize a new game escrow with two players
    pub fn initialize_game(
        ctx: Context<InitializeGame>,
        game_id: u64,
        bet_amount: u64,
        player1: Pubkey,
        player2: Pubkey,
        gasless_mode: bool,
        max_cost_cap: Option<u64>,
    ) -> Result<()> {
        instructions::initialize_game::handler(
            ctx,
            game_id,
            bet_amount,
            player1,
            player2,
            gasless_mode,
            max_cost_cap,
        )
    }

    /// Deposit tokens into the escrow with cost cap validation
    pub fn deposit_cap(
        ctx: Context<DepositCap>,
        amount: u64,
    ) -> Result<()> {
        instructions::deposit_cap::handler(ctx, amount)
    }

    /// Settle game using VRF-based winner selection
    pub fn settle_game(
        ctx: Context<SettleGame>,
        vrf_proof: [u8; 80],
        alpha_string: Vec<u8>,
    ) -> Result<()> {
        instructions::settle_game::handler(ctx, vrf_proof, alpha_string)
    }

    /// Abort game and return funds if conditions are met
    pub fn abort_game(ctx: Context<AbortGame>) -> Result<()> {
        instructions::abort_game::handler(ctx)
    }
}

/// Security advisory
#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "PvP Gambling",
    project_url: "https://github.com/your-org/pvp-gambling",
    contacts: "email:security@your-org.com",
    policy: "https://github.com/your-org/pvp-gambling/security/policy",
    preferred_languages: "en",
    source_code: "https://github.com/your-org/pvp-gambling"
}