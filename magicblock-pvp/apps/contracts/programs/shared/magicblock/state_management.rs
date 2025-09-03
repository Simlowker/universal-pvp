use anchor_lang::prelude::*;
use crate::shared::GameError;

/// State synchronization for cross-environment operations
#[account]
pub struct StateSync {
    pub authority: Pubkey,
    pub mainnet_state_hash: [u8; 32],
    pub er_state_hash: [u8; 32],
    pub last_sync_timestamp: i64,
    pub sync_frequency: i64, // seconds
    pub pending_syncs: Vec<PendingSync>,
    pub is_syncing: bool,
    pub sync_errors: u32,
    pub bump: u8,
}

impl StateSync {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // mainnet_state_hash
        32 + // er_state_hash
        8 + // last_sync_timestamp
        8 + // sync_frequency
        4 + (20 * PendingSync::LEN) + // pending_syncs (max 20)
        1 + // is_syncing
        4 + // sync_errors
        1; // bump

    pub fn needs_sync(&self, current_time: i64) -> bool {
        current_time - self.last_sync_timestamp > self.sync_frequency
    }

    pub fn add_pending_sync(&mut self, sync: PendingSync) -> Result<()> {
        if self.pending_syncs.len() >= 20 {
            return Err(GameError::InvalidGameState.into());
        }
        self.pending_syncs.push(sync);
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PendingSync {
    pub account_pubkey: Pubkey,
    pub sync_type: SyncType,
    pub priority: SyncPriority,
    pub data_hash: [u8; 32],
    pub created_at: i64,
    pub retry_count: u8,
}

impl PendingSync {
    pub const LEN: usize = 32 + // account_pubkey
        1 + // sync_type
        1 + // priority
        32 + // data_hash
        8 + // created_at
        1; // retry_count
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum SyncType {
    MatchResult,
    PlayerStats,
    TokenBalance,
    NftMetadata,
    RewardDistribution,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum SyncPriority {
    Low,
    Medium,
    High,
    Critical,
}

/// Cross-chain state bridge
#[account]
pub struct StateBridge {
    pub bridge_authority: Pubkey,
    pub mainnet_endpoint: String,
    pub er_endpoint: String,
    pub bridge_fee: u64,
    pub max_retries: u8,
    pub timeout_duration: i64,
    pub active_bridges: Vec<ActiveBridge>,
    pub total_bridged: u64,
    pub failed_bridges: u64,
    pub is_operational: bool,
    pub bump: u8,
}

impl StateBridge {
    pub const LEN: usize = 8 + // discriminator
        32 + // bridge_authority
        4 + 256 + // mainnet_endpoint (max 256 chars)
        4 + 256 + // er_endpoint (max 256 chars)
        8 + // bridge_fee
        1 + // max_retries
        8 + // timeout_duration
        4 + (10 * ActiveBridge::LEN) + // active_bridges (max 10)
        8 + // total_bridged
        8 + // failed_bridges
        1 + // is_operational
        1; // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ActiveBridge {
    pub bridge_id: u64,
    pub source_chain: ChainType,
    pub destination_chain: ChainType,
    pub account_pubkey: Pubkey,
    pub status: BridgeStatus,
    pub started_at: i64,
    pub data_size: u32,
    pub retry_count: u8,
}

impl ActiveBridge {
    pub const LEN: usize = 8 + // bridge_id
        1 + // source_chain
        1 + // destination_chain
        32 + // account_pubkey
        1 + // status
        8 + // started_at
        4 + // data_size
        1; // retry_count
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum ChainType {
    Mainnet,
    EphemeralRollup,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum BridgeStatus {
    Initiated,
    InProgress,
    Completed,
    Failed,
    Timeout,
}

/// Snapshot system for state recovery
#[account]
pub struct StateSnapshot {
    pub snapshot_id: u64,
    pub creator: Pubkey,
    pub snapshot_type: SnapshotType,
    pub state_hash: [u8; 32],
    pub data_size: u64,
    pub created_at: i64,
    pub expires_at: Option<i64>,
    pub metadata: SnapshotMetadata,
    pub is_validated: bool,
    pub validation_score: u32,
    pub bump: u8,
}

impl StateSnapshot {
    pub const LEN: usize = 8 + // discriminator
        8 + // snapshot_id
        32 + // creator
        1 + // snapshot_type
        32 + // state_hash
        8 + // data_size
        8 + // created_at
        1 + 8 + // expires_at (Option<i64>)
        SnapshotMetadata::LEN + // metadata
        1 + // is_validated
        4 + // validation_score
        1; // bump

    pub fn is_expired(&self, current_time: i64) -> bool {
        if let Some(expiry) = self.expires_at {
            current_time > expiry
        } else {
            false
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum SnapshotType {
    Full,
    Incremental,
    Emergency,
    Migration,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SnapshotMetadata {
    pub version: u32,
    pub compression_type: CompressionType,
    pub checksum: [u8; 32],
    pub account_count: u32,
    pub program_versions: Vec<ProgramVersion>,
}

impl SnapshotMetadata {
    pub const LEN: usize = 4 + // version
        1 + // compression_type
        32 + // checksum
        4 + // account_count
        4 + (5 * ProgramVersion::LEN); // program_versions (max 5)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum CompressionType {
    None,
    Gzip,
    Lz4,
    Zstd,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProgramVersion {
    pub program_id: Pubkey,
    pub version: String,
    pub deployment_slot: u64,
}

impl ProgramVersion {
    pub const LEN: usize = 32 + // program_id
        4 + 32 + // version (max 32 chars)
        8; // deployment_slot
}

/// State management instruction contexts
#[derive(Accounts)]
pub struct InitializeStateSync<'info> {
    #[account(
        init,
        payer = authority,
        space = StateSync::LEN,
        seeds = [b"state_sync"],
        bump
    )]
    pub state_sync: Account<'info, StateSync>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SyncState<'info> {
    #[account(
        mut,
        seeds = [b"state_sync"],
        bump = state_sync.bump
    )]
    pub state_sync: Account<'info, StateSync>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreateSnapshot<'info> {
    #[account(
        init,
        payer = creator,
        space = StateSnapshot::LEN,
        seeds = [b"snapshot", &Clock::get()?.unix_timestamp.to_le_bytes()],
        bump
    )]
    pub state_snapshot: Account<'info, StateSnapshot>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// State management handlers
pub mod state_handlers {
    use super::*;

    pub fn initialize_state_sync(
        ctx: Context<InitializeStateSync>,
        sync_frequency: i64,
    ) -> Result<()> {
        let state_sync = &mut ctx.accounts.state_sync;
        let current_time = Clock::get()?.unix_timestamp;
        
        state_sync.authority = ctx.accounts.authority.key();
        state_sync.mainnet_state_hash = [0; 32]; // Initial empty hash
        state_sync.er_state_hash = [0; 32]; // Initial empty hash
        state_sync.last_sync_timestamp = current_time;
        state_sync.sync_frequency = sync_frequency;
        state_sync.pending_syncs = Vec::new();
        state_sync.is_syncing = false;
        state_sync.sync_errors = 0;
        state_sync.bump = ctx.bumps.state_sync;

        Ok(())
    }

    pub fn sync_state(
        ctx: Context<SyncState>,
        mainnet_hash: [u8; 32],
        er_hash: [u8; 32],
    ) -> Result<()> {
        let state_sync = &mut ctx.accounts.state_sync;
        let current_time = Clock::get()?.unix_timestamp;

        if state_sync.is_syncing {
            return Err(GameError::InvalidGameState.into());
        }

        state_sync.is_syncing = true;
        state_sync.mainnet_state_hash = mainnet_hash;
        state_sync.er_state_hash = er_hash;
        state_sync.last_sync_timestamp = current_time;
        
        // Process pending syncs
        let mut failed_syncs = 0;
        state_sync.pending_syncs.retain(|sync| {
            // Simulate sync processing
            if sync.retry_count < 3 {
                false // Remove successful sync
            } else {
                failed_syncs += 1;
                true // Keep failed sync for retry
            }
        });

        state_sync.sync_errors = state_sync.sync_errors.saturating_add(failed_syncs);
        state_sync.is_syncing = false;

        Ok(())
    }

    pub fn create_snapshot(
        ctx: Context<CreateSnapshot>,
        snapshot_type: SnapshotType,
        state_hash: [u8; 32],
        data_size: u64,
        expires_at: Option<i64>,
    ) -> Result<()> {
        let snapshot = &mut ctx.accounts.state_snapshot;
        let current_time = Clock::get()?.unix_timestamp;
        
        snapshot.snapshot_id = current_time as u64;
        snapshot.creator = ctx.accounts.creator.key();
        snapshot.snapshot_type = snapshot_type;
        snapshot.state_hash = state_hash;
        snapshot.data_size = data_size;
        snapshot.created_at = current_time;
        snapshot.expires_at = expires_at;
        snapshot.metadata = SnapshotMetadata {
            version: 1,
            compression_type: CompressionType::Zstd,
            checksum: state_hash,
            account_count: 0,
            program_versions: Vec::new(),
        };
        snapshot.is_validated = false;
        snapshot.validation_score = 0;
        snapshot.bump = ctx.bumps.state_snapshot;

        Ok(())
    }
}