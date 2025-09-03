use anchor_lang::prelude::*;
use bolt_lang::*;

pub mod components;
pub mod entities;
pub mod systems;
pub mod world;

pub use components::*;
pub use entities::*;
pub use systems::*;
pub use world::*;

declare_id!("ECSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

/// ECS Program for SolDuel - BOLT-based Entity Component System
#[program]
pub mod ecs_program {
    use super::*;

    /// Initialize the ECS World
    pub fn initialize_world(ctx: Context<InitializeWorld>) -> Result<()> {
        world::initialize_world::handler(ctx)
    }

    /// Create a new entity
    pub fn create_entity(ctx: Context<CreateEntity>, entity_type: EntityType) -> Result<()> {
        entities::create_entity::handler(ctx, entity_type)
    }

    /// Add component to entity
    pub fn add_component(ctx: Context<AddComponent>, component_data: ComponentData) -> Result<()> {
        components::add_component::handler(ctx, component_data)
    }

    /// Update component data
    pub fn update_component(ctx: Context<UpdateComponent>, component_data: ComponentData) -> Result<()> {
        components::update_component::handler(ctx, component_data)
    }

    /// Remove component from entity
    pub fn remove_component(ctx: Context<RemoveComponent>) -> Result<()> {
        components::remove_component::handler(ctx)
    }

    /// Execute movement system
    pub fn execute_movement_system(ctx: Context<ExecuteMovementSystem>) -> Result<()> {
        systems::movement_system::handler(ctx)
    }

    /// Execute combat system
    pub fn execute_combat_system(ctx: Context<ExecuteCombatSystem>) -> Result<()> {
        systems::combat_system::handler(ctx)
    }

    /// Execute effect system
    pub fn execute_effect_system(ctx: Context<ExecuteEffectSystem>) -> Result<()> {
        systems::effect_system::handler(ctx)
    }

    /// Execute matchmaking system
    pub fn execute_matchmaking_system(ctx: Context<ExecuteMatchmakingSystem>) -> Result<()> {
        systems::matchmaking_system::handler(ctx)
    }

    /// Execute result system
    pub fn execute_result_system(ctx: Context<ExecuteResultSystem>) -> Result<()> {
        systems::result_system::handler(ctx)
    }

    /// Execute commit system (sync to mainnet)
    pub fn execute_commit_system(ctx: Context<ExecuteCommitSystem>) -> Result<()> {
        systems::commit_system::handler(ctx)
    }

    /// Query entities with specific components
    pub fn query_entities(ctx: Context<QueryEntities>, query: ComponentQuery) -> Result<()> {
        world::query_system::handler(ctx, query)
    }
}

// Account structs for BOLT integration
#[derive(Accounts)]
pub struct InitializeWorld<'info> {
    #[account(
        init,
        payer = authority,
        space = World::SIZE,
        seeds = [b"world"],
        bump
    )]
    pub world: Account<'info, World>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateEntity<'info> {
    #[account(
        init,
        payer = authority,
        space = Entity::SIZE,
        seeds = [b"entity", &world.entity_count.to_le_bytes()],
        bump
    )]
    pub entity: Account<'info, Entity>,
    #[account(
        mut,
        seeds = [b"world"],
        bump
    )]
    pub world: Account<'info, World>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddComponent<'info> {
    #[account(
        init,
        payer = authority,
        space = Component::SIZE,
        seeds = [b"component", entity.key().as_ref(), &component_type_id.to_le_bytes()],
        bump
    )]
    pub component: Account<'info, Component>,
    #[account(mut)]
    pub entity: Account<'info, Entity>,
    #[account(
        seeds = [b"world"],
        bump
    )]
    pub world: Account<'info, World>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateComponent<'info> {
    #[account(
        mut,
        seeds = [b"component", entity.key().as_ref(), &component_type_id.to_le_bytes()],
        bump
    )]
    pub component: Account<'info, Component>,
    pub entity: Account<'info, Entity>,
    #[account(
        seeds = [b"world"],
        bump
    )]
    pub world: Account<'info, World>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RemoveComponent<'info> {
    #[account(
        mut,
        close = authority,
        seeds = [b"component", entity.key().as_ref(), &component_type_id.to_le_bytes()],
        bump
    )]
    pub component: Account<'info, Component>,
    #[account(mut)]
    pub entity: Account<'info, Entity>,
    #[account(
        seeds = [b"world"],
        bump
    )]
    pub world: Account<'info, World>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

// System execution contexts
#[derive(Accounts)]
pub struct ExecuteMovementSystem<'info> {
    #[account(
        seeds = [b"world"],
        bump
    )]
    pub world: Account<'info, World>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteCombatSystem<'info> {
    #[account(
        seeds = [b"world"],
        bump
    )]
    pub world: Account<'info, World>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteEffectSystem<'info> {
    #[account(
        seeds = [b"world"],
        bump
    )]
    pub world: Account<'info, World>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteMatchmakingSystem<'info> {
    #[account(
        seeds = [b"world"],
        bump
    )]
    pub world: Account<'info, World>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteResultSystem<'info> {
    #[account(
        seeds = [b"world"],
        bump
    )]
    pub world: Account<'info, World>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteCommitSystem<'info> {
    #[account(
        seeds = [b"world"],
        bump
    )]
    pub world: Account<'info, World>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct QueryEntities<'info> {
    #[account(
        seeds = [b"world"],
        bump
    )]
    pub world: Account<'info, World>,
    pub authority: Signer<'info>,
}