use anchor_lang::prelude::*;
use crate::{
    ComponentTypeId, PositionComponent, HealthComponent, CombatComponent,
    StatusComponent, MatchComponent, TimerComponent, Entity
};

pub mod movement_system;
pub mod combat_system;
pub mod effect_system;
pub mod matchmaking_system;
pub mod result_system;
pub mod commit_system;

pub use movement_system::*;
pub use combat_system::*;
pub use effect_system::*;
pub use matchmaking_system::*;
pub use result_system::*;
pub use commit_system::*;

/// System execution phases for deterministic processing
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum SystemPhase {
    PreUpdate,    // Setup and validation
    Update,       // Main logic execution
    PostUpdate,   // Cleanup and state transitions
    Render,       // Visual updates (client-side)
}

/// System execution priority for ordering
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum SystemPriority {
    Critical = 0,  // Must run first (e.g., input validation)
    High = 1,      // Important systems (e.g., combat)
    Normal = 2,    // Standard systems (e.g., movement)
    Low = 3,       // Non-critical systems (e.g., effects)
    Background = 4, // Cleanup and maintenance
}

/// Base system trait for consistent interface
pub trait System {
    fn execute(&self, world: &mut World, entities: &[Entity]) -> Result<SystemExecutionResult>;
    fn can_run_parallel(&self) -> bool;
    fn get_required_components(&self) -> Vec<ComponentTypeId>;
    fn get_modified_components(&self) -> Vec<ComponentTypeId>;
    fn get_priority(&self) -> SystemPriority;
    fn get_phase(&self) -> SystemPhase;
}

/// Result of system execution
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SystemExecutionResult {
    pub entities_processed: u32,
    pub components_modified: u32,
    pub execution_time_ms: u32,
    pub errors: Vec<SystemError>,
    pub warnings: Vec<SystemWarning>,
    pub events: Vec<SystemEvent>,
}

impl Default for SystemExecutionResult {
    fn default() -> Self {
        Self {
            entities_processed: 0,
            components_modified: 0,
            execution_time_ms: 0,
            errors: Vec::new(),
            warnings: Vec::new(),
            events: Vec::new(),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SystemError {
    pub entity_id: u64,
    pub error_type: SystemErrorType,
    pub message: String,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum SystemErrorType {
    ComponentMissing,
    InvalidState,
    ArithmeticOverflow,
    PermissionDenied,
    ResourceExhausted,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SystemWarning {
    pub entity_id: u64,
    pub warning_type: SystemWarningType,
    pub message: String,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum SystemWarningType {
    LowResources,
    PerformanceIssue,
    StateInconsistency,
    DeprecatedUsage,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SystemEvent {
    pub event_type: SystemEventType,
    pub data: Vec<u8>,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum SystemEventType {
    EntityCreated,
    EntityDestroyed,
    ComponentAdded,
    ComponentRemoved,
    StateChanged,
    ActionExecuted,
    EffectApplied,
    CombatResolved,
    MatchCompleted,
}

/// Parallel execution batch for systems that can run concurrently
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SystemBatch {
    pub systems: Vec<SystemType>,
    pub entity_chunks: Vec<EntityChunk>,
    pub parallel_safe: bool,
    pub dependencies: Vec<SystemType>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum SystemType {
    Movement,
    Combat,
    Effect,
    Matchmaking,
    Result,
    Commit,
    Custom(u32),
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct EntityChunk {
    pub entity_ids: Vec<u64>,
    pub component_mask: u64,
    pub chunk_size: u32,
}

impl EntityChunk {
    pub fn new(entities: Vec<Entity>, component_mask: u64) -> Self {
        let entity_ids = entities.iter().map(|e| e.id).collect();
        let chunk_size = entity_ids.len() as u32;
        
        Self {
            entity_ids,
            component_mask,
            chunk_size,
        }
    }
}

/// System scheduler for managing execution order and dependencies
pub struct SystemScheduler {
    pub systems: Vec<(SystemType, SystemPhase, SystemPriority)>,
    pub dependencies: Vec<(SystemType, Vec<SystemType>)>,
    pub execution_groups: Vec<Vec<SystemType>>,
}

impl SystemScheduler {
    pub fn new() -> Self {
        Self {
            systems: Vec::new(),
            dependencies: Vec::new(),
            execution_groups: Vec::new(),
        }
    }

    pub fn register_system(&mut self, system_type: SystemType, phase: SystemPhase, priority: SystemPriority) {
        self.systems.push((system_type, phase, priority));
    }

    pub fn add_dependency(&mut self, system: SystemType, dependencies: Vec<SystemType>) {
        self.dependencies.push((system, dependencies));
    }

    pub fn build_execution_plan(&mut self) -> Result<Vec<Vec<SystemType>>> {
        // Sort systems by phase, then priority
        self.systems.sort_by(|a, b| {
            a.1.cmp(&b.1).then_with(|| a.2.cmp(&b.2))
        });

        // Group systems that can run in parallel
        let mut execution_groups = Vec::new();
        let mut current_group = Vec::new();
        let mut current_phase = SystemPhase::PreUpdate;
        let mut current_priority = SystemPriority::Critical;

        for (system_type, phase, priority) in &self.systems {
            if *phase != current_phase || *priority != current_priority {
                if !current_group.is_empty() {
                    execution_groups.push(current_group.clone());
                    current_group.clear();
                }
                current_phase = *phase;
                current_priority = *priority;
            }
            current_group.push(*system_type);
        }

        if !current_group.is_empty() {
            execution_groups.push(current_group);
        }

        self.execution_groups = execution_groups.clone();
        Ok(execution_groups)
    }
}

impl Default for SystemScheduler {
    fn default() -> Self {
        let mut scheduler = Self::new();
        
        // Register default systems
        scheduler.register_system(SystemType::Movement, SystemPhase::Update, SystemPriority::Normal);
        scheduler.register_system(SystemType::Combat, SystemPhase::Update, SystemPriority::High);
        scheduler.register_system(SystemType::Effect, SystemPhase::PostUpdate, SystemPriority::Normal);
        scheduler.register_system(SystemType::Matchmaking, SystemPhase::PreUpdate, SystemPriority::High);
        scheduler.register_system(SystemType::Result, SystemPhase::PostUpdate, SystemPriority::High);
        scheduler.register_system(SystemType::Commit, SystemPhase::PostUpdate, SystemPriority::Critical);

        // Add dependencies
        scheduler.add_dependency(SystemType::Combat, vec![SystemType::Movement]);
        scheduler.add_dependency(SystemType::Effect, vec![SystemType::Combat]);
        scheduler.add_dependency(SystemType::Result, vec![SystemType::Combat, SystemType::Effect]);
        scheduler.add_dependency(SystemType::Commit, vec![SystemType::Result]);

        scheduler
    }
}

/// Component query for efficient system entity filtering
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ComponentQuery {
    pub required_components: Vec<ComponentTypeId>,
    pub excluded_components: Vec<ComponentTypeId>,
    pub entity_types: Vec<crate::EntityType>,
    pub active_only: bool,
    pub max_results: u32,
}

impl ComponentQuery {
    pub fn new() -> Self {
        Self {
            required_components: Vec::new(),
            excluded_components: Vec::new(),
            entity_types: Vec::new(),
            active_only: true,
            max_results: 1000,
        }
    }

    pub fn require_component(mut self, component_type: ComponentTypeId) -> Self {
        self.required_components.push(component_type);
        self
    }

    pub fn exclude_component(mut self, component_type: ComponentTypeId) -> Self {
        self.excluded_components.push(component_type);
        self
    }

    pub fn filter_entity_type(mut self, entity_type: crate::EntityType) -> Self {
        self.entity_types.push(entity_type);
        self
    }

    pub fn include_inactive(mut self) -> Self {
        self.active_only = false;
        self
    }

    pub fn limit(mut self, max_results: u32) -> Self {
        self.max_results = max_results;
        self
    }

    /// Calculate component mask for efficient filtering
    pub fn get_required_mask(&self) -> u64 {
        let mut mask = 0u64;
        for component_type in &self.required_components {
            let bit_position = *component_type as u64;
            if bit_position < 64 {
                mask |= 1 << bit_position;
            }
        }
        mask
    }

    pub fn get_excluded_mask(&self) -> u64 {
        let mut mask = 0u64;
        for component_type in &self.excluded_components {
            let bit_position = *component_type as u64;
            if bit_position < 64 {
                mask |= 1 << bit_position;
            }
        }
        mask
    }

    pub fn matches_entity(&self, entity: &Entity) -> bool {
        // Check entity type filter
        if !self.entity_types.is_empty() && !self.entity_types.contains(&entity.entity_type) {
            return false;
        }

        // Check active status
        if self.active_only && !entity.is_active {
            return false;
        }

        // Check component requirements
        let required_mask = self.get_required_mask();
        let excluded_mask = self.get_excluded_mask();

        entity.matches_query(required_mask, excluded_mask)
    }
}

/// Performance metrics for system optimization
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct SystemMetrics {
    pub total_executions: u64,
    pub total_execution_time_ms: u64,
    pub average_execution_time_ms: u32,
    pub entities_processed: u64,
    pub components_modified: u64,
    pub error_count: u32,
    pub warning_count: u32,
    pub last_execution: i64,
}

impl SystemMetrics {
    pub fn update(&mut self, result: &SystemExecutionResult, current_time: i64) {
        self.total_executions += 1;
        self.total_execution_time_ms += result.execution_time_ms as u64;
        self.average_execution_time_ms = (self.total_execution_time_ms / self.total_executions) as u32;
        self.entities_processed += result.entities_processed as u64;
        self.components_modified += result.components_modified as u64;
        self.error_count += result.errors.len() as u32;
        self.warning_count += result.warnings.len() as u32;
        self.last_execution = current_time;
    }

    pub fn get_performance_score(&self) -> f32 {
        if self.total_executions == 0 {
            return 0.0;
        }

        let efficiency = if self.average_execution_time_ms > 0 {
            (self.entities_processed as f32) / (self.average_execution_time_ms as f32)
        } else {
            0.0
        };

        let reliability = if self.total_executions > 0 {
            1.0 - ((self.error_count as f32) / (self.total_executions as f32))
        } else {
            0.0
        };

        (efficiency * 0.7 + reliability * 0.3).min(100.0)
    }
}

use crate::World;