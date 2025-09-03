use anchor_lang::prelude::*;

#[error_code]
pub enum GameError {
    #[msg("Player not authorized for this action")]
    UnauthorizedPlayer,
    
    #[msg("Game is not in the correct state for this action")]
    InvalidGameState,
    
    #[msg("Match is full")]
    MatchFull,
    
    #[msg("Not player's turn")]
    NotPlayerTurn,
    
    #[msg("Invalid move")]
    InvalidMove,
    
    #[msg("Insufficient funds for entry fee")]
    InsufficientFunds,
    
    #[msg("Game has already ended")]
    GameEnded,
    
    #[msg("Player already registered")]
    PlayerAlreadyRegistered,
    
    #[msg("Player not found")]
    PlayerNotFound,
    
    #[msg("Invalid match configuration")]
    InvalidMatchConfig,
    
    #[msg("Match not found")]
    MatchNotFound,
    
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    
    #[msg("Invalid combat parameters")]
    InvalidCombatParams,
    
    #[msg("Cooldown period not met")]
    CooldownNotMet,
    
    #[msg("Maximum participants reached")]
    MaxParticipantsReached,
    
    #[msg("Reward pool empty")]
    RewardPoolEmpty,
    
    #[msg("Invalid reward distribution")]
    InvalidRewardDistribution,
    
    #[msg("Token account mismatch")]
    TokenAccountMismatch,
    
    #[msg("NFT metadata invalid")]
    InvalidNftMetadata,
    
    #[msg("Staking period not complete")]
    StakingPeriodNotComplete,
    
    #[msg("Invalid upgrade authority")]
    InvalidUpgradeAuthority,
    
    #[msg("Reentrancy attack detected")]
    ReentrancyDetected,
    
    #[msg("Access denied - admin privileges required")]
    AccessDenied,
    
    #[msg("Invalid admin signature")]
    InvalidAdminSignature,
    
    #[msg("Admin not in whitelist")]
    AdminNotWhitelisted,
}