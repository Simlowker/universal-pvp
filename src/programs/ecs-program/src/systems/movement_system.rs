use anchor_lang::prelude::*;
use crate::{
    World, Entity, ComponentTypeId, PositionComponent, 
    System, SystemExecutionResult, SystemPriority, SystemPhase, ComponentQuery
};

/// MovementSystem handles position updates and spatial calculations
pub struct MovementSystem;

impl System for MovementSystem {
    fn execute(&self, world: &mut World, entities: &[Entity]) -> Result<SystemExecutionResult> {
        let mut result = SystemExecutionResult::default();
        let start_time = Clock::get()?.unix_timestamp;

        // Query entities with Position components
        let query = ComponentQuery::new()
            .require_component(ComponentTypeId::Position);

        let mut entities_processed = 0u32;
        let mut components_modified = 0u32;

        for entity in entities {
            if !query.matches_entity(entity) {
                continue;
            }

            // Process movement for this entity
            if let Err(e) = process_entity_movement(world, entity) {
                result.errors.push(crate::SystemError {
                    entity_id: entity.id,
                    error_type: crate::SystemErrorType::InvalidState,
                    message: format!("Movement processing failed: {}", e),
                });
                continue;
            }

            entities_processed += 1;
            components_modified += 1;
        }

        let end_time = Clock::get()?.unix_timestamp;
        result.entities_processed = entities_processed;
        result.components_modified = components_modified;
        result.execution_time_ms = ((end_time - start_time) * 1000) as u32;

        Ok(result)
    }

    fn can_run_parallel(&self) -> bool {
        true // Movement can be processed in parallel per entity
    }

    fn get_required_components(&self) -> Vec<ComponentTypeId> {
        vec![ComponentTypeId::Position]
    }

    fn get_modified_components(&self) -> Vec<ComponentTypeId> {
        vec![ComponentTypeId::Position]
    }

    fn get_priority(&self) -> SystemPriority {
        SystemPriority::Normal
    }

    fn get_phase(&self) -> SystemPhase {
        SystemPhase::Update
    }
}

pub fn handler(ctx: Context<crate::ExecuteMovementSystem>) -> Result<()> {
    let world = &mut ctx.accounts.world;
    let movement_system = MovementSystem;

    // This would typically query entities from the world
    // For now, we'll simulate with an empty entity list
    let entities: Vec<Entity> = Vec::new();

    let result = movement_system.execute(world, &entities)?;

    // Emit execution result
    emit!(MovementSystemExecuted {
        entities_processed: result.entities_processed,
        execution_time_ms: result.execution_time_ms,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

fn process_entity_movement(world: &mut World, entity: &Entity) -> Result<()> {
    // In a real implementation, this would:
    // 1. Load the entity's PositionComponent from storage
    // 2. Apply movement rules (velocity, constraints, collision detection)
    // 3. Update the position
    // 4. Handle spatial indexing updates
    // 5. Trigger movement-related events

    // Placeholder implementation
    world.last_updated = Clock::get()?.unix_timestamp;
    
    Ok(())
}

/// Spatial grid for efficient collision detection and proximity queries
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SpatialGrid {
    pub cell_size: f32,
    pub width: u32,
    pub height: u32,
    pub cells: Vec<Vec<u64>>, // Entity IDs in each cell
}

impl SpatialGrid {
    pub fn new(width: u32, height: u32, cell_size: f32) -> Self {
        let total_cells = (width * height) as usize;
        Self {
            cell_size,
            width,
            height,
            cells: vec![Vec::new(); total_cells],
        }
    }

    pub fn get_cell_index(&self, x: f32, y: f32) -> Option<usize> {
        let cell_x = (x / self.cell_size).floor() as u32;
        let cell_y = (y / self.cell_size).floor() as u32;

        if cell_x < self.width && cell_y < self.height {
            Some((cell_y * self.width + cell_x) as usize)
        } else {
            None
        }
    }

    pub fn add_entity(&mut self, entity_id: u64, x: f32, y: f32) -> Result<()> {
        if let Some(cell_index) = self.get_cell_index(x, y) {
            self.cells[cell_index].push(entity_id);
        }
        Ok(())
    }

    pub fn remove_entity(&mut self, entity_id: u64, x: f32, y: f32) -> Result<()> {
        if let Some(cell_index) = self.get_cell_index(x, y) {
            self.cells[cell_index].retain(|&id| id != entity_id);
        }
        Ok(())
    }

    pub fn get_nearby_entities(&self, x: f32, y: f32, radius: f32) -> Vec<u64> {
        let mut nearby_entities = Vec::new();
        let cells_to_check = self.get_cells_in_radius(x, y, radius);

        for cell_index in cells_to_check {
            nearby_entities.extend(&self.cells[cell_index]);
        }

        nearby_entities
    }

    fn get_cells_in_radius(&self, x: f32, y: f32, radius: f32) -> Vec<usize> {
        let mut cells = Vec::new();
        let min_x = ((x - radius) / self.cell_size).floor() as i32;
        let max_x = ((x + radius) / self.cell_size).floor() as i32;
        let min_y = ((y - radius) / self.cell_size).floor() as i32;
        let max_y = ((y + radius) / self.cell_size).floor() as i32;

        for cell_y in min_y..=max_y {
            for cell_x in min_x..=max_x {
                if cell_x >= 0 && cell_x < self.width as i32 && 
                   cell_y >= 0 && cell_y < self.height as i32 {
                    let cell_index = (cell_y * self.width as i32 + cell_x) as usize;
                    cells.push(cell_index);
                }
            }
        }

        cells
    }
}

/// Movement constraints for different entity types
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MovementConstraints {
    pub max_speed: f32,
    pub acceleration: f32,
    pub friction: f32,
    pub can_fly: bool,
    pub collision_radius: f32,
    pub movement_type: MovementType,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum MovementType {
    Ground,    // Normal ground movement
    Flying,    // Can move in 3D space
    Teleport,  // Instant position changes
    Fixed,     // Cannot move
}

impl Default for MovementConstraints {
    fn default() -> Self {
        Self {
            max_speed: 5.0,
            acceleration: 1.0,
            friction: 0.8,
            can_fly: false,
            collision_radius: 1.0,
            movement_type: MovementType::Ground,
        }
    }
}

/// Pathfinding utilities for AI movement
pub struct Pathfinder {
    pub grid: Vec<Vec<bool>>, // true = walkable, false = blocked
    pub width: usize,
    pub height: usize,
}

impl Pathfinder {
    pub fn new(width: usize, height: usize) -> Self {
        Self {
            grid: vec![vec![true; width]; height],
            width,
            height,
        }
    }

    pub fn find_path(&self, start: (usize, usize), goal: (usize, usize)) -> Option<Vec<(usize, usize)>> {
        // A* pathfinding implementation
        // This is a simplified version - a full implementation would use a priority queue
        
        let mut open_set = vec![start];
        let mut came_from: std::collections::HashMap<(usize, usize), (usize, usize)> = std::collections::HashMap::new();
        let mut g_score: std::collections::HashMap<(usize, usize), f32> = std::collections::HashMap::new();
        g_score.insert(start, 0.0);

        while let Some(current) = open_set.pop() {
            if current == goal {
                return Some(self.reconstruct_path(came_from, current));
            }

            for neighbor in self.get_neighbors(current) {
                if !self.is_walkable(neighbor) {
                    continue;
                }

                let tentative_g_score = g_score.get(&current).unwrap_or(&f32::INFINITY) + 1.0;
                let neighbor_g_score = g_score.get(&neighbor).unwrap_or(&f32::INFINITY);

                if tentative_g_score < *neighbor_g_score {
                    came_from.insert(neighbor, current);
                    g_score.insert(neighbor, tentative_g_score);
                    
                    if !open_set.contains(&neighbor) {
                        open_set.push(neighbor);
                    }
                }
            }
        }

        None
    }

    fn get_neighbors(&self, pos: (usize, usize)) -> Vec<(usize, usize)> {
        let mut neighbors = Vec::new();
        let (x, y) = pos;

        // Cardinal directions
        if x > 0 { neighbors.push((x - 1, y)); }
        if x < self.width - 1 { neighbors.push((x + 1, y)); }
        if y > 0 { neighbors.push((x, y - 1)); }
        if y < self.height - 1 { neighbors.push((x, y + 1)); }

        neighbors
    }

    fn is_walkable(&self, pos: (usize, usize)) -> bool {
        let (x, y) = pos;
        if x >= self.width || y >= self.height {
            return false;
        }
        self.grid[y][x]
    }

    fn reconstruct_path(&self, came_from: std::collections::HashMap<(usize, usize), (usize, usize)>, mut current: (usize, usize)) -> Vec<(usize, usize)> {
        let mut path = vec![current];
        
        while let Some(&prev) = came_from.get(&current) {
            path.push(prev);
            current = prev;
        }
        
        path.reverse();
        path
    }
}

#[event]
pub struct MovementSystemExecuted {
    pub entities_processed: u32,
    pub execution_time_ms: u32,
    pub timestamp: i64,
}