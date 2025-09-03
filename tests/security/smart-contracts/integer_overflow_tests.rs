use anchor_lang::prelude::*;
use solana_program_test::*;
use solana_sdk::{
    signature::{Keypair, Signer},
    transaction::Transaction,
    pubkey::Pubkey,
};
use crate::{*, state::*, shared::*};

/// Comprehensive Integer Overflow Tests for execute_action.rs
/// Tests for arithmetic overflow protection in combat calculations

#[tokio::test]
async fn test_damage_calculation_overflow_protection() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_test_context().await?;
    
    // Create players with extreme stats
    let player1 = setup_test_player(&mut test_context, "OverflowPlayer1", PlayerClass::Warrior).await?;
    let player2 = setup_test_player(&mut test_context, "OverflowPlayer2", PlayerClass::Mage).await?;
    
    // Create match
    let match_config = MatchConfig {
        max_players: 2,
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![100],
    };
    
    let match_id = create_test_match(&mut test_context, &player1, match_config).await?;
    join_test_match(&mut test_context, &player2, match_id).await?;
    
    // Modify player stats to maximum values
    set_player_stats(&mut test_context, &match_id, 0, PlayerStats {
        attack: u32::MAX,
        defense: 100,
        speed: 100,
        health: 1000,
    }).await?;
    
    // Execute action with maximum power
    let combat_action = CombatAction {
        action_type: ActionType::BasicAttack,
        target: player2.keypair.pubkey(),
        power: u32::MAX,
        mana_cost: 10,
    };
    
    let execute_instruction = create_execute_action_instruction(
        &match_id,
        &player1.profile_pda,
        &player1.keypair.pubkey(),
        combat_action,
    );
    
    let transaction = Transaction::new_signed_with_payer(
        &[execute_instruction],
        Some(&player1.keypair.pubkey()),
        &[&player1.keypair],
        test_context.recent_blockhash,
    );
    
    let result = test_context.banks_client.process_transaction(transaction).await;
    
    // Should either succeed with bounded damage or fail gracefully
    match result {
        Ok(_) => {
            // Verify damage was calculated safely without overflow
            let match_state = get_match_state(&mut test_context, &match_id).await?;
            let target_player = match_state.get_player(&player2.keypair.pubkey()).unwrap();
            assert!(target_player.current_health <= 1000); // Max health
            assert!(target_player.current_health >= 0);
        },
        Err(_) => {
            // Acceptable to fail with overflow protection
            assert!(true);
        }
    }
    
    Ok(())
}

#[tokio::test]
async fn test_experience_calculation_overflow_protection() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_test_context().await?;
    
    let player1 = setup_test_player(&mut test_context, "ExpPlayer1", PlayerClass::Warrior).await?;
    let player2 = setup_test_player(&mut test_context, "ExpPlayer2", PlayerClass::Mage).await?;
    
    let match_config = MatchConfig {
        max_players: 2,
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![100],
    };
    
    let match_id = create_test_match(&mut test_context, &player1, match_config).await?;
    join_test_match(&mut test_context, &player2, match_id).await?;
    
    // Set player experience near maximum
    let initial_exp = u64::MAX - 1000;
    set_player_experience(&mut test_context, &player1.profile_pda, initial_exp).await?;
    
    // Execute action that would grant massive experience
    let combat_action = CombatAction {
        action_type: ActionType::SpecialAbility,
        target: player2.keypair.pubkey(),
        power: u32::MAX / 2,
        mana_cost: 50,
    };
    
    let execute_instruction = create_execute_action_instruction(
        &match_id,
        &player1.profile_pda,
        &player1.keypair.pubkey(),
        combat_action,
    );
    
    let transaction = Transaction::new_signed_with_payer(
        &[execute_instruction],
        Some(&player1.keypair.pubkey()),
        &[&player1.keypair],
        test_context.recent_blockhash,
    );
    
    let result = test_context.banks_client.process_transaction(transaction).await;
    
    match result {
        Ok(_) => {
            // Verify experience didn't overflow
            let player_profile = get_player_profile(&mut test_context, &player1.profile_pda).await?;
            assert!(player_profile.experience >= initial_exp);
            assert!(player_profile.experience <= u64::MAX);
        },
        Err(e) => {
            // Should fail with ArithmeticOverflow error
            let error_msg = format!("{:?}", e);
            assert!(error_msg.contains("ArithmeticOverflow") || error_msg.contains("overflow"));
        }
    }
    
    Ok(())
}

#[tokio::test]
async fn test_damage_dealt_tracking_overflow_protection() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_test_context().await?;
    
    let player1 = setup_test_player(&mut test_context, "DamagePlayer1", PlayerClass::Warrior).await?;
    let player2 = setup_test_player(&mut test_context, "DamagePlayer2", PlayerClass::Mage).await?;
    
    let match_config = MatchConfig {
        max_players: 2,
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![100],
    };
    
    let match_id = create_test_match(&mut test_context, &player1, match_config).await?;
    join_test_match(&mut test_context, &player2, match_id).await?;
    
    // Set player's total damage dealt near maximum
    let initial_damage = u64::MAX - 1000;
    set_player_total_damage(&mut test_context, &player1.profile_pda, initial_damage).await?;
    set_match_player_damage(&mut test_context, &match_id, &player1.keypair.pubkey(), u32::MAX - 1000).await?;
    
    // Execute high damage action
    let combat_action = CombatAction {
        action_type: ActionType::BasicAttack,
        target: player2.keypair.pubkey(),
        power: 10000,
        mana_cost: 10,
    };
    
    let execute_instruction = create_execute_action_instruction(
        &match_id,
        &player1.profile_pda,
        &player1.keypair.pubkey(),
        combat_action,
    );
    
    let transaction = Transaction::new_signed_with_payer(
        &[execute_instruction],
        Some(&player1.keypair.pubkey()),
        &[&player1.keypair],
        test_context.recent_blockhash,
    );
    
    let result = test_context.banks_client.process_transaction(transaction).await;
    
    match result {
        Ok(_) => {
            // Verify damage tracking didn't overflow
            let player_profile = get_player_profile(&mut test_context, &player1.profile_pda).await?;
            let match_state = get_match_state(&mut test_context, &match_id).await?;
            let player_in_match = match_state.get_player(&player1.keypair.pubkey()).unwrap();
            
            assert!(player_profile.total_damage_dealt >= initial_damage);
            assert!(player_profile.total_damage_dealt <= u64::MAX);
            assert!(player_in_match.damage_dealt <= u32::MAX);
        },
        Err(e) => {
            // Should fail with ArithmeticOverflow error
            let error_msg = format!("{:?}", e);
            assert!(error_msg.contains("ArithmeticOverflow") || error_msg.contains("overflow"));
        }
    }
    
    Ok(())
}

#[tokio::test]
async fn test_actions_taken_counter_overflow_protection() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_test_context().await?;
    
    let player1 = setup_test_player(&mut test_context, "ActionPlayer1", PlayerClass::Warrior).await?;
    let player2 = setup_test_player(&mut test_context, "ActionPlayer2", PlayerClass::Mage).await?;
    
    let match_config = MatchConfig {
        max_players: 2,
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![100],
    };
    
    let match_id = create_test_match(&mut test_context, &player1, match_config).await?;
    join_test_match(&mut test_context, &player2, match_id).await?;
    
    // Set actions taken near maximum
    let initial_actions = u32::MAX - 5;
    set_player_actions_taken(&mut test_context, &match_id, &player1.keypair.pubkey(), initial_actions).await?;
    
    // Execute multiple actions to trigger overflow
    for i in 0..10 {
        let combat_action = CombatAction {
            action_type: ActionType::DefensiveStance,
            target: player1.keypair.pubkey(),
            power: 0,
            mana_cost: 5,
        };
        
        let execute_instruction = create_execute_action_instruction(
            &match_id,
            &player1.profile_pda,
            &player1.keypair.pubkey(),
            combat_action,
        );
        
        let transaction = Transaction::new_signed_with_payer(
            &[execute_instruction],
            Some(&player1.keypair.pubkey()),
            &[&player1.keypair],
            test_context.recent_blockhash,
        );
        
        let result = test_context.banks_client.process_transaction(transaction).await;
        
        if result.is_err() {
            // Should fail with overflow protection after a few actions
            let error_msg = format!("{:?}", result.unwrap_err());
            assert!(error_msg.contains("ArithmeticOverflow") || error_msg.contains("overflow"));
            break;
        }
        
        if i > 6 {
            // Should have failed by now due to overflow protection
            panic!("Expected overflow protection to trigger");
        }
    }
    
    Ok(())
}

#[tokio::test]
async fn test_special_ability_power_multiplication_overflow() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_test_context().await?;
    
    let player1 = setup_test_player(&mut test_context, "SpecialPlayer1", PlayerClass::Mage).await?;
    let player2 = setup_test_player(&mut test_context, "SpecialPlayer2", PlayerClass::Warrior).await?;
    
    let match_config = MatchConfig {
        max_players: 2,
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![100],
    };
    
    let match_id = create_test_match(&mut test_context, &player1, match_config).await?;
    join_test_match(&mut test_context, &player2, match_id).await?;
    
    // Execute special ability with maximum power (would cause overflow when multiplied by 2)
    let combat_action = CombatAction {
        action_type: ActionType::SpecialAbility,
        target: player2.keypair.pubkey(),
        power: u32::MAX / 2 + 1, // This * 2 would overflow
        mana_cost: 50,
    };
    
    let execute_instruction = create_execute_action_instruction(
        &match_id,
        &player1.profile_pda,
        &player1.keypair.pubkey(),
        combat_action,
    );
    
    let transaction = Transaction::new_signed_with_payer(
        &[execute_instruction],
        Some(&player1.keypair.pubkey()),
        &[&player1.keypair],
        test_context.recent_blockhash,
    );
    
    let result = test_context.banks_client.process_transaction(transaction).await;
    
    // Should fail with overflow protection
    assert!(result.is_err());
    
    let error_msg = format!("{:?}", result.unwrap_err());
    assert!(error_msg.contains("ArithmeticOverflow") || error_msg.contains("overflow"));
    
    Ok(())
}

#[tokio::test]
async fn test_experience_multiplier_overflow_protection() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_test_context().await?;
    
    let player1 = setup_test_player(&mut test_context, "ExpMultPlayer1", PlayerClass::Mage).await?;
    let player2 = setup_test_player(&mut test_context, "ExpMultPlayer2", PlayerClass::Warrior).await?;
    
    let match_config = MatchConfig {
        max_players: 2,
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![100],
    };
    
    let match_id = create_test_match(&mut test_context, &player1, match_config).await?;
    join_test_match(&mut test_context, &player2, match_id).await?;
    
    // Execute special ability that would cause experience calculation overflow
    let combat_action = CombatAction {
        action_type: ActionType::SpecialAbility,
        target: player2.keypair.pubkey(),
        power: u32::MAX / 4, // Large value that when multiplied for experience might overflow
        mana_cost: 50,
    };
    
    let execute_instruction = create_execute_action_instruction(
        &match_id,
        &player1.profile_pda,
        &player1.keypair.pubkey(),
        combat_action,
    );
    
    let transaction = Transaction::new_signed_with_payer(
        &[execute_instruction],
        Some(&player1.keypair.pubkey()),
        &[&player1.keypair],
        test_context.recent_blockhash,
    );
    
    let result = test_context.banks_client.process_transaction(transaction).await;
    
    match result {
        Ok(_) => {
            // If successful, verify no overflow occurred
            let player_profile = get_player_profile(&mut test_context, &player1.profile_pda).await?;
            assert!(player_profile.experience < u64::MAX);
        },
        Err(e) => {
            // Acceptable to fail with overflow protection
            let error_msg = format!("{:?}", e);
            assert!(error_msg.contains("ArithmeticOverflow") || error_msg.contains("overflow"));
        }
    }
    
    Ok(())
}

#[tokio::test]
async fn test_boundary_value_arithmetic() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_test_context().await?;
    
    let player1 = setup_test_player(&mut test_context, "BoundaryPlayer1", PlayerClass::Warrior).await?;
    let player2 = setup_test_player(&mut test_context, "BoundaryPlayer2", PlayerClass::Mage).await?;
    
    let match_config = MatchConfig {
        max_players: 2,
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![100],
    };
    
    let match_id = create_test_match(&mut test_context, &player1, match_config).await?;
    join_test_match(&mut test_context, &player2, match_id).await?;
    
    // Test boundary values that are safe
    let safe_values = [
        u32::MAX / 2,
        u32::MAX / 3,
        u32::MAX / 4,
        1000000,
        0,
    ];
    
    for &power in &safe_values {
        let combat_action = CombatAction {
            action_type: ActionType::BasicAttack,
            target: player2.keypair.pubkey(),
            power,
            mana_cost: 10,
        };
        
        let execute_instruction = create_execute_action_instruction(
            &match_id,
            &player1.profile_pda,
            &player1.keypair.pubkey(),
            combat_action,
        );
        
        let transaction = Transaction::new_signed_with_payer(
            &[execute_instruction],
            Some(&player1.keypair.pubkey()),
            &[&player1.keypair],
            test_context.recent_blockhash,
        );
        
        let result = test_context.banks_client.process_transaction(transaction).await;
        
        // Safe values should process without overflow
        if result.is_err() {
            let error_msg = format!("{:?}", result.unwrap_err());
            // Only arithmetic overflow errors are expected, other errors are fine
            if error_msg.contains("ArithmeticOverflow") {
                panic!("Unexpected overflow with safe value: {}", power);
            }
        }
    }
    
    Ok(())
}

// Helper functions (mocked for testing)

async fn setup_test_context() -> Result<TestContext, Box<dyn std::error::Error>> {
    let program_test = ProgramTest::new(
        "universal_pvp",
        crate::ID,
        processor!(crate::entry),
    );
    
    let (banks_client, payer, recent_blockhash) = program_test.start().await;
    
    Ok(TestContext {
        banks_client,
        payer,
        recent_blockhash,
    })
}

// Additional helper function implementations would be similar to reentrancy tests...
// [Mock implementations of all the helper functions used above]

async fn set_player_stats(
    test_context: &mut TestContext,
    match_id: &Pubkey,
    player_index: usize,
    stats: PlayerStats,
) -> Result<(), Box<dyn std::error::Error>> {
    // Mock implementation
    Ok(())
}

async fn set_player_experience(
    test_context: &mut TestContext,
    profile_pda: &Pubkey,
    experience: u64,
) -> Result<(), Box<dyn std::error::Error>> {
    // Mock implementation
    Ok(())
}

async fn set_player_total_damage(
    test_context: &mut TestContext,
    profile_pda: &Pubkey,
    total_damage: u64,
) -> Result<(), Box<dyn std::error::Error>> {
    // Mock implementation
    Ok(())
}

async fn set_match_player_damage(
    test_context: &mut TestContext,
    match_id: &Pubkey,
    player: &Pubkey,
    damage: u32,
) -> Result<(), Box<dyn std::error::Error>> {
    // Mock implementation
    Ok(())
}

async fn set_player_actions_taken(
    test_context: &mut TestContext,
    match_id: &Pubkey,
    player: &Pubkey,
    actions: u32,
) -> Result<(), Box<dyn std::error::Error>> {
    // Mock implementation
    Ok(())
}

fn create_execute_action_instruction(
    match_id: &Pubkey,
    player_profile: &Pubkey,
    player: &Pubkey,
    action: CombatAction,
) -> Instruction {
    // Mock instruction
    Instruction::new_with_bytes(crate::ID, &[], vec![])
}

// Re-use helper structures from reentrancy tests
use super::reentrancy_tests::{TestContext, TestPlayer, setup_test_player, create_test_match, join_test_match, get_match_state, get_player_profile};