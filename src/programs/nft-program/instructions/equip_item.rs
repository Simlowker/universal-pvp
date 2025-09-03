use anchor_lang::prelude::*;
use crate::state::{PlayerNft, ItemNft, ItemSlot};
use crate::shared::GameError;

pub fn handler(
    ctx: Context<crate::EquipItem>,
    item_slot: ItemSlot,
) -> Result<()> {
    let player_nft = &mut ctx.accounts.player_nft;
    let item_nft = &ctx.accounts.item_nft;
    
    // Validate item can be equipped
    if !player_nft.can_equip_item(item_nft, item_slot) {
        return Err(GameError::InvalidMove.into());
    }
    
    // Check if item is broken
    if item_nft.is_broken() {
        return Err(GameError::InvalidCombatParams.into());
    }
    
    // Equip the item
    player_nft.equip_item(item_nft.mint, item_slot)?;
    
    emit!(ItemEquipped {
        player: ctx.accounts.player.key(),
        item_mint: item_nft.mint,
        item_type: item_nft.item_type,
        slot: item_slot,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!(
        "Player {} equipped item {} in slot {:?}",
        ctx.accounts.player.key(),
        item_nft.mint,
        item_slot
    );
    
    Ok(())
}

#[event]
pub struct ItemEquipped {
    pub player: Pubkey,
    pub item_mint: Pubkey,
    pub item_type: crate::state::ItemType,
    pub slot: ItemSlot,
    pub timestamp: i64,
}