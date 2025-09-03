use anchor_lang::prelude::*;
use crate::{Component, ComponentData, ComponentTypeId, Entity};

pub fn handler(ctx: Context<AddComponent>, component_data: ComponentData) -> Result<()> {
    let component = &mut ctx.accounts.component;
    let entity = &mut ctx.accounts.entity;
    let clock = Clock::get()?;

    // Verify component type matches what was expected
    let component_type = component_data.get_type();
    
    // Serialize component data
    let serialized_data = component_data.serialize()?;
    
    // Check data size limits
    if serialized_data.len() > 1024 {
        return Err(ErrorCode::ComponentDataTooLarge.into());
    }

    // Create new component
    let new_component = Component::new(
        entity.id,
        component_type,
        serialized_data,
    )?;

    // Update component account
    **component = new_component;
    component.bump = ctx.bumps.component;

    // Update entity's component mask
    entity.add_component_mask(component_type);
    entity.touch()?;

    emit!(ComponentAdded {
        entity_id: entity.id,
        component_type,
        component_size: component.size,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct ComponentAdded {
    pub entity_id: u64,
    pub component_type: ComponentTypeId,
    pub component_size: u16,
    pub timestamp: i64,
}

use crate::AddComponent;