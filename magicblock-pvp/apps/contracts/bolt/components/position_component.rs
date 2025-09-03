use bolt_lang::*;
use anchor_lang::prelude::*;
use bytemuck::{Pod, Zeroable};

/// Position component for entity location and movement
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(C)]
pub struct Position {
    pub x: i32,
    pub y: i32,
    pub z: i32,
    pub last_x: i32,
    pub last_y: i32,
    pub last_z: i32,
    pub velocity_x: i16,
    pub velocity_y: i16,
    pub velocity_z: i16,
    pub facing_direction: u8, // 0=North, 1=East, 2=South, 3=West
    pub movement_speed: u16,
    pub is_moving: bool,
    pub can_move: bool,
    pub immobilized_until: i64,
    pub last_moved: i64,
}

unsafe impl Pod for Position {}
unsafe impl Zeroable for Position {}

impl Default for Position {
    fn default() -> Self {
        Self {
            x: 0,
            y: 0,
            z: 0,
            last_x: 0,
            last_y: 0,
            last_z: 0,
            velocity_x: 0,
            velocity_y: 0,
            velocity_z: 0,
            facing_direction: 0,
            movement_speed: 100,
            is_moving: false,
            can_move: true,
            immobilized_until: 0,
            last_moved: 0,
        }
    }
}

impl Position {
    pub const SIZE: usize = 4 + 4 + 4 + 4 + 4 + 4 + 2 + 2 + 2 + 1 + 2 + 1 + 1 + 8 + 8; // 51 bytes
    
    /// Create new position at given coordinates
    pub fn new(x: i32, y: i32, z: i32, movement_speed: u16, clock: &Clock) -> Self {
        Self {
            x,
            y,
            z,
            last_x: x,
            last_y: y,
            last_z: z,
            velocity_x: 0,
            velocity_y: 0,
            velocity_z: 0,
            facing_direction: 0,
            movement_speed,
            is_moving: false,
            can_move: true,
            immobilized_until: 0,
            last_moved: clock.unix_timestamp,
        }
    }
    
    /// Move to a new position with validation
    pub fn move_to(&mut self, new_x: i32, new_y: i32, new_z: i32, clock: &Clock) -> Result<()> {
        // Check if movement is allowed
        if !self.can_move || (self.immobilized_until > 0 && clock.unix_timestamp < self.immobilized_until) {
            return Err(ProgramError::Custom(1)); // Movement restricted
        }
        
        // Clear immobilization if expired
        if self.immobilized_until > 0 && clock.unix_timestamp >= self.immobilized_until {
            self.immobilized_until = 0;
        }
        
        // Calculate movement distance
        let dx = new_x - self.x;
        let dy = new_y - self.y;
        let dz = new_z - self.z;
        let distance = ((dx * dx + dy * dy + dz * dz) as f64).sqrt() as u32;
        
        // Check if movement is within allowed speed limit
        let time_since_last = clock.unix_timestamp - self.last_moved;
        let max_distance = (self.movement_speed as u64 * time_since_last.max(1) as u64 / 100) as u32;
        
        if distance > max_distance {
            return Err(ProgramError::Custom(2)); // Movement too fast
        }
        
        // Store previous position
        self.last_x = self.x;
        self.last_y = self.y;
        self.last_z = self.z;
        
        // Update position
        self.x = new_x;
        self.y = new_y;
        self.z = new_z;
        
        // Update velocity and facing direction
        self.velocity_x = dx.clamp(-32767, 32767) as i16;
        self.velocity_y = dy.clamp(-32767, 32767) as i16;
        self.velocity_z = dz.clamp(-32767, 32767) as i16;
        
        // Update facing direction based on movement
        if dx > 0 {
            self.facing_direction = 1; // East
        } else if dx < 0 {
            self.facing_direction = 3; // West
        } else if dy > 0 {
            self.facing_direction = 0; // North
        } else if dy < 0 {
            self.facing_direction = 2; // South
        }
        
        self.is_moving = distance > 0;
        self.last_moved = clock.unix_timestamp;
        
        Ok(())
    }
    
    /// Move by relative offset
    pub fn move_by(&mut self, dx: i32, dy: i32, dz: i32, clock: &Clock) -> Result<()> {
        let new_x = self.x.checked_add(dx).ok_or(ProgramError::ArithmeticOverflow)?;
        let new_y = self.y.checked_add(dy).ok_or(ProgramError::ArithmeticOverflow)?;
        let new_z = self.z.checked_add(dz).ok_or(ProgramError::ArithmeticOverflow)?;
        
        self.move_to(new_x, new_y, new_z, clock)
    }
    
    /// Calculate distance to another position
    pub fn distance_to(&self, other: &Position) -> f64 {
        let dx = (self.x - other.x) as f64;
        let dy = (self.y - other.y) as f64;
        let dz = (self.z - other.z) as f64;
        (dx * dx + dy * dy + dz * dz).sqrt()
    }
    
    /// Calculate 2D distance (ignoring Z axis)
    pub fn distance_2d_to(&self, other: &Position) -> f64 {
        let dx = (self.x - other.x) as f64;
        let dy = (self.y - other.y) as f64;
        (dx * dx + dy * dy).sqrt()
    }
    
    /// Check if within range of another position
    pub fn is_in_range(&self, other: &Position, range: u32) -> bool {
        self.distance_to(other) <= range as f64
    }
    
    /// Check if within 2D range of another position
    pub fn is_in_2d_range(&self, other: &Position, range: u32) -> bool {
        self.distance_2d_to(other) <= range as f64
    }
    
    /// Immobilize entity for a duration
    pub fn immobilize(&mut self, duration_seconds: i64, clock: &Clock) {
        self.immobilized_until = clock.unix_timestamp + duration_seconds;
        self.is_moving = false;
        self.velocity_x = 0;
        self.velocity_y = 0;
        self.velocity_z = 0;
    }
    
    /// Remove immobilization
    pub fn remove_immobilization(&mut self) {
        self.immobilized_until = 0;
    }
    
    /// Set movement speed
    pub fn set_movement_speed(&mut self, speed: u16) {
        self.movement_speed = speed;
    }
    
    /// Disable/enable movement
    pub fn set_can_move(&mut self, can_move: bool) {
        self.can_move = can_move;
        if !can_move {
            self.is_moving = false;
            self.velocity_x = 0;
            self.velocity_y = 0;
            self.velocity_z = 0;
        }
    }
    
    /// Stop movement immediately
    pub fn stop(&mut self) {
        self.is_moving = false;
        self.velocity_x = 0;
        self.velocity_y = 0;
        self.velocity_z = 0;
    }
    
    /// Get current velocity magnitude
    pub fn velocity_magnitude(&self) -> f64 {
        let vx = self.velocity_x as f64;
        let vy = self.velocity_y as f64;
        let vz = self.velocity_z as f64;
        (vx * vx + vy * vy + vz * vz).sqrt()
    }
    
    /// Update facing direction manually
    pub fn set_facing(&mut self, direction: u8) -> Result<()> {
        if direction > 3 {
            return Err(ProgramError::InvalidArgument);
        }
        self.facing_direction = direction;
        Ok(())
    }
    
    /// Get direction vector based on facing direction
    pub fn facing_vector(&self) -> (i8, i8) {
        match self.facing_direction {
            0 => (0, 1),  // North
            1 => (1, 0),  // East
            2 => (0, -1), // South
            3 => (-1, 0), // West
            _ => (0, 0),
        }
    }
    
    /// Check if entity moved since last update
    pub fn has_moved(&self) -> bool {
        self.x != self.last_x || self.y != self.last_y || self.z != self.last_z
    }
    
    /// Reset to spawn position
    pub fn reset_to(&mut self, spawn_x: i32, spawn_y: i32, spawn_z: i32, clock: &Clock) {
        self.last_x = self.x;
        self.last_y = self.y;
        self.last_z = self.z;
        
        self.x = spawn_x;
        self.y = spawn_y;
        self.z = spawn_z;
        
        self.velocity_x = 0;
        self.velocity_y = 0;
        self.velocity_z = 0;
        self.is_moving = false;
        self.facing_direction = 0;
        self.last_moved = clock.unix_timestamp;
        
        // Clear any movement restrictions
        self.can_move = true;
        self.immobilized_until = 0;
    }
}