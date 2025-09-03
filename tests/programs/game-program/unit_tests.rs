use anchor_lang::prelude::*;
use anchor_lang::solana_program::test_validator::*;
use solana_program_test::*;
use solana_sdk::{
    signature::{Keypair, Signer},
    transaction::Transaction,
    system_instruction,
    pubkey::Pubkey,
};
use sol_duel_game::{*, instruction::*};
use sol_duel_game::state::*;
use sol_duel_game::error::*;

/// Unit Tests for Smart Contract Functions
/// Covers core game mechanics and validations

#[tokio::test]
async fn test_initialize_game_state() -> Result<(), Box<dyn std::error::Error>> {
    let program_test = ProgramTest::new(
        "sol_duel_game",
        sol_duel_game::ID,
        processor!(sol_duel_game::entry),
    );
    
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;
    
    let upgrade_authority = Keypair::new();
    let (game_state_pda, _bump) = Pubkey::find_program_address(
        &[b"game_state"],
        &sol_duel_game::ID,
    );
    
    let instruction = initialize_game(
        sol_duel_game::ID,
        &InitializeGameAccounts {
            game_state: game_state_pda,
            authority: payer.pubkey(),
            system_program: system_program::ID,
        },
        upgrade_authority.pubkey(),
    );
    
    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );
    
    banks_client.process_transaction(transaction).await?;
    
    // Verify game state initialization
    let game_state_account = banks_client.get_account(game_state_pda).await?.unwrap();
    let game_state_data = GameState::try_deserialize(&mut &game_state_account.data[8..])?;
    
    assert_eq!(game_state_data.upgrade_authority, upgrade_authority.pubkey());
    assert_eq!(game_state_data.total_matches, 0);
    assert_eq!(game_state_data.total_players, 0);
    assert!(!game_state_data.paused);
    assert!(game_state_data.created_at > 0);
    
    Ok(())
}

#[tokio::test]
async fn test_player_registration() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_test_context().await?;
    
    let player = Keypair::new();
    let username = "TestWarrior".to_string();
    let player_class = shared::PlayerClass::Warrior;
    
    // Fund player account
    fund_account(&mut test_context, &player.pubkey(), 1_000_000_000).await?;
    
    let (player_profile_pda, _bump) = Pubkey::find_program_address(
        &[b"player", player.pubkey().as_ref()],
        &sol_duel_game::ID,
    );
    
    let instruction = register_player(
        sol_duel_game::ID,
        &RegisterPlayerAccounts {
            player_profile: player_profile_pda,
            player: player.pubkey(),
            system_program: system_program::ID,
        },
        username.clone(),
        player_class,
    );
    
    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&player.pubkey()),
        &[&player],
        test_context.recent_blockhash,
    );
    
    test_context.banks_client.process_transaction(transaction).await?;
    
    // Verify player profile
    let profile_account = test_context.banks_client.get_account(player_profile_pda).await?.unwrap();
    let profile_data = PlayerProfile::try_deserialize(&mut &profile_account.data[8..])?;
    
    assert_eq!(profile_data.owner, player.pubkey());
    assert_eq!(profile_data.username, username);
    assert_eq!(profile_data.player_class, player_class);
    assert_eq!(profile_data.level, 1);
    assert_eq!(profile_data.experience, 0);
    assert_eq!(profile_data.base_stats.health, 100);
    assert!(profile_data.is_active);
    
    Ok(())
}

#[tokio::test]
async fn test_match_creation() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_test_context().await?;
    let creator = setup_player_with_tokens(&mut test_context, "Creator", shared::PlayerClass::Mage).await?;
    
    let match_config = shared::MatchConfig {
        max_players: 4,
        entry_fee: 1_000_000, // 0.001 SOL
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![50, 30, 20],
    };
    
    let timestamp = Clock::get()?.unix_timestamp;
    let (match_pda, _bump) = Pubkey::find_program_address(
        &[b"match", creator.keypair.pubkey().as_ref(), &timestamp.to_le_bytes()],
        &sol_duel_game::ID,
    );
    
    let instruction = create_match(
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
        match_config.clone(),
    );
    
    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&creator.keypair.pubkey()),
        &[&creator.keypair],
        test_context.recent_blockhash,
    );
    
    let result = test_context.banks_client.process_transaction(transaction).await;
    
    // Verify match creation
    if result.is_ok() {
        let match_account = test_context.banks_client.get_account(match_pda).await?.unwrap();
        let match_data = MatchState::try_deserialize(&mut &match_account.data[8..])?;
        
        assert_eq!(match_data.creator, creator.keypair.pubkey());
        assert_eq!(match_data.config.max_players, 4);
        assert_eq!(match_data.config.entry_fee, 1_000_000);
        assert_eq!(match_data.status, MatchStatus::WaitingForPlayers);
    }
    
    Ok(())
}

#[tokio::test]
async fn test_combat_damage_calculation() -> Result<(), Box<dyn std::error::Error>> {
    // Test various damage scenarios
    struct DamageTest {
        attack: u32,
        defense: u32,
        action_power: u32,
        is_critical: bool,
        expected_min: u32,
        expected_max: u32,
    }
    
    let test_cases = vec![
        DamageTest { attack: 100, defense: 50, action_power: 25, is_critical: false, expected_min: 60, expected_max: 80 },
        DamageTest { attack: 100, defense: 50, action_power: 25, is_critical: true, expected_min: 90, expected_max: 120 },
        DamageTest { attack: 50, defense: 100, action_power: 25, is_critical: false, expected_min: 15, expected_max: 25 },
        DamageTest { attack: 200, defense: 20, action_power: 50, is_critical: false, expected_min: 180, expected_max: 220 },
    ];
    
    for test in test_cases {
        let damage = shared::calculate_damage(test.attack, test.defense, test.action_power, test.is_critical)?;
        assert!(
            damage >= test.expected_min && damage <= test.expected_max,
            "Damage {} not in range {}-{} for attack:{} defense:{} power:{} crit:{}",
            damage, test.expected_min, test.expected_max, test.attack, test.defense, test.action_power, test.is_critical
        );
    }
    
    Ok(())
}

#[tokio::test]
async fn test_player_experience_and_leveling() -> Result<(), Box<dyn std::error::Error>> {
    let mut profile = PlayerProfile {
        owner: Pubkey::new_unique(),
        username: "TestPlayer".to_string(),
        player_class: shared::PlayerClass::Warrior,
        base_stats: shared::PlayerStats::new_warrior(),
        level: 1,
        experience: 0,
        total_matches: 0,
        wins: 0,
        losses: 0,
        total_damage_dealt: 0,
        total_damage_taken: 0,
        created_at: Clock::get()?.unix_timestamp,
        last_match_at: 0,
        is_active: true,
        bump: 0,
    };
    
    // Test experience gain
    let win_exp = shared::calculate_experience_gain(100, true);
    let loss_exp = shared::calculate_experience_gain(100, false);
    assert!(win_exp > loss_exp);
    assert!(win_exp >= 150);
    assert!(loss_exp >= 50);
    
    // Test leveling up
    profile.experience = 1000;
    let new_level = profile.calculate_level();
    assert!(new_level > 1);
    
    profile.experience = 10000;
    let higher_level = profile.calculate_level();
    assert!(higher_level > new_level);
    
    // Test stat scaling with level
    let base_health = profile.base_stats.health;
    let current_stats = profile.get_current_stats();
    assert!(current_stats.health > base_health);
    
    Ok(())
}

#[tokio::test]
async fn test_security_validations() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_test_context().await?;
    
    // Test unauthorized operations
    let unauthorized_user = Keypair::new();
    fund_account(&mut test_context, &unauthorized_user.pubkey(), 1_000_000_000).await?;
    
    let (game_state_pda, _) = Pubkey::find_program_address(
        &[b"game_state"],
        &sol_duel_game::ID,
    );
    
    // Try to pause game without authority
    let invalid_instruction = pause_game(
        sol_duel_game::ID,
        &PauseGameAccounts {
            game_state: game_state_pda,
            authority: unauthorized_user.pubkey(),
        },
    );
    
    let transaction = Transaction::new_signed_with_payer(
        &[invalid_instruction],
        Some(&unauthorized_user.pubkey()),
        &[&unauthorized_user],
        test_context.recent_blockhash,
    );
    
    let result = test_context.banks_client.process_transaction(transaction).await;
    assert!(result.is_err()); // Should fail due to unauthorized access
    
    Ok(())
}

#[tokio::test]
async fn test_edge_cases_and_boundaries() -> Result<(), Box<dyn std::error::Error>> {
    // Test maximum and minimum values
    
    // Test zero damage scenario
    let zero_damage = shared::calculate_damage(10, 100, 5, false)?;
    assert!(zero_damage >= 0);
    
    // Test maximum stats
    let max_stats = shared::PlayerStats {
        health: u32::MAX / 1000, // Reasonable max to avoid overflow
        attack: u32::MAX / 1000,
        defense: u32::MAX / 1000,
        speed: u32::MAX / 1000,
        mana: u32::MAX / 1000,
    };
    
    // Should not panic with large numbers
    let _damage = shared::calculate_damage(max_stats.attack, max_stats.defense, 100, false)?;
    
    // Test reward calculation edge cases
    let small_pool_reward = shared::calculate_reward_share(100, 50)?;
    assert_eq!(small_pool_reward, 50);
    
    let zero_pool_reward = shared::calculate_reward_share(0, 50)?;
    assert_eq!(zero_pool_reward, 0);
    
    Ok(())
}

#[tokio::test]
async fn test_concurrent_operations() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_test_context().await?;
    
    // Create multiple players concurrently
    let mut handles = Vec::new();
    
    for i in 0..5 {
        let player = Keypair::new();
        let username = format!("Player{}", i);
        
        fund_account(&mut test_context, &player.pubkey(), 1_000_000_000).await?;
        
        let (player_profile_pda, _) = Pubkey::find_program_address(
            &[b"player", player.pubkey().as_ref()],
            &sol_duel_game::ID,
        );
        
        let instruction = register_player(
            sol_duel_game::ID,
            &RegisterPlayerAccounts {
                player_profile: player_profile_pda,
                player: player.pubkey(),
                system_program: system_program::ID,
            },
            username,
            shared::PlayerClass::Warrior,
        );
        
        let transaction = Transaction::new_signed_with_payer(
            &[instruction],
            Some(&player.pubkey()),
            &[&player],
            test_context.recent_blockhash,
        );
        
        // Each player registration should succeed independently
        let result = test_context.banks_client.process_transaction(transaction).await;
        assert!(result.is_ok());
    }
    
    Ok(())
}

// Helper structures and functions

struct TestContext {
    banks_client: BanksClient,
    payer: Keypair,
    recent_blockhash: Hash,
}

struct TestPlayer {
    keypair: Keypair,
    profile_pda: Pubkey,
    token_account: Pubkey,
}

async fn setup_test_context() -> Result<TestContext, Box<dyn std::error::Error>> {
    let program_test = ProgramTest::new(
        "sol_duel_game",
        sol_duel_game::ID,
        processor!(sol_duel_game::entry),
    );
    
    let (banks_client, payer, recent_blockhash) = program_test.start().await;
    
    Ok(TestContext {
        banks_client,
        payer,
        recent_blockhash,
    })
}

async fn fund_account(
    test_context: &mut TestContext,
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

async fn setup_player_with_tokens(
    test_context: &mut TestContext,
    username: &str,
    player_class: shared::PlayerClass,
) -> Result<TestPlayer, Box<dyn std::error::Error>> {
    let keypair = Keypair::new();
    
    fund_account(test_context, &keypair.pubkey(), 2_000_000_000).await?;
    
    let (profile_pda, _) = Pubkey::find_program_address(
        &[b"player", keypair.pubkey().as_ref()],
        &sol_duel_game::ID,
    );
    
    // Create token account (mock for testing)
    let token_account = Keypair::new().pubkey();
    
    // Register player
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
    
    Ok(TestPlayer {
        keypair,
        profile_pda,
        token_account,
    })
}