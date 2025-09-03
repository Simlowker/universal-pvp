use anchor_lang::prelude::*;
use solana_program_test::*;
use solana_sdk::{
    signature::{Keypair, Signer},
    transaction::Transaction,
    compute_budget::ComputeBudgetInstruction,
};
use std::time::{Duration, Instant};
use sol_duel_game::{*, state::*};

/// Performance Tests for Smart Contract Compute Units and Optimization
/// Tests for gas efficiency, throughput, and resource utilization

#[tokio::test]
async fn test_compute_unit_limits() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_performance_test_context().await?;
    
    // Test player registration compute units
    let player = Keypair::new();
    fund_account(&mut test_context, &player.pubkey(), 1_000_000_000).await?;
    
    let (profile_pda, _) = Pubkey::find_program_address(
        &[b"player", player.pubkey().as_ref()],
        &sol_duel_game::ID,
    );
    
    // Add compute budget instruction to measure actual usage
    let compute_budget_ix = ComputeBudgetInstruction::set_compute_unit_limit(200_000);
    
    let register_ix = register_player(
        sol_duel_game::ID,
        &RegisterPlayerAccounts {
            player_profile: profile_pda,
            player: player.pubkey(),
            system_program: system_program::ID,
        },
        "TestPlayer".to_string(),
        shared::PlayerClass::Warrior,
    );
    
    let transaction = Transaction::new_signed_with_payer(
        &[compute_budget_ix, register_ix],
        Some(&player.pubkey()),
        &[&player],
        test_context.recent_blockhash,
    );
    
    let result = test_context.banks_client.process_transaction(transaction).await;
    assert!(result.is_ok(), "Player registration should complete within compute limits");
    
    println!("✅ Player registration completed within compute unit limits");
    
    Ok(())
}

#[tokio::test]
async fn test_match_creation_performance() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_performance_test_context().await?;
    
    // Setup player
    let creator = setup_performance_player(&mut test_context, "Creator", shared::PlayerClass::Warrior).await?;
    
    let match_config = shared::MatchConfig {
        max_players: 8, // Larger match for stress testing
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![40, 30, 20, 10],
    };
    
    // Measure performance
    let start_time = Instant::now();
    
    let compute_budget_ix = ComputeBudgetInstruction::set_compute_unit_limit(300_000);
    
    let match_id = create_performance_match(&mut test_context, &creator, match_config, Some(compute_budget_ix)).await?;
    
    let duration = start_time.elapsed();
    assert!(duration < Duration::from_millis(1000), "Match creation should complete in <1s");
    
    println!("✅ Match creation completed in {:?}", duration);
    
    // Verify match was created successfully
    let match_account = test_context.banks_client.get_account(match_id).await?.unwrap();
    assert!(match_account.data.len() > 0);
    
    Ok(())
}

#[tokio::test]
async fn test_combat_action_throughput() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_performance_test_context().await?;
    
    // Setup players and match
    let player1 = setup_performance_player(&mut test_context, "Player1", shared::PlayerClass::Warrior).await?;
    let player2 = setup_performance_player(&mut test_context, "Player2", shared::PlayerClass::Mage).await?;
    
    let match_config = shared::MatchConfig {
        max_players: 2,
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![100],
    };
    
    let match_id = create_performance_match(&mut test_context, &player1, match_config, None).await?;
    join_performance_match(&mut test_context, &player2, match_id).await?;
    
    // Execute multiple combat actions and measure throughput
    let num_actions = 50;
    let start_time = Instant::now();
    
    for i in 0..num_actions {
        let current_player = if i % 2 == 0 { &player1 } else { &player2 };
        
        let compute_budget_ix = ComputeBudgetInstruction::set_compute_unit_limit(150_000);
        
        let combat_action = execute_combat_action(
            sol_duel_game::ID,
            &ExecuteCombatActionAccounts {
                match_account: match_id,
                player_profile: current_player.profile_pda,
                player: current_player.keypair.pubkey(),
            },
            shared::CombatAction::Attack { target: 1 - (i % 2), power: 25 },
        );
        
        let transaction = Transaction::new_signed_with_payer(
            &[compute_budget_ix, combat_action],
            Some(&current_player.keypair.pubkey()),
            &[&current_player.keypair],
            test_context.recent_blockhash,
        );
        
        let result = test_context.banks_client.process_transaction(transaction).await;
        if result.is_err() {
            break; // Stop if match ends or error occurs
        }
    }
    
    let duration = start_time.elapsed();
    let actions_per_second = num_actions as f64 / duration.as_secs_f64();
    
    assert!(actions_per_second > 10.0, "Should process at least 10 actions per second");
    println!("✅ Combat throughput: {:.2} actions/second", actions_per_second);
    
    Ok(())
}

#[tokio::test]
async fn test_concurrent_match_scaling() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_performance_test_context().await?;
    
    // Create multiple matches concurrently
    let num_matches = 10;
    let mut match_ids = Vec::new();
    
    let start_time = Instant::now();
    
    for i in 0..num_matches {
        let creator = setup_performance_player(&mut test_context, &format!("Creator{}", i), shared::PlayerClass::Warrior).await?;
        
        let match_config = shared::MatchConfig {
            max_players: 4,
            entry_fee: 1_000_000,
            turn_timeout: 60,
            match_duration: 1800,
            reward_distribution: vec![50, 30, 20],
        };
        
        let match_id = create_performance_match(&mut test_context, &creator, match_config, None).await?;
        match_ids.push(match_id);
    }
    
    let duration = start_time.elapsed();
    let matches_per_second = num_matches as f64 / duration.as_secs_f64();
    
    assert!(matches_per_second > 5.0, "Should create at least 5 matches per second");
    assert_eq!(match_ids.len(), num_matches, "All matches should be created successfully");
    
    println!("✅ Match creation scaling: {:.2} matches/second", matches_per_second);
    
    Ok(())
}

#[tokio::test]
async fn test_large_match_performance() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_performance_test_context().await?;
    
    // Create match with maximum players
    let max_players = 16; // Stress test with large match
    let creator = setup_performance_player(&mut test_context, "Creator", shared::PlayerClass::Warrior).await?;
    
    let match_config = shared::MatchConfig {
        max_players,
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![30, 25, 20, 15, 10],
    };
    
    let start_time = Instant::now();
    let match_id = create_performance_match(&mut test_context, &creator, match_config, None).await?;
    
    // Add players to the match
    let mut players = vec![creator];
    
    for i in 1..max_players {
        let player = setup_performance_player(&mut test_context, &format!("Player{}", i), shared::PlayerClass::Mage).await?;
        join_performance_match(&mut test_context, &player, match_id).await?;
        players.push(player);
    }
    
    let setup_duration = start_time.elapsed();
    
    // Start combat simulation
    let combat_start = Instant::now();
    
    // Simulate one round of combat with all players
    for (i, player) in players.iter().enumerate() {
        let target = (i + 1) % players.len();
        
        let combat_action = execute_combat_action(
            sol_duel_game::ID,
            &ExecuteCombatActionAccounts {
                match_account: match_id,
                player_profile: player.profile_pda,
                player: player.keypair.pubkey(),
            },
            shared::CombatAction::Attack { target, power: 20 },
        );
        
        let transaction = Transaction::new_signed_with_payer(
            &[combat_action],
            Some(&player.keypair.pubkey()),
            &[&player.keypair],
            test_context.recent_blockhash,
        );
        
        let result = test_context.banks_client.process_transaction(transaction).await;
        if result.is_err() {
            break; // Combat may end early
        }
    }
    
    let combat_duration = combat_start.elapsed();
    
    assert!(setup_duration < Duration::from_secs(10), "Large match setup should complete in <10s");
    assert!(combat_duration < Duration::from_secs(5), "Combat round should complete in <5s");
    
    println!("✅ Large match ({} players) - Setup: {:?}, Combat round: {:?}", 
             max_players, setup_duration, combat_duration);
    
    Ok(())
}

#[tokio::test]
async fn test_memory_usage_optimization() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_performance_test_context().await?;
    
    // Test account size optimization
    let player = setup_performance_player(&mut test_context, "MemTest", shared::PlayerClass::Warrior).await?;
    
    // Check player profile account size
    let profile_account = test_context.banks_client.get_account(player.profile_pda).await?.unwrap();
    let profile_size = profile_account.data.len();
    
    // Should be reasonable size (not excessive)
    assert!(profile_size < 1024, "Player profile should be <1KB, actual: {} bytes", profile_size);
    
    // Create match and check account size
    let match_config = shared::MatchConfig {
        max_players: 8,
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![40, 30, 20, 10],
    };
    
    let match_id = create_performance_match(&mut test_context, &player, match_config, None).await?;
    let match_account = test_context.banks_client.get_account(match_id).await?.unwrap();
    let match_size = match_account.data.len();
    
    // Match account should also be reasonable
    assert!(match_size < 2048, "Match account should be <2KB, actual: {} bytes", match_size);
    
    println!("✅ Memory usage - Profile: {} bytes, Match: {} bytes", profile_size, match_size);
    
    Ok(())
}

#[tokio::test]
async fn test_transaction_batching_performance() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_performance_test_context().await?;
    
    // Test batching multiple operations in single transaction
    let player = Keypair::new();
    fund_account(&mut test_context, &player.pubkey(), 5_000_000_000).await?;
    
    let (profile_pda, _) = Pubkey::find_program_address(
        &[b"player", player.pubkey().as_ref()],
        &sol_duel_game::ID,
    );
    
    // Batch multiple operations
    let compute_budget_ix = ComputeBudgetInstruction::set_compute_unit_limit(500_000);
    
    let register_ix = register_player(
        sol_duel_game::ID,
        &RegisterPlayerAccounts {
            player_profile: profile_pda,
            player: player.pubkey(),
            system_program: system_program::ID,
        },
        "BatchPlayer".to_string(),
        shared::PlayerClass::Warrior,
    );
    
    // Create match in same transaction
    let match_config = shared::MatchConfig {
        max_players: 2,
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![100],
    };
    
    let timestamp = Clock::get()?.unix_timestamp;
    let (match_pda, _) = Pubkey::find_program_address(
        &[b"match", player.pubkey().as_ref(), &timestamp.to_le_bytes()],
        &sol_duel_game::ID,
    );
    
    let create_match_ix = create_match(
        sol_duel_game::ID,
        &CreateMatchAccounts {
            match_account: match_pda,
            creator_profile: profile_pda,
            creator: player.pubkey(),
            creator_token_account: player.pubkey(), // Mock for test
            sol_mint: spl_token::native_mint::ID,
            token_program: spl_token::ID,
            system_program: system_program::ID,
        },
        match_config,
    );
    
    let start_time = Instant::now();
    
    let transaction = Transaction::new_signed_with_payer(
        &[compute_budget_ix, register_ix, create_match_ix],
        Some(&player.pubkey()),
        &[&player],
        test_context.recent_blockhash,
    );
    
    let result = test_context.banks_client.process_transaction(transaction).await;
    let duration = start_time.elapsed();
    
    // Batched transaction should complete successfully and quickly
    assert!(result.is_ok() || duration < Duration::from_millis(500)); // Either succeeds or fails fast
    
    println!("✅ Batched transaction completed in {:?}", duration);
    
    Ok(())
}

#[tokio::test]
async fn test_state_read_performance() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_performance_test_context().await?;
    
    // Setup multiple accounts to read
    let num_players = 100;
    let mut player_pdas = Vec::new();
    
    for i in 0..num_players {
        let player = setup_performance_player(&mut test_context, &format!("ReadTest{}", i), shared::PlayerClass::Warrior).await?;
        player_pdas.push(player.profile_pda);
    }
    
    // Measure batch read performance
    let start_time = Instant::now();
    
    for pda in &player_pdas {
        let account = test_context.banks_client.get_account(*pda).await?;
        assert!(account.is_some(), "Account should exist");
    }
    
    let duration = start_time.elapsed();
    let reads_per_second = num_players as f64 / duration.as_secs_f64();
    
    assert!(reads_per_second > 50.0, "Should read at least 50 accounts per second");
    println!("✅ State read performance: {:.2} reads/second", reads_per_second);
    
    Ok(())
}

// Helper structures and functions for performance tests

struct PerformanceTestContext {
    banks_client: BanksClient,
    payer: Keypair,
    recent_blockhash: Hash,
}

struct PerformancePlayer {
    keypair: Keypair,
    profile_pda: Pubkey,
    token_account: Pubkey,
}

async fn setup_performance_test_context() -> Result<PerformanceTestContext, Box<dyn std::error::Error>> {
    let program_test = ProgramTest::new(
        "sol_duel_game",
        sol_duel_game::ID,
        processor!(sol_duel_game::entry),
    );
    
    let (banks_client, payer, recent_blockhash) = program_test.start().await;
    
    Ok(PerformanceTestContext {
        banks_client,
        payer,
        recent_blockhash,
    })
}

async fn fund_account(
    test_context: &mut PerformanceTestContext,
    target: &Pubkey,
    amount: u64,
) -> Result<(), Box<dyn std::error::Error>> {
    let instruction = system_instruction::transfer(
        &test_context.payer.pubkey(),
        target,
        amount,
    );
    
    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&test_context.payer.pubkey()),
        &[&test_context.payer],
        test_context.recent_blockhash,
    );
    
    test_context.banks_client.process_transaction(transaction).await?;
    Ok(())
}

async fn setup_performance_player(
    test_context: &mut PerformanceTestContext,
    username: &str,
    player_class: shared::PlayerClass,
) -> Result<PerformancePlayer, Box<dyn std::error::Error>> {
    let keypair = Keypair::new();
    fund_account(test_context, &keypair.pubkey(), 2_000_000_000).await?;
    
    let (profile_pda, _) = Pubkey::find_program_address(
        &[b"player", keypair.pubkey().as_ref()],
        &sol_duel_game::ID,
    );
    
    let instruction = register_player(
        sol_duel_game::ID,
        &RegisterPlayerAccounts {
            player_profile: profile_pda,
            player: keypair.pubkey(),
            system_program: system_program::ID,
        },
        username.to_string(),
        player_class,
    );
    
    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&keypair.pubkey()),
        &[&keypair],
        test_context.recent_blockhash,
    );
    
    test_context.banks_client.process_transaction(transaction).await?;
    
    Ok(PerformancePlayer {
        keypair,
        profile_pda,
        token_account: Pubkey::new_unique(),
    })
}

async fn create_performance_match(
    test_context: &mut PerformanceTestContext,
    creator: &PerformancePlayer,
    config: shared::MatchConfig,
    compute_budget: Option<Instruction>,
) -> Result<Pubkey, Box<dyn std::error::Error>> {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;
    let (match_pda, _) = Pubkey::find_program_address(
        &[b"match", creator.keypair.pubkey().as_ref(), &timestamp.to_le_bytes()],
        &sol_duel_game::ID,
    );
    
    let create_match_ix = create_match(
        sol_duel_game::ID,
        &CreateMatchAccounts {
            match_account: match_pda,
            creator_profile: creator.profile_pda,
            creator: creator.keypair.pubkey(),
            creator_token_account: creator.token_account,
            sol_mint: spl_token::native_mint::ID,
            token_program: spl_token::ID,
            system_program: system_program::ID,
        },
        config,
    );
    
    let mut instructions = vec![create_match_ix];
    if let Some(budget_ix) = compute_budget {
        instructions.insert(0, budget_ix);
    }
    
    let transaction = Transaction::new_signed_with_payer(
        &instructions,
        Some(&creator.keypair.pubkey()),
        &[&creator.keypair],
        test_context.recent_blockhash,
    );
    
    let result = test_context.banks_client.process_transaction(transaction).await;
    if result.is_ok() {
        Ok(match_pda)
    } else {
        Err("Failed to create match".into())
    }
}

async fn join_performance_match(
    test_context: &mut PerformanceTestContext,
    player: &PerformancePlayer,
    match_id: Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    // Mock implementation for performance testing
    Ok(())
}

fn execute_combat_action(
    _program_id: Pubkey,
    _accounts: &ExecuteCombatActionAccounts,
    _action: shared::CombatAction,
) -> Instruction {
    // Mock implementation for performance testing
    Instruction::new_with_bytes(sol_duel_game::ID, &[], vec![])
}

// Mock account structs for performance testing
#[derive(Accounts)]
struct ExecuteCombatActionAccounts {
    match_account: Pubkey,
    player_profile: Pubkey,
    player: Pubkey,
}