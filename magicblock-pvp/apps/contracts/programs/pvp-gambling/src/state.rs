use anchor_lang::prelude::*;

/// Game states for state machine validation
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum GameState {
    Initialized,
    WaitingForDeposits,
    ReadyToSettle,
    Settled,
    Aborted,
}

/// Game escrow account storing all game state and funds
#[account]
pub struct GameEscrow {
    /// Unique game identifier
    pub game_id: u64,
    /// First player's public key
    pub player1: Pubkey,
    /// Second player's public key
    pub player2: Pubkey,
    /// Bet amount per player in lamports
    pub bet_amount: u64,
    /// Current game state
    pub game_state: GameState,
    /// Winner's public key (set after settlement)
    pub winner: Option<Pubkey>,
    /// Total amount in escrow
    pub total_amount: u64,
    /// Timestamp when game was created
    pub created_at: i64,
    /// Timestamp when game was settled (if settled)
    pub settled_at: Option<i64>,
    /// Game authority (program derived address)
    pub authority: Pubkey,
    /// Authority bump seed
    pub authority_bump: u8,
    /// Gasless mode enabled flag
    pub gasless_mode: bool,
    /// Maximum cost cap for gasless mode
    pub max_cost_cap: Option<u64>,
    /// Accumulated transaction costs
    pub accumulated_costs: u64,
    /// Number of signatures used
    pub signature_count: u32,
    /// Reserved space for future upgrades
    pub reserved: [u8; 64],
}

impl GameEscrow {
    /// Space calculation for rent exemption
    /// 8 (discriminator) + game_escrow_size()
    pub const LEN: usize = 8 + Self::game_escrow_size();
    
    /// Calculate exact size needed for GameEscrow
    const fn game_escrow_size() -> usize {
        8 +     // game_id
        32 +    // player1
        32 +    // player2  
        8 +     // bet_amount
        1 +     // game_state (enum discriminant)
        1 + 32 +// winner (Option<Pubkey>)
        8 +     // total_amount
        8 +     // created_at
        1 + 8 + // settled_at (Option<i64>)
        32 +    // authority
        1 +     // authority_bump
        1 +     // gasless_mode
        1 + 8 + // max_cost_cap (Option<u64>)
        8 +     // accumulated_costs
        4 +     // signature_count
        64      // reserved
    }
    
    /// Expected rent-exempt amount: 1,447,680 lamports
    pub const RENT_EXEMPT_LAMPORTS: u64 = 1_447_680;
    
    /// Validate state transition
    pub fn can_transition_to(&self, new_state: &GameState) -> bool {
        use GameState::*;
        match (&self.game_state, new_state) {
            (Initialized, WaitingForDeposits) => true,
            (WaitingForDeposits, ReadyToSettle) => true,
            (ReadyToSettle, Settled) => true,
            (Initialized | WaitingForDeposits | ReadyToSettle, Aborted) => true,
            _ => false,
        }
    }
    
    /// Check if both players have deposited
    pub fn both_players_ready(&self) -> bool {
        self.total_amount >= self.bet_amount.checked_mul(2).unwrap_or(0)
    }
    
    /// Add transaction cost with overflow protection
    pub fn add_cost(&mut self, cost: u64) -> Result<()> {
        self.accumulated_costs = self.accumulated_costs
            .checked_add(cost)
            .ok_or(crate::error::PvpGamblingError::ArithmeticOverflow)?;
        Ok(())
    }
    
    /// Check if cost cap is exceeded
    pub fn check_cost_cap(&self) -> Result<()> {
        if let Some(max_cap) = self.max_cost_cap {
            if self.accumulated_costs > max_cap {
                return Err(crate::error::PvpGamblingError::CostCapExceeded.into());
            }
        }
        Ok(())
    }
    
    /// Increment signature count
    pub fn increment_signatures(&mut self, count: u32) -> Result<()> {
        self.signature_count = self.signature_count
            .checked_add(count)
            .ok_or(crate::error::PvpGamblingError::ArithmeticOverflow)?;
        Ok(())
    }
}

/// Individual player state tracking deposits and status
#[account]
pub struct PlayerState {
    /// Player's public key
    pub player: Pubkey,
    /// Associated game escrow
    pub game_escrow: Pubkey,
    /// Amount deposited by this player
    pub deposited_amount: u64,
    /// Whether player has deposited required amount
    pub has_deposited: bool,
    /// Player's transaction costs
    pub player_costs: u64,
    /// Last activity timestamp
    pub last_activity: i64,
    /// Reserved space for future upgrades
    pub reserved: [u8; 32],
}

impl PlayerState {
    /// Space calculation for rent exemption  
    /// 8 (discriminator) + player_state_size()
    pub const LEN: usize = 8 + Self::player_state_size();
    
    /// Calculate exact size needed for PlayerState
    const fn player_state_size() -> usize {
        32 +    // player
        32 +    // game_escrow
        8 +     // deposited_amount
        1 +     // has_deposited
        8 +     // player_costs
        8 +     // last_activity
        32      // reserved
    }
    
    /// Expected rent-exempt amount: 1,113,600 lamports
    pub const RENT_EXEMPT_LAMPORTS: u64 = 1_113_600;
    
    /// Add cost to player's tracking
    pub fn add_cost(&mut self, cost: u64) -> Result<()> {
        self.player_costs = self.player_costs
            .checked_add(cost)
            .ok_or(crate::error::PvpGamblingError::ArithmeticOverflow)?;
        Ok(())
    }
    
    /// Update activity timestamp
    pub fn update_activity(&mut self) {
        self.last_activity = Clock::get().unwrap().unix_timestamp;
    }
}

/// Cost tracking constants based on Solana fee structure
pub struct CostModel;

impl CostModel {
    /// Base fee per signature: 5,000 lamports
    pub const BASE_FEE_PER_SIGNATURE: u64 = 5_000;
    
    /// Priority fee range based on network congestion
    pub const MIN_PRIORITY_FEE: u64 = 5_000;
    pub const MAX_PRIORITY_FEE: u64 = 20_000;
    
    /// Target total cost range for a complete duel
    pub const TARGET_MIN_COST: u64 = 50_000;
    pub const TARGET_MAX_COST: u64 = 100_000;
    
    /// Calculate transaction cost including priority fees
    pub fn calculate_transaction_cost(signature_count: u32, congestion_level: u8) -> Result<u64> {
        let base_cost = Self::BASE_FEE_PER_SIGNATURE
            .checked_mul(signature_count as u64)
            .ok_or(crate::error::PvpGamblingError::ArithmeticOverflow)?;
            
        // Calculate priority fee based on congestion (0-10 scale)
        let priority_multiplier = congestion_level.min(10) as u64;
        let priority_fee_per_sig = Self::MIN_PRIORITY_FEE + 
            (Self::MAX_PRIORITY_FEE - Self::MIN_PRIORITY_FEE) * priority_multiplier / 10;
            
        let priority_cost = priority_fee_per_sig
            .checked_mul(signature_count as u64)
            .ok_or(crate::error::PvpGamblingError::ArithmeticOverflow)?;
            
        base_cost.checked_add(priority_cost)
            .ok_or(crate::error::PvpGamblingError::ArithmeticOverflow.into())
    }
    
    /// Validate cost is within acceptable range
    pub fn validate_cost_range(cost: u64) -> bool {
        cost >= Self::TARGET_MIN_COST && cost <= Self::TARGET_MAX_COST
    }
}