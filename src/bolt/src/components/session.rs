use bolt_lang::*;

/// Session key delegation component for gasless transactions
#[component]
#[derive(Clone, Copy)]
pub struct SessionDelegation {
    pub authority: Pubkey,          // Original wallet that delegated
    pub session_key: Pubkey,        // Ephemeral session key
    pub permissions: u32,           // Bitfield of allowed actions
    pub created_at: i64,           // Delegation timestamp
    pub expires_at: i64,           // Expiration timestamp
    pub uses_remaining: Option<u32>, // Optional usage limit
    pub is_active: bool,           // Can be revoked
    pub last_used: i64,            // Last usage timestamp
}

impl Default for SessionDelegation {
    fn default() -> Self {
        Self {
            authority: Pubkey::default(),
            session_key: Pubkey::default(),
            permissions: 0,
            created_at: 0,
            expires_at: 0,
            uses_remaining: None,
            is_active: false,
            last_used: 0,
        }
    }
}

impl SessionDelegation {
    pub fn new(
        authority: Pubkey,
        session_key: Pubkey,
        permissions: u32,
        current_time: i64,
        duration: i64,
        use_limit: Option<u32>,
    ) -> Self {
        Self {
            authority,
            session_key,
            permissions,
            created_at: current_time,
            expires_at: current_time + duration,
            uses_remaining: use_limit,
            is_active: true,
            last_used: 0,
        }
    }

    pub fn is_valid(&self, current_time: i64) -> bool {
        self.is_active && 
        current_time <= self.expires_at &&
        self.uses_remaining.map_or(true, |uses| uses > 0)
    }

    pub fn can_execute_action(&self, action: SessionAction, current_time: i64) -> bool {
        if !self.is_valid(current_time) {
            return false;
        }

        let action_bit = action as u32;
        (self.permissions & (1 << action_bit)) != 0
    }

    pub fn use_session(&mut self, current_time: i64) -> bool {
        if !self.is_valid(current_time) {
            return false;
        }

        self.last_used = current_time;
        
        if let Some(uses) = self.uses_remaining {
            if uses > 0 {
                self.uses_remaining = Some(uses - 1);
                true
            } else {
                false
            }
        } else {
            true
        }
    }

    pub fn revoke(&mut self) {
        self.is_active = false;
    }

    pub fn extend_expiration(&mut self, additional_time: i64) {
        if self.is_active {
            self.expires_at += additional_time;
        }
    }
}

/// Permissions for session keys (bitfield)
#[derive(Clone, Copy)]
pub enum SessionAction {
    JoinMatch = 0,         // Can join matches
    ExecuteAction = 1,     // Can execute combat actions
    EndTurn = 2,          // Can end turns
    UseConsumable = 3,    // Can use consumable items
    Move = 4,             // Can move position
    Chat = 5,             // Can send chat messages
    ViewStats = 6,        // Can view statistics
    EquipItems = 7,       // Can equip/unequip items
    // Reserved bits 8-31 for future actions
}

pub const SESSION_PERMISSION_ALL: u32 = 0xFF; // All basic actions
pub const SESSION_PERMISSION_GAMEPLAY: u32 = 0x1F; // Join, action, turn, consumable, move
pub const SESSION_PERMISSION_READONLY: u32 = 0x40; // Only view stats

/// Ephemeral Rollup session state component
#[component]
#[derive(Clone, Copy)]
pub struct EphemeralState {
    pub rollup_id: Pubkey,         // Which ER this session is on
    pub sequence_number: u64,       // Transaction sequence for ordering
    pub last_commit: i64,          // Last mainnet commit timestamp
    pub pending_actions: u32,      // Number of uncommitted actions
    pub commit_threshold: u32,     // Actions before forced commit
    pub auto_commit_interval: i64, // Time interval for commits
    pub is_dirty: bool,           // Has uncommitted state changes
    pub commit_authority: Pubkey,  // Who can trigger commits
}

impl Default for EphemeralState {
    fn default() -> Self {
        Self {
            rollup_id: Pubkey::default(),
            sequence_number: 0,
            last_commit: 0,
            pending_actions: 0,
            commit_threshold: 100, // Commit every 100 actions
            auto_commit_interval: 300, // Auto-commit every 5 minutes
            is_dirty: false,
            commit_authority: Pubkey::default(),
        }
    }
}

impl EphemeralState {
    pub fn new(rollup_id: Pubkey, commit_authority: Pubkey) -> Self {
        Self {
            rollup_id,
            commit_authority,
            ..Default::default()
        }
    }

    pub fn record_action(&mut self, current_time: i64) {
        self.pending_actions += 1;
        self.sequence_number += 1;
        self.is_dirty = true;
    }

    pub fn should_commit(&self, current_time: i64) -> bool {
        self.pending_actions >= self.commit_threshold ||
        (self.is_dirty && current_time >= self.last_commit + self.auto_commit_interval)
    }

    pub fn commit(&mut self, current_time: i64) {
        self.last_commit = current_time;
        self.pending_actions = 0;
        self.is_dirty = false;
    }

    pub fn get_latency_estimate(&self) -> u64 {
        // Estimate based on pending actions and rollup performance
        let base_latency = 30; // 30ms base ER latency
        let congestion_penalty = (self.pending_actions / 10).min(50); // Max 50ms penalty
        base_latency + congestion_penalty as u64
    }
}

/// Gasless transaction tracking component
#[component]
#[derive(Clone, Copy)]
pub struct GaslessTransaction {
    pub sponsor: Pubkey,           // Who pays for gas
    pub user: Pubkey,             // Who initiated the action
    pub transaction_hash: [u8; 32], // Transaction hash
    pub gas_used: u64,            // Gas consumed
    pub timestamp: i64,           // When transaction occurred
    pub action_type: u8,          // What action was performed
    pub success: bool,            // Transaction result
    pub error_code: Option<u32>,  // Error if failed
}

impl Default for GaslessTransaction {
    fn default() -> Self {
        Self {
            sponsor: Pubkey::default(),
            user: Pubkey::default(),
            transaction_hash: [0; 32],
            gas_used: 0,
            timestamp: 0,
            action_type: 0,
            success: false,
            error_code: None,
        }
    }
}

/// Magic Router configuration component
#[component]
#[derive(Clone, Copy)]
pub struct RouterConfig {
    pub mainnet_endpoint: [u8; 256],    // Mainnet RPC endpoint
    pub er_endpoint: [u8; 256],         // Ephemeral Rollup endpoint
    pub routing_strategy: RoutingStrategy,
    pub latency_threshold: u64,         // Switch to ER if mainnet > this
    pub cost_threshold: u64,            // Switch to ER if mainnet cost > this
    pub auto_route: bool,               // Enable automatic routing
    pub preferred_network: NetworkPreference,
    pub fallback_enabled: bool,         // Fallback to mainnet if ER fails
}

impl Default for RouterConfig {
    fn default() -> Self {
        Self {
            mainnet_endpoint: [0; 256],
            er_endpoint: [0; 256],
            routing_strategy: RoutingStrategy::LatencyOptimized,
            latency_threshold: 100, // 100ms
            cost_threshold: 10000,  // 0.01 SOL in lamports
            auto_route: true,
            preferred_network: NetworkPreference::EphemeralRollup,
            fallback_enabled: true,
        }
    }
}

#[derive(Clone, Copy)]
pub enum RoutingStrategy {
    LatencyOptimized = 0,  // Route based on fastest response
    CostOptimized = 1,     // Route based on lowest cost
    Balanced = 2,          // Balance latency and cost
    ForceMainnet = 3,      // Always use mainnet
    ForceER = 4,          // Always use ER
}

impl Default for RoutingStrategy {
    fn default() -> Self {
        RoutingStrategy::LatencyOptimized
    }
}

#[derive(Clone, Copy)]
pub enum NetworkPreference {
    EphemeralRollup = 0,
    Mainnet = 1,
    Auto = 2,
}

impl Default for NetworkPreference {
    fn default() -> Self {
        NetworkPreference::Auto
    }
}