use anchor_lang::prelude::*;
use anchor_spl::token::{self, MintTo};
use crate::state::NftCollection;

pub fn handler(
    ctx: Context<crate::InitializeCollection>,
    name: String,
    symbol: String,
    uri: String,
    collection_size: Option<u64>,
) -> Result<()> {
    let collection = &mut ctx.accounts.collection;
    let clock = Clock::get()?;
    
    // Validate inputs
    if name.len() > 64 || symbol.len() > 16 || uri.len() > 200 {
        return Err(crate::shared::GameError::InvalidNftMetadata.into());
    }
    
    // Initialize collection
    collection.authority = ctx.accounts.authority.key();
    collection.collection_mint = ctx.accounts.collection_mint.key();
    collection.name = name.clone();
    collection.symbol = symbol.clone();
    collection.uri = uri.clone();
    collection.size = collection_size;
    collection.items_minted = 0;
    collection.created_at = clock.unix_timestamp;
    collection.bump = ctx.bumps.collection;
    
    // Mint collection NFT to authority
    let collection_authority_bump = ctx.bumps.collection_authority;
    let signer_seeds = &[
        b"collection_authority".as_ref(),
        &[collection_authority_bump],
    ];
    
    let mint_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.collection_mint.to_account_info(),
            to: ctx.accounts.collection_token_account.to_account_info(),
            authority: ctx.accounts.collection_authority.to_account_info(),
        },
        &[signer_seeds],
    );
    
    token::mint_to(mint_ctx, 1)?;
    
    // TODO: Create Metaplex metadata for collection
    // This would use mpl_token_metadata::instructions::CreateV1
    
    emit!(CollectionInitialized {
        collection: ctx.accounts.collection.key(),
        mint: ctx.accounts.collection_mint.key(),
        name: name.clone(),
        symbol: symbol.clone(),
        size: collection_size,
        timestamp: clock.unix_timestamp,
    });
    
    msg!(
        "Collection '{}' initialized with mint: {}",
        name,
        ctx.accounts.collection_mint.key()
    );
    
    Ok(())
}

#[event]
pub struct CollectionInitialized {
    pub collection: Pubkey,
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub size: Option<u64>,
    pub timestamp: i64,
}