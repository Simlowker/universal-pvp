use bolt_lang::*;
use anchor_lang::prelude::*;
use crate::components::*;

pub mod action_processing;
pub mod round_progression;
pub mod vrf_resolution;
pub mod psychological_analysis;
pub mod settlement;

pub use action_processing::*;
pub use round_progression::*;
pub use vrf_resolution::*;
pub use psychological_analysis::*;
pub use settlement::*;

/// ActionProcessingSystem - Handles CHECK, RAISE, CALL, FOLD actions
#[system]
pub mod action_processing {
    pub fn execute(ctx: Context<ActionProcessing>, action_type: ActionType, bet_amount: u64) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Load components
        let mut duel = ctx.accounts.duel.load_mut()?;
        let mut player = ctx.accounts.player.load_mut()?;
        let mut action = ctx.accounts.action.load_mut()?;
        let mut betting = ctx.accounts.betting.load_mut()?;
        let mut psych_profile = ctx.accounts.psych_profile.load_mut()?;

        // Validate game state
        require!(duel.game_state == GameState::AwaitingAction, GameError::InvalidGameState);
        require!(player.is_active, GameError::PlayerInactive);
        require!(!duel.is_timeout_exceeded(current_time), GameError::ActionTimeout);

        // Record action timing for psychological analysis
        let decision_time = (current_time - duel.last_action_time) as u32;
        psych_profile.update_decision_time(decision_time);

        // Process action based on type
        match action_type {
            ActionType::Check => {
                require!(betting.current_bet == player.total_bet, GameError::CannotCheck);
                // No bet change needed
            },
            ActionType::Call => {
                let call_amount = betting.current_bet.saturating_sub(player.total_bet);
                require!(player.can_bet(call_amount), GameError::InsufficientChips);
                
                player.chip_count -= call_amount;
                player.total_bet += call_amount;
                betting.add_to_pot(call_amount);
            },
            ActionType::Raise => {
                let total_required = betting.current_bet + bet_amount;
                let additional_bet = total_required.saturating_sub(player.total_bet);
                
                require!(betting.can_raise(player.chip_count, bet_amount), GameError::InvalidRaise);
                require!(player.can_bet(additional_bet), GameError::InsufficientChips);

                player.chip_count -= additional_bet;
                player.total_bet = total_required;
                betting.current_bet = total_required;
                betting.last_raise_amount = bet_amount;
                betting.add_to_pot(additional_bet);

                // Update psychological profile for aggression
                psych_profile.aggression_score += 10;
            },
            ActionType::Fold => {
                player.is_active = false;
                psych_profile.fold_frequency += 1;
                
                // Check if only one player remains
                if should_end_round(&duel) {
                    duel.game_state = GameState::ResolutionPending;
                }
            },
            ActionType::AllIn => {
                let all_in_amount = player.chip_count;
                require!(all_in_amount > 0, GameError::NoChipsToAllIn);

                player.chip_count = 0;
                player.total_bet += all_in_amount;
                betting.add_to_pot(all_in_amount);

                // Create side pot if necessary
                create_side_pot_if_needed(&mut betting, &player, all_in_amount);
            },
            _ => return Err(GameError::InvalidActionType.into()),
        }

        // Update action record
        action.entity_id = ctx.accounts.entity.key().to_bytes()[0..8].try_into().unwrap_or([0; 8]);
        action.player = player.player_id;
        action.action_type = action_type;
        action.bet_amount = bet_amount;
        action.timestamp = current_time;
        action.round_number = duel.current_round;
        action.sequence_number = player.actions_taken;
        action.is_processed = true;
        action.processing_time = Some(current_time);

        // Update game state
        player.actions_taken += 1;
        duel.last_action_time = current_time;

        // Transition to next game state
        if all_players_acted(&duel) {
            duel.game_state = GameState::InProgress;
        }

        emit!(ActionProcessedEvent {
            duel_id: duel.duel_id,
            player: player.player_id,
            action_type,
            amount: bet_amount,
            pot_total: betting.total_pot,
        });

        Ok(())
    }

    fn should_end_round(duel: &DuelComponent) -> bool {
        // Implementation to check if only one active player remains
        false // Simplified for now
    }

    fn all_players_acted(duel: &DuelComponent) -> bool {
        // Implementation to check if all active players have acted
        false // Simplified for now
    }

    fn create_side_pot_if_needed(betting: &mut BettingComponent, player: &PlayerComponent, amount: u64) {
        // Create side pot logic for all-in scenarios
        let side_pot = SidePot {
            amount,
            eligible_players: vec![player.player_id],
            is_main_pot: false,
        };
        betting.side_pots.push(side_pot);
    }
}

/// RoundProgressionSystem - Manages round transitions and timing
#[system]
pub mod round_progression {
    pub fn execute(ctx: Context<RoundProgression>) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        let mut duel = ctx.accounts.duel.load_mut()?;
        let mut betting = ctx.accounts.betting.load_mut()?;

        require!(duel.game_state == GameState::InProgress, GameError::InvalidGameState);

        // Check if round should advance
        if should_advance_round(&duel, current_time) {
            duel.current_round += 1;
            betting.betting_round += 1;
            betting.current_bet = 0;
            
            // Reset player betting amounts for new round
            reset_round_betting(&mut duel);

            if duel.current_round >= duel.max_rounds {
                duel.game_state = GameState::ResolutionPending;
                duel.resolution_pending = true;
            } else {
                duel.game_state = GameState::AwaitingAction;
            }

            emit!(RoundAdvancedEvent {
                duel_id: duel.duel_id,
                new_round: duel.current_round,
                pot_size: betting.total_pot,
            });
        }

        Ok(())
    }

    fn should_advance_round(duel: &DuelComponent, current_time: i64) -> bool {
        // Logic to determine if round should advance
        duel.current_round < duel.max_rounds
    }

    fn reset_round_betting(duel: &mut DuelComponent) {
        // Reset betting amounts for new round
    }
}

/// VRFResolutionSystem - Fair randomness for game resolution
#[system] 
pub mod vrf_resolution {
    pub fn execute(ctx: Context<VrfResolution>, vrf_proof: [u8; 64]) -> Result<()> {
        let mut duel = ctx.accounts.duel.load_mut()?;
        let mut betting = ctx.accounts.betting.load_mut()?;

        require!(duel.game_state == GameState::ResolutionPending, GameError::InvalidGameState);
        require!(duel.resolution_pending, GameError::NoResolutionPending);

        // Verify VRF proof
        let vrf_result = verify_vrf_proof(&duel.vrf_seed, &vrf_proof)?;
        
        // Determine winner based on VRF result and game logic
        let winner = determine_winner(vrf_result, &duel)?;
        
        duel.winner = Some(winner);
        duel.game_state = GameState::Completed;
        duel.resolution_pending = false;
        betting.is_settled = true;

        emit!(GameResolvedEvent {
            duel_id: duel.duel_id,
            winner,
            pot_size: betting.total_pot,
            randomness: vrf_result,
        });

        Ok(())
    }

    fn verify_vrf_proof(seed: &[u8; 32], proof: &[u8; 64]) -> Result<u64> {
        // VRF verification logic - simplified for demo
        let mut hasher = std::hash::DefaultHasher::new();
        hasher.write(seed);
        hasher.write(proof);
        Ok(hasher.finish())
    }

    fn determine_winner(randomness: u64, duel: &DuelComponent) -> Result<Pubkey> {
        // Winner determination logic based on randomness and game state
        if randomness % 2 == 0 {
            Ok(duel.player_one)
        } else {
            Ok(duel.player_two)
        }
    }
}

/// PsychologicalAnalysisSystem - Analyzes player behavior patterns
#[system]
pub mod psychological_analysis {
    pub fn execute(ctx: Context<PsychologicalAnalysis>) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        let mut psych_profile = ctx.accounts.psych_profile.load_mut()?;
        let player = ctx.accounts.player.load()?;
        let betting = ctx.accounts.betting.load()?;

        // Update psychological metrics
        analyze_bluff_patterns(&mut psych_profile, &player)?;
        analyze_pressure_response(&mut psych_profile, &betting, current_time)?;
        calculate_consistency_rating(&mut psych_profile)?;

        psych_profile.last_updated = current_time;

        emit!(PsychProfileUpdatedEvent {
            player: psych_profile.player,
            aggression_score: psych_profile.aggression_score,
            consistency_rating: psych_profile.consistency_rating,
            pressure_response: psych_profile.pressure_response,
        });

        Ok(())
    }

    fn analyze_bluff_patterns(profile: &mut PsychProfileComponent, player: &PlayerComponent) -> Result<()> {
        // Analyze betting patterns to detect bluffs
        if player.actions_taken > 0 {
            let bluff_indicator = calculate_bluff_probability(player);
            profile.bluff_frequency = (profile.bluff_frequency + bluff_indicator) / 2;
        }
        Ok(())
    }

    fn analyze_pressure_response(profile: &mut PsychProfileComponent, betting: &BettingComponent, time: i64) -> Result<()> {
        // Analyze how player responds under pressure
        let pressure_score = profile.calculate_pressure_score(betting.total_pot, true);
        profile.pressure_response = (profile.pressure_response + pressure_score) / 2;
        Ok(())
    }

    fn calculate_consistency_rating(profile: &mut PsychProfileComponent) -> Result<()> {
        // Calculate consistency based on decision variance
        if profile.decision_variance > 0 {
            profile.consistency_rating = (1000 - (profile.decision_variance / 100).min(1000)) as u16;
        }
        Ok(())
    }

    fn calculate_bluff_probability(player: &PlayerComponent) -> u16 {
        // Simplified bluff detection - in reality would be more complex
        if player.total_bet > player.chip_count / 4 {
            200 // High bet relative to chips might indicate bluff
        } else {
            50  // Normal betting pattern
        }
    }
}

/// SettlementSystem - Handles game completion and payouts
#[system]
pub mod settlement {
    pub fn execute(ctx: Context<Settlement>) -> Result<()> {
        let mut duel = ctx.accounts.duel.load_mut()?;
        let mut betting = ctx.accounts.betting.load_mut()?;
        let mut winner_player = ctx.accounts.winner_player.load_mut()?;
        let mut loser_player = ctx.accounts.loser_player.load_mut()?;

        require!(duel.game_state == GameState::Completed, GameError::InvalidGameState);
        require!(duel.winner.is_some(), GameError::NoWinnerDetermined);
        require!(!betting.is_settled, GameError::AlreadySettled);

        let winner = duel.winner.unwrap();
        
        // Calculate rake
        let rake = betting.calculate_rake(250); // 2.5% rake
        let payout = betting.total_pot - rake;

        // Distribute winnings
        if winner == winner_player.player_id {
            winner_player.chip_count += payout;
            winner_player.games_won += 1;
            winner_player.total_winnings += payout;
        }

        // Update both players' game counts
        winner_player.games_played += 1;
        loser_player.games_played += 1;

        // Update skill ratings using ELO-like system
        update_skill_ratings(&mut winner_player, &mut loser_player, true);

        // Mark as settled
        betting.is_settled = true;
        betting.rake_amount = rake;

        emit!(GameSettledEvent {
            duel_id: duel.duel_id,
            winner,
            payout,
            rake,
            winner_new_rating: winner_player.skill_rating,
        });

        Ok(())
    }

    fn update_skill_ratings(winner: &mut PlayerComponent, loser: &mut PlayerComponent, winner_won: bool) {
        let k_factor = 32; // ELO K-factor
        let expected_winner = 1.0 / (1.0 + 10.0_f64.powf((loser.skill_rating as f64 - winner.skill_rating as f64) / 400.0));
        let expected_loser = 1.0 - expected_winner;

        if winner_won {
            winner.skill_rating = (winner.skill_rating as f64 + k_factor as f64 * (1.0 - expected_winner)) as u32;
            loser.skill_rating = (loser.skill_rating as f64 + k_factor as f64 * (0.0 - expected_loser)) as u32;
        }
    }
}

/// Events
#[event]
pub struct ActionProcessedEvent {
    pub duel_id: u64,
    pub player: Pubkey,
    pub action_type: ActionType,
    pub amount: u64,
    pub pot_total: u64,
}

#[event]
pub struct RoundAdvancedEvent {
    pub duel_id: u64,
    pub new_round: u8,
    pub pot_size: u64,
}

#[event]
pub struct GameResolvedEvent {
    pub duel_id: u64,
    pub winner: Pubkey,
    pub pot_size: u64,
    pub randomness: u64,
}

#[event]
pub struct PsychProfileUpdatedEvent {
    pub player: Pubkey,
    pub aggression_score: u16,
    pub consistency_rating: u16,
    pub pressure_response: u16,
}

#[event]
pub struct GameSettledEvent {
    pub duel_id: u64,
    pub winner: Pubkey,
    pub payout: u64,
    pub rake: u64,
    pub winner_new_rating: u32,
}

/// Game errors
#[error_code]
pub enum GameError {
    #[msg("Invalid game state for this action")]
    InvalidGameState,
    #[msg("Player is not active")]
    PlayerInactive,
    #[msg("Action timeout exceeded")]
    ActionTimeout,
    #[msg("Cannot check - must call or raise")]
    CannotCheck,
    #[msg("Insufficient chips for this action")]
    InsufficientChips,
    #[msg("Invalid raise amount")]
    InvalidRaise,
    #[msg("Invalid action type")]
    InvalidActionType,
    #[msg("No chips available for all-in")]
    NoChipsToAllIn,
    #[msg("No resolution pending")]
    NoResolutionPending,
    #[msg("No winner determined")]
    NoWinnerDetermined,
    #[msg("Game already settled")]
    AlreadySettled,
}