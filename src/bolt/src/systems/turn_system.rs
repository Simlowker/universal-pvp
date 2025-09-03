use bolt_lang::*;
use crate::components::*;

pub mod process_turn {
    use super::*;

    pub fn handler(ctx: Context<ProcessTurn>) -> Result<()> {
        let match_state = &mut ctx.accounts.match_state;
        let participants = &ctx.accounts.match_participants;
        let clock = Clock::get()?;

        // Validate match is in progress
        if match_state.state != GameState::InProgress {
            return Err(crate::GameError::InvalidGameState.into());
        }

        // Check if current turn has timed out
        if clock.unix_timestamp > match_state.turn_deadline {
            // Skip current player's turn
            next_turn(match_state, participants)?;
            
            msg!(
                "Turn timed out for player at index {}. Moving to next player.",
                match_state.current_turn
            );
        }

        // Process any end-of-turn effects for all players
        process_turn_effects(ctx)?;

        // Check if match should end
        if participants.is_match_over() {
            match_state.state = GameState::Completed;
            match_state.ended_at = Some(clock.unix_timestamp);
            match_state.winner = participants.get_winner();
        }

        Ok(())
    }

    fn next_turn(
        match_state: &mut MatchState,
        participants: &MatchParticipants,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let mut next_turn_index = (match_state.current_turn + 1) % participants.player_count;
        let mut attempts = 0;

        // Find next alive player
        while attempts < participants.player_count {
            if let Some(player_key) = participants.get_turn_player(next_turn_index) {
                // In a full implementation, we'd check if this player is still alive
                // For now, we assume all players in participants array are alive
                break;
            }
            
            next_turn_index = (next_turn_index + 1) % participants.player_count;
            attempts += 1;
        }

        if attempts >= participants.player_count {
            return Err(crate::GameError::InvalidGameState.into());
        }

        match_state.current_turn = next_turn_index;
        match_state.turn_deadline = clock.unix_timestamp + match_state.turn_timeout;

        Ok(())
    }

    fn process_turn_effects(ctx: Context<ProcessTurn>) -> Result<()> {
        // Process turn-based effects like poison, regeneration, etc.
        // This would iterate through all player effect components
        // For now, we'll just log that effects are being processed
        
        msg!("Processing turn effects for all players in match");
        
        // In a full implementation, this would:
        // 1. Get all player entities in the match
        // 2. Process their ActiveEffects components
        // 3. Apply damage/healing from DoT/HoT effects
        // 4. Update cooldowns
        // 5. Remove expired effects
        
        Ok(())
    }
}

pub mod end_turn {
    use super::*;

    pub fn handler(ctx: Context<EndTurn>) -> Result<()> {
        let match_state = &mut ctx.accounts.match_state;
        let participants = &ctx.accounts.match_participants;
        let analytics = &mut ctx.accounts.match_analytics;
        let clock = Clock::get()?;

        // Validate it's the player's turn
        let current_player = participants.get_turn_player(match_state.current_turn);
        if current_player != Some(ctx.accounts.player.key()) {
            return Err(crate::GameError::NotPlayerTurn.into());
        }

        // Record turn time for analytics
        let turn_start = match_state.turn_deadline - match_state.turn_timeout;
        let turn_duration = clock.unix_timestamp - turn_start;
        analytics.record_turn_time(turn_duration);

        // Move to next turn
        next_turn_in_sequence(match_state, participants)?;

        msg!(
            "Player {} ended turn. Turn duration: {}s",
            ctx.accounts.player.key(),
            turn_duration
        );

        Ok(())
    }

    fn next_turn_in_sequence(
        match_state: &mut MatchState,
        participants: &MatchParticipants,
    ) -> Result<()> {
        let clock = Clock::get()?;
        
        // Move to next player in turn order
        match_state.current_turn = (match_state.current_turn + 1) % participants.player_count;
        match_state.turn_deadline = clock.unix_timestamp + match_state.turn_timeout;

        // Validate next player exists
        if participants.get_turn_player(match_state.current_turn).is_none() {
            return Err(crate::GameError::InvalidGameState.into());
        }

        Ok(())
    }
}

pub mod skip_turn {
    use super::*;

    pub fn handler(ctx: Context<SkipTurn>) -> Result<()> {
        let match_state = &mut ctx.accounts.match_state;
        let participants = &ctx.accounts.match_participants;
        let clock = Clock::get()?;

        // Only allow skipping if turn has timed out or player explicitly skips
        let current_player = participants.get_turn_player(match_state.current_turn);
        let is_current_player = current_player == Some(ctx.accounts.player.key());
        let is_timed_out = clock.unix_timestamp > match_state.turn_deadline;

        if !is_current_player && !is_timed_out {
            return Err(crate::GameError::UnauthorizedAction.into());
        }

        // Skip to next turn
        next_turn_in_sequence(match_state, participants)?;

        msg!(
            "Turn skipped for player {}. Reason: {}",
            current_player.unwrap_or_default(),
            if is_timed_out { "timeout" } else { "voluntary" }
        );

        Ok(())
    }

    fn next_turn_in_sequence(
        match_state: &mut MatchState,
        participants: &MatchParticipants,
    ) -> Result<()> {
        let clock = Clock::get()?;
        
        match_state.current_turn = (match_state.current_turn + 1) % participants.player_count;
        match_state.turn_deadline = clock.unix_timestamp + match_state.turn_timeout;

        Ok(())
    }
}

pub mod pause_match {
    use super::*;

    pub fn handler(ctx: Context<PauseMatch>) -> Result<()> {
        let match_state = &mut ctx.accounts.match_state;
        let participants = &ctx.accounts.match_participants;

        // Only creator or unanimous player consent can pause
        let is_creator = ctx.accounts.authority.key() == match_state.creator;
        
        if !is_creator {
            return Err(crate::GameError::UnauthorizedAction.into());
        }

        if match_state.state != GameState::InProgress {
            return Err(crate::GameError::InvalidGameState.into());
        }

        match_state.state = GameState::Paused;

        msg!(
            "Match {} paused by {}",
            match_state.match_id,
            ctx.accounts.authority.key()
        );

        Ok(())
    }
}

pub mod resume_match {
    use super::*;

    pub fn handler(ctx: Context<ResumeMatch>) -> Result<()> {
        let match_state = &mut ctx.accounts.match_state;
        let clock = Clock::get()?;

        if match_state.state != GameState::Paused {
            return Err(crate::GameError::InvalidGameState.into());
        }

        // Only creator can resume
        if ctx.accounts.authority.key() != match_state.creator {
            return Err(crate::GameError::UnauthorizedAction.into());
        }

        match_state.state = GameState::InProgress;
        
        // Reset turn deadline to give current player full time
        match_state.turn_deadline = clock.unix_timestamp + match_state.turn_timeout;

        msg!(
            "Match {} resumed by {}",
            match_state.match_id,
            ctx.accounts.authority.key()
        );

        Ok(())
    }
}

// Context definitions
#[derive(Accounts)]
pub struct ProcessTurn<'info> {
    /// CHECK: System authority for processing turns
    pub system_authority: Signer<'info>,
    
    #[account(mut)]
    pub match_state: Account<'info, MatchState>,
    
    #[account(mut)]
    pub match_participants: Account<'info, MatchParticipants>,
}

#[derive(Accounts)]
pub struct EndTurn<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(mut)]
    pub match_state: Account<'info, MatchState>,
    
    #[account(mut)]
    pub match_participants: Account<'info, MatchParticipants>,
    
    #[account(mut)]
    pub match_analytics: Account<'info, MatchAnalytics>,
}

#[derive(Accounts)]
pub struct SkipTurn<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(mut)]
    pub match_state: Account<'info, MatchState>,
    
    #[account(mut)]
    pub match_participants: Account<'info, MatchParticipants>,
}

#[derive(Accounts)]
pub struct PauseMatch<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub match_state: Account<'info, MatchState>,
    
    #[account(mut)]
    pub match_participants: Account<'info, MatchParticipants>,
}

#[derive(Accounts)]
pub struct ResumeMatch<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub match_state: Account<'info, MatchState>,
}