use anchor_lang::prelude::*;
use crate::{Entity, EntityType, EntityFactory, World};

pub fn handler(ctx: Context<CreateEntity>, entity_type: EntityType) -> Result<()> {
    let world = &mut ctx.accounts.world;
    let entity = &mut ctx.accounts.entity;
    let clock = Clock::get()?;

    // Create entity based on type
    let mut new_entity = match entity_type {
        EntityType::Player => EntityFactory::create_player_entity(ctx.accounts.authority.key(), &clock),
        EntityType::Match => EntityFactory::create_match_entity(ctx.accounts.authority.key(), &clock),
        EntityType::Item => EntityFactory::create_item_entity(ctx.accounts.authority.key(), &clock),
        EntityType::Effect => Entity {
            id: world.entity_count,
            entity_type: EntityType::Effect,
            component_mask: 0,
            component_count: 0,
            is_active: true,
            created_at: clock.unix_timestamp,
            last_updated: clock.unix_timestamp,
            owner: ctx.accounts.authority.key(),
            bump: ctx.bumps.entity,
        },
        EntityType::System => Entity {
            id: world.entity_count,
            entity_type: EntityType::System,
            component_mask: 0,
            component_count: 0,
            is_active: true,
            created_at: clock.unix_timestamp,
            last_updated: clock.unix_timestamp,
            owner: ctx.accounts.authority.key(),
            bump: ctx.bumps.entity,
        },
    };

    // Set entity ID from world counter
    new_entity.id = world.entity_count;
    new_entity.bump = ctx.bumps.entity;

    // Copy to account
    **entity = new_entity;

    // Update world counters
    world.entity_count = world.entity_count.checked_add(1)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    // Update entity type counters
    match entity_type {
        EntityType::Player => world.player_count += 1,
        EntityType::Match => world.match_count += 1,
        EntityType::Item => world.item_count += 1,
        EntityType::Effect => world.effect_count += 1,
        EntityType::System => world.system_count += 1,
    }

    world.last_updated = clock.unix_timestamp;

    emit!(EntityCreated {
        entity_id: new_entity.id,
        entity_type,
        owner: ctx.accounts.authority.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct EntityCreated {
    pub entity_id: u64,
    pub entity_type: EntityType,
    pub owner: Pubkey,
    pub timestamp: i64,
}

use crate::CreateEntity;