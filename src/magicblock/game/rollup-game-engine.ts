/**
 * Rollup Game Engine for MagicBlock PvP
 * Handles real-time game state transitions on ephemeral rollups
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  TransactionInstruction
} from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { EventEmitter } from 'eventemitter3';

import { EphemeralRollupsClient } from '../rollup/ephemeral-rollups-client';
import { RealSessionKeyManager } from '../core/real-session-key-manager';
import { GaslessTransactionManager } from '../core/gasless-transaction-manager';
import { StateSync } from '../core/state-sync';
import { DevNetVRFPlugin } from '../vrf/devnet-vrf-plugin';

export interface GameState {
  gameId: string;
  players: PlayerState[];
  currentPhase: GamePhase;
  pot: BN;
  currentBet: BN;
  round: number;
  deck?: Card[];
  communityCards?: Card[];
  vrfRequestId?: string;
  lastAction?: GameAction;
  winner?: string;
  timestamp: number;
  stateVersion: number;
}

export interface PlayerState {
  playerId: string;
  publicKey: PublicKey;
  balance: BN;
  currentBet: BN;
  cards?: Card[];
  position: number;
  status: PlayerStatus;
  lastAction?: GameAction;
  sessionId?: string;
}

export interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: number; // 2-14 (11=J, 12=Q, 13=K, 14=A)
}

export interface GameAction {
  actionId: string;
  playerId: string;
  type: 'JOIN' | 'BET' | 'CALL' | 'RAISE' | 'FOLD' | 'STRATEGIC_FOLD' | 'CHECK' | 'REVEAL';
  amount?: BN;
  cards?: Card[];
  timestamp: number;
  nonce: number;
  signature?: string;
}

export enum GamePhase {
  WAITING = 'waiting',
  DEALING = 'dealing',
  BETTING = 'betting',
  REVEAL = 'reveal',
  RESOLUTION = 'resolution',
  COMPLETED = 'completed'
}

export enum PlayerStatus {
  ACTIVE = 'active',
  FOLDED = 'folded',
  ALL_IN = 'all_in',
  DISCONNECTED = 'disconnected'
}

export interface GameConfig {
  maxPlayers: number;
  minBet: BN;
  maxBet: BN;
  blinds: {
    small: BN;
    big: BN;
  };
  timeoutSeconds: number;
  enableVRF: boolean;
  rollupConfig: {
    tickRateMs: number;
    batchSize: number;
    autoCommit: boolean;
  };
}

export interface RollupTransition {
  from: GameState;
  to: GameState;
  action: GameAction;
  valid: boolean;
  executionTime: number;
  rollupSignature?: string;
}

export class RollupGameEngine extends EventEmitter {
  private connection: Connection;
  private rollupClient: EphemeralRollupsClient;
  private sessionManager: RealSessionKeyManager;
  private gaslessManager: GaslessTransactionManager;
  private stateSync: StateSync;
  private vrfPlugin: DevNetVRFPlugin;
  
  // Game state management
  private games: Map<string, GameState> = new Map();
  private gameConfigs: Map<string, GameConfig> = new Map();
  private rollupSessions: Map<string, string> = new Map(); // gameId -> rollupSessionId
  
  // Performance tracking
  private transitionLatencies: number[] = [];
  private readonly TARGET_TRANSITION_TIME_MS = 30;
  
  // Game mechanics
  private readonly STRATEGIC_FOLD_REFUND = 0.5; // 50% refund
  
  constructor(
    connection: Connection,
    rollupClient: EphemeralRollupsClient,
    sessionManager: RealSessionKeyManager,
    gaslessManager: GaslessTransactionManager,
    stateSync: StateSync,
    vrfPlugin: DevNetVRFPlugin
  ) {
    super();
    
    this.connection = connection;
    this.rollupClient = rollupClient;
    this.sessionManager = sessionManager;
    this.gaslessManager = gaslessManager;
    this.stateSync = stateSync;
    this.vrfPlugin = vrfPlugin;
    
    console.log('🎮 Rollup Game Engine initialized');
  }

  /**
   * Create new PvP game on ephemeral rollup
   */
  async createGame(
    gameId: string,
    creator: PublicKey,
    config: Partial<GameConfig> = {}
  ): Promise<GameState> {
    const startTime = performance.now();
    
    try {
      // Default game configuration
      const gameConfig: GameConfig = {
        maxPlayers: config.maxPlayers || 6,
        minBet: config.minBet || new BN(1000000), // 0.001 SOL
        maxBet: config.maxBet || new BN(1000000000), // 1 SOL
        blinds: {
          small: config.blinds?.small || new BN(5000000), // 0.005 SOL
          big: config.blinds?.big || new BN(10000000) // 0.01 SOL
        },
        timeoutSeconds: config.timeoutSeconds || 30,
        enableVRF: config.enableVRF ?? true,
        rollupConfig: {
          tickRateMs: config.rollupConfig?.tickRateMs || 50, // 20 TPS
          batchSize: config.rollupConfig?.batchSize || 25,
          autoCommit: config.rollupConfig?.autoCommit ?? true
        }
      };
      
      // Create rollup session for game
      const authority = Keypair.generate(); // Game authority
      const rollupSession = await this.rollupClient.createRollupSession(authority, {
        computeBudget: 2_000_000,
        lifetimeMs: 7200000, // 2 hours
        autoCommit: gameConfig.rollupConfig.autoCommit,
        tickRateMs: gameConfig.rollupConfig.tickRateMs
      });
      
      // Initialize game state
      const gameState: GameState = {
        gameId,
        players: [],
        currentPhase: GamePhase.WAITING,
        pot: new BN(0),
        currentBet: new BN(0),
        round: 0,
        timestamp: Date.now(),
        stateVersion: 1
      };
      
      // Store game data
      this.games.set(gameId, gameState);
      this.gameConfigs.set(gameId, gameConfig);
      this.rollupSessions.set(gameId, rollupSession.id);
      
      // Track game state for sync
      await this.stateSync.trackAccount(new PublicKey(gameId), rollupSession.id);
      
      const latency = performance.now() - startTime;
      console.log(`🎮 Game created: ${gameId} (${latency.toFixed(1)}ms)`);
      
      this.emit('game:created', gameState);
      
      return gameState;
      
    } catch (error) {
      const latency = performance.now() - startTime;
      console.error(`❌ Game creation failed in ${latency.toFixed(1)}ms:`, error);
      throw new Error(`Game creation failed: ${error.message}`);
    }
  }

  /**
   * Execute game action with state transition validation
   */
  async executeGameAction(
    gameId: string,
    action: GameAction,
    playerSessionId: string
  ): Promise<RollupTransition> {
    const startTime = performance.now();
    
    try {
      const currentState = this.games.get(gameId);
      if (!currentState) {
        throw new Error(`Game ${gameId} not found`);
      }
      
      // Validate action
      const validation = this.validateAction(currentState, action);
      if (!validation.valid) {
        throw new Error(`Invalid action: ${validation.reason}`);
      }
      
      // Apply state transition
      const newState = await this.applyStateTransition(currentState, action);
      
      // Execute on rollup for instant confirmation
      const rollupSessionId = this.rollupSessions.get(gameId);
      if (!rollupSessionId) {
        throw new Error(`No rollup session for game ${gameId}`);
      }
      
      const rollupTx = await this.buildGameTransaction(gameId, action);
      const rollupResult = await this.rollupClient.executeTransaction(
        rollupSessionId,
        rollupTx,
        [this.getGameAuthority(gameId)]
      );
      
      // Update game state
      this.games.set(gameId, newState);
      
      const executionTime = performance.now() - startTime;
      this.transitionLatencies.push(executionTime);
      
      const transition: RollupTransition = {
        from: currentState,
        to: newState,
        action,
        valid: true,
        executionTime,
        rollupSignature: rollupResult.signature
      };
      
      if (executionTime > this.TARGET_TRANSITION_TIME_MS) {
        console.warn(`⚠️ Transition took ${executionTime}ms, target is ${this.TARGET_TRANSITION_TIME_MS}ms`);
      }
      
      console.log(`🎯 Action executed: ${action.type} (${executionTime.toFixed(1)}ms)`);
      
      // Emit events
      this.emit('action:executed', transition);
      this.emit('state:changed', newState);
      
      // Handle special actions
      await this.handleSpecialActions(newState, action);
      
      return transition;
      
    } catch (error) {
      const executionTime = performance.now() - startTime;
      console.error(`❌ Action execution failed in ${executionTime.toFixed(1)}ms:`, error);
      
      const currentState = this.games.get(gameId);
      const failedTransition: RollupTransition = {
        from: currentState!,
        to: currentState!,
        action,
        valid: false,
        executionTime
      };
      
      this.emit('action:failed', failedTransition, error);
      throw new Error(`Action execution failed: ${error.message}`);
    }
  }

  /**
   * Join game as player
   */
  async joinGame(
    gameId: string,
    player: PublicKey,
    buyIn: BN,
    sessionId: string
  ): Promise<PlayerState> {
    const joinAction: GameAction = {
      actionId: `join_${Date.now()}`,
      playerId: player.toString(),
      type: 'JOIN',
      amount: buyIn,
      timestamp: Date.now(),
      nonce: Date.now()
    };
    
    const transition = await this.executeGameAction(gameId, joinAction, sessionId);
    
    const playerState = transition.to.players.find(p => p.playerId === player.toString());
    if (!playerState) {
      throw new Error('Failed to join game');
    }
    
    return playerState;
  }

  /**
   * Execute strategic fold with 50% refund
   */
  async executeStrategicFold(
    gameId: string,
    playerId: string,
    sessionId: string
  ): Promise<RollupTransition> {
    const game = this.games.get(gameId);
    if (!game) {
      throw new Error(`Game ${gameId} not found`);
    }
    
    const player = game.players.find(p => p.playerId === playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found in game`);
    }
    
    // Calculate refund amount (50% of current bet)
    const refundAmount = player.currentBet.muln(this.STRATEGIC_FOLD_REFUND);
    
    const strategicFoldAction: GameAction = {
      actionId: `strategic_fold_${Date.now()}`,
      playerId,
      type: 'STRATEGIC_FOLD',
      amount: refundAmount,
      timestamp: Date.now(),
      nonce: Date.now()
    };
    
    return this.executeGameAction(gameId, strategicFoldAction, sessionId);
  }

  /**
   * Validate game action
   */
  private validateAction(state: GameState, action: GameAction): { valid: boolean; reason?: string } {
    const player = state.players.find(p => p.playerId === action.playerId);
    
    switch (action.type) {
      case 'JOIN':
        if (state.players.length >= (this.gameConfigs.get(state.gameId)?.maxPlayers || 6)) {
          return { valid: false, reason: 'Game is full' };
        }
        if (player) {
          return { valid: false, reason: 'Player already in game' };
        }
        if (!action.amount || action.amount.lte(new BN(0))) {
          return { valid: false, reason: 'Invalid buy-in amount' };
        }
        break;
        
      case 'BET':
      case 'RAISE':
        if (!player || player.status !== PlayerStatus.ACTIVE) {
          return { valid: false, reason: 'Player not active' };
        }
        if (state.currentPhase !== GamePhase.BETTING) {
          return { valid: false, reason: 'Not in betting phase' };
        }
        if (!action.amount || action.amount.lte(state.currentBet)) {
          return { valid: false, reason: 'Bet amount too low' };
        }
        if (player.balance.lt(action.amount)) {
          return { valid: false, reason: 'Insufficient balance' };
        }
        break;
        
      case 'CALL':
        if (!player || player.status !== PlayerStatus.ACTIVE) {
          return { valid: false, reason: 'Player not active' };
        }
        if (state.currentPhase !== GamePhase.BETTING) {
          return { valid: false, reason: 'Not in betting phase' };
        }
        const callAmount = state.currentBet.sub(player.currentBet);
        if (player.balance.lt(callAmount)) {
          return { valid: false, reason: 'Insufficient balance to call' };
        }
        break;
        
      case 'FOLD':
      case 'STRATEGIC_FOLD':
        if (!player || player.status !== PlayerStatus.ACTIVE) {
          return { valid: false, reason: 'Player not active' };
        }
        if (state.currentPhase !== GamePhase.BETTING) {
          return { valid: false, reason: 'Not in betting phase' };
        }
        break;
        
      case 'REVEAL':
        if (!player || player.status === PlayerStatus.FOLDED) {
          return { valid: false, reason: 'Player cannot reveal' };
        }
        if (state.currentPhase !== GamePhase.REVEAL) {
          return { valid: false, reason: 'Not in reveal phase' };
        }
        if (!action.cards || action.cards.length === 0) {
          return { valid: false, reason: 'No cards to reveal' };
        }
        break;
    }
    
    return { valid: true };
  }

  /**
   * Apply state transition
   */
  private async applyStateTransition(currentState: GameState, action: GameAction): Promise<GameState> {
    const newState = JSON.parse(JSON.stringify(currentState)) as GameState;
    newState.lastAction = action;
    newState.timestamp = Date.now();
    newState.stateVersion++;
    
    let player = newState.players.find(p => p.playerId === action.playerId);
    
    switch (action.type) {
      case 'JOIN':
        const newPlayer: PlayerState = {
          playerId: action.playerId,
          publicKey: new PublicKey(action.playerId),
          balance: action.amount!,
          currentBet: new BN(0),
          position: newState.players.length,
          status: PlayerStatus.ACTIVE
        };
        newState.players.push(newPlayer);
        
        // Start game if enough players
        if (newState.players.length >= 2 && newState.currentPhase === GamePhase.WAITING) {
          newState.currentPhase = GamePhase.DEALING;
          await this.dealCards(newState);
        }
        break;
        
      case 'BET':
      case 'RAISE':
        if (player) {
          const betAmount = action.amount!;
          player.balance = player.balance.sub(betAmount);
          player.currentBet = player.currentBet.add(betAmount);
          player.lastAction = action;
          
          newState.pot = newState.pot.add(betAmount);
          newState.currentBet = player.currentBet;
        }
        break;
        
      case 'CALL':
        if (player) {
          const callAmount = newState.currentBet.sub(player.currentBet);
          player.balance = player.balance.sub(callAmount);
          player.currentBet = newState.currentBet;
          player.lastAction = action;
          
          newState.pot = newState.pot.add(callAmount);
        }
        break;
        
      case 'FOLD':
        if (player) {
          player.status = PlayerStatus.FOLDED;
          player.lastAction = action;
        }
        break;
        
      case 'STRATEGIC_FOLD':
        if (player && action.amount) {
          player.status = PlayerStatus.FOLDED;
          player.balance = player.balance.add(action.amount); // Add refund
          player.lastAction = action;
          
          newState.pot = newState.pot.sub(action.amount); // Remove refund from pot
        }
        break;
        
      case 'REVEAL':
        if (player && action.cards) {
          player.cards = action.cards;
          player.lastAction = action;
        }
        break;
    }
    
    // Check for phase transitions
    await this.checkPhaseTransition(newState);
    
    return newState;
  }

  /**
   * Deal cards using VRF
   */
  private async dealCards(state: GameState): Promise<void> {
    const config = this.gameConfigs.get(state.gameId);
    if (!config || !config.enableVRF) {
      // Use pseudorandom for testing
      this.dealCardsWithPseudoRandom(state);
      return;
    }
    
    try {
      // Request VRF for card dealing
      const vrfRequestId = await this.vrfPlugin.requestGameVRF(
        new PublicKey(state.gameId),
        new PublicKey('11111111111111111111111111111111'), // Placeholder program
        'deal_cards'
      );
      
      state.vrfRequestId = vrfRequestId;
      state.currentPhase = GamePhase.BETTING;
      
      console.log(`🎲 VRF requested for card dealing: ${vrfRequestId}`);
      
    } catch (error) {
      console.error('VRF card dealing failed, using pseudorandom:', error);
      this.dealCardsWithPseudoRandom(state);
    }
  }

  /**
   * Deal cards with pseudorandom (fallback)
   */
  private dealCardsWithPseudoRandom(state: GameState): void {
    // Create and shuffle deck
    const deck = this.createDeck();
    this.shuffleDeck(deck, state.gameId + state.timestamp);
    
    // Deal 2 cards to each player
    let cardIndex = 0;
    for (const player of state.players) {
      player.cards = [
        deck[cardIndex++],
        deck[cardIndex++]
      ];
    }
    
    // Deal community cards (for poker variants)
    state.communityCards = deck.slice(cardIndex, cardIndex + 5);
    state.deck = deck.slice(cardIndex + 5);
    
    state.currentPhase = GamePhase.BETTING;
  }

  /**
   * Create standard 52-card deck
   */
  private createDeck(): Card[] {
    const deck: Card[] = [];
    const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
    
    for (const suit of suits) {
      for (let rank = 2; rank <= 14; rank++) {
        deck.push({ suit, rank });
      }
    }
    
    return deck;
  }

  /**
   * Shuffle deck using deterministic seed
   */
  private shuffleDeck(deck: Card[], seed: string): void {
    // Simple seeded shuffle for deterministic results
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    for (let i = deck.length - 1; i > 0; i--) {
      hash = (hash * 9301 + 49297) % 233280;
      const j = Math.floor((hash / 233280) * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  /**
   * Check for phase transitions
   */
  private async checkPhaseTransition(state: GameState): Promise<void> {
    const activePlayers = state.players.filter(p => p.status === PlayerStatus.ACTIVE);
    
    switch (state.currentPhase) {
      case GamePhase.BETTING:
        // Check if betting round is complete
        const allActed = activePlayers.every(p => 
          p.lastAction && 
          (p.currentBet.eq(state.currentBet) || p.status === PlayerStatus.FOLDED)
        );
        
        if (allActed || activePlayers.length <= 1) {
          if (activePlayers.length <= 1) {
            state.currentPhase = GamePhase.RESOLUTION;
            await this.resolveGame(state);
          } else {
            state.currentPhase = GamePhase.REVEAL;
          }
        }
        break;
        
      case GamePhase.REVEAL:
        const allRevealed = activePlayers.every(p => p.cards && p.cards.length > 0);
        if (allRevealed) {
          state.currentPhase = GamePhase.RESOLUTION;
          await this.resolveGame(state);
        }
        break;
    }
  }

  /**
   * Resolve game and determine winner
   */
  private async resolveGame(state: GameState): Promise<void> {
    const activePlayers = state.players.filter(p => p.status === PlayerStatus.ACTIVE);
    
    if (activePlayers.length === 1) {
      // Single winner by elimination
      const winner = activePlayers[0];
      winner.balance = winner.balance.add(state.pot);
      state.winner = winner.playerId;
      
    } else if (activePlayers.length > 1) {
      // Hand evaluation needed
      const winner = this.evaluateHands(activePlayers, state.communityCards || []);
      winner.balance = winner.balance.add(state.pot);
      state.winner = winner.playerId;
    }
    
    state.currentPhase = GamePhase.COMPLETED;
    
    console.log(`🏆 Game completed: ${state.gameId}, Winner: ${state.winner}`);
    this.emit('game:completed', state);
  }

  /**
   * Evaluate poker hands (simplified)
   */
  private evaluateHands(players: PlayerState[], communityCards: Card[]): PlayerState {
    // Simplified hand evaluation - return random winner for demo
    const randomIndex = Math.floor(Math.random() * players.length);
    return players[randomIndex];
  }

  /**
   * Handle special actions
   */
  private async handleSpecialActions(state: GameState, action: GameAction): Promise<void> {
    switch (action.type) {
      case 'STRATEGIC_FOLD':
        // Log strategic fold analytics
        console.log(`📊 Strategic fold executed: ${action.playerId}, refund: ${action.amount?.toString()}`);
        break;
        
      case 'JOIN':
        // Setup player session tracking
        if (state.players.length === 2) {
          // Enable high-frequency sync for active game
          const playerAccounts = state.players.map(p => p.publicKey);
          await this.stateSync.enableRealTimeSync(playerAccounts.map(pk => pk.toString()));
        }
        break;
    }
  }

  /**
   * Build game transaction
   */
  private async buildGameTransaction(gameId: string, action: GameAction): Promise<Transaction> {
    const transaction = new Transaction();
    
    // Add game instruction based on action type
    const gameIx = this.buildGameInstruction(gameId, action);
    transaction.add(gameIx);
    
    return transaction;
  }

  /**
   * Build game instruction
   */
  private buildGameInstruction(gameId: string, action: GameAction): TransactionInstruction {
    // Simplified instruction building
    const data = Buffer.concat([
      Buffer.from([this.getActionDiscriminator(action.type)]),
      Buffer.from(action.playerId),
      action.amount ? action.amount.toArrayLike(Buffer, 'le', 8) : Buffer.alloc(0)
    ]);
    
    return new TransactionInstruction({
      keys: [
        { pubkey: new PublicKey(gameId), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(action.playerId), isSigner: true, isWritable: true }
      ],
      programId: new PublicKey('11111111111111111111111111111111'), // Placeholder
      data
    });
  }

  /**
   * Get action discriminator
   */
  private getActionDiscriminator(actionType: GameAction['type']): number {
    const discriminators: Record<GameAction['type'], number> = {
      'JOIN': 0,
      'BET': 1,
      'CALL': 2,
      'RAISE': 3,
      'FOLD': 4,
      'STRATEGIC_FOLD': 5,
      'CHECK': 6,
      'REVEAL': 7
    };
    
    return discriminators[actionType] || 0;
  }

  /**
   * Get game authority keypair
   */
  private getGameAuthority(gameId: string): Keypair {
    // In practice, this would be properly managed
    return Keypair.generate();
  }

  /**
   * Get game state
   */
  getGameState(gameId: string): GameState | undefined {
    return this.games.get(gameId);
  }

  /**
   * Get all active games
   */
  getActiveGames(): GameState[] {
    return Array.from(this.games.values()).filter(game => 
      game.currentPhase !== GamePhase.COMPLETED
    );
  }

  /**
   * Get performance metrics
   */
  getEngineMetrics(): {
    activeGames: number;
    avgTransitionTime: number;
    transitionsPerSecond: number;
    rollupSessions: number;
  } {
    const avgTransitionTime = this.transitionLatencies.length > 0
      ? this.transitionLatencies.reduce((sum, time) => sum + time, 0) / this.transitionLatencies.length
      : 0;
    
    // Calculate TPS over last minute
    const oneMinuteAgo = Date.now() - 60000;
    const recentTransitions = this.transitionLatencies.filter((_, index) => 
      Date.now() - (index * 100) > oneMinuteAgo // Rough estimation
    ).length;
    
    return {
      activeGames: this.getActiveGames().length,
      avgTransitionTime,
      transitionsPerSecond: recentTransitions / 60,
      rollupSessions: this.rollupSessions.size
    };
  }

  /**
   * Cleanup completed games
   */
  cleanupCompletedGames(): void {
    const cutoff = Date.now() - 3600000; // 1 hour ago
    
    for (const [gameId, game] of this.games) {
      if (game.currentPhase === GamePhase.COMPLETED && game.timestamp < cutoff) {
        this.games.delete(gameId);
        this.gameConfigs.delete(gameId);
        
        const rollupSessionId = this.rollupSessions.get(gameId);
        if (rollupSessionId) {
          this.rollupClient.closeSession(rollupSessionId).catch(console.error);
          this.rollupSessions.delete(gameId);
        }
      }
    }
  }
}

export default RollupGameEngine;