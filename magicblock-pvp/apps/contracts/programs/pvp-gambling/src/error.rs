use anchor_lang::prelude::*;

#[error_code]
pub enum PvpGamblingError {
    #[msg("Invalid player for this operation")]
    InvalidPlayer,
    
    #[msg("Game has not started yet")]
    GameNotStarted,
    
    #[msg("Game has already been settled")]
    GameAlreadySettled,
    
    #[msg("Game has been aborted")]
    GameAborted,
    
    #[msg("Insufficient balance for bet")]
    InsufficientBalance,
    
    #[msg("Invalid bet amount")]
    InvalidBetAmount,
    
    #[msg("Both players must deposit before settling")]
    PlayersNotReady,
    
    #[msg("Invalid VRF proof")]
    InvalidVrfProof,
    
    #[msg("VRF verification failed")]
    VrfVerificationFailed,
    
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    
    #[msg("Cost cap exceeded")]
    CostCapExceeded,
    
    #[msg("Invalid cost cap amount")]
    InvalidCostCap,
    
    #[msg("Gasless mode not enabled")]
    GaslessModeDisabled,
    
    #[msg("Game timeout exceeded")]
    GameTimeout,
    
    #[msg("Invalid game state transition")]
    InvalidStateTransition,
    
    #[msg("Unauthorized access")]
    Unauthorized,
    
    #[msg("Invalid account data")]
    InvalidAccountData,
    
    #[msg("Rent calculation error")]
    RentCalculationError,
    
    #[msg("Invalid signature count")]
    InvalidSignatureCount,
    
    #[msg("Priority fee calculation failed")]
    PriorityFeeCalculationFailed,
}