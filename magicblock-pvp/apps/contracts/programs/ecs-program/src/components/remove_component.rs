use anchor_lang::prelude::*;
use crate::{Component, Entity};

pub fn handler(ctx: Context<RemoveComponent>) -> Result<()> {
    let component = &ctx.accounts.component;
    let entity = &mut ctx.accounts.entity;
    let clock = Clock::get()?;

    // Verify entity owns this component
    if component.entity_id != entity.id {
        return Err(ErrorCode::InvalidComponentOperation.into());
    }

    // Remove component from entity's mask
    entity.remove_component_mask(component.component_type);
    entity.touch()?;

    emit!(ComponentRemoved {
        entity_id: entity.id,
        component_type: component.component_type,
        timestamp: clock.unix_timestamp,
    });

    // Component account will be closed and rent returned to authority
    Ok(())
}

#[event]
pub struct ComponentRemoved {
    pub entity_id: u64,
    pub component_type: crate::ComponentTypeId,
    pub timestamp: i64,
}

use crate::{RemoveComponent, ComponentTypeId};