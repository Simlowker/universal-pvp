/**
 * Game Client - Unified client combining MagicBlock, VRF, and TEE features
 */

import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { EventEmitter } from 'eventemitter3';
import { 
  GameClientConfig,
  GameState,
  GameAction,
  Match,
  Player,
  VRFOutput,
  WinnerSelectionConfig,
  WinnerSelectionResult,
  TEEAttestation,
  SessionState,
  MagicBlockError,
  SDKEvents
} from '../types';
import { MagicBlockClient } from './magicblock-client';
import { VRFClient } from '../vrf/vrf-client';
import { TEEAttestationVerifier } from '../tee/attestation';

export class GameClient extends EventEmitter<SDKEvents> {
  private magicBlockClient: MagicBlockClient;
  private vrfClient: VRFClient;
  private teeVerifier: TEEAttestationVerifier;
  private config: GameClientConfig;
  
  private gameStates = new Map<string, GameState>();
  private matches = new Map<string, Match>();
  private players = new Map<string, Player>();
  
  private rollupSessions = new Map<string, string>(); // matchId -> rollupId
  private isInitialized = false;

  constructor(config: GameClientConfig) {
    super();
    
    this.config = config;
    
    // Initialize sub-clients
    this.magicBlockClient = new MagicBlockClient(config);
    this.vrfClient = new VRFClient(config.vrf);
    this.teeVerifier = new TEEAttestationVerifier();
    
    // Forward events from sub-clients
    this.setupEventForwarding();
  }

  /**
   * Initialize the game client
   * @param keypair Optional keypair for session
   */
  async initialize(keypair?: Keypair): Promise<void> {
    try {
      // Initialize MagicBlock client
      await this.magicBlockClient.initialize(keypair);
      
      // Initialize VRF client
      await this.vrfClient.initialize();
      
      this.isInitialized = true;
      const vrfPublicKey = this.vrfClient.getPublicKey();
      this.emit('initialized', { vrfPublicKey: vrfPublicKey ? Buffer.from(vrfPublicKey).toString('hex') : '' });
      
    } catch (error) {
      throw new MagicBlockError(
        `Game client initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GAME_CLIENT_INIT_ERROR'
      );
    }
  }

  /**
   * Create a new game match with rollup session
   * @param players Array of player public keys
   * @param matchConfig Optional match configuration
   */
  async createMatch(players: PublicKey[], matchConfig?: {
    computeBudget?: number;
    lifetimeMs?: number;
    enableVRF?: boolean;
    requireTEE?: boolean;
  }): Promise<{ match: Match; rollupId: string }> {
    if (!this.isInitialized) {
      throw new MagicBlockError('Game client not initialized', 'NOT_INITIALIZED');
    }

    try {
      // Create rollup session for this match
      const rollupSession = await this.magicBlockClient.createRollupSession({
        computeBudget: matchConfig?.computeBudget,
        lifetimeMs: matchConfig?.lifetimeMs,
        autoCommit: true
      });
      
      // Create match object
      const match: Match = {
        id: new PublicKey(this.generateMatchId()),
        players: [...players],
        status: 0, // MatchStatus.Pending
        startTime: Date.now()
      };
      
      // Store match and rollup association
      this.matches.set(match.id.toString(), match);
      this.rollupSessions.set(match.id.toString(), rollupSession.rollupId);
      
      // Initialize game state
      const gameState: GameState = {
        match,
        players: players.map(pk => this.getOrCreatePlayer(pk)),
        currentTurn: players[0], // First player starts
        actions: []
      };
      
      this.gameStates.set(match.id.toString(), gameState);
      
      // Generate initial randomness if VRF enabled
      if (matchConfig?.enableVRF !== false) {
        const seed = new TextEncoder().encode(`match_${match.id.toString()}_${Date.now()}`);
        const vrfOutput = await this.vrfClient.generateRandomness(seed);
        
        this.emit('match:created', { match, vrfOutput });
      } else {
        this.emit('match:created', { match });
      }
      
      return { match, rollupId: rollupSession.rollupId };
      
    } catch (error) {
      throw new MagicBlockError(
        `Failed to create match: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'MATCH_CREATION_ERROR'
      );
    }
  }

  /**
   * Execute game action on rollup
   * @param matchId Match ID
   * @param action Game action to execute
   * @param attestation Optional TEE attestation for action verification
   */
  async executeGameAction(
    matchId: string,
    action: GameAction,
    attestation?: TEEAttestation
  ): Promise<{ signature: string; vrfOutput?: VRFOutput }> {
    const gameState = this.gameStates.get(matchId);
    if (!gameState) {
      throw new MagicBlockError('Match not found', 'MATCH_NOT_FOUND');
    }

    const rollupId = this.rollupSessions.get(matchId);
    if (!rollupId) {
      throw new MagicBlockError('No rollup session for match', 'NO_ROLLUP_SESSION');
    }

    try {
      // Verify TEE attestation if provided
      if (attestation && this.config.teeVerification) {
        const teeResult = await TEEAttestationVerifier.verifyAttestation(attestation);
        if (!teeResult.isValid) {
          throw new MagicBlockError('Invalid TEE attestation', 'TEE_VERIFICATION_FAILED');
        }
      }

      // Validate action
      this.validateGameAction(gameState, action);
      
      // Create transaction for the action
      const actionTx = await this.createActionTransaction(action, gameState);
      
      // Execute on rollup
      const result = await this.magicBlockClient.executeTransaction(actionTx, {
        priority: 'medium',
        rollupId,
        timeout: 10000 // 10s for game actions
      });
      
      // Update game state
      gameState.actions.push(action);
      this.updateGameState(gameState, action);
      
      // Generate VRF output for random events
      let vrfOutput: VRFOutput | undefined;
      if (this.requiresRandomness(action)) {
        const seed = this.createActionSeed(action, gameState);
        vrfOutput = await this.vrfClient.generateRandomness(seed);
        
        // Apply randomness to game state
        this.applyRandomness(gameState, action, vrfOutput);
      }
      
      this.emit('action:executed', { matchId, action, vrfOutput });
      
      return {
        signature: result.signature,
        vrfOutput
      };
      
    } catch (error) {
      throw new MagicBlockError(
        `Game action execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ACTION_EXECUTION_ERROR'
      );
    }
  }

  /**
   * Select match winners using VRF
   * @param matchId Match ID
   * @param winnerCount Number of winners to select
   * @param weights Optional player weights for selection
   */
  async selectMatchWinners(
    matchId: string, 
    winnerCount: number, 
    weights?: number[]
  ): Promise<WinnerSelectionResult> {
    const gameState = this.gameStates.get(matchId);
    if (!gameState) {
      throw new MagicBlockError('Match not found', 'MATCH_NOT_FOUND');
    }

    try {
      const selectionConfig: WinnerSelectionConfig = {
        totalParticipants: gameState.players.length,
        winnerCount,
        seed: new TextEncoder().encode(`winners_${matchId}_${Date.now()}`),
        weights
      };
      
      const result = await this.vrfClient.selectWinners(selectionConfig);
      
      // Update match with winners
      const match = gameState.match;
      if (result.winners.length > 0) {
        match.winner = gameState.players[result.winners[0]].publicKey;
      }
      match.status = 2; // MatchStatus.Completed
      match.endTime = Date.now();
      
      this.matches.set(matchId, match);
      gameState.match = match;
      
      this.emit('match:completed', { match, winnerSelection: result });
      
      return result;
      
    } catch (error) {
      throw new MagicBlockError(
        `Winner selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'WINNER_SELECTION_ERROR'
      );
    }
  }

  /**
   * Commit match results to L1
   * @param matchId Match ID to commit
   */
  async commitMatchToL1(matchId: string): Promise<{ signature: string; proof: any }> {
    const rollupId = this.rollupSessions.get(matchId);
    if (!rollupId) {
      throw new MagicBlockError('No rollup session for match', 'NO_ROLLUP_SESSION');
    }

    try {
      const result = await this.magicBlockClient.commitToL1(rollupId);
      
      // Clean up rollup session
      this.rollupSessions.delete(matchId);
      
      this.emit('match:committed', { matchId, signature: result.signature });
      
      return result;
      
    } catch (error) {
      throw new MagicBlockError(
        `Match L1 commitment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'MATCH_COMMIT_ERROR'
      );
    }
  }

  /**
   * Get match state
   * @param matchId Match ID
   */
  getMatchState(matchId: string): GameState | null {
    return this.gameStates.get(matchId) || null;
  }

  /**
   * Get all matches for a player
   * @param playerPubkey Player public key
   */
  getPlayerMatches(playerPubkey: PublicKey): Match[] {
    const playerKey = playerPubkey.toString();
    return Array.from(this.matches.values())
      .filter(match => match.players.some(p => p.toString() === playerKey));
  }

  /**
   * Get player statistics
   * @param playerPubkey Player public key
   */
  getPlayerStats(playerPubkey: PublicKey): Player | null {
    return this.players.get(playerPubkey.toString()) || null;
  }

  /**
   * Get client status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      activeMatches: this.gameStates.size,
      activePlayers: this.players.size,
      rollupSessions: this.rollupSessions.size,
      magicBlock: this.magicBlockClient.getStatus(),
      vrfMetrics: this.vrfClient.getMetrics()
    };
  }

  /**
   * Close client and cleanup
   */
  async close(): Promise<void> {
    try {
      await this.magicBlockClient.close();
      this.gameStates.clear();
      this.matches.clear();
      this.players.clear();
      this.rollupSessions.clear();
      this.isInitialized = false;
    } catch (error) {
      console.error('Error closing game client:', error);
    }
  }

  /**
   * Get or create player record
   */
  private getOrCreatePlayer(publicKey: PublicKey): Player {
    const key = publicKey.toString();
    let player = this.players.get(key);
    
    if (!player) {
      player = {
        publicKey,
        username: key.slice(0, 8), // Use first 8 chars as default username
        level: 1,
        experience: 0,
        wins: 0,
        losses: 0
      };
      this.players.set(key, player);
    }
    
    return player;
  }

  /**
   * Validate game action
   */
  private validateGameAction(gameState: GameState, action: GameAction): void {
    // Check if it's the player's turn
    if (action.player.toString() !== gameState.currentTurn.toString()) {
      throw new MagicBlockError('Not player turn', 'INVALID_TURN');
    }
    
    // Check if match is active
    if (gameState.match.status !== 1) { // MatchStatus.Active
      throw new MagicBlockError('Match not active', 'MATCH_NOT_ACTIVE');
    }
    
    // Additional action-specific validation would go here
  }

  /**
   * Create transaction for game action
   */
  private async createActionTransaction(action: GameAction, gameState: GameState): Promise<Transaction> {
    // In a real implementation, this would create a proper Solana transaction
    // For now, return a dummy transaction
    const transaction = new Transaction();
    
    // Add action data as memo or custom instruction
    // transaction.add(...);
    
    return transaction;
  }

  /**
   * Update game state based on action
   */
  private updateGameState(gameState: GameState, action: GameAction): void {
    // Update current turn to next player
    const currentPlayerIndex = gameState.players.findIndex(
      p => p.publicKey.toString() === action.player.toString()
    );
    
    if (currentPlayerIndex >= 0) {
      const nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length;
      gameState.currentTurn = gameState.players[nextPlayerIndex].publicKey;
    }
    
    // Store updated state
    this.gameStates.set(gameState.match.id.toString(), gameState);
  }

  /**
   * Check if action requires randomness
   */
  private requiresRandomness(action: GameAction): boolean {
    // Actions that typically require randomness
    const randomnessActions = [1, 4]; // Attack, Special
    return randomnessActions.includes(action.type);
  }

  /**
   * Create seed for action randomness
   */
  private createActionSeed(action: GameAction, gameState: GameState): Uint8Array {
    const seedString = `${gameState.match.id.toString()}_${action.type}_${action.player.toString()}_${action.timestamp}`;
    return new TextEncoder().encode(seedString);
  }

  /**
   * Apply VRF randomness to game state
   */
  private applyRandomness(gameState: GameState, action: GameAction, vrfOutput: VRFOutput): void {
    // Convert VRF output to game-specific random values
    const randomValue = new DataView(vrfOutput.beta.buffer).getUint32(0, false) / 0xFFFFFFFF;
    
    // Apply randomness based on action type
    switch (action.type) {
      case 1: // Attack
        action.data.damage = Math.floor(randomValue * 100) + 1;
        break;
      case 4: // Special
        action.data.effect = randomValue > 0.5 ? 'critical' : 'normal';
        break;
    }
  }

  /**
   * Generate unique match ID
   */
  private generateMatchId(): string {
    return `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Setup event forwarding from sub-clients
   */
  private setupEventForwarding(): void {
    // Forward MagicBlock events
    this.magicBlockClient.on('session:created', (session) => {
      this.emit('session:created', session);
    });
    
    this.magicBlockClient.on('transaction:confirmed', (signature) => {
      this.emit('transaction:confirmed', signature);
    });
    
    // Forward VRF events
    this.vrfClient.on('vrf:generated', (output) => {
      this.emit('vrf:generated', output);
    });
    
    this.vrfClient.on('winners:selected', (result) => {
      this.emit('winners:selected', result);
    });
  }
}