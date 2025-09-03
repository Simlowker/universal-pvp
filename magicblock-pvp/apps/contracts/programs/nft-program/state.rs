use anchor_lang::prelude::*;
use crate::shared::{PlayerClass, PlayerStats, MAX_USERNAME_LENGTH};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rarity {
    Common,
    Uncommon,
    Rare,
    Epic,
    Legendary,
    Mythic,
}

impl Rarity {
    pub fn multiplier(&self) -> f64 {
        match self {
            Rarity::Common => 1.0,
            Rarity::Uncommon => 1.1,
            Rarity::Rare => 1.25,
            Rarity::Epic => 1.5,
            Rarity::Legendary => 2.0,
            Rarity::Mythic => 3.0,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum AchievementType {
    FirstWin,
    WinStreak,
    HighDamage,
    Survivor,
    Champion,
    Legendary,
    Master,
    Immortal,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemType {
    Weapon,
    Armor,
    Accessory,
    Consumable,
    Special,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemSlot {
    MainHand,
    OffHand,
    Head,
    Chest,
    Legs,
    Feet,
    Ring,
    Necklace,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct ItemStats {
    pub attack_bonus: u32,
    pub defense_bonus: u32,
    pub health_bonus: u32,
    pub speed_bonus: u32,
    pub mana_bonus: u32,
    pub special_effect: u8, // Custom effect ID
}

impl ItemStats {
    pub fn apply_rarity_multiplier(&self, rarity: Rarity) -> ItemStats {
        let multiplier = rarity.multiplier() as f32;
        ItemStats {
            attack_bonus: (self.attack_bonus as f32 * multiplier) as u32,
            defense_bonus: (self.defense_bonus as f32 * multiplier) as u32,
            health_bonus: (self.health_bonus as f32 * multiplier) as u32,
            speed_bonus: (self.speed_bonus as f32 * multiplier) as u32,
            mana_bonus: (self.mana_bonus as f32 * multiplier) as u32,
            special_effect: self.special_effect,
        }
    }
}

#[account]
pub struct NftCollection {
    pub authority: Pubkey,
    pub collection_mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub size: Option<u64>,
    pub items_minted: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl NftCollection {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // collection_mint
        4 + 64 + // name (max 64 chars)
        4 + 16 + // symbol (max 16 chars)
        4 + 200 + // uri (max 200 chars)
        1 + 8 + // size (Option<u64>)
        8 + // items_minted
        8 + // created_at
        1; // bump
}

#[account]
pub struct PlayerNft {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub name: String,
    pub player_class: PlayerClass,
    pub level: u32,
    pub experience: u64,
    pub base_stats: PlayerStats,
    pub equipped_items: [Option<Pubkey>; 8], // 8 equipment slots
    pub total_matches: u32,
    pub wins: u32,
    pub achievements: Vec<AchievementType>,
    pub created_at: i64,
    pub last_updated: i64,
    pub bump: u8,
}

impl PlayerNft {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        32 + // mint
        4 + MAX_USERNAME_LENGTH + // name
        1 + // player_class
        4 + // level
        8 + // experience
        20 + // base_stats (5 * u32)
        8 * (1 + 32) + // equipped_items (8 * Option<Pubkey>)
        4 + // total_matches
        4 + // wins
        4 + 16 * 1 + // achievements vec (max 16 achievements)
        8 + // created_at
        8 + // last_updated
        1; // bump

    pub fn get_effective_stats(&self, item_nfts: &[&ItemNft]) -> PlayerStats {
        let mut effective_stats = self.base_stats.clone();
        
        // Apply bonuses from equipped items
        for &item in item_nfts {
            if item.is_equipped {
                let item_stats = item.stats.apply_rarity_multiplier(item.rarity);
                effective_stats.attack = effective_stats.attack.saturating_add(item_stats.attack_bonus);
                effective_stats.defense = effective_stats.defense.saturating_add(item_stats.defense_bonus);
                effective_stats.health = effective_stats.health.saturating_add(item_stats.health_bonus);
                effective_stats.speed = effective_stats.speed.saturating_add(item_stats.speed_bonus);
                effective_stats.mana = effective_stats.mana.saturating_add(item_stats.mana_bonus);
            }
        }
        
        effective_stats
    }

    pub fn can_equip_item(&self, item: &ItemNft, slot: ItemSlot) -> bool {
        item.owner == self.owner && 
        self.equipped_items[slot as usize].is_none() &&
        !item.is_equipped
    }

    pub fn equip_item(&mut self, item_mint: Pubkey, slot: ItemSlot) -> Result<()> {
        if self.equipped_items[slot as usize].is_some() {
            return Err(crate::shared::GameError::InvalidMove.into());
        }
        
        self.equipped_items[slot as usize] = Some(item_mint);
        self.last_updated = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn unequip_item(&mut self, slot: ItemSlot) -> Result<Option<Pubkey>> {
        let item = self.equipped_items[slot as usize].take();
        self.last_updated = Clock::get()?.unix_timestamp;
        Ok(item)
    }

    pub fn add_achievement(&mut self, achievement: AchievementType) -> Result<()> {
        if !self.achievements.contains(&achievement) {
            self.achievements.push(achievement);
            self.last_updated = Clock::get()?.unix_timestamp;
        }
        Ok(())
    }
}

#[account]
pub struct AchievementNft {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub achievement_type: AchievementType,
    pub name: String,
    pub description: String,
    pub rarity: Rarity,
    pub earned_at: i64,
    pub match_id: Option<u64>,
    pub bump: u8,
}

impl AchievementNft {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        32 + // mint
        1 + // achievement_type
        4 + 64 + // name (max 64 chars)
        4 + 256 + // description (max 256 chars)
        1 + // rarity
        8 + // earned_at
        1 + 8 + // match_id (Option<u64>)
        1; // bump
}

#[account]
pub struct ItemNft {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub item_type: ItemType,
    pub name: String,
    pub description: String,
    pub stats: ItemStats,
    pub rarity: Rarity,
    pub is_equipped: bool,
    pub equipped_slot: Option<ItemSlot>,
    pub durability: u32,
    pub max_durability: u32,
    pub created_at: i64,
    pub bump: u8,
}

impl ItemNft {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        32 + // mint
        1 + // item_type
        4 + 64 + // name (max 64 chars)
        4 + 256 + // description (max 256 chars)
        24 + // stats (6 * u32)
        1 + // rarity
        1 + // is_equipped
        1 + 1 + // equipped_slot (Option<ItemSlot>)
        4 + // durability
        4 + // max_durability
        8 + // created_at
        1; // bump

    pub fn get_effective_stats(&self) -> ItemStats {
        if self.durability == 0 {
            // Broken item provides no stats
            return ItemStats {
                attack_bonus: 0,
                defense_bonus: 0,
                health_bonus: 0,
                speed_bonus: 0,
                mana_bonus: 0,
                special_effect: 0,
            };
        }

        let durability_multiplier = self.durability as f32 / self.max_durability as f32;
        let base_stats = self.stats.apply_rarity_multiplier(self.rarity);
        
        ItemStats {
            attack_bonus: (base_stats.attack_bonus as f32 * durability_multiplier) as u32,
            defense_bonus: (base_stats.defense_bonus as f32 * durability_multiplier) as u32,
            health_bonus: (base_stats.health_bonus as f32 * durability_multiplier) as u32,
            speed_bonus: (base_stats.speed_bonus as f32 * durability_multiplier) as u32,
            mana_bonus: (base_stats.mana_bonus as f32 * durability_multiplier) as u32,
            special_effect: base_stats.special_effect,
        }
    }

    pub fn durability_percentage(&self) -> f32 {
        if self.max_durability == 0 {
            return 0.0;
        }
        self.durability as f32 / self.max_durability as f32
    }

    pub fn is_broken(&self) -> bool {
        self.durability == 0
    }

    pub fn use_durability(&mut self, amount: u32) {
        self.durability = self.durability.saturating_sub(amount);
    }

    pub fn repair(&mut self, amount: u32) {
        self.durability = (self.durability + amount).min(self.max_durability);
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct NftMetadata {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub seller_fee_basis_points: u16,
    pub creators: Option<Vec<Creator>>,
    pub collection: Option<Collection>,
    pub uses: Option<Uses>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Creator {
    pub address: Pubkey,
    pub verified: bool,
    pub share: u8,
}