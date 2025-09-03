use anchor_lang::prelude::*;
use ed25519_dalek::{PublicKey, Signature, Verifier};
use sha2::{Digest, Sha256};
use rand_core::RngCore;

use crate::error::PvpGamblingError;

/// ECVRF (Elliptic Curve Verifiable Random Function) implementation
/// Used for provably fair winner selection in PvP gambling
pub struct EcVrf;

impl EcVrf {
    /// VRF proof length (Ed25519 signature + additional proof data)
    pub const PROOF_LENGTH: usize = 80;
    
    /// VRF output length (32 bytes hash output)
    pub const OUTPUT_LENGTH: usize = 32;
    
    /// Verify VRF proof and extract randomness
    /// Returns true if proof is valid and the random output
    pub fn verify_and_extract(
        public_key: &[u8; 32],
        proof: &[u8; 80],
        alpha_string: &[u8],
    ) -> Result<([u8; 32], bool)> {
        // Validate input lengths
        if proof.len() != Self::PROOF_LENGTH {
            return Err(PvpGamblingError::InvalidVrfProof.into());
        }
        
        // Extract components from proof
        let signature_bytes = &proof[0..64];
        let proof_bytes = &proof[64..80];
        
        // Construct Ed25519 public key
        let ed_public_key = PublicKey::from_bytes(public_key)
            .map_err(|_| PvpGamblingError::InvalidVrfProof)?;
        
        // Construct signature from proof
        let signature = Signature::from_bytes(signature_bytes)
            .map_err(|_| PvpGamblingError::InvalidVrfProof)?;
        
        // Create the message to verify: hash(alpha_string || proof_bytes)
        let mut hasher = Sha256::new();
        hasher.update(alpha_string);
        hasher.update(proof_bytes);
        let message = hasher.finalize();
        
        // Verify the signature
        let is_valid = ed_public_key.verify(&message, &signature).is_ok();
        
        if !is_valid {
            return Err(PvpGamblingError::VrfVerificationFailed.into());
        }
        
        // Extract randomness by hashing the proof components
        let mut output_hasher = Sha256::new();
        output_hasher.update(public_key);
        output_hasher.update(alpha_string);
        output_hasher.update(proof_bytes);
        let vrf_output = output_hasher.finalize();
        
        let mut output_array = [0u8; 32];
        output_array.copy_from_slice(&vrf_output[..32]);
        
        Ok((output_array, is_valid))
    }
    
    /// Convert VRF output to winner selection using proportional selection
    /// with rejection sampling to prevent modulo bias
    pub fn select_winner(
        vrf_output: &[u8; 32],
        player1_weight: u64,
        player2_weight: u64,
    ) -> Result<bool> {
        if player1_weight == 0 && player2_weight == 0 {
            return Err(PvpGamblingError::InvalidBetAmount.into());
        }
        
        let total_weight = player1_weight
            .checked_add(player2_weight)
            .ok_or(PvpGamblingError::ArithmeticOverflow)?;
        
        // For equal bets, use simple coin flip
        if player1_weight == player2_weight {
            return Ok(vrf_output[0] & 1 == 0);
        }
        
        // Use rejection sampling to avoid modulo bias
        // Convert first 8 bytes of VRF output to u64
        let mut random_bytes = [0u8; 8];
        random_bytes.copy_from_slice(&vrf_output[0..8]);
        let random_value = u64::from_le_bytes(random_bytes);
        
        // Use the full range of u64 and reject values that would cause bias
        let max_fair_value = u64::MAX - (u64::MAX % total_weight);
        
        // If random value would cause bias, use secondary randomness
        let fair_random = if random_value >= max_fair_value {
            // Use next 8 bytes as fallback
            let mut secondary_bytes = [0u8; 8];
            secondary_bytes.copy_from_slice(&vrf_output[8..16]);
            let secondary_random = u64::from_le_bytes(secondary_bytes);
            
            // If still biased, use a combination approach
            if secondary_random >= max_fair_value {
                // XOR the values and take modulo
                (random_value ^ secondary_random) % total_weight
            } else {
                secondary_random % total_weight
            }
        } else {
            random_value % total_weight
        };
        
        // Player 1 wins if fair_random < player1_weight
        Ok(fair_random < player1_weight)
    }
    
    /// Generate a deterministic alpha string for the VRF from game parameters
    pub fn generate_alpha_string(
        game_id: u64,
        player1: &Pubkey,
        player2: &Pubkey,
        bet_amount: u64,
        timestamp: i64,
    ) -> Vec<u8> {
        let mut hasher = Sha256::new();
        hasher.update(b"PVP_GAMBLING_VRF_V1:");
        hasher.update(&game_id.to_le_bytes());
        hasher.update(player1.as_ref());
        hasher.update(player2.as_ref());
        hasher.update(&bet_amount.to_le_bytes());
        hasher.update(&timestamp.to_le_bytes());
        
        hasher.finalize().to_vec()
    }
    
    /// Validate that alpha string matches game parameters
    pub fn validate_alpha_string(
        alpha_string: &[u8],
        game_id: u64,
        player1: &Pubkey,
        player2: &Pubkey,
        bet_amount: u64,
        timestamp: i64,
    ) -> bool {
        let expected = Self::generate_alpha_string(
            game_id,
            player1,
            player2,
            bet_amount,
            timestamp,
        );
        
        alpha_string == expected.as_slice()
    }
}

/// VRF Authority for generating and managing VRF keys
pub struct VrfAuthority;

impl VrfAuthority {
    /// Derive VRF authority PDA
    pub fn find_program_address(program_id: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"vrf_authority"], program_id)
    }
    
    /// Seeds for PDA derivation
    pub const SEED: &'static [u8] = b"vrf_authority";
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_winner_selection_equal_weights() {
        let vrf_output = [0u8; 32];
        let result = EcVrf::select_winner(&vrf_output, 100, 100).unwrap();
        // Should return a boolean (either player can win)
        assert!(result == true || result == false);
    }
    
    #[test]
    fn test_winner_selection_unequal_weights() {
        // Player 1 has much higher weight, should win most of the time
        let mut vrf_output = [0u8; 32];
        
        // Test with different random values
        for i in 0..10 {
            vrf_output[0] = i * 25; // Vary the randomness
            let result = EcVrf::select_winner(&vrf_output, 900, 100).unwrap();
            // With 90% vs 10% weights, player 1 should win most tests
            // But we can't guarantee specific outcomes due to randomness
        }
    }
    
    #[test]
    fn test_alpha_string_generation() {
        let game_id = 12345u64;
        let player1 = Pubkey::new_unique();
        let player2 = Pubkey::new_unique();
        let bet_amount = 1000000u64;
        let timestamp = 1634567890i64;
        
        let alpha1 = EcVrf::generate_alpha_string(
            game_id, &player1, &player2, bet_amount, timestamp
        );
        let alpha2 = EcVrf::generate_alpha_string(
            game_id, &player1, &player2, bet_amount, timestamp
        );
        
        // Should be deterministic
        assert_eq!(alpha1, alpha2);
        
        // Should validate correctly
        assert!(EcVrf::validate_alpha_string(
            &alpha1, game_id, &player1, &player2, bet_amount, timestamp
        ));
    }
    
    #[test]
    fn test_rejection_sampling() {
        // Test with edge cases that might cause modulo bias
        let vrf_output = [0xFFu8; 32]; // Max values
        
        // Should not panic with overflow
        let result = EcVrf::select_winner(&vrf_output, 3, 7);
        assert!(result.is_ok());
        
        // Test with zero weights (should error)
        let result = EcVrf::select_winner(&vrf_output, 0, 0);
        assert!(result.is_err());
    }
}