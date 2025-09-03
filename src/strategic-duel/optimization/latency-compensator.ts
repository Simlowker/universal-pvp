/**
 * Advanced Latency Compensation System for Strategic Duel
 * Provides client-side prediction, rollback, and lag compensation for 10-50ms gameplay
 */

import { EventEmitter } from 'events';

export interface GameState {
  id: string;
  timestamp: number;
  frameNumber: number;
  playerStates: Map<string, PlayerState>;
  gameData: any;
  hash?: string;
}

export interface PlayerState {
  playerId: string;
  position: { x: number; y: number };
  action: string | null;
  health: number;
  resources: any;
  lastInput: number;
}

export interface InputCommand {
  id: string;
  playerId: string;
  action: string;
  parameters: any;
  timestamp: number;
  clientFrame: number;
  predicted: boolean;
}

export interface PredictionResult {
  success: boolean;
  state: GameState;
  confidence: number;
  rollbackRequired: boolean;
  affectedPlayers: string[];
}

export interface CompensationOptions {
  maxPredictionFrames: number;
  rollbackWindowMs: number;
  interpolationFactor: number;
  compensationThresholdMs: number;
  enableClientPrediction: boolean;
  enableLagCompensation: boolean;
  enableInterpolation: boolean;
}

/**
 * Client-side prediction engine
 */
class ClientPredictor {
  private predictedStates: Map<number, GameState> = new Map();
  private confirmedStates: Map<number, GameState> = new Map();
  private pendingInputs: Map<string, InputCommand> = new Map();
  private maxPredictionFrames: number;
  private rollbackWindowMs: number;

  constructor(maxPredictionFrames: number = 10, rollbackWindowMs: number = 500) {
    this.maxPredictionFrames = maxPredictionFrames;
    this.rollbackWindowMs = rollbackWindowMs;
  }

  /**
   * Predict next game state based on input
   */
  predictState(currentState: GameState, input: InputCommand): PredictionResult {
    const predictionStart = performance.now();
    
    try {
      // Clone current state for prediction
      const predictedState = this.cloneGameState(currentState);
      predictedState.id = `predicted_${Date.now()}`;
      predictedState.frameNumber = currentState.frameNumber + 1;
      predictedState.timestamp = Date.now();

      // Apply input to predicted state
      this.applyInputToState(predictedState, input);

      // Calculate prediction confidence based on game complexity
      const confidence = this.calculatePredictionConfidence(currentState, input);

      // Store predicted state
      this.predictedStates.set(predictedState.frameNumber, predictedState);
      
      // Store pending input
      input.predicted = true;
      this.pendingInputs.set(input.id, input);

      // Clean up old predictions
      this.cleanupOldPredictions();

      const predictionTime = performance.now() - predictionStart;
      
      return {
        success: true,
        state: predictedState,
        confidence,
        rollbackRequired: false,
        affectedPlayers: [input.playerId]
      };

    } catch (error) {
      return {
        success: false,
        state: currentState,
        confidence: 0,
        rollbackRequired: true,
        affectedPlayers: []
      };
    }
  }

  /**
   * Confirm server state and check for rollback
   */
  confirmState(serverState: GameState): { rollbackRequired: boolean; rollbackFrame: number } {
    this.confirmedStates.set(serverState.frameNumber, serverState);
    
    // Check if prediction was correct
    const predictedState = this.predictedStates.get(serverState.frameNumber);
    
    if (predictedState && !this.statesMatch(predictedState, serverState)) {
      // Prediction was wrong, rollback required
      return {
        rollbackRequired: true,
        rollbackFrame: serverState.frameNumber
      };
    }

    // Remove confirmed pending inputs
    for (const [inputId, input] of this.pendingInputs) {
      if (input.clientFrame <= serverState.frameNumber) {
        this.pendingInputs.delete(inputId);
      }
    }

    return { rollbackRequired: false, rollbackFrame: -1 };
  }

  /**
   * Perform rollback and replay from specified frame
   */
  rollbackAndReplay(rollbackFrame: number, correctState: GameState): GameState[] {
    const replayStates: GameState[] = [];
    
    // Start from the correct server state
    let currentState = correctState;
    replayStates.push(this.cloneGameState(currentState));

    // Get all pending inputs after rollback frame
    const inputsToReplay = Array.from(this.pendingInputs.values())
      .filter(input => input.clientFrame > rollbackFrame)
      .sort((a, b) => a.timestamp - b.timestamp);

    // Replay inputs
    for (const input of inputsToReplay) {
      currentState = this.cloneGameState(currentState);
      currentState.frameNumber++;
      currentState.timestamp = Date.now();
      this.applyInputToState(currentState, input);
      replayStates.push(currentState);
    }

    // Update predicted states
    for (let i = 0; i < replayStates.length; i++) {
      const state = replayStates[i];
      this.predictedStates.set(state.frameNumber, state);
    }

    return replayStates;
  }

  /**
   * Apply input command to game state
   */
  private applyInputToState(state: GameState, input: InputCommand): void {
    const playerState = state.playerStates.get(input.playerId);
    if (!playerState) return;

    switch (input.action) {
      case 'move':
        playerState.position.x = input.parameters.x;
        playerState.position.y = input.parameters.y;
        break;
      case 'attack':
        playerState.action = 'attacking';
        // Additional attack logic here
        break;
      case 'defend':
        playerState.action = 'defending';
        break;
      case 'use_ability':
        playerState.action = input.parameters.ability;
        // Apply ability effects
        break;
    }

    playerState.lastInput = input.timestamp;
    state.playerStates.set(input.playerId, playerState);
  }

  /**
   * Clone game state for prediction
   */
  private cloneGameState(state: GameState): GameState {
    return {
      id: `${state.id}_clone`,
      timestamp: state.timestamp,
      frameNumber: state.frameNumber,
      playerStates: new Map(
        Array.from(state.playerStates.entries()).map(([id, playerState]) => [
          id,
          {
            playerId: playerState.playerId,
            position: { ...playerState.position },
            action: playerState.action,
            health: playerState.health,
            resources: { ...playerState.resources },
            lastInput: playerState.lastInput
          }
        ])
      ),
      gameData: JSON.parse(JSON.stringify(state.gameData)),
      hash: state.hash
    };
  }

  /**
   * Check if two states match for rollback detection
   */
  private statesMatch(predicted: GameState, confirmed: GameState, tolerance: number = 0.01): boolean {
    // Compare player positions with tolerance
    for (const [playerId, predictedPlayer] of predicted.playerStates) {
      const confirmedPlayer = confirmed.playerStates.get(playerId);
      if (!confirmedPlayer) return false;

      const positionDiff = Math.sqrt(
        Math.pow(predictedPlayer.position.x - confirmedPlayer.position.x, 2) +
        Math.pow(predictedPlayer.position.y - confirmedPlayer.position.y, 2)
      );

      if (positionDiff > tolerance) return false;

      if (predictedPlayer.action !== confirmedPlayer.action) return false;
      if (Math.abs(predictedPlayer.health - confirmedPlayer.health) > tolerance) return false;
    }

    return true;
  }

  /**
   * Calculate prediction confidence based on game state complexity
   */
  private calculatePredictionConfidence(state: GameState, input: InputCommand): number {
    let confidence = 1.0;

    // Reduce confidence for complex actions
    if (input.action === 'use_ability') {
      confidence *= 0.8;
    } else if (input.action === 'attack') {
      confidence *= 0.9;
    }

    // Reduce confidence based on number of players
    const playerCount = state.playerStates.size;
    confidence *= Math.max(0.5, 1.0 - (playerCount - 1) * 0.1);

    // Reduce confidence for rapid successive inputs
    const timeSinceLastInput = Date.now() - input.timestamp;
    if (timeSinceLastInput < 50) {
      confidence *= 0.7;
    }

    return Math.max(0.1, confidence);
  }

  /**
   * Clean up old predicted states
   */
  private cleanupOldPredictions(): void {
    const cutoff = Date.now() - this.rollbackWindowMs;
    
    for (const [frame, state] of this.predictedStates) {
      if (state.timestamp < cutoff) {
        this.predictedStates.delete(frame);
      }
    }
    
    for (const [frame, state] of this.confirmedStates) {
      if (state.timestamp < cutoff) {
        this.confirmedStates.delete(frame);
      }
    }
  }

  /**
   * Get current prediction metrics
   */
  getPredictionMetrics(): any {
    return {
      predictedStatesCount: this.predictedStates.size,
      confirmedStatesCount: this.confirmedStates.size,
      pendingInputsCount: this.pendingInputs.size,
      maxPredictionFrames: this.maxPredictionFrames
    };
  }
}

/**
 * Lag compensation system for server-side hit registration
 */
class LagCompensator {
  private playerHistories: Map<string, PlayerState[]> = new Map();
  private maxHistorySize: number = 100;
  private compensationThresholdMs: number = 100;

  constructor(compensationThresholdMs: number = 100) {
    this.compensationThresholdMs = compensationThresholdMs;
  }

  /**
   * Store player state history for compensation
   */
  recordPlayerState(playerId: string, state: PlayerState): void {
    if (!this.playerHistories.has(playerId)) {
      this.playerHistories.set(playerId, []);
    }

    const history = this.playerHistories.get(playerId)!;
    history.push(state);

    // Maintain history size
    if (history.length > this.maxHistorySize) {
      history.splice(0, history.length - this.maxHistorySize);
    }
  }

  /**
   * Compensate for player latency when processing actions
   */
  compensateAction(action: InputCommand, playerLatency: number): PlayerState | null {
    if (playerLatency < this.compensationThresholdMs) {
      // No compensation needed for low latency
      return null;
    }

    const targetTime = action.timestamp - playerLatency;
    const playerHistory = this.playerHistories.get(action.playerId);
    
    if (!playerHistory || playerHistory.length < 2) {
      return null;
    }

    // Find the player state at the compensated time
    return this.getPlayerStateAtTime(playerHistory, targetTime);
  }

  /**
   * Get player state at specific time using interpolation
   */
  private getPlayerStateAtTime(history: PlayerState[], targetTime: number): PlayerState | null {
    // Find surrounding states
    let beforeState: PlayerState | null = null;
    let afterState: PlayerState | null = null;

    for (let i = history.length - 1; i >= 0; i--) {
      const state = history[i];
      
      if (state.lastInput <= targetTime) {
        beforeState = state;
        afterState = history[i + 1] || state;
        break;
      }
    }

    if (!beforeState) {
      return history[0];
    }

    // If no interpolation needed
    if (beforeState === afterState) {
      return beforeState;
    }

    // Interpolate between states
    const timeDiff = afterState.lastInput - beforeState.lastInput;
    const factor = timeDiff > 0 ? (targetTime - beforeState.lastInput) / timeDiff : 0;

    return {
      playerId: beforeState.playerId,
      position: {
        x: beforeState.position.x + (afterState.position.x - beforeState.position.x) * factor,
        y: beforeState.position.y + (afterState.position.y - beforeState.position.y) * factor
      },
      action: beforeState.action,
      health: beforeState.health + (afterState.health - beforeState.health) * factor,
      resources: beforeState.resources, // Don't interpolate complex objects
      lastInput: targetTime
    };
  }

  /**
   * Clean up old player history
   */
  cleanupHistory(maxAgeMs: number): void {
    const cutoff = Date.now() - maxAgeMs;

    for (const [playerId, history] of this.playerHistories) {
      const filteredHistory = history.filter(state => state.lastInput > cutoff);
      this.playerHistories.set(playerId, filteredHistory);
    }
  }

  /**
   * Get compensation statistics
   */
  getCompensationStats(): any {
    const stats: any = {};
    
    for (const [playerId, history] of this.playerHistories) {
      stats[playerId] = {
        historySize: history.length,
        oldestEntry: history.length > 0 ? history[0].lastInput : 0,
        newestEntry: history.length > 0 ? history[history.length - 1].lastInput : 0
      };
    }

    return stats;
  }
}

/**
 * State interpolation system for smooth visual updates
 */
class StateInterpolator {
  private interpolationBuffer: Map<string, GameState[]> = new Map();
  private interpolationFactor: number = 0.1;
  private bufferSize: number = 10;

  constructor(interpolationFactor: number = 0.1) {
    this.interpolationFactor = interpolationFactor;
  }

  /**
   * Add state to interpolation buffer
   */
  addState(state: GameState): void {
    const playerId = 'global'; // Use global buffer for game states
    
    if (!this.interpolationBuffer.has(playerId)) {
      this.interpolationBuffer.set(playerId, []);
    }

    const buffer = this.interpolationBuffer.get(playerId)!;
    buffer.push(state);

    // Sort by timestamp
    buffer.sort((a, b) => a.timestamp - b.timestamp);

    // Maintain buffer size
    if (buffer.length > this.bufferSize) {
      buffer.splice(0, buffer.length - this.bufferSize);
    }
  }

  /**
   * Get interpolated state for current time
   */
  getInterpolatedState(currentTime: number): GameState | null {
    const buffer = this.interpolationBuffer.get('global');
    if (!buffer || buffer.length < 2) {
      return buffer && buffer.length > 0 ? buffer[buffer.length - 1] : null;
    }

    // Find surrounding states
    let beforeState: GameState | null = null;
    let afterState: GameState | null = null;

    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i].timestamp <= currentTime && buffer[i + 1].timestamp > currentTime) {
        beforeState = buffer[i];
        afterState = buffer[i + 1];
        break;
      }
    }

    // Use latest state if no interpolation range found
    if (!beforeState || !afterState) {
      return buffer[buffer.length - 1];
    }

    // Interpolate between states
    return this.interpolateStates(beforeState, afterState, currentTime);
  }

  /**
   * Interpolate between two game states
   */
  private interpolateStates(before: GameState, after: GameState, targetTime: number): GameState {
    const timeDiff = after.timestamp - before.timestamp;
    const factor = timeDiff > 0 ? (targetTime - before.timestamp) / timeDiff : 0;
    const clampedFactor = Math.max(0, Math.min(1, factor));

    const interpolatedState: GameState = {
      id: `interpolated_${Date.now()}`,
      timestamp: targetTime,
      frameNumber: Math.round(before.frameNumber + (after.frameNumber - before.frameNumber) * clampedFactor),
      playerStates: new Map(),
      gameData: before.gameData
    };

    // Interpolate player states
    for (const [playerId, beforePlayer] of before.playerStates) {
      const afterPlayer = after.playerStates.get(playerId);
      
      if (afterPlayer) {
        const interpolatedPlayer: PlayerState = {
          playerId,
          position: {
            x: this.lerp(beforePlayer.position.x, afterPlayer.position.x, clampedFactor),
            y: this.lerp(beforePlayer.position.y, afterPlayer.position.y, clampedFactor)
          },
          action: clampedFactor > 0.5 ? afterPlayer.action : beforePlayer.action,
          health: this.lerp(beforePlayer.health, afterPlayer.health, clampedFactor),
          resources: clampedFactor > 0.5 ? afterPlayer.resources : beforePlayer.resources,
          lastInput: Math.round(this.lerp(beforePlayer.lastInput, afterPlayer.lastInput, clampedFactor))
        };
        
        interpolatedState.playerStates.set(playerId, interpolatedPlayer);
      } else {
        interpolatedState.playerStates.set(playerId, beforePlayer);
      }
    }

    return interpolatedState;
  }

  /**
   * Linear interpolation helper
   */
  private lerp(start: number, end: number, factor: number): number {
    return start + (end - start) * factor;
  }

  /**
   * Set interpolation factor
   */
  setInterpolationFactor(factor: number): void {
    this.interpolationFactor = Math.max(0, Math.min(1, factor));
  }

  /**
   * Clear interpolation buffer
   */
  clear(): void {
    this.interpolationBuffer.clear();
  }
}

/**
 * Main Latency Compensator class
 */
export class LatencyCompensator extends EventEmitter {
  private clientPredictor: ClientPredictor;
  private lagCompensator: LagCompensator;
  private stateInterpolator: StateInterpolator;
  private options: CompensationOptions;
  private currentLatency: number = 0;
  private isEnabled: boolean = true;

  constructor(options: Partial<CompensationOptions> = {}) {
    super();
    
    this.options = {
      maxPredictionFrames: 10,
      rollbackWindowMs: 500,
      interpolationFactor: 0.1,
      compensationThresholdMs: 50,
      enableClientPrediction: true,
      enableLagCompensation: true,
      enableInterpolation: true,
      ...options
    };

    this.clientPredictor = new ClientPredictor(
      this.options.maxPredictionFrames,
      this.options.rollbackWindowMs
    );
    
    this.lagCompensator = new LagCompensator(
      this.options.compensationThresholdMs
    );
    
    this.stateInterpolator = new StateInterpolator(
      this.options.interpolationFactor
    );
  }

  /**
   * Process input with prediction and compensation
   */
  processInput(input: InputCommand, currentState: GameState): PredictionResult | null {
    if (!this.isEnabled || !this.options.enableClientPrediction) {
      return null;
    }

    const prediction = this.clientPredictor.predictState(currentState, input);
    
    this.emit('input-predicted', {
      input,
      prediction,
      latency: this.currentLatency
    });

    return prediction;
  }

  /**
   * Handle server state update and check for rollback
   */
  handleServerUpdate(serverState: GameState): { rollbackRequired: boolean; newStates?: GameState[] } {
    if (!this.options.enableClientPrediction) {
      return { rollbackRequired: false };
    }

    const rollbackCheck = this.clientPredictor.confirmState(serverState);
    
    if (rollbackCheck.rollbackRequired) {
      const newStates = this.clientPredictor.rollbackAndReplay(
        rollbackCheck.rollbackFrame,
        serverState
      );
      
      this.emit('rollback-performed', {
        rollbackFrame: rollbackCheck.rollbackFrame,
        newStates
      });

      return { rollbackRequired: true, newStates };
    }

    return { rollbackRequired: false };
  }

  /**
   * Compensate action for player latency
   */
  compensatePlayerAction(action: InputCommand, playerLatency: number): PlayerState | null {
    if (!this.options.enableLagCompensation) {
      return null;
    }

    return this.lagCompensator.compensateAction(action, playerLatency);
  }

  /**
   * Record player state for history-based compensation
   */
  recordPlayerState(playerId: string, state: PlayerState): void {
    if (this.options.enableLagCompensation) {
      this.lagCompensator.recordPlayerState(playerId, state);
    }
  }

  /**
   * Get interpolated state for smooth rendering
   */
  getInterpolatedState(targetTime?: number): GameState | null {
    if (!this.options.enableInterpolation) {
      return null;
    }

    const currentTime = targetTime || Date.now();
    return this.stateInterpolator.getInterpolatedState(currentTime);
  }

  /**
   * Add state to interpolation buffer
   */
  addStateForInterpolation(state: GameState): void {
    if (this.options.enableInterpolation) {
      this.stateInterpolator.addState(state);
    }
  }

  /**
   * Update current network latency
   */
  updateLatency(latencyMs: number): void {
    this.currentLatency = latencyMs;
    
    // Adjust interpolation factor based on latency
    if (this.options.enableInterpolation) {
      const adaptedFactor = Math.min(0.3, this.options.interpolationFactor + (latencyMs / 1000));
      this.stateInterpolator.setInterpolationFactor(adaptedFactor);
    }
  }

  /**
   * Get current latency
   */
  getCurrentLatency(): number {
    return this.currentLatency;
  }

  /**
   * Enable or disable compensation features
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Enable or disable specific compensation feature
   */
  setFeatureEnabled(feature: keyof CompensationOptions, enabled: boolean): void {
    this.options[feature] = enabled as any;
  }

  /**
   * Get comprehensive compensation statistics
   */
  getCompensationStats(): any {
    return {
      enabled: this.isEnabled,
      currentLatency: this.currentLatency,
      prediction: this.clientPredictor.getPredictionMetrics(),
      compensation: this.lagCompensator.getCompensationStats(),
      options: this.options
    };
  }

  /**
   * Optimize compensation settings based on current performance
   */
  optimizeSettings(avgLatency: number, frameRate: number): void {
    // Adjust prediction frames based on latency
    if (avgLatency > 100) {
      this.options.maxPredictionFrames = Math.min(20, this.options.maxPredictionFrames + 2);
    } else if (avgLatency < 30) {
      this.options.maxPredictionFrames = Math.max(3, this.options.maxPredictionFrames - 1);
    }

    // Adjust interpolation based on frame rate
    if (frameRate < 45) {
      this.options.interpolationFactor = Math.min(0.3, this.options.interpolationFactor + 0.05);
    } else if (frameRate > 55) {
      this.options.interpolationFactor = Math.max(0.05, this.options.interpolationFactor - 0.02);
    }

    // Adjust compensation threshold based on performance
    if (avgLatency > this.options.compensationThresholdMs) {
      this.options.compensationThresholdMs = Math.min(200, avgLatency * 0.8);
    }
  }

  /**
   * Clean up old data
   */
  cleanup(): void {
    const maxAge = Math.max(this.options.rollbackWindowMs, 60000); // At least 1 minute
    this.lagCompensator.cleanupHistory(maxAge);
    this.stateInterpolator.clear();
  }

  /**
   * Reset all compensation systems
   */
  reset(): void {
    this.cleanup();
    this.currentLatency = 0;
    this.emit('compensation-reset');
  }
}

// Export singleton instance for global use
export const latencyCompensator = new LatencyCompensator();