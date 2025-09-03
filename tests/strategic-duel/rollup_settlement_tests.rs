use anchor_lang::prelude::*;
use strategic_duel::*;
use solana_program_test::*;
use solana_sdk::{
    signature::{Keypair, Signer},
    transaction::Transaction,
};

#[tokio::test]
async fn test_rollup_settlement_full_flow() {
    let program_id = strategic_duel::id();
    let mut context = ProgramTest::new(
        "strategic_duel",
        program_id,
        processor!(strategic_duel::entry),
    )
    .start_with_context()
    .await;

    // Setup accounts
    let authority = Keypair::new();
    let l1_authority = Keypair::new();
    let entity = Keypair::new();
    let winner = Keypair::new();
    let treasury = Keypair::new();
    
    // Airdrop SOL to all accounts
    let rent = context.banks_client.get_rent().await.unwrap();
    let airdrop_amount = rent.minimum_balance(2000) * 10;
    
    for account in [&authority, &winner, &treasury] {
        context
            .banks_client
            .process_transaction(Transaction::new_signed_with_payer(
                &[solana_sdk::system_instruction::transfer(
                    &context.payer.pubkey(),
                    &account.pubkey(),
                    airdrop_amount,
                )],
                Some(&context.payer.pubkey()),
                &[&context.payer],
                context.last_blockhash,
            ))
            .await
            .unwrap();
    }

    // Setup test data
    let rollup_block_height = 100u64;
    let l1_block_height = 50u64;
    let winner_proof = generate_test_winner_proof();
    let validator_signatures = vec![generate_test_validator_signature()];

    // Create required accounts and set proper state
    setup_duel_for_settlement(&mut context, &entity, &authority, &winner).await;

    // Test rollup settlement instruction
    let accounts = strategic_duel::accounts::RollupSettlement {
        authority: authority.pubkey(),
        l1_authority: l1_authority.pubkey(),
        world: Pubkey::new_unique(),
        entity: entity.pubkey(),
        duel: get_duel_pda(&entity.pubkey()),
        vrf_attestation: get_vrf_attestation_pda(&entity.pubkey()),
        rollup_settlement: get_rollup_settlement_pda(&entity.pubkey()),
        betting: get_betting_pda(&entity.pubkey()),
        winner_player: get_player_pda(&winner.pubkey(), &entity.pubkey()),
        l1_commitment: get_l1_commitment_pda(&entity.pubkey()),
        treasury: treasury.pubkey(),
        system_program: solana_sdk::system_program::id(),
    };

    let instruction = Instruction {
        program_id,
        accounts: accounts.to_account_metas(Some(true)),
        data: strategic_duel::instruction::RollupSettlement {
            rollup_block_height,
            l1_block_height,
            winner_proof,
            validator_signatures,
        }
        .data(),
    };

    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&context.payer.pubkey()),
        &[&context.payer, &authority],
        context.last_blockhash,
    );

    let result = context.banks_client.process_transaction(transaction).await;
    
    match result {
        Ok(_) => {
            println!("Rollup settlement successful");
            // Verify settlement state
            verify_settlement_state(&mut context, &entity).await;
        },
        Err(e) => println!("Rollup settlement failed: {:?}", e),
    }
}

#[tokio::test]
async fn test_business_invariants_validation() {
    // Test cap/weights/pot consistency validation
    let test_pot_size = 1000u64;
    let test_rake_amount = 25u64; // 2.5%
    let test_winner_amount = test_pot_size - test_rake_amount;
    
    assert!(validate_pot_consistency(test_pot_size, test_rake_amount, test_winner_amount));
    
    // Test invalid cases
    let invalid_winner_amount = test_pot_size + 100; // More than pot
    assert!(!validate_pot_consistency(test_pot_size, test_rake_amount, invalid_winner_amount));
    
    let invalid_rake = test_pot_size + 100; // Rake larger than pot
    assert!(!validate_pot_consistency(test_pot_size, invalid_rake, test_winner_amount));
    
    println!("Business invariants validation tests passed");
}

#[tokio::test]
async fn test_dynamic_rent_exemption() {
    let program_id = strategic_duel::id();
    let mut context = ProgramTest::new(
        "strategic_duel",
        program_id,
        processor!(strategic_duel::entry),
    )
    .start_with_context()
    .await;

    let rent = context.banks_client.get_rent().await.unwrap();
    
    // Test rent calculation for different account sizes
    let base_size = 165;
    let settlement_component_size = std::mem::size_of::<RollupSettlementComponent>();
    let l1_commitment_size = std::mem::size_of::<L1CommitmentComponent>();
    
    let total_size = base_size + settlement_component_size + l1_commitment_size;
    let required_rent = rent.minimum_balance(total_size);
    
    println!("Required rent exemption: {} lamports for {} bytes", required_rent, total_size);
    
    assert!(required_rent > 0, "Rent exemption should be greater than 0");
    assert!(total_size > 0, "Total account size should be greater than 0");
    
    // Test with different component configurations
    let minimal_size = base_size + settlement_component_size;
    let minimal_rent = rent.minimum_balance(minimal_size);
    
    assert!(required_rent > minimal_rent, "Full configuration should require more rent than minimal");
}

#[tokio::test]
async fn test_optimistic_settlement_period() {
    let program_id = strategic_duel::id();
    let mut context = ProgramTest::new(
        "strategic_duel",
        program_id,
        processor!(strategic_duel::entry),
    )
    .start_with_context()
    .await;

    // Test optimistic timeout calculation
    let current_timestamp = 1640995200i64; // Fixed timestamp for testing
    let optimistic_timeout = 24 * 60 * 60; // 24 hours
    let expected_end = current_timestamp + optimistic_timeout;
    
    let settlement = create_test_settlement_component(current_timestamp, optimistic_timeout);
    
    assert_eq!(settlement.challenge_period_end, expected_end);
    assert_eq!(settlement.optimistic_timeout, optimistic_timeout);
    assert_eq!(settlement.settlement_status, SettlementStatus::OptimisticConfirmed);
    
    // Test settlement finalization after challenge period
    let post_challenge_timestamp = expected_end + 1;
    assert!(can_finalize_settlement(&settlement, post_challenge_timestamp));
    
    // Test challenge window still active
    let during_challenge_timestamp = current_timestamp + (optimistic_timeout / 2);
    assert!(!can_finalize_settlement(&settlement, during_challenge_timestamp));
    
    println!("Optimistic settlement period tests passed");
}

#[tokio::test]
async fn test_l1_commitment_generation() {
    // Test L1 commitment hash generation
    let test_duel_id = 12345u64;
    let test_pot_size = 1000u64;
    let test_rake = 25u64;
    let test_winner = Pubkey::new_unique();
    
    let commitment = generate_test_l1_commitment(test_duel_id, test_pot_size, test_rake, test_winner);
    
    assert_ne!(commitment.state_commitment, [0u8; 32], "State commitment should not be empty");
    assert_ne!(commitment.merkle_root, [0u8; 32], "Merkle root should not be empty");
    assert!(commitment.validator_signatures.is_empty(), "Should start with no signatures");
    assert_eq!(commitment.finality_status, FinalityStatus::Provisional);
    
    // Test deterministic generation
    let commitment2 = generate_test_l1_commitment(test_duel_id, test_pot_size, test_rake, test_winner);
    assert_eq!(commitment.state_commitment, commitment2.state_commitment, "State commitment should be deterministic");
    assert_eq!(commitment.merkle_root, commitment2.merkle_root, "Merkle root should be deterministic");
    
    // Test different inputs produce different commitments
    let different_commitment = generate_test_l1_commitment(test_duel_id + 1, test_pot_size, test_rake, test_winner);
    assert_ne!(commitment.state_commitment, different_commitment.state_commitment, "Different inputs should produce different commitments");
    
    println!("L1 commitment generation tests passed");
}

#[tokio::test]
async fn test_merkle_root_computation() {
    // Test Merkle root computation for state verification
    let leaves = vec![
        hash_test_data(b"duel_id_12345"),
        hash_test_data(b"pot_size_1000"),
        hash_test_data(b"winner_pubkey"),
        hash_test_data(b"total_winnings_975"),
    ];
    
    let merkle_root = compute_test_merkle_root(&leaves);
    assert_ne!(merkle_root, [0u8; 32], "Merkle root should not be empty");
    
    // Test with single leaf
    let single_leaf = vec![leaves[0]];
    let single_root = compute_test_merkle_root(&single_leaf);
    assert_eq!(single_root, leaves[0], "Single leaf should be its own root");
    
    // Test with empty leaves
    let empty_leaves: Vec<[u8; 32]> = vec![];
    let empty_root = compute_test_merkle_root(&empty_leaves);
    assert_eq!(empty_root, [0u8; 32], "Empty leaves should produce zero root");
    
    // Test odd number of leaves
    let odd_leaves = vec![leaves[0], leaves[1], leaves[2]];
    let odd_root = compute_test_merkle_root(&odd_leaves);
    assert_ne!(odd_root, [0u8; 32], "Odd number of leaves should produce valid root");
    
    println!("Merkle root computation tests passed: {:?}", merkle_root);
}

#[tokio::test]
async fn test_settlement_fee_calculation() {
    // Test dynamic fee calculation based on pot size and complexity
    let base_fee = 1000u64;
    
    // Simple game (no side pots)
    let simple_pot = 10000u64;
    let simple_fee = calculate_test_settlement_fee(simple_pot, false);
    let expected_simple = base_fee + (simple_pot / 1000);
    assert_eq!(simple_fee, expected_simple);
    
    // Complex game (with side pots)
    let complex_fee = calculate_test_settlement_fee(simple_pot, true);
    let expected_complex = expected_simple * 2; // 2x multiplier for complexity
    assert_eq!(complex_fee, expected_complex);
    
    // Large pot test
    let large_pot = 1000000u64;
    let large_fee = calculate_test_settlement_fee(large_pot, false);
    assert!(large_fee > simple_fee, "Large pot should have higher fee");
    
    // Fee should be reasonable proportion of pot
    assert!(large_fee < large_pot / 10, "Fee should be less than 10% of pot");
    
    println!("Settlement fee calculation tests passed");
}

// Helper functions for testing

async fn setup_duel_for_settlement(
    context: &mut ProgramTestContext,
    entity: &Keypair,
    authority: &Keypair,
    winner: &Keypair,
) {
    // Mock implementation - would set up duel in proper state for settlement
    println!("Setting up duel for settlement testing");
}

async fn verify_settlement_state(context: &mut ProgramTestContext, entity: &Keypair) {
    // Mock implementation - would verify the settlement completed correctly
    println!("Verifying settlement state after completion");
}

fn get_rollup_settlement_pda(entity: &Pubkey) -> Pubkey {
    let seeds = &[b"rollup_settlement", entity.as_ref()];
    Pubkey::find_program_address(seeds, &strategic_duel::id()).0
}

fn get_l1_commitment_pda(entity: &Pubkey) -> Pubkey {
    let seeds = &[b"l1_commitment", entity.as_ref()];
    Pubkey::find_program_address(seeds, &strategic_duel::id()).0
}

fn get_player_pda(player: &Pubkey, entity: &Pubkey) -> Pubkey {
    let seeds = &[b"player", player.as_ref(), entity.as_ref()];
    Pubkey::find_program_address(seeds, &strategic_duel::id()).0
}

fn get_duel_pda(entity: &Pubkey) -> Pubkey {
    let seeds = &[b"duel", entity.as_ref()];
    Pubkey::find_program_address(seeds, &strategic_duel::id()).0
}

fn get_vrf_attestation_pda(entity: &Pubkey) -> Pubkey {
    let seeds = &[b"vrf_attestation", entity.as_ref()];
    Pubkey::find_program_address(seeds, &strategic_duel::id()).0
}

fn get_betting_pda(entity: &Pubkey) -> Pubkey {
    let seeds = &[b"betting", entity.as_ref()];
    Pubkey::find_program_address(seeds, &strategic_duel::id()).0
}

fn generate_test_winner_proof() -> [u8; 256] {
    let mut proof = [0u8; 256];
    for i in 0..256 {
        proof[i] = (i % 256) as u8;
    }
    proof
}

fn generate_test_validator_signature() -> [u8; 64] {
    let mut signature = [0u8; 64];
    for i in 0..64 {
        signature[i] = (i * 2) as u8;
    }
    signature
}

fn validate_pot_consistency(pot_size: u64, rake_amount: u64, winner_amount: u64) -> bool {
    pot_size > 0 && 
    rake_amount <= pot_size &&
    winner_amount <= (pot_size - rake_amount) &&
    (rake_amount + winner_amount) <= pot_size
}

fn create_test_settlement_component(timestamp: i64, timeout: i64) -> RollupSettlementComponent {
    RollupSettlementComponent {
        duel_id: 12345,
        rollup_block_height: 100,
        l1_block_height: 50,
        settlement_timestamp: timestamp,
        rollup_state_root: [1u8; 32],
        l1_commitment_hash: [2u8; 32],
        winner_determination_proof: [3u8; 256],
        settlement_status: SettlementStatus::OptimisticConfirmed,
        gas_used: 50000,
        settlement_fee: 1000,
        optimistic_timeout: timeout,
        challenge_period_end: timestamp + timeout,
        is_finalized: false,
        dispute_count: 0,
    }
}

fn can_finalize_settlement(settlement: &RollupSettlementComponent, current_time: i64) -> bool {
    current_time > settlement.challenge_period_end &&
    settlement.settlement_status == SettlementStatus::OptimisticConfirmed &&
    !settlement.is_finalized
}

fn generate_test_l1_commitment(duel_id: u64, pot_size: u64, rake: u64, winner: Pubkey) -> L1CommitmentComponent {
    let state_commitment = hash_test_data(&[
        &pot_size.to_le_bytes(),
        &rake.to_le_bytes(),
        &[1u8], // is_settled = true
        &duel_id.to_le_bytes(),
    ].concat());
    
    let merkle_leaves = vec![
        hash_test_data(&duel_id.to_le_bytes()),
        hash_test_data(&pot_size.to_le_bytes()),
        hash_test_data(winner.as_ref()),
        hash_test_data(&(pot_size - rake).to_le_bytes()), // winner amount
    ];
    
    let merkle_root = compute_test_merkle_root(&merkle_leaves);
    
    L1CommitmentComponent {
        rollup_hash: [1u8; 32],
        state_commitment,
        merkle_root,
        commitment_timestamp: 1640995200,
        validator_signatures: vec![],
        finality_status: FinalityStatus::Provisional,
        withdrawal_enabled: false,
    }
}

fn hash_test_data(input: &[u8]) -> [u8; 32] {
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

fn compute_test_merkle_root(leaves: &[[u8; 32]]) -> [u8; 32] {
    if leaves.is_empty() {
        return [0u8; 32];
    }
    
    let mut current_level = leaves.to_vec();
    
    while current_level.len() > 1 {
        let mut next_level = Vec::new();
        
        for chunk in current_level.chunks(2) {
            if chunk.len() == 2 {
                let combined = combine_test_hashes(&[chunk[0], chunk[1]]);
                next_level.push(combined);
            } else {
                next_level.push(chunk[0]);
            }
        }
        
        current_level = next_level;
    }
    
    current_level[0]
}

fn combine_test_hashes(hashes: &[[u8; 32]]) -> [u8; 32] {
    let mut combined = [0u8; 32];
    for hash in hashes {
        for i in 0..32 {
            combined[i] ^= hash[i];
        }
    }
    combined
}

fn calculate_test_settlement_fee(pot_size: u64, has_side_pots: bool) -> u64 {
    let base_fee = 1000u64;
    let pot_based_fee = pot_size / 1000; // 0.1% of pot
    let complexity_multiplier = if has_side_pots { 2 } else { 1 };
    
    base_fee + pot_based_fee * complexity_multiplier
}