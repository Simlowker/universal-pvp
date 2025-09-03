use anchor_lang::prelude::*;
use anchor_spl::token::{self, MintTo};
use crate::state::TokenVault;
use crate::shared::GameError;

pub fn handler(ctx: Context<crate::MintTokens>, amount: u64) -> Result<()> {
    let token_vault = &mut ctx.accounts.token_vault;
    
    // Only vault authority can mint tokens
    if token_vault.authority != ctx.accounts.authority.key() {
        return Err(GameError::UnauthorizedPlayer.into());
    }
    
    if amount == 0 {
        return Err(GameError::InvalidCombatParams.into());
    }
    
    // Mint tokens using PDA authority
    let mint_authority_bump = ctx.bumps.mint_authority;
    let signer_seeds = &[
        b"mint_authority".as_ref(),
        &[mint_authority_bump],
    ];
    
    let mint_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        },
        &[signer_seeds],
    );
    
    token::mint_to(mint_ctx, amount)?;
    
    // Update vault state
    token_vault.total_supply = token_vault.total_supply
        .checked_add(amount)
        .ok_or(GameError::ArithmeticOverflow)?;
    
    emit!(TokensMinted {
        mint: ctx.accounts.mint.key(),
        recipient: ctx.accounts.recipient.key(),
        amount,
        total_supply: token_vault.total_supply,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!(
        "Minted {} tokens to {}. Total supply: {}",
        amount,
        ctx.accounts.recipient.key(),
        token_vault.total_supply
    );
    
    Ok(())
}

#[event]
pub struct TokensMinted {
    pub mint: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub total_supply: u64,
    pub timestamp: i64,
}