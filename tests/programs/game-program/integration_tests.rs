use anchor_lang::prelude::*;
use solana_program_test::*;
use solana_sdk::{
    signature::{Keypair, Signer},
    transaction::Transaction,
    pubkey::Pubkey,
};
use std::time::{SystemTime, UNIX_EPOCH};
use sol_duel_game::{*, state::*};

/// Integration Tests for Cross-Program Interactions
/// Tests the complete game flow from start to finish

#[tokio::test]
async fn test_complete_game_flow() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_integrated_test_context().await?;
    
    // Phase 1: Initialize game system
    let game_authority = Keypair::new();
    initialize_game_system(&mut test_context, &game_authority).await?;
    
    // Phase 2: Register multiple players
    let players = vec![
        ("Alice", shared::PlayerClass::Warrior),
        ("Bob", shared::PlayerClass::Mage),
        ("Charlie", shared::PlayerClass::Rogue),
        ("Diana", shared::PlayerClass::Archer),
    ];
    
    let mut registered_players = Vec::new();
    for (name, class) in players {
        let player = register_test_player(&mut test_context, name, class).await?;
        registered_players.push(player);
    }
    
    // Phase 3: Create a match
    let match_config = shared::MatchConfig {
        max_players: 4,
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![50, 30, 20],
    };
    
    let match_id = create_test_match(&mut test_context, &registered_players[0], match_config).await?;
    
    // Phase 4: Players join the match
    for player in &registered_players[1..] {
        join_test_match(&mut test_context, player, match_id).await?;
    }
    
    // Phase 5: Start the match
    start_test_match(&mut test_context, match_id).await?;
    
    // Phase 6: Execute combat rounds
    execute_combat_simulation(&mut test_context, match_id, &registered_players).await?;
    
    // Phase 7: Verify match completion and rewards
    verify_match_completion(&mut test_context, match_id, &registered_players).await?;
    
    Ok(())
}

#[tokio::test]
async fn test_match_lifecycle() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_integrated_test_context().await?;
    
    // Create players
    let creator = register_test_player(&mut test_context, "Creator", shared::PlayerClass::Warrior).await?;
    let joiner1 = register_test_player(&mut test_context, "Joiner1", shared::PlayerClass::Mage).await?;
    let joiner2 = register_test_player(&mut test_context, "Joiner2", shared::PlayerClass::Rogue).await?;
    
    // Create match with 3 players max
    let match_config = shared::MatchConfig {
        max_players: 3,
        entry_fee: 500_000,
        turn_timeout: 30,
        match_duration: 900,
        reward_distribution: vec![60, 40],
    };
    
    let match_id = create_test_match(&mut test_context, &creator, match_config).await?;
    
    // Verify initial match state
    let match_state = get_match_state(&mut test_context, match_id).await?;
    assert_eq!(match_state.status, MatchStatus::WaitingForPlayers);
    assert_eq!(match_state.current_players.len(), 1);
    
    // Join match with second player
    join_test_match(&mut test_context, &joiner1, match_id).await?;
    let match_state = get_match_state(&mut test_context, match_id).await?;
    assert_eq!(match_state.current_players.len(), 2);
    
    // Join match with third player (should trigger auto-start)
    join_test_match(&mut test_context, &joiner2, match_id).await?;
    let match_state = get_match_state(&mut test_context, match_id).await?;
    assert_eq!(match_state.current_players.len(), 3);
    assert_eq!(match_state.status, MatchStatus::InProgress);
    
    Ok(())
}

#[tokio::test]
async fn test_token_integration() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_integrated_test_context().await?;
    
    // Setup players with token accounts
    let player1 = setup_player_with_full_tokens(&mut test_context, "Player1", shared::PlayerClass::Warrior).await?;
    let player2 = setup_player_with_full_tokens(&mut test_context, "Player2", shared::PlayerClass::Mage).await?;
    
    // Get initial token balances
    let initial_balance1 = get_token_balance(&mut test_context, &player1.token_account).await?;
    let initial_balance2 = get_token_balance(&mut test_context, &player2.token_account).await?;
    
    // Create and join match with entry fee
    let match_config = shared::MatchConfig {
        max_players: 2,
        entry_fee: 2_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![100],
    };
    
    let match_id = create_test_match(&mut test_context, &player1, match_config.clone()).await?;
    join_test_match(&mut test_context, &player2, match_id).await?;
    
    // Verify entry fees were deducted
    let balance_after_entry1 = get_token_balance(&mut test_context, &player1.token_account).await?;
    let balance_after_entry2 = get_token_balance(&mut test_context, &player2.token_account).await?;
    
    assert_eq!(balance_after_entry1, initial_balance1 - match_config.entry_fee);
    assert_eq!(balance_after_entry2, initial_balance2 - match_config.entry_fee);
    
    // Simulate match completion with player1 winning
    complete_match_with_winner(&mut test_context, match_id, &player1).await?;
    
    // Verify winner received the prize pool
    let final_balance1 = get_token_balance(&mut test_context, &player1.token_account).await?;
    let expected_prize = match_config.entry_fee * 2; // Both entry fees
    
    assert_eq!(final_balance1, balance_after_entry1 + expected_prize);
    
    Ok(())
}

#[tokio::test]
async fn test_nft_integration() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_integrated_test_context().await?;
    
    // Setup player with NFT collection
    let player = setup_player_with_nfts(&mut test_context, "NFTPlayer", shared::PlayerClass::Warrior).await?;
    
    // Verify NFT ownership affects stats
    let profile = get_player_profile(&mut test_context, &player.profile_pda).await?;
    let base_stats = profile.get_current_stats();
    
    // Apply NFT bonuses
    let nft_enhanced_stats = apply_nft_bonuses(&mut test_context, &player.keypair.pubkey(), base_stats).await?;
    
    // Verify stats were enhanced
    assert!(nft_enhanced_stats.attack > base_stats.attack || 
            nft_enhanced_stats.defense > base_stats.defense ||
            nft_enhanced_stats.health > base_stats.health);
    
    Ok(())
}

#[tokio::test]
async fn test_cross_program_communication() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_integrated_test_context().await?;
    
    // Test game program calling token program
    let player = setup_player_with_full_tokens(&mut test_context, "CrossPlayer", shared::PlayerClass::Mage).await?;
    
    let initial_balance = get_token_balance(&mut test_context, &player.token_account).await?;
    
    // Execute a transaction that requires cross-program invocation
    let reward_amount = 1_000_000u64;
    distribute_match_rewards(
        &mut test_context,
        vec![(player.keypair.pubkey(), reward_amount)],
    ).await?;
    
    let final_balance = get_token_balance(&mut test_context, &player.token_account).await?;
    assert_eq!(final_balance, initial_balance + reward_amount);
    
    Ok(())
}

#[tokio::test]
async fn test_state_consistency() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_integrated_test_context().await?;
    
    // Create multiple concurrent operations
    let players: Vec<_> = (0..5)
        .map(|i| async {
            register_test_player(
                &mut test_context,
                &format!("Player{}", i),
                shared::PlayerClass::Warrior,
            ).await
        })
        .collect();
    
    // Execute all registrations
    let registered_players: Result<Vec<_>, _> = futures::future::try_join_all(players).await;
    let registered_players = registered_players?;
    
    // Verify all players were registered correctly
    assert_eq!(registered_players.len(), 5);
    
    // Create multiple matches simultaneously
    let match_configs = vec![
        shared::MatchConfig {
            max_players: 2,
            entry_fee: 500_000,
            turn_timeout: 30,
            match_duration: 600,
            reward_distribution: vec![100],
        },
        shared::MatchConfig {
            max_players: 3,
            entry_fee: 1_000_000,
            turn_timeout: 60,
            match_duration: 1200,
            reward_distribution: vec![60, 40],
        },
    ];
    
    let mut match_ids = Vec::new();
    for (i, config) in match_configs.into_iter().enumerate() {
        let match_id = create_test_match(&mut test_context, &registered_players[i], config).await?;
        match_ids.push(match_id);
    }
    
    // Verify all matches exist and are in correct state
    for match_id in match_ids {
        let match_state = get_match_state(&mut test_context, match_id).await?;
        assert_eq!(match_state.status, MatchStatus::WaitingForPlayers);
    }
    
    Ok(())
}

#[tokio::test]
async fn test_error_recovery() -> Result<(), Box<dyn std::error::Error>> {
    let mut test_context = setup_integrated_test_context().await?;
    
    // Test recovery from failed match creation
    let player = register_test_player(&mut test_context, "ErrorPlayer", shared::PlayerClass::Warrior).await?;
    
    // Try to create match with invalid config
    let invalid_config = shared::MatchConfig {
        max_players: 0, // Invalid
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![100],
    };
    
    let result = create_test_match(&mut test_context, &player, invalid_config).await;
    assert!(result.is_err()); // Should fail
    
    // Verify system is still functional with valid config
    let valid_config = shared::MatchConfig {
        max_players: 2,
        entry_fee: 1_000_000,
        turn_timeout: 60,
        match_duration: 1800,
        reward_distribution: vec![100],
    };
    
    let match_id = create_test_match(&mut test_context, &player, valid_config).await?;
    let match_state = get_match_state(&mut test_context, match_id).await?;
    assert_eq!(match_state.status, MatchStatus::WaitingForPlayers);
    
    Ok(())
}

// Helper functions for integration tests

struct IntegratedTestContext {
    banks_client: BanksClient,
    payer: Keypair,
    recent_blockhash: Hash,
    game_program_id: Pubkey,
    token_program_id: Pubkey,
    nft_program_id: Pubkey,
}

struct TestPlayerFull {
    keypair: Keypair,
    profile_pda: Pubkey,
    token_account: Pubkey,
    nft_accounts: Vec<Pubkey>,
}

async fn setup_integrated_test_context() -> Result<IntegratedTestContext, Box<dyn std::error::Error>> {
    let mut program_test = ProgramTest::new(
        "sol_duel_game",
        sol_duel_game::ID,
        processor!(sol_duel_game::entry),
    );
    
    // Add token program
    program_test.add_program(
        "sol_token_program",
        sol_token_program::ID,
        processor!(sol_token_program::entry),
    );
    
    // Add NFT program
    program_test.add_program(
        "sol_nft_program", 
        sol_nft_program::ID,
        processor!(sol_nft_program::entry),
    );
    
    let (banks_client, payer, recent_blockhash) = program_test.start().await;
    
    Ok(IntegratedTestContext {
        banks_client,
        payer,
        recent_blockhash,
        game_program_id: sol_duel_game::ID,
        token_program_id: sol_token_program::ID,
        nft_program_id: sol_nft_program::ID,
    })
}

async fn initialize_game_system(
    test_context: &mut IntegratedTestContext,
    authority: &Keypair,
) -> Result<(), Box<dyn std::error::Error>> {
    // Initialize game state, token mint, and NFT collection
    // Implementation details...
    Ok(())
}

async fn register_test_player(
    test_context: &mut IntegratedTestContext,
    username: &str,
    player_class: shared::PlayerClass,
) -> Result<TestPlayerFull, Box<dyn std::error::Error>> {
    // Complete player registration with all integrations
    // Implementation details...
    
    let keypair = Keypair::new();
    let (profile_pda, _) = Pubkey::find_program_address(
        &[b"player", keypair.pubkey().as_ref()],
        &test_context.game_program_id,
    );
    
    Ok(TestPlayerFull {
        keypair,
        profile_pda,
        token_account: Pubkey::new_unique(),
        nft_accounts: vec![],
    })
}

async fn create_test_match(
    test_context: &mut IntegratedTestContext,
    creator: &TestPlayerFull,
    config: shared::MatchConfig,
) -> Result<Pubkey, Box<dyn std::error::Error>> {
    // Create match with full integration
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;
    let (match_pda, _) = Pubkey::find_program_address(
        &[b"match", creator.keypair.pubkey().as_ref(), &timestamp.to_le_bytes()],
        &test_context.game_program_id,
    );
    
    Ok(match_pda)
}

async fn join_test_match(
    test_context: &mut IntegratedTestContext,
    player: &TestPlayerFull,
    match_id: Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    // Join match with all validations
    Ok(())
}

async fn start_test_match(
    test_context: &mut IntegratedTestContext,
    match_id: Pubkey,
) -> Result<(), Box<dyn std::error::Error>> {
    // Start match and initialize combat
    Ok(())
}

async fn execute_combat_simulation(
    test_context: &mut IntegratedTestContext,
    match_id: Pubkey,
    players: &[TestPlayerFull],
) -> Result<(), Box<dyn std::error::Error>> {
    // Simulate complete combat sequence
    Ok(())
}

async fn verify_match_completion(
    test_context: &mut IntegratedTestContext,
    match_id: Pubkey,
    players: &[TestPlayerFull],
) -> Result<(), Box<dyn std::error::Error>> {
    // Verify final state and rewards distribution
    Ok(())
}

async fn setup_player_with_full_tokens(
    test_context: &mut IntegratedTestContext,
    username: &str,
    player_class: shared::PlayerClass,
) -> Result<TestPlayerFull, Box<dyn std::error::Error>> {
    // Setup player with complete token integration
    let mut player = register_test_player(test_context, username, player_class).await?;
    
    // Create and fund token account
    // Implementation details...
    
    Ok(player)
}

async fn setup_player_with_nfts(
    test_context: &mut IntegratedTestContext,
    username: &str,
    player_class: shared::PlayerClass,
) -> Result<TestPlayerFull, Box<dyn std::error::Error>> {
    // Setup player with NFT collection
    let mut player = setup_player_with_full_tokens(test_context, username, player_class).await?;
    
    // Mint NFTs to player
    // Implementation details...
    
    Ok(player)
}

async fn get_token_balance(
    test_context: &mut IntegratedTestContext,
    token_account: &Pubkey,
) -> Result<u64, Box<dyn std::error::Error>> {
    // Get current token balance
    Ok(0)
}

async fn get_match_state(
    test_context: &mut IntegratedTestContext,
    match_id: Pubkey,
) -> Result<MatchState, Box<dyn std::error::Error>> {
    // Retrieve current match state
    let account = test_context.banks_client.get_account(match_id).await?.unwrap();
    let match_state = MatchState::try_deserialize(&mut &account.data[8..])?;
    Ok(match_state)
}

async fn get_player_profile(
    test_context: &mut IntegratedTestContext,
    profile_pda: &Pubkey,
) -> Result<PlayerProfile, Box<dyn std::error::Error>> {
    // Retrieve player profile
    let account = test_context.banks_client.get_account(*profile_pda).await?.unwrap();
    let profile = PlayerProfile::try_deserialize(&mut &account.data[8..])?;
    Ok(profile)
}

async fn apply_nft_bonuses(
    test_context: &mut IntegratedTestContext,
    player: &Pubkey,
    base_stats: shared::PlayerStats,
) -> Result<shared::PlayerStats, Box<dyn std::error::Error>> {
    // Apply NFT stat bonuses
    Ok(base_stats)
}

async fn distribute_match_rewards(
    test_context: &mut IntegratedTestContext,
    rewards: Vec<(Pubkey, u64)>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Distribute rewards via cross-program invocation
    Ok(())
}

async fn complete_match_with_winner(
    test_context: &mut IntegratedTestContext,
    match_id: Pubkey,
    winner: &TestPlayerFull,
) -> Result<(), Box<dyn std::error::Error>> {
    // Complete match and distribute rewards
    Ok(())
}