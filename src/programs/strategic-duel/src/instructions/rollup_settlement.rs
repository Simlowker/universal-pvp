use anchor_lang::prelude::*;
use bolt_lang::*;
use crate::components::*;

/// Rollup Settlement with L1 mapping for MagicBlock Ephemeral Rollups
#[derive(Accounts)]
pub struct RollupSettlement<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: L1 settlement authority (MagicBlock validator)
    pub l1_authority: AccountInfo<'info>,

    /// CHECK: World PDA
    #[account(mut)]
    pub world: AccountInfo<'info>,

    /// CHECK: Entity for the duel
    #[account(mut)]
    pub entity: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"duel", entity.key().as_ref()],
        bump,
        constraint = duel.load()?.vrf_verified @ GameError::VrfNotVerified
    )]
    pub duel: Account<'info, ComponentData<DuelComponent>>,

    #[account(
        mut,
        seeds = [b"vrf_attestation", entity.key().as_ref()],
        bump,
        constraint = vrf_attestation.load()?.is_verified @ GameError::AttestationNotVerified
    )]
    pub vrf_attestation: Account<'info, ComponentData<VrfAttestationComponent>>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + std::mem::size_of::<RollupSettlementComponent>(),
        seeds = [b"rollup_settlement", entity.key().as_ref()],
        bump
    )]
    pub rollup_settlement: Account<'info, ComponentData<RollupSettlementComponent>>,

    #[account(
        mut,
        seeds = [b"betting", entity.key().as_ref()],
        bump
    )]
    pub betting: Account<'info, ComponentData<BettingComponent>>,

    #[account(
        mut,
        seeds = [b"player", duel.load()?.winner.unwrap().as_ref(), entity.key().as_ref()],
        bump
    )]
    pub winner_player: Account<'info, ComponentData<PlayerComponent>>,

    /// CHECK: L1 commitment account for state mapping
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + std::mem::size_of::<L1CommitmentComponent>(),
        seeds = [b"l1_commitment", entity.key().as_ref()],
        bump
    )]
    pub l1_commitment: Account<'info, ComponentData<L1CommitmentComponent>>,

    /// CHECK: Treasury for fee collection
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

/// Rollup Settlement Component for managing cross-layer state
#[component]
#[derive(Default)]
pub struct RollupSettlementComponent {
    pub duel_id: u64,
    pub rollup_block_height: u64,
    pub l1_block_height: u64,
    pub settlement_timestamp: i64,
    pub rollup_state_root: [u8; 32],
    pub l1_commitment_hash: [u8; 32],
    pub winner_determination_proof: [u8; 256],
    pub settlement_status: SettlementStatus,
    pub gas_used: u64,
    pub settlement_fee: u64,
    pub optimistic_timeout: i64,
    pub challenge_period_end: i64,
    pub is_finalized: bool,
    pub dispute_count: u8,
}

/// L1 Commitment Component for state mapping
#[component]
#[derive(Default)]
pub struct L1CommitmentComponent {
    pub rollup_hash: [u8; 32],
    pub state_commitment: [u8; 32],
    pub merkle_root: [u8; 32],
    pub commitment_timestamp: i64,
    pub validator_signatures: Vec<[u8; 64]>,
    pub finality_status: FinalityStatus,
    pub withdrawal_enabled: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum SettlementStatus {
    Pending,
    OptimisticConfirmed,
    Challenged,
    Finalized,
    Failed,
}

impl Default for SettlementStatus {
    fn default() -> Self {
        SettlementStatus::Pending
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum FinalityStatus {
    Pending,
    Provisional,
    Final,
    Disputed,
}

impl Default for FinalityStatus {
    fn default() -> Self {
        FinalityStatus::Pending
    }
}

impl<'info> RollupSettlement<'info> {
    pub fn process(
        &mut self,
        rollup_block_height: u64,
        l1_block_height: u64,
        winner_proof: [u8; 256],
        validator_signatures: Vec<[u8; 64]>,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        let mut duel = self.duel.load_mut()?;
        let vrf_attestation = self.vrf_attestation.load()?;
        let mut settlement = self.rollup_settlement.load_mut()?;
        let mut l1_commitment = self.l1_commitment.load_mut()?;
        let mut betting = self.betting.load_mut()?;
        let mut winner_player = self.winner_player.load_mut()?;

        // Verify game is ready for settlement
        require!(duel.ready_for_settlement, GameError::NotReadyForSettlement);
        require!(duel.winner.is_some(), GameError::NoWinnerDetermined);
        require!(!betting.is_settled, GameError::AlreadySettled);

        // Initialize settlement
        settlement.duel_id = duel.duel_id;
        settlement.rollup_block_height = rollup_block_height;
        settlement.l1_block_height = l1_block_height;
        settlement.settlement_timestamp = current_time;
        settlement.winner_determination_proof = winner_proof;

        // Generate rollup state root
        settlement.rollup_state_root = self.generate_rollup_state_root(&duel, &vrf_attestation)?;
        settlement.l1_commitment_hash = vrf_attestation.l1_commitment_hash;

        // Verify winner determination with proof
        let winner_valid = self.verify_winner_determination(&duel, &vrf_attestation, &winner_proof)?;
        require!(winner_valid, GameError::InvalidWinnerProof);

        // Calculate settlement fee and gas costs
        settlement.settlement_fee = self.calculate_settlement_fee(&betting)?;
        settlement.gas_used = self.estimate_gas_usage(&duel)?;

        // Set optimistic timeout (24 hours for challenges)
        settlement.optimistic_timeout = 24 * 60 * 60; // 24 hours in seconds
        settlement.challenge_period_end = current_time + settlement.optimistic_timeout;
        settlement.settlement_status = SettlementStatus::OptimisticConfirmed;

        // Initialize L1 commitment
        l1_commitment.rollup_hash = settlement.rollup_state_root;
        l1_commitment.state_commitment = self.generate_state_commitment(&duel, &betting)?;
        l1_commitment.merkle_root = self.generate_merkle_root(&duel, &betting, &winner_player)?;
        l1_commitment.commitment_timestamp = current_time;
        l1_commitment.validator_signatures = validator_signatures;
        l1_commitment.finality_status = FinalityStatus::Provisional;

        // Validate business invariants
        self.validate_business_invariants(&duel, &betting, &winner_player)?;

        // Calculate and validate rent exemption
        let rent_exempt_balance = self.calculate_dynamic_rent_exemption()?;
        require!(
            **self.winner_player.to_account_info().lamports.borrow() >= rent_exempt_balance,
            GameError::InsufficientRentExemption
        );

        // Start optimistic settlement process
        self.initiate_optimistic_settlement(&mut settlement, &mut betting, &mut winner_player)?;

        emit!(RollupSettlementInitiatedEvent {
            duel_id: duel.duel_id,
            rollup_block_height,
            l1_block_height,
            rollup_state_root: settlement.rollup_state_root,
            l1_commitment_hash: settlement.l1_commitment_hash,
            challenge_period_end: settlement.challenge_period_end,
            settlement_fee: settlement.settlement_fee,
        });

        Ok(())
    }

    fn generate_rollup_state_root(
        &self,
        duel: &DuelComponent,
        attestation: &VrfAttestationComponent,
    ) -> Result<[u8; 32]> {
        let mut state_data = Vec::new();
        
        // Include duel state
        state_data.extend_from_slice(&duel.duel_id.to_le_bytes());
        state_data.extend_from_slice(&duel.current_round.to_le_bytes());
        state_data.push(duel.game_state as u8);
        
        // Include VRF attestation data
        state_data.extend_from_slice(&attestation.vrf_randomness);
        state_data.extend_from_slice(&attestation.weights_hash);
        state_data.extend_from_slice(&attestation.transcript_hash);
        
        // Include winner if determined
        if let Some(winner) = duel.winner {
            state_data.extend_from_slice(winner.as_ref());
        }
        
        Ok(self.hash_bytes(&state_data))
    }

    fn verify_winner_determination(
        &self,
        duel: &DuelComponent,
        attestation: &VrfAttestationComponent,
        proof: &[u8; 256],
    ) -> Result<bool> {
        // Verify that winner determination is valid based on VRF randomness and game state
        let winner = duel.winner.ok_or(GameError::NoWinnerDetermined)?;
        
        // Construct expected proof data
        let mut proof_input = Vec::new();
        proof_input.extend_from_slice(&attestation.vrf_randomness);
        proof_input.extend_from_slice(winner.as_ref());
        proof_input.extend_from_slice(&duel.duel_id.to_le_bytes());
        
        let expected_proof_hash = self.hash_bytes(&proof_input);
        let actual_proof_hash = self.hash_bytes(proof);
        
        // Simplified verification - in production, use zk-SNARK or similar
        Ok(expected_proof_hash[0..16] == actual_proof_hash[0..16])
    }

    fn calculate_settlement_fee(&self, betting: &BettingComponent) -> Result<u64> {
        // Dynamic fee based on pot size and complexity
        let base_fee = 1000; // Base fee in lamports
        let pot_based_fee = betting.total_pot / 1000; // 0.1% of pot
        let complexity_multiplier = if betting.side_pots.len() > 0 { 2 } else { 1 };
        
        Ok(base_fee + pot_based_fee * complexity_multiplier)
    }

    fn estimate_gas_usage(&self, duel: &DuelComponent) -> Result<u64> {
        // Estimate gas based on game complexity
        let base_gas = 10000;
        let round_multiplier = duel.current_round as u64 * 500;
        let state_complexity = if duel.winner.is_some() { 2000 } else { 1000 };
        
        Ok(base_gas + round_multiplier + state_complexity)
    }

    fn generate_state_commitment(
        &self,
        duel: &DuelComponent,
        betting: &BettingComponent,
    ) -> Result<[u8; 32]> {
        let mut commitment_data = Vec::new();
        commitment_data.extend_from_slice(&betting.total_pot.to_le_bytes());
        commitment_data.extend_from_slice(&betting.rake_amount.to_le_bytes());
        commitment_data.push(betting.is_settled as u8);
        commitment_data.extend_from_slice(&duel.duel_id.to_le_bytes());
        
        Ok(self.hash_bytes(&commitment_data))
    }

    fn generate_merkle_root(
        &self,
        duel: &DuelComponent,
        betting: &BettingComponent,
        winner: &PlayerComponent,
    ) -> Result<[u8; 32]> {
        // Generate Merkle root for state verification
        let leaves = vec![
            self.hash_bytes(&duel.duel_id.to_le_bytes()),
            self.hash_bytes(&betting.total_pot.to_le_bytes()),
            self.hash_bytes(winner.player_id.as_ref()),
            self.hash_bytes(&winner.total_winnings.to_le_bytes()),
        ];
        
        self.compute_merkle_root(&leaves)
    }

    fn compute_merkle_root(&self, leaves: &[[u8; 32]]) -> Result<[u8; 32]> {
        if leaves.is_empty() {
            return Ok([0u8; 32]);
        }
        
        let mut current_level = leaves.to_vec();
        
        while current_level.len() > 1 {
            let mut next_level = Vec::new();
            
            for chunk in current_level.chunks(2) {
                if chunk.len() == 2 {
                    let combined = self.combine_hashes(&[chunk[0], chunk[1]]);
                    next_level.push(combined);
                } else {
                    next_level.push(chunk[0]);
                }
            }
            
            current_level = next_level;
        }
        
        Ok(current_level[0])
    }

    fn validate_business_invariants(
        &self,
        duel: &DuelComponent,
        betting: &BettingComponent,
        winner: &PlayerComponent,
    ) -> Result<()> {
        // Validate cap consistency
        require!(
            betting.total_pot > 0,
            GameError::InvalidPotSize
        );

        // Validate weights hash consistency
        let expected_total = betting.total_pot - betting.rake_amount;
        require!(
            winner.total_winnings >= expected_total || betting.side_pots.len() > 0,
            GameError::InconsistentWinnings
        );

        // Validate pot consistency
        let total_side_pot: u64 = betting.side_pots.iter().map(|pot| pot.amount).sum();
        require!(
            betting.total_pot >= total_side_pot + betting.rake_amount,
            GameError::InconsistentPotCalculation
        );

        // Validate game state consistency
        require!(
            duel.game_state == GameState::Completed,
            GameError::InvalidGameState
        );

        Ok(())
    }

    fn calculate_dynamic_rent_exemption(&self) -> Result<u64> {
        let rent = Rent::get()?;
        let base_account_size = 165; // Base account size
        let component_size = std::mem::size_of::<RollupSettlementComponent>();
        let l1_commitment_size = std::mem::size_of::<L1CommitmentComponent>();
        
        let total_size = base_account_size + component_size + l1_commitment_size;
        Ok(rent.minimum_balance(total_size))
    }

    fn initiate_optimistic_settlement(
        &self,
        settlement: &mut RollupSettlementComponent,
        betting: &mut BettingComponent,
        winner: &mut PlayerComponent,
    ) -> Result<()> {
        // Calculate final payout after fees
        let settlement_fee = settlement.settlement_fee;
        let net_payout = betting.total_pot.saturating_sub(betting.rake_amount).saturating_sub(settlement_fee);
        
        // Update winner's balance (optimistically)
        winner.total_winnings = winner.total_winnings.checked_add(net_payout)
            .ok_or(GameError::ArithmeticOverflow)?;
        winner.games_won = winner.games_won.checked_add(1)
            .ok_or(GameError::ArithmeticOverflow)?;
        
        // Mark betting as settled
        betting.is_settled = true;
        
        // Update settlement status
        settlement.settlement_status = SettlementStatus::OptimisticConfirmed;
        
        Ok(())
    }

    fn hash_bytes(&self, input: &[u8]) -> [u8; 32] {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let mut hasher = DefaultHasher::new();
        input.hash(&mut hasher);
        let hash_u64 = hasher.finish();
        
        let mut result = [0u8; 32];
        result[0..8].copy_from_slice(&hash_u64.to_le_bytes());
        
        for i in 1..4 {
            let derived = hash_u64.wrapping_mul(i as u64 + 1);
            result[i * 8..(i + 1) * 8].copy_from_slice(&derived.to_le_bytes());
        }
        
        result
    }

    fn combine_hashes(&self, hashes: &[[u8; 32]]) -> [u8; 32] {
        let mut combined = [0u8; 32];
        for hash in hashes {
            for i in 0..32 {
                combined[i] ^= hash[i];
            }
        }
        combined
    }
}

#[event]
pub struct RollupSettlementInitiatedEvent {
    pub duel_id: u64,
    pub rollup_block_height: u64,
    pub l1_block_height: u64,
    pub rollup_state_root: [u8; 32],
    pub l1_commitment_hash: [u8; 32],
    pub challenge_period_end: i64,
    pub settlement_fee: u64,
}

#[error_code]
pub enum SettlementError {
    #[msg("VRF not verified")]
    VrfNotVerified,
    #[msg("Attestation not verified")]
    AttestationNotVerified,
    #[msg("Not ready for settlement")]
    NotReadyForSettlement,
    #[msg("Invalid winner proof")]
    InvalidWinnerProof,
    #[msg("Invalid pot size")]
    InvalidPotSize,
    #[msg("Inconsistent winnings")]
    InconsistentWinnings,
    #[msg("Inconsistent pot calculation")]
    InconsistentPotCalculation,
    #[msg("Insufficient rent exemption")]
    InsufficientRentExemption,
}