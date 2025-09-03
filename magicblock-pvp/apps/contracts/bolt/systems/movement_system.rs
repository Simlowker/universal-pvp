use bolt_lang::*;
use anchor_lang::prelude::*;
use crate::components::*;

/// Movement System for handling real-time movement and positioning
pub struct MovementSystem;

impl MovementSystem {
    /// Process movement command for an entity
    pub fn process_movement(
        position: &mut Position,
        combat: &mut Combat,
        health: &Health,
        target_x: i32,
        target_y: i32,
        target_z: i32,
        clock: &Clock,
    ) -> Result<MovementResult> {
        // Check if entity can move
        if !Self::can_move(position, combat, health, clock) {
            return Ok(MovementResult::failed("Cannot move at this time"));
        }
        
        // Validate target position
        if !Self::is_valid_position(target_x, target_y, target_z) {
            return Ok(MovementResult::failed("Invalid target position"));
        }
        
        // Calculate movement distance and validate speed
        let distance = Self::calculate_distance(position, target_x, target_y, target_z);
        let max_distance = Self::calculate_max_movement(position, clock);
        
        if distance > max_distance {
            return Ok(MovementResult::failed("Movement too fast - exceeds speed limit"));
        }
        
        // Store previous position
        let prev_x = position.x;
        let prev_y = position.y;
        let prev_z = position.z;
        
        // Attempt to move
        match position.move_to(target_x, target_y, target_z, clock) {
            Ok(_) => {
                Ok(MovementResult {
                    success: true,
                    new_x: position.x,
                    new_y: position.y,
                    new_z: position.z,
                    distance_moved: distance,
                    movement_time: clock.unix_timestamp - position.last_moved + 1,
                    message: "Movement successful".to_string(),
                })
            },
            Err(e) => {
                // Restore previous position if movement failed
                position.x = prev_x;
                position.y = prev_y;
                position.z = prev_z;
                
                Ok(MovementResult::failed(&format!("Movement failed: {:?}", e)))
            }
        }
    }
    
    /// Process relative movement (move by offset)
    pub fn process_relative_movement(
        position: &mut Position,
        combat: &mut Combat,
        health: &Health,
        delta_x: i32,
        delta_y: i32,
        delta_z: i32,
        clock: &Clock,
    ) -> Result<MovementResult> {
        let target_x = position.x.saturating_add(delta_x);
        let target_y = position.y.saturating_add(delta_y);
        let target_z = position.z.saturating_add(delta_z);
        
        Self::process_movement(position, combat, health, target_x, target_y, target_z, clock)
    }
    
    /// Process instant teleportation (for abilities/spells)
    pub fn process_teleport(
        position: &mut Position,
        combat: &mut Combat,
        health: &Health,
        target_x: i32,
        target_y: i32,
        target_z: i32,
        max_range: u32,
        clock: &Clock,
    ) -> Result<MovementResult> {
        // Check if entity can teleport
        if !health.is_alive || health.is_dead() {
            return Ok(MovementResult::failed("Dead entities cannot teleport"));
        }
        
        if combat.is_stunned_now(clock) {
            return Ok(MovementResult::failed("Cannot teleport while stunned"));
        }
        
        // Check teleport range
        let distance = Self::calculate_distance(position, target_x, target_y, target_z);
        if distance > max_range as f64 {
            return Ok(MovementResult::failed("Teleport target out of range"));
        }
        
        // Validate target position
        if !Self::is_valid_position(target_x, target_y, target_z) {
            return Ok(MovementResult::failed("Invalid teleport destination"));
        }
        
        // Store previous position
        let prev_x = position.x;
        let prev_y = position.y;
        let prev_z = position.z;
        
        // Perform teleport (bypasses movement speed restrictions)
        position.last_x = position.x;
        position.last_y = position.y;
        position.last_z = position.z;
        
        position.x = target_x;
        position.y = target_y;
        position.z = target_z;
        
        position.velocity_x = 0;
        position.velocity_y = 0;
        position.velocity_z = 0;
        position.is_moving = false;
        position.last_moved = clock.unix_timestamp;
        
        Ok(MovementResult {
            success: true,
            new_x: position.x,
            new_y: position.y,
            new_z: position.z,
            distance_moved: distance,
            movement_time: 0, // Instant
            message: "Teleported successfully".to_string(),
        })
    }
    
    /// Stop entity movement
    pub fn stop_movement(position: &mut Position) -> MovementResult {
        position.stop();
        
        MovementResult {
            success: true,
            new_x: position.x,
            new_y: position.y,
            new_z: position.z,
            distance_moved: 0.0,
            movement_time: 0,
            message: "Movement stopped".to_string(),
        }
    }
    
    /// Set entity facing direction
    pub fn set_facing_direction(position: &mut Position, direction: u8) -> Result<MovementResult> {
        if direction > 3 {
            return Ok(MovementResult::failed("Invalid facing direction"));
        }
        
        position.set_facing(direction)?;
        
        Ok(MovementResult {
            success: true,
            new_x: position.x,
            new_y: position.y,
            new_z: position.z,
            distance_moved: 0.0,
            movement_time: 0,
            message: format!("Facing direction set to {}", direction),
        })
    }
    
    /// Apply movement speed modifier (buffs/debuffs)
    pub fn modify_movement_speed(position: &mut Position, speed_modifier: i16) -> MovementResult {
        let new_speed = (position.movement_speed as i32 + speed_modifier as i32)
            .max(10)  // Minimum speed of 10
            .min(500) // Maximum speed of 500
            as u16;
        
        position.set_movement_speed(new_speed);
        
        MovementResult {
            success: true,
            new_x: position.x,
            new_y: position.y,
            new_z: position.z,
            distance_moved: 0.0,
            movement_time: 0,
            message: format!("Movement speed modified to {}", new_speed),
        }
    }
    
    /// Immobilize entity for a duration
    pub fn immobilize_entity(
        position: &mut Position,
        duration_seconds: i64,
        clock: &Clock,
    ) -> MovementResult {
        position.immobilize(duration_seconds, clock);
        
        MovementResult {
            success: true,
            new_x: position.x,
            new_y: position.y,
            new_z: position.z,
            distance_moved: 0.0,
            movement_time: 0,
            message: format!("Immobilized for {} seconds", duration_seconds),
        }
    }
    
    /// Check if two entities are within interaction range
    pub fn are_in_range(pos1: &Position, pos2: &Position, range: u32) -> bool {
        pos1.is_in_range(pos2, range)
    }
    
    /// Get all entities within a certain range (would need world query in full implementation)
    pub fn get_entities_in_range(
        center: &Position,
        range: u32,
        entities: &[(Position, Pubkey)], // Simplified - in real implementation would query world
    ) -> Vec<Pubkey> {
        entities
            .iter()
            .filter(|(pos, _)| center.is_in_range(pos, range))
            .map(|(_, pubkey)| *pubkey)
            .collect()
    }
    
    /// Update position interpolation for smooth movement
    pub fn update_position_interpolation(
        position: &mut Position,
        delta_time: f64,
        clock: &Clock,
    ) -> Result<()> {
        if !position.is_moving {
            return Ok(());
        }
        
        // Simple linear interpolation based on velocity
        let vel_magnitude = position.velocity_magnitude();
        if vel_magnitude > 0.0 {
            let time_factor = delta_time.min(1.0); // Clamp to prevent overshooting
            
            let move_x = (position.velocity_x as f64 * time_factor) as i32;
            let move_y = (position.velocity_y as f64 * time_factor) as i32;
            let move_z = (position.velocity_z as f64 * time_factor) as i32;
            
            if move_x != 0 || move_y != 0 || move_z != 0 {
                position.move_by(move_x, move_y, move_z, clock)?;
            }
        }
        
        Ok(())
    }
    
    /// Pathfinding helper - calculate next step towards target
    pub fn calculate_next_step(
        from: &Position,
        target_x: i32,
        target_y: i32,
        step_size: u32,
    ) -> (i32, i32) {
        let dx = target_x - from.x;
        let dy = target_y - from.y;
        let distance = ((dx * dx + dy * dy) as f64).sqrt();
        
        if distance <= step_size as f64 {
            return (target_x, target_y);
        }
        
        let step_x = ((dx as f64 / distance) * step_size as f64) as i32;
        let step_y = ((dy as f64 / distance) * step_size as f64) as i32;
        
        (from.x + step_x, from.y + step_y)
    }
    
    // Helper functions
    
    fn can_move(
        position: &Position,
        combat: &Combat,
        health: &Health,
        clock: &Clock,
    ) -> bool {
        // Check basic movement restrictions
        if !position.can_move || health.is_dead() {
            return false;
        }
        
        // Check combat-related movement restrictions
        if combat.is_stunned_now(clock) {
            return false;
        }
        
        // Check immobilization
        if position.immobilized_until > 0 && clock.unix_timestamp < position.immobilized_until {
            return false;
        }
        
        true
    }
    
    fn is_valid_position(x: i32, y: i32, z: i32) -> bool {
        // Define world boundaries (adjust as needed)
        const MIN_COORD: i32 = -10000;
        const MAX_COORD: i32 = 10000;
        const MIN_Z: i32 = 0;
        const MAX_Z: i32 = 1000;
        
        x >= MIN_COORD && x <= MAX_COORD &&
        y >= MIN_COORD && y <= MAX_COORD &&
        z >= MIN_Z && z <= MAX_Z
    }
    
    fn calculate_distance(position: &Position, target_x: i32, target_y: i32, target_z: i32) -> f64 {
        let dx = (target_x - position.x) as f64;
        let dy = (target_y - position.y) as f64;
        let dz = (target_z - position.z) as f64;
        (dx * dx + dy * dy + dz * dz).sqrt()
    }
    
    fn calculate_max_movement(position: &Position, clock: &Clock) -> f64 {
        let time_since_last = (clock.unix_timestamp - position.last_moved).max(1);
        (position.movement_speed as f64 * time_since_last as f64) / 100.0
    }
}

/// Result of a movement operation
#[derive(Debug, Clone)]
pub struct MovementResult {
    pub success: bool,
    pub new_x: i32,
    pub new_y: i32,
    pub new_z: i32,
    pub distance_moved: f64,
    pub movement_time: i64,
    pub message: String,
}

impl MovementResult {
    fn failed(message: &str) -> Self {
        Self {
            success: false,
            new_x: 0,
            new_y: 0,
            new_z: 0,
            distance_moved: 0.0,
            movement_time: 0,
            message: message.to_string(),
        }
    }
}