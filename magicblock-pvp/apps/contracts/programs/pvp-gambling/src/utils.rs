use anchor_lang::prelude::*;
use crate::error::PvpGamblingError;
use crate::state::{CostModel, GameEscrow, PlayerState};

/// Utility functions for the PvP gambling program
pub struct Utils;

impl Utils {
    /// Validate that an amount is within acceptable bounds
    pub fn validate_amount(amount: u64, min: u64, max: u64) -> Result<()> {
        if amount < min || amount > max {
            return Err(PvpGamblingError::InvalidBetAmount.into());
        }
        Ok(())
    }
    
    /// Calculate rent for an account with given space
    pub fn calculate_rent(space: usize) -> Result<u64> {
        let rent = Rent::get()?;
        Ok(rent.minimum_balance(space))
    }
    
    /// Validate that account has sufficient lamports for rent exemption
    pub fn validate_rent_exempt(account: &AccountInfo, required_space: usize) -> Result<()> {
        let required_rent = Self::calculate_rent(required_space)?;
        if account.lamports() < required_rent {
            return Err(ProgramError::AccountNotRentExempt.into());
        }
        Ok(())
    }
    
    /// Calculate dynamic priority fee based on network conditions
    pub fn calculate_priority_fee(base_fee: u64, congestion_multiplier: f64) -> Result<u64> {
        let multiplier_scaled = (congestion_multiplier * 1000.0) as u64;
        let priority_fee = base_fee
            .checked_mul(multiplier_scaled)
            .ok_or(PvpGamblingError::ArithmeticOverflow)?
            .checked_div(1000)
            .ok_or(PvpGamblingError::ArithmeticOverflow)?;
            
        // Clamp to acceptable range
        let clamped = priority_fee
            .max(CostModel::MIN_PRIORITY_FEE)
            .min(CostModel::MAX_PRIORITY_FEE);
            
        Ok(clamped)
    }
    
    /// Generate program derived address for game escrow
    pub fn find_game_escrow_address(
        program_id: &Pubkey,
        game_id: u64,
        authority: &Pubkey,
    ) -> (Pubkey, u8) {
        let seeds = &[
            b"game_escrow",
            &game_id.to_le_bytes(),
            authority.as_ref(),
        ];
        Pubkey::find_program_address(seeds, program_id)
    }
    
    /// Generate program derived address for player state
    pub fn find_player_state_address(
        program_id: &Pubkey,
        player: &Pubkey,
        game_escrow: &Pubkey,
    ) -> (Pubkey, u8) {
        let seeds = &[
            b"player_state",
            player.as_ref(),
            game_escrow.as_ref(),
        ];
        Pubkey::find_program_address(seeds, program_id)
    }
    
    /// Generate program derived address for game authority
    pub fn find_game_authority_address(
        program_id: &Pubkey,
        game_id: u64,
    ) -> (Pubkey, u8) {
        let seeds = &[
            b"game_authority",
            &game_id.to_le_bytes(),
        ];
        Pubkey::find_program_address(seeds, program_id)
    }
    
    /// Validate game timeout (24 hours default)
    pub fn check_game_timeout(created_at: i64, timeout_seconds: i64) -> Result<bool> {
        let current_time = Clock::get()?.unix_timestamp;
        let elapsed = current_time
            .checked_sub(created_at)
            .ok_or(PvpGamblingError::ArithmeticOverflow)?;
            
        Ok(elapsed > timeout_seconds)
    }
    
    /// Safe arithmetic operations with overflow checking
    pub fn safe_add(a: u64, b: u64) -> Result<u64> {
        a.checked_add(b).ok_or(PvpGamblingError::ArithmeticOverflow.into())
    }
    
    pub fn safe_sub(a: u64, b: u64) -> Result<u64> {
        a.checked_sub(b).ok_or(PvpGamblingError::ArithmeticOverflow.into())
    }
    
    pub fn safe_mul(a: u64, b: u64) -> Result<u64> {
        a.checked_mul(b).ok_or(PvpGamblingError::ArithmeticOverflow.into())
    }
    
    /// Validate signature count for transaction cost calculation
    pub fn validate_signature_count(count: u32) -> Result<()> {
        // Reasonable limits for signature count (1-10)
        if count == 0 || count > 10 {
            return Err(PvpGamblingError::InvalidSignatureCount.into());
        }
        Ok(())
    }
    
    /// Calculate total transaction cost including all fees
    pub fn calculate_total_cost(
        signature_count: u32,
        congestion_level: u8,
        include_rent: bool,
    ) -> Result<u64> {
        Self::validate_signature_count(signature_count)?;
        
        // Base transaction cost
        let tx_cost = CostModel::calculate_transaction_cost(signature_count, congestion_level)?;
        
        if include_rent {
            // Add rent for accounts if needed
            let rent_cost = Self::safe_add(
                GameEscrow::RENT_EXEMPT_LAMPORTS,
                PlayerState::RENT_EXEMPT_LAMPORTS.checked_mul(2).unwrap_or(0),
            )?;
            Self::safe_add(tx_cost, rent_cost)
        } else {
            Ok(tx_cost)
        }
    }
    
    /// Validate that player is authorized for this operation
    pub fn validate_player_authorization(
        game_escrow: &GameEscrow,
        player: &Pubkey,
    ) -> Result<()> {
        if game_escrow.player1 != *player && game_escrow.player2 != *player {
            return Err(PvpGamblingError::InvalidPlayer.into());
        }
        Ok(())
    }
    
    /// Get the opponent player's public key
    pub fn get_opponent(game_escrow: &GameEscrow, player: &Pubkey) -> Result<Pubkey> {
        if game_escrow.player1 == *player {
            Ok(game_escrow.player2)
        } else if game_escrow.player2 == *player {
            Ok(game_escrow.player1)
        } else {
            Err(PvpGamblingError::InvalidPlayer.into())
        }
    }
    
    /// Calculate winner's payout (total minus fees if gasless mode)
    pub fn calculate_payout(
        total_amount: u64,
        accumulated_costs: u64,
        gasless_mode: bool,
    ) -> Result<u64> {
        if gasless_mode {
            // Deduct costs from payout in gasless mode
            Self::safe_sub(total_amount, accumulated_costs)
        } else {
            // Player pays their own costs, winner gets full amount
            Ok(total_amount)
        }
    }
    
    /// Validate account ownership and type
    pub fn validate_account_owner(account: &AccountInfo, expected_owner: &Pubkey) -> Result<()> {
        if account.owner != expected_owner {
            return Err(ProgramError::IncorrectProgramId.into());
        }
        Ok(())
    }
}

/// Constants for validation and limits
pub struct GameConstants;

impl GameConstants {
    /// Minimum bet amount (0.01 SOL)
    pub const MIN_BET_AMOUNT: u64 = 10_000_000; // 0.01 SOL in lamports
    
    /// Maximum bet amount (100 SOL) 
    pub const MAX_BET_AMOUNT: u64 = 100_000_000_000; // 100 SOL in lamports
    
    /// Game timeout in seconds (24 hours)
    pub const GAME_TIMEOUT_SECONDS: i64 = 24 * 60 * 60;
    
    /// Maximum cost cap for gasless mode (0.1 SOL)
    pub const MAX_GASLESS_COST_CAP: u64 = 100_000_000; // 0.1 SOL
    
    /// Network congestion levels (0-10 scale)
    pub const MIN_CONGESTION_LEVEL: u8 = 0;
    pub const MAX_CONGESTION_LEVEL: u8 = 10;
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_safe_arithmetic() {
        // Test normal cases
        assert_eq!(Utils::safe_add(100, 200).unwrap(), 300);
        assert_eq!(Utils::safe_sub(300, 100).unwrap(), 200);
        assert_eq!(Utils::safe_mul(5, 10).unwrap(), 50);
        
        // Test overflow cases
        assert!(Utils::safe_add(u64::MAX, 1).is_err());
        assert!(Utils::safe_sub(100, 200).is_err());
        assert!(Utils::safe_mul(u64::MAX, 2).is_err());
    }
    
    #[test]
    fn test_calculate_priority_fee() {
        let base_fee = 5000;
        
        // Normal multiplier
        let fee1 = Utils::calculate_priority_fee(base_fee, 1.5).unwrap();
        assert_eq!(fee1, 7500);
        
        // High multiplier should be clamped
        let fee2 = Utils::calculate_priority_fee(base_fee, 10.0).unwrap();
        assert_eq!(fee2, CostModel::MAX_PRIORITY_FEE);
        
        // Low multiplier should be clamped  
        let fee3 = Utils::calculate_priority_fee(base_fee, 0.1).unwrap();
        assert_eq!(fee3, CostModel::MIN_PRIORITY_FEE);
    }
    
    #[test]
    fn test_validate_amount() {
        // Valid amount
        assert!(Utils::validate_amount(50_000_000, GameConstants::MIN_BET_AMOUNT, GameConstants::MAX_BET_AMOUNT).is_ok());
        
        // Too low
        assert!(Utils::validate_amount(1_000_000, GameConstants::MIN_BET_AMOUNT, GameConstants::MAX_BET_AMOUNT).is_err());
        
        // Too high
        assert!(Utils::validate_amount(200_000_000_000, GameConstants::MIN_BET_AMOUNT, GameConstants::MAX_BET_AMOUNT).is_err());
    }
    
    #[test]
    fn test_calculate_payout() {
        let total = 2_000_000;
        let costs = 50_000;
        
        // Gasless mode - costs deducted
        let payout1 = Utils::calculate_payout(total, costs, true).unwrap();
        assert_eq!(payout1, 1_950_000);
        
        // Normal mode - full amount
        let payout2 = Utils::calculate_payout(total, costs, false).unwrap();
        assert_eq!(payout2, 2_000_000);
    }
}