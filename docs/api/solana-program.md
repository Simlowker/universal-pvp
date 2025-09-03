# SOL Duel Solana Program Documentation

## Overview

SOL Duel's on-chain program handles game state, player registration, match creation, escrow management, and reward distribution on the Solana blockchain. The program ensures trustless, verifiable gameplay with automatic payout mechanics.

**Program ID**: `GAMExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## Architecture

### Program Structure
```
src/programs/
├── game-program/           # Main game logic program
│   ├── lib.rs             # Program entry points
│   ├── state.rs           # Account state definitions  
│   └── instructions/      # Instruction handlers
├── token-program/          # Token management
└── nft-program/           # NFT rewards and equipment
```

### Account Types

| Account | Description | Size (bytes) |
|---------|-------------|--------------|
| `GameState` | Global game configuration | 72 |
| `PlayerProfile` | Player stats and info | 256 |
| `Match` | Individual match state | 512+ |
| `MatchPlayer` | Player state within match | 128 |

## Instructions

### Player Management

#### `initialize_game`
Initialize the global game state (admin only).

**Accounts:**
- `game_state` (writable, signer): Global game state account
- `authority` (signer): Upgrade authority
- `system_program`: Solana System Program

**Parameters:**
- `upgrade_authority: Pubkey` - Account that can upgrade the program

**Example:**
```rust
pub struct InitializeGame<'info> {
    #[account(
        init,
        payer = authority,
        space = GameState::LEN,
        seeds = [b"game_state"],
        bump
    )]
    pub game_state: Account<'info, GameState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
```

#### `register_player`
Register a new player profile on-chain.

**Accounts:**
- `player_profile` (writable, init): New player profile account
- `player` (signer, payer): Player's wallet
- `system_program`: Solana System Program

**Parameters:**
- `username: String` - Player's chosen username (3-30 chars)
- `player_class: PlayerClass` - Initial character class

**Player Classes:**
```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum PlayerClass {
    Warrior,    // High health, moderate attack
    Mage,       // High mana, magical attacks  
    Rogue,      // High speed, critical hits
    Paladin,    // Balanced stats, healing
    Berserker,  // High attack, low defense
}
```

**Base Stats by Class:**
| Class | Health | Attack | Defense | Speed | Mana |
|-------|---------|---------|----------|--------|------|
| Warrior | 120 | 80 | 90 | 60 | 40 |
| Mage | 80 | 70 | 50 | 70 | 120 |
| Rogue | 90 | 90 | 60 | 100 | 50 |
| Paladin | 110 | 75 | 85 | 65 | 80 |
| Berserker | 100 | 110 | 40 | 80 | 30 |

### Match Management

#### `create_match`
Create a new match with specified configuration.

**Accounts:**
- `match_account` (writable, init): New match account
- `creator_profile` (writable): Creator's player profile
- `creator` (signer): Match creator
- `creator_token_account` (writable): Creator's token account for entry fee
- `sol_mint`: SOL mint account
- `token_program`: SPL Token Program
- `system_program`: Solana System Program

**Parameters:**
- `match_config: MatchConfig` - Match configuration

**MatchConfig Structure:**
```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MatchConfig {
    pub entry_fee: u64,           // Entry fee in lamports
    pub max_players: u8,          // Maximum players (2-8)  
    pub turn_timeout: i64,        // Turn timeout in seconds
    pub match_duration: i64,      // Max match duration in seconds
    pub game_mode: GameMode,      // Game mode type
    pub allow_spectators: bool,   // Allow spectators
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum GameMode {
    LastManStanding,  // Standard battle royale
    FirstToKill,      // First to eliminate opponent wins
    HealthBased,      // Win by dealing most damage
    TimeBased,        // Most health when time expires wins
}
```

#### `join_match`
Join an existing match.

**Accounts:**
- `match_account` (writable): Match to join
- `player_profile` (writable): Joining player's profile
- `player` (signer): Joining player's wallet
- `player_token_account` (writable): Player's token account
- `sol_mint`: SOL mint account
- `token_program`: SPL Token Program

**Validation:**
- Match must be in `WaitingForPlayers` state
- Player must have sufficient balance for entry fee
- Match must not be full
- Player cannot join their own match

#### `start_match`
Start a match when ready conditions are met.

**Accounts:**
- `match_account` (writable): Match to start
- `authority` (signer): Game authority or match creator

**Start Conditions:**
- Minimum players reached (typically 2)
- All players have paid entry fees
- Match is in `WaitingForPlayers` state

### Gameplay Instructions

#### `execute_action`
Execute a combat action during active match.

**Accounts:**
- `match_account` (writable): Active match
- `player_profile` (writable): Acting player's profile  
- `player` (signer): Acting player

**Parameters:**
- `action: CombatAction` - Action to execute

**Combat Actions:**
```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum CombatAction {
    Attack { 
        target_index: u8,
        power: u32,
        weapon_type: Option<WeaponType>
    },
    Heal { 
        heal_amount: u32,
        mana_cost: u32 
    },
    SpecialAttack { 
        target_index: u8,
        skill_id: String,
        mana_cost: u32 
    },
    Defend { 
        defense_bonus: u32 
    },
    UseItem { 
        item_id: String,
        target_index: Option<u8> 
    },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum WeaponType {
    Sword,      // +10% critical chance
    Axe,        // +15% damage, -10% speed
    Bow,        // Range attack, +5% accuracy
    Staff,      // Magical damage, +20% mana efficiency
    Dagger,     // +20% critical chance, -10% damage
}
```

**Action Validation:**
- Must be player's turn
- Player must be alive
- Sufficient mana/resources for action
- Valid targets only
- Within turn time limit

#### `end_turn`
End current player's turn and advance to next player.

**Accounts:**
- `match_account` (writable): Active match
- `player` (signer): Current turn player

**Turn Logic:**
- Advances to next alive player
- Resets turn timer
- Applies status effects
- Checks win conditions

### Match Completion

#### `finish_match`
Complete a match and distribute rewards.

**Accounts:**
- `match_account` (writable): Match to finish
- `authority` (signer): Game authority
- `token_program`: SPL Token Program

**Completion Logic:**
1. Determine winner(s)
2. Calculate final scores and statistics
3. Distribute reward pool
4. Update player ELO ratings
5. Record match results
6. Update player statistics

**Reward Distribution:**
```rust
// Platform fee (5% default)
let platform_fee = total_pool * PLATFORM_FEE_PERCENTAGE;
let winner_reward = total_pool - platform_fee;

// Multi-winner scenarios (tournaments)
let rewards_per_winner = winner_reward / winner_count;
```

#### `update_player_stats`
Update player statistics after match completion.

**Accounts:**
- `player_profile` (writable): Player's profile to update
- `player` (signer): Player's wallet

**Parameters:**
- `experience_gained: u32` - Experience points earned

**Statistics Updated:**
- Total matches played
- Wins/losses record
- Total damage dealt/taken
- Experience and level
- ELO rating changes
- Earnings tracking

### Administrative Instructions

#### `emergency_stop_match`
Emergency stop for problematic matches (admin only).

**Accounts:**
- `match_account` (writable): Match to stop
- `game_state`: Global game state
- `authority` (signer): Must be upgrade authority
- `token_program`: SPL Token Program

**Emergency Conditions:**
- Suspected cheating or exploits
- Technical issues preventing normal completion
- Player disputes requiring intervention
- Smart contract bugs or edge cases

**Refund Logic:**
```rust
// Refund entry fees to all players
for player in match.players.iter() {
    refund_amount = match.config.entry_fee;
    // Transfer back to player's wallet
}
```

## Account Structures

### GameState
```rust
#[account]
pub struct GameState {
    pub upgrade_authority: Pubkey,        // Admin authority
    pub total_matches: u64,               // All-time match count
    pub total_players: u64,               // Registered player count  
    pub total_rewards_distributed: u64,   // Total SOL distributed
    pub paused: bool,                     // Emergency pause flag
    pub bump: u8,                         // PDA bump seed
}
```

### PlayerProfile  
```rust
#[account]
pub struct PlayerProfile {
    pub owner: Pubkey,                    // Player's wallet
    pub username: String,                 // Display name
    pub player_class: PlayerClass,        // Character class
    pub base_stats: PlayerStats,          // Base statistics
    pub level: u32,                       // Current level
    pub experience: u64,                  // Total experience
    pub total_matches: u32,               // Matches played
    pub wins: u32,                        // Wins count
    pub losses: u32,                      // Losses count  
    pub total_damage_dealt: u64,          // Cumulative damage
    pub total_damage_taken: u64,          // Cumulative damage taken
    pub created_at: i64,                  // Registration timestamp
    pub last_match_at: i64,               // Last activity
    pub is_active: bool,                  // Account status
    pub bump: u8,                         // PDA bump seed
}
```

### Match
```rust
#[account]
pub struct Match {
    pub creator: Pubkey,                  // Match creator
    pub match_id: u64,                    // Unique match ID
    pub config: MatchConfig,              // Match settings
    pub state: GameState,                 // Current state
    pub players: Vec<MatchPlayer>,        // Player list
    pub current_turn: u8,                 // Current player index
    pub turn_deadline: i64,               // Turn expiration time
    pub reward_pool: u64,                 // Total rewards in lamports
    pub winner: Option<Pubkey>,           // Winner (if finished)
    pub created_at: i64,                  // Creation timestamp
    pub started_at: Option<i64>,          // Start timestamp
    pub ended_at: Option<i64>,            // End timestamp
    pub bump: u8,                         // PDA bump seed
}
```

### MatchPlayer
```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct MatchPlayer {
    pub player: Pubkey,                   // Player's wallet
    pub stats: PlayerStats,               // Current match stats
    pub current_health: u32,              // Current health points
    pub current_mana: u32,                // Current mana points
    pub is_alive: bool,                   // Alive status
    pub actions_taken: u32,               // Actions this match
    pub damage_dealt: u32,                // Damage dealt this match
    pub damage_taken: u32,                // Damage taken this match
    pub joined_at: i64,                   // Join timestamp
}
```

## Error Codes

```rust
#[error_code]
pub enum GameError {
    #[msg("Invalid match configuration")]
    InvalidMatchConfig,                   // 6000

    #[msg("Match is full")]  
    MatchFull,                           // 6001

    #[msg("Insufficient balance for entry fee")]
    InsufficientBalance,                 // 6002
    
    #[msg("Not player's turn")]
    NotPlayerTurn,                       // 6003
    
    #[msg("Player is not alive")]
    PlayerNotAlive,                      // 6004
    
    #[msg("Invalid target")]
    InvalidTarget,                       // 6005
    
    #[msg("Insufficient mana")]
    InsufficientMana,                    // 6006
    
    #[msg("Turn timeout exceeded")]
    TurnTimeoutExceeded,                 // 6007
    
    #[msg("Match not active")]
    MatchNotActive,                      // 6008
    
    #[msg("Invalid game state")]
    InvalidGameState,                    // 6009
    
    #[msg("Unauthorized action")]
    Unauthorized,                        // 6010
    
    #[msg("Username already taken")]
    UsernameTaken,                       // 6011
    
    #[msg("Invalid username length")]
    InvalidUsernameLength,               // 6012
    
    #[msg("Player already registered")]
    PlayerAlreadyRegistered,             // 6013
    
    #[msg("Match already started")]
    MatchAlreadyStarted,                 // 6014
    
    #[msg("Cannot join own match")]
    CannotJoinOwnMatch,                  // 6015
}
```

## Events

### Match Events
```rust
#[event]
pub struct MatchCreated {
    pub match_id: u64,
    pub creator: Pubkey,
    pub config: MatchConfig,
    pub timestamp: i64,
}

#[event] 
pub struct PlayerJoined {
    pub match_id: u64,
    pub player: Pubkey,
    pub username: String,
    pub timestamp: i64,
}

#[event]
pub struct MatchStarted {
    pub match_id: u64,
    pub players: Vec<Pubkey>,
    pub timestamp: i64,
}

#[event]
pub struct ActionExecuted {
    pub match_id: u64,
    pub player: Pubkey,
    pub action: CombatAction,
    pub result: ActionResult,
    pub timestamp: i64,
}

#[event]
pub struct MatchCompleted {
    pub match_id: u64,
    pub winner: Option<Pubkey>,
    pub reason: CompletionReason,
    pub final_stats: Vec<PlayerMatchStats>,
    pub rewards_distributed: u64,
    pub timestamp: i64,
}
```

## Integration Examples

### Client-Side Integration (JavaScript/TypeScript)

```typescript
import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';

// Initialize program
const connection = new Connection('https://api.mainnet-beta.solana.com');
const programId = new PublicKey('GAMExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');

// Register new player
async function registerPlayer(
    playerKeypair: Keypair,
    username: string,
    playerClass: PlayerClass
) {
    const [playerProfilePda] = await PublicKey.findProgramAddress(
        [Buffer.from('player'), playerKeypair.publicKey.toBuffer()],
        programId
    );

    const tx = await program.methods
        .registerPlayer(username, playerClass)
        .accounts({
            playerProfile: playerProfilePda,
            player: playerKeypair.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .signers([playerKeypair])
        .rpc();

    return { tx, playerProfile: playerProfilePda };
}

// Create match
async function createMatch(
    creatorKeypair: Keypair,
    matchConfig: MatchConfig
) {
    const matchId = Date.now();
    const [matchPda] = await PublicKey.findProgramAddress(
        [
            Buffer.from('match'),
            creatorKeypair.publicKey.toBuffer(),
            Buffer.from(matchId.toString())
        ],
        programId
    );

    const tx = await program.methods
        .createMatch(matchConfig)
        .accounts({
            matchAccount: matchPda,
            creatorProfile: creatorProfilePda,
            creator: creatorKeypair.publicKey,
            // ... other accounts
        })
        .signers([creatorKeypair])
        .rpc();

    return { tx, match: matchPda };
}

// Execute combat action
async function executeAction(
    playerKeypair: Keypair,
    matchPda: PublicKey,
    action: CombatAction
) {
    const tx = await program.methods
        .executeAction(action)
        .accounts({
            matchAccount: matchPda,
            playerProfile: playerProfilePda,
            player: playerKeypair.publicKey,
        })
        .signers([playerKeypair])
        .rpc();

    return tx;
}
```

### Listening to Events
```typescript
// Listen to match events
program.addEventListener('MatchCreated', (event, slot) => {
    console.log('New match created:', event.matchId);
    console.log('Creator:', event.creator.toString());
    console.log('Config:', event.config);
});

program.addEventListener('ActionExecuted', (event, slot) => {
    console.log('Action executed in match:', event.matchId);
    console.log('Player:', event.player.toString());
    console.log('Action:', event.action);
    console.log('Result:', event.result);
});
```

## Security Considerations

### Input Validation
- All string inputs are length-validated
- Numeric inputs are range-checked
- Account ownership is verified
- PDA derivations are validated

### Reentrancy Protection
- State updates occur before external calls
- Critical sections use proper ordering
- Token transfers are validated

### Access Control
- Player actions require proper signatures  
- Admin functions restricted to upgrade authority
- Match participation validated per account

### Economic Security
- Entry fees escrowed before match start
- Reward calculations prevent overflow
- Platform fees calculated precisely
- Emergency refund mechanisms available

This Solana program provides the trustless, verifiable foundation for SOL Duel's competitive gaming platform, ensuring fair play and automatic reward distribution.