use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Token, TokenAccount, Mint},
    associated_token::AssociatedToken,
    metadata::{
        Metadata,
        MetadataAccount,
        mpl_token_metadata::{
            self,
            instructions::{CreateV1, UpdateV1, TransferV1},
            types::{DataV2, Collection, Uses, CollectionDetails},
        },
    },
};

pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

// Import shared modules
use crate::shared::GameError;

declare_id!("NFTExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

#[program]
pub mod sol_duel_nft {
    use super::*;

    /// Initialize the NFT collection
    pub fn initialize_collection(
        ctx: Context<InitializeCollection>,
        name: String,
        symbol: String,
        uri: String,
        collection_size: Option<u64>,
    ) -> Result<()> {
        instructions::initialize_collection::handler(ctx, name, symbol, uri, collection_size)
    }

    /// Create a player profile NFT
    pub fn create_player_nft(
        ctx: Context<CreatePlayerNft>,
        name: String,
        symbol: String,
        uri: String,
        player_class: crate::shared::PlayerClass,
        level: u32,
    ) -> Result<()> {
        instructions::create_player_nft::handler(ctx, name, symbol, uri, player_class, level)
    }

    /// Update player NFT metadata (level up, stats, etc.)
    pub fn update_player_nft(
        ctx: Context<UpdatePlayerNft>,
        new_uri: String,
        level: u32,
        experience: u64,
    ) -> Result<()> {
        instructions::update_player_nft::handler(ctx, new_uri, level, experience)
    }

    /// Create achievement NFT
    pub fn create_achievement_nft(
        ctx: Context<CreateAchievementNft>,
        name: String,
        symbol: String,
        uri: String,
        achievement_type: AchievementType,
        rarity: Rarity,
    ) -> Result<()> {
        instructions::create_achievement_nft::handler(ctx, name, symbol, uri, achievement_type, rarity)
    }

    /// Transfer NFT between players
    pub fn transfer_nft(ctx: Context<TransferNft>) -> Result<()> {
        instructions::transfer_nft::handler(ctx)
    }

    /// Burn NFT (for special mechanics)
    pub fn burn_nft(ctx: Context<BurnNft>) -> Result<()> {
        instructions::burn_nft::handler(ctx)
    }

    /// Create item NFT (weapons, armor, etc.)
    pub fn create_item_nft(
        ctx: Context<CreateItemNft>,
        name: String,
        symbol: String,
        uri: String,
        item_type: ItemType,
        stats: ItemStats,
        rarity: Rarity,
    ) -> Result<()> {
        instructions::create_item_nft::handler(ctx, name, symbol, uri, item_type, stats, rarity)
    }

    /// Equip item NFT to player
    pub fn equip_item(
        ctx: Context<EquipItem>,
        item_slot: ItemSlot,
    ) -> Result<()> {
        instructions::equip_item::handler(ctx, item_slot)
    }

    /// Unequip item NFT from player
    pub fn unequip_item(
        ctx: Context<UnequipItem>,
        item_slot: ItemSlot,
    ) -> Result<()> {
        instructions::unequip_item::handler(ctx, item_slot)
    }
}

#[derive(Accounts)]
pub struct InitializeCollection<'info> {
    #[account(
        init,
        payer = authority,
        space = NftCollection::LEN,
        seeds = [b"collection"],
        bump
    )]
    pub collection: Account<'info, NftCollection>,
    
    #[account(
        init,
        payer = authority,
        mint::decimals = 0,
        mint::authority = collection_authority,
        mint::freeze_authority = collection_authority,
    )]
    pub collection_mint: Account<'info, Mint>,
    
    /// CHECK: This is the collection authority PDA
    #[account(
        seeds = [b"collection_authority"],
        bump
    )]
    pub collection_authority: UncheckedAccount<'info>,
    
    #[account(
        init,
        payer = authority,
        associated_token::mint = collection_mint,
        associated_token::authority = collection_authority
    )]
    pub collection_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: This account will be initialized by Metaplex
    #[account(mut)]
    pub collection_metadata: UncheckedAccount<'info>,
    
    /// CHECK: This account will be initialized by Metaplex
    #[account(mut)]
    pub collection_master_edition: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CreatePlayerNft<'info> {
    #[account(
        init,
        payer = player,
        space = PlayerNft::LEN,
        seeds = [b"player_nft", player.key().as_ref()],
        bump
    )]
    pub player_nft: Account<'info, PlayerNft>,
    
    #[account(
        init,
        payer = player,
        mint::decimals = 0,
        mint::authority = nft_authority,
        mint::freeze_authority = nft_authority,
    )]
    pub nft_mint: Account<'info, Mint>,
    
    /// CHECK: This is the NFT mint authority PDA
    #[account(
        seeds = [b"nft_authority"],
        bump
    )]
    pub nft_authority: UncheckedAccount<'info>,
    
    #[account(
        init,
        payer = player,
        associated_token::mint = nft_mint,
        associated_token::authority = player
    )]
    pub player_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: This account will be initialized by Metaplex
    #[account(mut)]
    pub nft_metadata: UncheckedAccount<'info>,
    
    /// CHECK: This account will be initialized by Metaplex
    #[account(mut)]
    pub nft_master_edition: UncheckedAccount<'info>,
    
    #[account(
        seeds = [b"collection"],
        bump
    )]
    pub collection: Account<'info, NftCollection>,
    
    #[account(mut)]
    pub collection_mint: Account<'info, Mint>,
    
    /// CHECK: Collection metadata account
    #[account(mut)]
    pub collection_metadata: UncheckedAccount<'info>,
    
    /// CHECK: Collection master edition account
    #[account(mut)]
    pub collection_master_edition: UncheckedAccount<'info>,
    
    /// CHECK: This is the collection authority PDA
    #[account(
        seeds = [b"collection_authority"],
        bump
    )]
    pub collection_authority: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub player: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdatePlayerNft<'info> {
    #[account(
        mut,
        seeds = [b"player_nft", player.key().as_ref()],
        bump = player_nft.bump
    )]
    pub player_nft: Account<'info, PlayerNft>,
    
    pub nft_mint: Account<'info, Mint>,
    
    /// CHECK: This account will be updated by Metaplex
    #[account(mut)]
    pub nft_metadata: UncheckedAccount<'info>,
    
    /// CHECK: This is the NFT update authority PDA
    #[account(
        seeds = [b"nft_authority"],
        bump
    )]
    pub nft_authority: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub player: Signer<'info>,
    
    pub token_metadata_program: Program<'info, Metadata>,
}

#[derive(Accounts)]
pub struct CreateAchievementNft<'info> {
    #[account(
        init,
        payer = player,
        space = AchievementNft::LEN,
        seeds = [b"achievement", player.key().as_ref(), &Clock::get()?.unix_timestamp.to_le_bytes()],
        bump
    )]
    pub achievement_nft: Account<'info, AchievementNft>,
    
    #[account(
        init,
        payer = player,
        mint::decimals = 0,
        mint::authority = nft_authority,
        mint::freeze_authority = nft_authority,
    )]
    pub nft_mint: Account<'info, Mint>,
    
    /// CHECK: This is the NFT mint authority PDA
    #[account(
        seeds = [b"nft_authority"],
        bump
    )]
    pub nft_authority: UncheckedAccount<'info>,
    
    #[account(
        init,
        payer = player,
        associated_token::mint = nft_mint,
        associated_token::authority = player
    )]
    pub player_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: This account will be initialized by Metaplex
    #[account(mut)]
    pub nft_metadata: UncheckedAccount<'info>,
    
    /// CHECK: This account will be initialized by Metaplex
    #[account(mut)]
    pub nft_master_edition: UncheckedAccount<'info>,
    
    #[account(
        seeds = [b"collection"],
        bump
    )]
    pub collection: Account<'info, NftCollection>,
    
    #[account(mut)]
    pub collection_mint: Account<'info, Mint>,
    
    /// CHECK: Collection metadata account
    #[account(mut)]
    pub collection_metadata: UncheckedAccount<'info>,
    
    /// CHECK: Collection master edition account
    #[account(mut)]
    pub collection_master_edition: UncheckedAccount<'info>,
    
    /// CHECK: This is the collection authority PDA
    #[account(
        seeds = [b"collection_authority"],
        bump
    )]
    pub collection_authority: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub player: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CreateItemNft<'info> {
    #[account(
        init,
        payer = player,
        space = ItemNft::LEN,
        seeds = [b"item", player.key().as_ref(), &Clock::get()?.unix_timestamp.to_le_bytes()],
        bump
    )]
    pub item_nft: Account<'info, ItemNft>,
    
    #[account(
        init,
        payer = player,
        mint::decimals = 0,
        mint::authority = nft_authority,
        mint::freeze_authority = nft_authority,
    )]
    pub nft_mint: Account<'info, Mint>,
    
    /// CHECK: This is the NFT mint authority PDA
    #[account(
        seeds = [b"nft_authority"],
        bump
    )]
    pub nft_authority: UncheckedAccount<'info>,
    
    #[account(
        init,
        payer = player,
        associated_token::mint = nft_mint,
        associated_token::authority = player
    )]
    pub player_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: This account will be initialized by Metaplex
    #[account(mut)]
    pub nft_metadata: UncheckedAccount<'info>,
    
    /// CHECK: This account will be initialized by Metaplex
    #[account(mut)]
    pub nft_master_edition: UncheckedAccount<'info>,
    
    #[account(
        seeds = [b"collection"],
        bump
    )]
    pub collection: Account<'info, NftCollection>,
    
    #[account(mut)]
    pub collection_mint: Account<'info, Mint>,
    
    /// CHECK: Collection metadata account
    #[account(mut)]
    pub collection_metadata: UncheckedAccount<'info>,
    
    /// CHECK: Collection master edition account
    #[account(mut)]
    pub collection_master_edition: UncheckedAccount<'info>,
    
    /// CHECK: This is the collection authority PDA
    #[account(
        seeds = [b"collection_authority"],
        bump
    )]
    pub collection_authority: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub player: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct TransferNft<'info> {
    pub nft_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        associated_token::mint = nft_mint,
        associated_token::authority = current_owner
    )]
    pub current_owner_token_account: Account<'info, TokenAccount>,
    
    #[account(
        init_if_needed,
        payer = current_owner,
        associated_token::mint = nft_mint,
        associated_token::authority = new_owner
    )]
    pub new_owner_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: New owner account
    pub new_owner: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub current_owner: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BurnNft<'info> {
    #[account(mut)]
    pub nft_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        associated_token::mint = nft_mint,
        associated_token::authority = owner
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: This account will be closed by Metaplex
    #[account(mut)]
    pub nft_metadata: UncheckedAccount<'info>,
    
    /// CHECK: This account will be closed by Metaplex
    #[account(mut)]
    pub nft_master_edition: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub token_metadata_program: Program<'info, Metadata>,
}

#[derive(Accounts)]
pub struct EquipItem<'info> {
    #[account(
        mut,
        seeds = [b"player_nft", player.key().as_ref()],
        bump = player_nft.bump
    )]
    pub player_nft: Account<'info, PlayerNft>,
    
    #[account(
        seeds = [b"item", item_nft.owner.as_ref(), &item_nft.created_at.to_le_bytes()],
        bump = item_nft.bump,
        constraint = item_nft.owner == player.key()
    )]
    pub item_nft: Account<'info, ItemNft>,
    
    #[account(mut)]
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct UnequipItem<'info> {
    #[account(
        mut,
        seeds = [b"player_nft", player.key().as_ref()],
        bump = player_nft.bump
    )]
    pub player_nft: Account<'info, PlayerNft>,
    
    #[account(mut)]
    pub player: Signer<'info>,
}