use anchor_lang::prelude::*;
use anchor_spl::token::{self, MintTo};
use crate::state::TokenVault;

pub fn handler(
    ctx: Context<crate::InitializeToken>,
    decimals: u8,
    initial_supply: u64,
) -> Result<()> {
    let token_vault = &mut ctx.accounts.token_vault;
    let clock = Clock::get()?;
    
    // Initialize token vault state
    token_vault.authority = ctx.accounts.authority.key();
    token_vault.mint = ctx.accounts.mint.key();
    token_vault.total_supply = initial_supply;
    token_vault.total_burned = 0;
    token_vault.total_staked = 0;
    token_vault.created_at = clock.unix_timestamp;
    token_vault.bump = ctx.bumps.token_vault;
    
    // Mint initial supply if specified
    if initial_supply > 0 {
        let mint_authority_bump = ctx.bumps.mint_authority;
        let signer_seeds = &[
            b"mint_authority".as_ref(),
            &[mint_authority_bump],
        ];
        
        let mint_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.mint.to_account_info(), // Would mint to treasury in real implementation
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            &[signer_seeds],
        );
        
        token::mint_to(mint_ctx, initial_supply)?;
    }
    
    emit!(TokenInitialized {
        mint: ctx.accounts.mint.key(),
        authority: ctx.accounts.authority.key(),
        decimals,
        initial_supply,
        timestamp: clock.unix_timestamp,
    });
    
    msg!(
        "SOL Duel token initialized with mint: {}, decimals: {}, initial supply: {}",
        ctx.accounts.mint.key(),
        decimals,
        initial_supply
    );
    
    Ok(())
}

#[event]
pub struct TokenInitialized {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub decimals: u8,
    pub initial_supply: u64,
    pub timestamp: i64,
}