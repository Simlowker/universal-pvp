use bolt_lang::*;
use crate::components::*;

pub mod create_match {
    use super::*;

    pub fn handler(
        ctx: Context<CreateMatch>,
        max_players: u8,
        entry_fee: u64,
        turn_timeout: i64,
    ) -> Result<()> {
        let clock = Clock::get()?;

        // Validate match parameters
        if max_players == 0 || max_players > 8 {
            return Err(crate::GameError::InvalidGameState.into());
        }

        if turn_timeout <= 0 {
            return Err(crate::GameError::InvalidGameState.into());
        }

        // Initialize match state
        let match_state = MatchState {
            match_id: clock.unix_timestamp as u64,
            creator: ctx.accounts.creator.key(),
            state: GameState::WaitingForPlayers,
            max_players,
            current_players: 1, // Creator is first player
            current_turn: 0,
            turn_deadline: 0,
            entry_fee,
            reward_pool: entry_fee,
            winner: None,
            created_at: clock.unix_timestamp,
            started_at: None,
            ended_at: None,
            turn_timeout,
            match_duration: 1800, // 30 minutes default
        };

        ctx.accounts.match_state.set_inner(match_state);

        // Initialize participants with creator as first player
        let mut participants = MatchParticipants::default();
        participants.add_player(ctx.accounts.creator.key(), clock.unix_timestamp)?;

        ctx.accounts.match_participants.set_inner(participants);

        // Initialize rewards
        let mut rewards = MatchRewards::default();
        rewards.calculate_rewards(entry_fee, max_players);

        ctx.accounts.match_rewards.set_inner(rewards);

        // Initialize analytics
        let analytics = MatchAnalytics::default();
        ctx.accounts.match_analytics.set_inner(analytics);

        // Initialize ephemeral state for this match
        let ephemeral_state = EphemeralState::new(
            ctx.accounts.ephemeral_rollup.key(),
            ctx.accounts.creator.key(),
        );
        ctx.accounts.ephemeral_state.set_inner(ephemeral_state);

        msg!(
            "Match {} created by {} with {} max players, {} SOL entry fee",
            match_state.match_id,
            ctx.accounts.creator.key(),
            max_players,
            entry_fee as f64 / 1_000_000_000.0
        );

        Ok(())
    }
}

pub mod join_match {
    use super::*;

    pub fn handler(ctx: Context<JoinMatch>) -> Result<()> {
        let match_state = &mut ctx.accounts.match_state;
        let participants = &mut ctx.accounts.match_participants;
        let clock = Clock::get()?;

        // Validate match state
        if match_state.state != GameState::WaitingForPlayers {
            return Err(crate::GameError::InvalidGameState.into());
        }

        // Check if match is full
        if match_state.current_players >= match_state.max_players {
            return Err(crate::GameError::MatchFull.into());
        }

        // Check if player is already in match
        if participants.is_player_in_match(&ctx.accounts.player.key()) {
            return Err(crate::GameError::InvalidGameState.into());
        }

        // Add player to match
        participants.add_player(ctx.accounts.player.key(), clock.unix_timestamp)?;
        match_state.current_players += 1;
        match_state.reward_pool += match_state.entry_fee;

        // Start match if full
        if match_state.current_players == match_state.max_players {
            match_state.state = GameState::InProgress;
            match_state.started_at = Some(clock.unix_timestamp);
            match_state.turn_deadline = clock.unix_timestamp + match_state.turn_timeout;
            
            msg!(
                "Match {} started with {} players",
                match_state.match_id,
                match_state.current_players
            );
        }

        msg!(
            "Player {} joined match {} ({}/{})",
            ctx.accounts.player.key(),
            match_state.match_id,
            match_state.current_players,
            match_state.max_players
        );

        Ok(())
    }
}

pub mod end_match {
    use super::*;

    pub fn handler(ctx: Context<EndMatch>) -> Result<()> {
        let match_state = &mut ctx.accounts.match_state;
        let participants = &ctx.accounts.match_participants;
        let rewards = &mut ctx.accounts.match_rewards;
        let analytics = &mut ctx.accounts.match_analytics;
        let ephemeral_state = &mut ctx.accounts.ephemeral_state;
        let clock = Clock::get()?;

        // Validate match can be ended
        if match_state.state != GameState::InProgress {
            return Err(crate::GameError::InvalidGameState.into());
        }

        // Determine winner
        let winner = if participants.is_match_over() {
            participants.get_winner()
        } else {
            // Match ended by timeout or other condition
            None
        };

        // Update match state
        match_state.state = GameState::Completed;
        match_state.ended_at = Some(clock.unix_timestamp);
        match_state.winner = winner;

        // Calculate final analytics
        let match_duration = if let Some(started_at) = match_state.started_at {
            clock.unix_timestamp - started_at
        } else {
            0
        };

        analytics.calculate_quality_score(match_duration, match_state.current_players);

        // Distribute rewards
        if !rewards.rewards_distributed {
            distribute_rewards(ctx, winner)?;
            rewards.rewards_distributed = true;
        }

        // Force commit to mainnet for final state
        ephemeral_state.commit(clock.unix_timestamp);

        msg!(
            "Match {} ended. Winner: {:?}, Duration: {}s, Quality: {:.1}/10",
            match_state.match_id,
            winner,
            match_duration,
            analytics.match_quality_score
        );

        Ok(())
    }

    fn distribute_rewards(ctx: Context<EndMatch>, winner: Option<Pubkey>) -> Result<()> {
        let rewards = &ctx.accounts.match_rewards;
        
        if let Some(winner_key) = winner {
            // In a real implementation, this would transfer SOL to the winner
            // For now, we just log the rewards distribution
            msg!(
                "Rewards distributed - Winner: {} receives {} SOL",
                winner_key,
                rewards.winner_reward as f64 / 1_000_000_000.0
            );
        } else {
            msg!("Match ended without winner - entry fees returned");
        }

        Ok(())
    }
}

pub mod force_end_match {
    use super::*;

    pub fn handler(ctx: Context<ForceEndMatch>) -> Result<()> {
        let match_state = &mut ctx.accounts.match_state;
        let clock = Clock::get()?;

        // Only authorized users can force end matches
        // This could be the creator, admin, or based on timeout conditions
        
        if match_state.state == GameState::Completed || match_state.state == GameState::Cancelled {
            return Err(crate::GameError::InvalidGameState.into());
        }

        // Check if match has timed out
        let should_timeout = if let Some(started_at) = match_state.started_at {
            clock.unix_timestamp > started_at + match_state.match_duration
        } else {
            // Match never started and has been waiting too long
            clock.unix_timestamp > match_state.created_at + 600 // 10 minutes timeout for lobby
        };

        let can_force_end = ctx.accounts.authority.key() == match_state.creator || should_timeout;

        if !can_force_end {
            return Err(crate::GameError::UnauthorizedAction.into());
        }

        // Force end the match
        match_state.state = GameState::Cancelled;
        match_state.ended_at = Some(clock.unix_timestamp);

        // Return entry fees to participants (in real implementation)
        msg!(
            "Match {} force ended by {}. Entry fees returned.",
            match_state.match_id,
            ctx.accounts.authority.key()
        );

        Ok(())
    }
}

pub mod update_match_state {
    use super::*;

    pub fn handler(ctx: Context<UpdateMatchState>) -> Result<()> {
        let match_state = &mut ctx.accounts.match_state;
        let participants = &ctx.accounts.match_participants;
        let ephemeral_state = &mut ctx.accounts.ephemeral_state;
        let clock = Clock::get()?;

        if match_state.state != GameState::InProgress {
            return Ok(()); // Nothing to update
        }

        // Check for match end conditions
        if participants.is_match_over() {
            match_state.state = GameState::Completed;
            match_state.ended_at = Some(clock.unix_timestamp);
            match_state.winner = participants.get_winner();
            
            msg!("Match {} completed - winner: {:?}", match_state.match_id, match_state.winner);
        }

        // Check for timeout conditions
        if let Some(started_at) = match_state.started_at {
            if clock.unix_timestamp > started_at + match_state.match_duration {
                match_state.state = GameState::Completed;
                match_state.ended_at = Some(clock.unix_timestamp);
                
                msg!("Match {} timed out", match_state.match_id);
            }
        }

        // Record action for ephemeral rollup tracking
        ephemeral_state.record_action(clock.unix_timestamp);

        // Check if we should commit to mainnet
        if ephemeral_state.should_commit(clock.unix_timestamp) {
            ephemeral_state.commit(clock.unix_timestamp);
            
            msg!(
                "Ephemeral state committed to mainnet for match {}",
                match_state.match_id
            );
        }

        Ok(())
    }
}

// Context definitions
#[derive(Accounts)]
pub struct CreateMatch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    
    #[account(
        init,
        payer = creator,
        space = 8 + std::mem::size_of::<MatchState>(),
    )]
    pub match_state: Account<'info, MatchState>,
    
    #[account(
        init,
        payer = creator,
        space = 8 + std::mem::size_of::<MatchParticipants>(),
    )]
    pub match_participants: Account<'info, MatchParticipants>,
    
    #[account(
        init,
        payer = creator,
        space = 8 + std::mem::size_of::<MatchRewards>(),
    )]
    pub match_rewards: Account<'info, MatchRewards>,
    
    #[account(
        init,
        payer = creator,
        space = 8 + std::mem::size_of::<MatchAnalytics>(),
    )]
    pub match_analytics: Account<'info, MatchAnalytics>,
    
    #[account(
        init,
        payer = creator,
        space = 8 + std::mem::size_of::<EphemeralState>(),
    )]
    pub ephemeral_state: Account<'info, EphemeralState>,
    
    /// CHECK: Ephemeral Rollup PDA
    pub ephemeral_rollup: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinMatch<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(mut)]
    pub match_state: Account<'info, MatchState>,
    
    #[account(mut)]
    pub match_participants: Account<'info, MatchParticipants>,
    
    // Player must have required entry fee (validated off-chain or in previous instruction)
}

#[derive(Accounts)]
pub struct EndMatch<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub match_state: Account<'info, MatchState>,
    
    #[account(mut)]
    pub match_participants: Account<'info, MatchParticipants>,
    
    #[account(mut)]
    pub match_rewards: Account<'info, MatchRewards>,
    
    #[account(mut)]
    pub match_analytics: Account<'info, MatchAnalytics>,
    
    #[account(mut)]
    pub ephemeral_state: Account<'info, EphemeralState>,
}

#[derive(Accounts)]
pub struct ForceEndMatch<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub match_state: Account<'info, MatchState>,
}

#[derive(Accounts)]
pub struct UpdateMatchState<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub match_state: Account<'info, MatchState>,
    
    #[account(mut)]
    pub match_participants: Account<'info, MatchParticipants>,
    
    #[account(mut)]
    pub ephemeral_state: Account<'info, EphemeralState>,
}