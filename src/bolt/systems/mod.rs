// BOLT Systems Module for SolDuel PvP Game

pub mod combat_system;
pub mod movement_system;
pub mod session_system;
pub mod state_delegation;
pub mod optimistic_system;

// Re-export systems for easier importing
pub use combat_system::CombatSystem;
pub use movement_system::MovementSystem;
pub use session_system::SessionSystem;
pub use state_delegation::StateDelegationSystem;
pub use optimistic_system::OptimisticSystem;

use bolt_lang::*;
use anchor_lang::prelude::*;
use crate::components::*;

/// System execution priority levels
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum SystemPriority {
    Critical = 0,  // Must execute first (session validation, etc.)
    High = 1,      // Core gameplay (movement, combat)
    Medium = 2,    // Secondary systems (effects, UI updates)
    Low = 3,       // Background tasks (cleanup, stats)
}

/// System execution context with timing information
#[derive(Clone, Debug)]
pub struct SystemContext {
    pub clock: Clock,
    pub tick_number: u64,
    pub delta_time: f64,    // Time since last tick in seconds
    pub entities_processed: u32,
    pub optimistic_mode: bool,
}

impl SystemContext {
    pub fn new(clock: Clock, tick_number: u64, delta_time: f64) -> Self {
        Self {
            clock,
            tick_number,
            delta_time,
            entities_processed: 0,
            optimistic_mode: false,
        }
    }
    
    pub fn with_optimistic(mut self, optimistic: bool) -> Self {
        self.optimistic_mode = optimistic;
        self
    }
}

/// System registry and execution manager
pub struct SystemManager {
    systems: Vec<SystemInfo>,
    execution_order: Vec<usize>,
    last_tick_time: i64,
    tick_count: u64,
}

#[derive(Clone, Debug)]
struct SystemInfo {
    name: String,
    priority: SystemPriority,
    tick_rate: u32,        // Ticks per second (0 = every tick)
    last_execution: u64,   // Last tick number this system ran
    execution_time_us: u64, // Average execution time in microseconds
    enabled: bool,
}

impl SystemManager {
    pub fn new() -> Self {
        let mut manager = Self {
            systems: Vec::new(),
            execution_order: Vec::new(),
            last_tick_time: 0,
            tick_count: 0,
        };
        
        // Register default systems
        manager.register_default_systems();
        manager.sort_systems_by_priority();
        
        manager
    }
    
    /// Register all default game systems
    fn register_default_systems(&mut self) {
        self.register_system("SessionValidation", SystemPriority::Critical, 0);
        self.register_system("StateDelegation", SystemPriority::Critical, 0);
        self.register_system("OptimisticUpdates", SystemPriority::High, 0);
        self.register_system("Movement", SystemPriority::High, 33); // 30ms ticks
        self.register_system("Combat", SystemPriority::High, 20);   // 50ms ticks
        self.register_system("HealthRegen", SystemPriority::Medium, 5); // 200ms ticks
        self.register_system("Cleanup", SystemPriority::Low, 1);    // 1 second ticks
    }
    
    /// Register a new system
    pub fn register_system(&mut self, name: &str, priority: SystemPriority, tick_rate: u32) {
        let system_info = SystemInfo {
            name: name.to_string(),
            priority,
            tick_rate,
            last_execution: 0,
            execution_time_us: 0,
            enabled: true,
        };
        
        self.systems.push(system_info);
    }
    
    /// Sort systems by priority for execution
    fn sort_systems_by_priority(&mut self) {
        // Create execution order indices sorted by priority
        let mut indices: Vec<usize> = (0..self.systems.len()).collect();
        indices.sort_by_key(|&i| self.systems[i].priority);
        self.execution_order = indices;
    }
    
    /// Execute all systems for this tick
    pub fn execute_systems(&mut self, context: &mut SystemContext) -> Result<SystemExecutionResult> {
        let start_time = std::time::Instant::now();
        let mut result = SystemExecutionResult::new();
        
        self.tick_count += 1;
        context.tick_number = self.tick_count;
        
        // Calculate delta time
        if self.last_tick_time > 0 {
            context.delta_time = (context.clock.unix_timestamp - self.last_tick_time) as f64;
        }
        self.last_tick_time = context.clock.unix_timestamp;
        
        // Execute systems in priority order
        for &system_index in &self.execution_order {
            let system = &mut self.systems[system_index];
            
            if !system.enabled {
                continue;
            }
            
            // Check if system should run this tick
            if system.tick_rate > 0 {
                let ticks_since_last = self.tick_count - system.last_execution;
                let required_interval = 33 / system.tick_rate.max(1); // Assuming 33 ticks per second base rate
                
                if ticks_since_last < required_interval as u64 {
                    continue;
                }
            }
            
            let system_start = std::time::Instant::now();
            
            // Execute the system
            let system_result = self.execute_system(&system.name, context)?;
            
            let execution_time = system_start.elapsed().as_micros() as u64;
            system.execution_time_us = (system.execution_time_us + execution_time) / 2; // Moving average
            system.last_execution = self.tick_count;
            
            result.systems_executed.push(SystemResult {
                name: system.name.clone(),
                execution_time_us: execution_time,
                entities_processed: system_result.entities_processed,
                success: system_result.success,
                error: system_result.error,
            });
            
            if !system_result.success {
                result.errors += 1;
            }
        }
        
        result.total_time_us = start_time.elapsed().as_micros() as u64;
        result.tick_number = self.tick_count;
        
        Ok(result)
    }
    
    /// Execute a specific system
    fn execute_system(&self, system_name: &str, context: &mut SystemContext) -> Result<SingleSystemResult> {
        let mut entities_processed = 0;
        
        let result = match system_name {
            "SessionValidation" => {
                // Validate all active session keys
                entities_processed = self.execute_session_validation(context)?;
                SingleSystemResult::success(entities_processed)
            },
            
            "StateDelegation" => {
                // Process state delegation and commits
                entities_processed = self.execute_state_delegation(context)?;
                SingleSystemResult::success(entities_processed)
            },
            
            "OptimisticUpdates" => {
                // Process optimistic updates and confirmations
                entities_processed = self.execute_optimistic_updates(context)?;
                SingleSystemResult::success(entities_processed)
            },
            
            "Movement" => {
                // Process all movement updates
                entities_processed = self.execute_movement_system(context)?;
                SingleSystemResult::success(entities_processed)
            },
            
            "Combat" => {
                // Process all combat actions and effects
                entities_processed = self.execute_combat_system(context)?;
                SingleSystemResult::success(entities_processed)
            },
            
            "HealthRegen" => {
                // Process health and mana regeneration
                entities_processed = self.execute_health_regeneration(context)?;
                SingleSystemResult::success(entities_processed)
            },
            
            "Cleanup" => {
                // Clean up expired sessions, delegations, etc.
                entities_processed = self.execute_cleanup_system(context)?;
                SingleSystemResult::success(entities_processed)
            },
            
            _ => {
                SingleSystemResult::error(format!("Unknown system: {}", system_name))
            }
        };
        
        context.entities_processed += entities_processed;
        Ok(result)
    }
    
    // System execution implementations
    
    fn execute_session_validation(&self, context: &SystemContext) -> Result<u32> {
        // Validate session keys and clean up expired ones
        // This would iterate through all active session keys
        Ok(0) // Placeholder
    }
    
    fn execute_state_delegation(&self, context: &SystemContext) -> Result<u32> {
        // Process state delegation updates and commits to mainnet
        // This would handle the Ephemeral Rollup state synchronization
        Ok(0) // Placeholder
    }
    
    fn execute_optimistic_updates(&self, context: &SystemContext) -> Result<u32> {
        // Process optimistic updates, confirmations, and rollbacks
        Ok(0) // Placeholder
    }
    
    fn execute_movement_system(&self, context: &SystemContext) -> Result<u32> {
        // Process all movement updates using MovementSystem
        // This would query all entities with Position + Movement components
        Ok(0) // Placeholder
    }
    
    fn execute_combat_system(&self, context: &SystemContext) -> Result<u32> {
        // Process all combat actions using CombatSystem
        // This would handle damage, healing, effects, etc.
        Ok(0) // Placeholder
    }
    
    fn execute_health_regeneration(&self, context: &SystemContext) -> Result<u32> {
        // Process health and mana regeneration for all entities
        Ok(0) // Placeholder
    }
    
    fn execute_cleanup_system(&self, context: &SystemContext) -> Result<u32> {
        // Clean up expired data, optimize memory, etc.
        Ok(0) // Placeholder
    }
    
    /// Get system performance statistics
    pub fn get_performance_stats(&self) -> SystemPerformanceStats {
        let total_execution_time: u64 = self.systems.iter()
            .map(|s| s.execution_time_us)
            .sum();
            
        let enabled_systems = self.systems.iter()
            .filter(|s| s.enabled)
            .count();
            
        SystemPerformanceStats {
            total_systems: self.systems.len(),
            enabled_systems,
            total_execution_time_us: total_execution_time,
            average_execution_time_us: if enabled_systems > 0 { 
                total_execution_time / enabled_systems as u64 
            } else { 
                0 
            },
            tick_count: self.tick_count,
        }
    }
    
    /// Enable or disable a system
    pub fn set_system_enabled(&mut self, system_name: &str, enabled: bool) -> Result<()> {
        if let Some(system) = self.systems.iter_mut().find(|s| s.name == system_name) {
            system.enabled = enabled;
            Ok(())
        } else {
            Err(ProgramError::InvalidArgument.into())
        }
    }
}

/// Result of executing all systems for one tick
#[derive(Clone, Debug)]
pub struct SystemExecutionResult {
    pub tick_number: u64,
    pub total_time_us: u64,
    pub systems_executed: Vec<SystemResult>,
    pub errors: u32,
}

impl SystemExecutionResult {
    fn new() -> Self {
        Self {
            tick_number: 0,
            total_time_us: 0,
            systems_executed: Vec::new(),
            errors: 0,
        }
    }
}

/// Result of executing a single system
#[derive(Clone, Debug)]
pub struct SystemResult {
    pub name: String,
    pub execution_time_us: u64,
    pub entities_processed: u32,
    pub success: bool,
    pub error: Option<String>,
}

/// Internal result type for system execution
struct SingleSystemResult {
    pub success: bool,
    pub entities_processed: u32,
    pub error: Option<String>,
}

impl SingleSystemResult {
    fn success(entities_processed: u32) -> Self {
        Self {
            success: true,
            entities_processed,
            error: None,
        }
    }
    
    fn error(message: String) -> Self {
        Self {
            success: false,
            entities_processed: 0,
            error: Some(message),
        }
    }
}

/// System performance statistics
#[derive(Clone, Debug)]
pub struct SystemPerformanceStats {
    pub total_systems: usize,
    pub enabled_systems: usize,
    pub total_execution_time_us: u64,
    pub average_execution_time_us: u64,
    pub tick_count: u64,
}