use anchor_lang::prelude::*;
use crate::{Component, ComponentData, Entity};

pub fn handler(ctx: Context<UpdateComponent>, component_data: ComponentData) -> Result<()> {
    let component = &mut ctx.accounts.component;
    let entity = &mut ctx.accounts.entity;
    let clock = Clock::get()?;

    // Verify component type matches
    if component_data.get_type() != component.component_type {
        return Err(ErrorCode::ComponentTypeMismatch.into());
    }

    // Verify entity owns this component
    if component.entity_id != entity.id {
        return Err(ErrorCode::InvalidComponentOperation.into());
    }

    // Serialize new data
    let serialized_data = component_data.serialize()?;
    
    // Check data size limits
    if serialized_data.len() > 1024 {
        return Err(ErrorCode::ComponentDataTooLarge.into());
    }

    // Update component data
    component.update_data(serialized_data)?;

    // Update entity timestamp
    entity.touch()?;

    emit!(ComponentUpdated {
        entity_id: entity.id,
        component_type: component.component_type,
        version: component.version,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct ComponentUpdated {
    pub entity_id: u64,
    pub component_type: crate::ComponentTypeId,
    pub version: u32,
    pub timestamp: i64,
}

use crate::{UpdateComponent, ComponentTypeId};