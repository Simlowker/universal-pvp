use anchor_lang::prelude::*;
use crate::shared::GameError;

/// Delegation state for MagicBlock Ephemeral Rollups
#[account]
pub struct DelegationState {
    pub delegator: Pubkey,
    pub ephemeral_rollup: Pubkey,
    pub original_owner: Pubkey,
    pub delegated_accounts: Vec<DelegatedAccount>,
    pub delegation_timestamp: i64,
    pub expiry_timestamp: Option<i64>,
    pub is_active: bool,
    pub pending_commits: Vec<PendingCommit>,
    pub bump: u8,
}

impl DelegationState {
    pub const LEN: usize = 8 + // discriminator
        32 + // delegator
        32 + // ephemeral_rollup
        32 + // original_owner
        4 + (10 * DelegatedAccount::LEN) + // delegated_accounts (max 10)
        8 + // delegation_timestamp
        1 + 8 + // expiry_timestamp (Option<i64>)
        1 + // is_active
        4 + (50 * PendingCommit::LEN) + // pending_commits (max 50)
        1; // bump

    pub fn add_delegated_account(&mut self, account: DelegatedAccount) -> Result<()> {
        if self.delegated_accounts.len() >= 10 {
            return Err(GameError::MaxParticipantsReached.into());
        }
        self.delegated_accounts.push(account);
        Ok(())
    }

    pub fn add_pending_commit(&mut self, commit: PendingCommit) -> Result<()> {
        if self.pending_commits.len() >= 50 {
            return Err(GameError::InvalidGameState.into());
        }
        self.pending_commits.push(commit);
        Ok(())
    }

    pub fn is_expired(&self, current_time: i64) -> bool {
        if let Some(expiry) = self.expiry_timestamp {
            current_time > expiry
        } else {
            false
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct DelegatedAccount {
    pub account_pubkey: Pubkey,
    pub account_type: DelegatedAccountType,
    pub original_data_hash: [u8; 32],
    pub current_data_hash: [u8; 32],
    pub is_modified: bool,
}

impl DelegatedAccount {
    pub const LEN: usize = 32 + // account_pubkey
        1 + // account_type
        32 + // original_data_hash
        32 + // current_data_hash
        1; // is_modified
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum DelegatedAccountType {
    Match,
    PlayerProfile,
    PlayerStats,
    GameState,
    TokenAccount,
    NftAccount,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PendingCommit {
    pub account_pubkey: Pubkey,
    pub commit_type: CommitType,
    pub data_hash: [u8; 32],
    pub timestamp: i64,
    pub requires_mainnet_confirmation: bool,
}

impl PendingCommit {
    pub const LEN: usize = 32 + // account_pubkey
        1 + // commit_type
        32 + // data_hash
        8 + // timestamp
        1; // requires_mainnet_confirmation
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum CommitType {
    StateUpdate,
    TokenTransfer,
    NftUpdate,
    MatchResult,
    PlayerStatsUpdate,
}

/// Instructions for delegation management
#[derive(Accounts)]
pub struct InitializeDelegation<'info> {
    #[account(
        init,
        payer = delegator,
        space = DelegationState::LEN,
        seeds = [b"delegation", ephemeral_rollup.key().as_ref(), delegator.key().as_ref()],
        bump
    )]
    pub delegation_state: Account<'info, DelegationState>,

    /// CHECK: This is the ephemeral rollup program ID
    pub ephemeral_rollup: UncheckedAccount<'info>,

    #[account(mut)]
    pub delegator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DelegateAccount<'info> {
    #[account(
        mut,
        seeds = [b"delegation", ephemeral_rollup.key().as_ref(), delegator.key().as_ref()],
        bump = delegation_state.bump,
        constraint = delegation_state.is_active
    )]
    pub delegation_state: Account<'info, DelegationState>,

    /// CHECK: This is the account to be delegated
    #[account(mut)]
    pub target_account: UncheckedAccount<'info>,

    /// CHECK: This is the ephemeral rollup program ID
    pub ephemeral_rollup: UncheckedAccount<'info>,

    #[account(mut)]
    pub delegator: Signer<'info>,
}

#[derive(Accounts)]
pub struct CommitStateChanges<'info> {
    #[account(
        mut,
        seeds = [b"delegation", ephemeral_rollup.key().as_ref(), delegator.key().as_ref()],
        bump = delegation_state.bump,
        constraint = delegation_state.is_active
    )]
    pub delegation_state: Account<'info, DelegationState>,

    /// CHECK: This is the ephemeral rollup program ID
    pub ephemeral_rollup: UncheckedAccount<'info>,

    #[account(mut)]
    pub delegator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RollbackChanges<'info> {
    #[account(
        mut,
        seeds = [b"delegation", ephemeral_rollup.key().as_ref(), delegator.key().as_ref()],
        bump = delegation_state.bump
    )]
    pub delegation_state: Account<'info, DelegationState>,

    /// CHECK: This is the ephemeral rollup program ID
    pub ephemeral_rollup: UncheckedAccount<'info>,

    #[account(mut)]
    pub delegator: Signer<'info>,
}

/// Delegation instruction handlers
pub mod delegation_handlers {
    use super::*;

    pub fn initialize_delegation(
        ctx: Context<InitializeDelegation>,
        expiry_timestamp: Option<i64>,
    ) -> Result<()> {
        let delegation_state = &mut ctx.accounts.delegation_state;
        
        delegation_state.delegator = ctx.accounts.delegator.key();
        delegation_state.ephemeral_rollup = ctx.accounts.ephemeral_rollup.key();
        delegation_state.original_owner = ctx.accounts.delegator.key();
        delegation_state.delegated_accounts = Vec::new();
        delegation_state.delegation_timestamp = Clock::get()?.unix_timestamp;
        delegation_state.expiry_timestamp = expiry_timestamp;
        delegation_state.is_active = true;
        delegation_state.pending_commits = Vec::new();
        delegation_state.bump = ctx.bumps.delegation_state;

        Ok(())
    }

    pub fn delegate_account(
        ctx: Context<DelegateAccount>,
        account_type: DelegatedAccountType,
    ) -> Result<()> {
        let delegation_state = &mut ctx.accounts.delegation_state;
        let current_time = Clock::get()?.unix_timestamp;

        // Check if delegation is expired
        if delegation_state.is_expired(current_time) {
            return Err(GameError::InvalidGameState.into());
        }

        // Create hash of current account data for integrity checking
        let account_data = &ctx.accounts.target_account.data.borrow();
        let data_hash = solana_program::hash::hash(account_data).to_bytes();

        let delegated_account = DelegatedAccount {
            account_pubkey: ctx.accounts.target_account.key(),
            account_type,
            original_data_hash: data_hash,
            current_data_hash: data_hash,
            is_modified: false,
        };

        delegation_state.add_delegated_account(delegated_account)?;

        Ok(())
    }

    pub fn commit_state_changes(
        ctx: Context<CommitStateChanges>,
        commits: Vec<PendingCommit>,
    ) -> Result<()> {
        let delegation_state = &mut ctx.accounts.delegation_state;
        let current_time = Clock::get()?.unix_timestamp;

        // Check if delegation is expired
        if delegation_state.is_expired(current_time) {
            return Err(GameError::InvalidGameState.into());
        }

        // Add all commits to pending list
        for commit in commits {
            delegation_state.add_pending_commit(commit)?;
        }

        // Process commits that don't require mainnet confirmation
        delegation_state.pending_commits.retain(|commit| {
            if !commit.requires_mainnet_confirmation {
                // Auto-approve local state changes
                false // Remove from pending
            } else {
                true // Keep in pending for mainnet confirmation
            }
        });

        Ok(())
    }

    pub fn rollback_changes(ctx: Context<RollbackChanges>) -> Result<()> {
        let delegation_state = &mut ctx.accounts.delegation_state;

        // Mark all delegated accounts as needing rollback
        for delegated_account in delegation_state.delegated_accounts.iter_mut() {
            if delegated_account.is_modified {
                delegated_account.current_data_hash = delegated_account.original_data_hash;
                delegated_account.is_modified = false;
            }
        }

        // Clear pending commits
        delegation_state.pending_commits.clear();

        Ok(())
    }
}