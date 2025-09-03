import { EventEmitter } from 'events';
import { WebSocket } from 'ws';

interface Player {
  id: string;
  wallet: string;
  eloRating: number;
  winRate: number;
  avgDecisionTime: number;
  psychProfile: PsychProfile;
  lastActive: number;
  websocket?: WebSocket;
}

interface PsychProfile {
  aggressionLevel: number; // 0-100
  bluffFrequency: number;  // 0-100
  riskTolerance: number;   // 0-100
  decisionPattern: 'fast' | 'deliberate' | 'unpredictable';
  tellIndicators: string[];
}

interface MatchRequest {
  playerId: string;
  betAmount: number;
  gameMode: 'quick' | 'ranked' | 'tournament';
  maxWaitTime: number;
}

interface Match {
  id: string;
  players: [Player, Player];
  betAmount: number;
  gameMode: string;
  startTime: number;
  status: 'waiting' | 'active' | 'completed';
  vrfRequestId?: string;
}

export class RealTimeMatchmaking extends EventEmitter {
  private waitingPlayers: Map<string, MatchRequest> = new Map();
  private activeMatches: Map<string, Match> = new Map();
  private playerProfiles: Map<string, Player> = new Map();
  private matchingInterval: NodeJS.Timeout | null = null;
  private readonly MATCH_TOLERANCE = 200; // ELO difference tolerance
  private readonly MAX_WAIT_TIME = 30000; // 30 seconds

  constructor() {
    super();
    this.startMatchingProcess();
  }

  /**
   * Add player to matchmaking queue
   */
  public addToQueue(request: MatchRequest): void {
    const player = this.playerProfiles.get(request.playerId);
    if (!player) {
      throw new Error('Player profile not found');
    }

    // Update player activity
    player.lastActive = Date.now();

    // Add to waiting queue
    this.waitingPlayers.set(request.playerId, {
      ...request,
      maxWaitTime: Math.min(request.maxWaitTime, this.MAX_WAIT_TIME)
    });

    this.emit('playerQueued', { playerId: request.playerId, request });
  }

  /**
   * Remove player from queue
   */
  public removeFromQueue(playerId: string): boolean {
    const removed = this.waitingPlayers.delete(playerId);
    if (removed) {
      this.emit('playerDequeued', { playerId });
    }
    return removed;
  }

  /**
   * Register player profile
   */
  public registerPlayer(player: Player): void {
    this.playerProfiles.set(player.id, player);
  }

  /**
   * Update player psychological profile based on game history
   */
  public updatePsychProfile(playerId: string, gameData: any): void {
    const player = this.playerProfiles.get(playerId);
    if (!player) return;

    // Analyze decision times
    if (gameData.decisionTimes?.length > 0) {
      const avgTime = gameData.decisionTimes.reduce((a: number, b: number) => a + b, 0) / gameData.decisionTimes.length;
      player.avgDecisionTime = (player.avgDecisionTime * 0.8) + (avgTime * 0.2);
    }

    // Update aggression based on betting patterns
    if (gameData.betPatterns) {
      const aggression = this.calculateAggression(gameData.betPatterns);
      player.psychProfile.aggressionLevel = (player.psychProfile.aggressionLevel * 0.7) + (aggression * 0.3);
    }

    // Update bluff frequency
    if (gameData.bluffCount !== undefined && gameData.totalMoves > 0) {
      const bluffRate = (gameData.bluffCount / gameData.totalMoves) * 100;
      player.psychProfile.bluffFrequency = (player.psychProfile.bluffFrequency * 0.7) + (bluffRate * 0.3);
    }

    this.emit('profileUpdated', { playerId, profile: player.psychProfile });
  }

  /**
   * Start automatic matching process
   */
  private startMatchingProcess(): void {
    this.matchingInterval = setInterval(() => {
      this.processMatching();
    }, 1000); // Check every second
  }

  /**
   * Process matching logic
   */
  private processMatching(): void {
    const waitingList = Array.from(this.waitingPlayers.entries());
    const now = Date.now();

    // Remove expired requests
    for (const [playerId, request] of waitingList) {
      if (now - request.maxWaitTime > this.MAX_WAIT_TIME) {
        this.removeFromQueue(playerId);
      }
    }

    // Find matches
    const activeWaiting = Array.from(this.waitingPlayers.entries());
    
    for (let i = 0; i < activeWaiting.length - 1; i++) {
      const [playerId1, request1] = activeWaiting[i];
      const player1 = this.playerProfiles.get(playerId1);
      if (!player1) continue;

      for (let j = i + 1; j < activeWaiting.length; j++) {
        const [playerId2, request2] = activeWaiting[j];
        const player2 = this.playerProfiles.get(playerId2);
        if (!player2) continue;

        if (this.isGoodMatch(player1, player2, request1, request2)) {
          this.createMatch(player1, player2, request1, request2);
          break;
        }
      }
    }
  }

  /**
   * Check if two players are a good match
   */
  private isGoodMatch(
    player1: Player, 
    player2: Player, 
    request1: MatchRequest, 
    request2: MatchRequest
  ): boolean {
    // Same game mode
    if (request1.gameMode !== request2.gameMode) return false;

    // Similar bet amounts
    if (request1.betAmount !== request2.betAmount) return false;

    // ELO compatibility
    const eloDiff = Math.abs(player1.eloRating - player2.eloRating);
    if (eloDiff > this.MATCH_TOLERANCE) return false;

    // Psychological compatibility (for better gameplay)
    const psychScore = this.calculatePsychCompatibility(player1.psychProfile, player2.psychProfile);
    if (psychScore < 0.3) return false; // Minimum compatibility threshold

    return true;
  }

  /**
   * Calculate psychological compatibility between players
   */
  private calculatePsychCompatibility(profile1: PsychProfile, profile2: PsychProfile): number {
    // Balance aggressive vs defensive players
    const aggressionBalance = 1 - Math.abs(profile1.aggressionLevel - profile2.aggressionLevel) / 100;
    
    // Different decision patterns make for interesting games
    const patternDiversity = profile1.decisionPattern !== profile2.decisionPattern ? 0.8 : 0.5;
    
    // Risk tolerance compatibility
    const riskCompatibility = 1 - Math.abs(profile1.riskTolerance - profile2.riskTolerance) / 100;

    return (aggressionBalance * 0.4 + patternDiversity * 0.3 + riskCompatibility * 0.3);
  }

  /**
   * Create a new match
   */
  private createMatch(
    player1: Player, 
    player2: Player, 
    request1: MatchRequest, 
    request2: MatchRequest
  ): void {
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const match: Match = {
      id: matchId,
      players: [player1, player2],
      betAmount: request1.betAmount,
      gameMode: request1.gameMode,
      startTime: Date.now(),
      status: 'waiting'
    };

    this.activeMatches.set(matchId, match);
    
    // Remove players from queue
    this.waitingPlayers.delete(player1.id);
    this.waitingPlayers.delete(player2.id);

    // Notify players
    this.emit('matchFound', {
      matchId,
      players: [
        { id: player1.id, rating: player1.eloRating },
        { id: player2.id, rating: player2.eloRating }
      ],
      betAmount: match.betAmount,
      gameMode: match.gameMode
    });

    // Send websocket notifications
    this.notifyPlayer(player1, 'matchFound', { matchId, opponent: player2.id });
    this.notifyPlayer(player2, 'matchFound', { matchId, opponent: player1.id });
  }

  /**
   * Calculate aggression level from betting patterns
   */
  private calculateAggression(betPatterns: number[]): number {
    if (betPatterns.length === 0) return 50;
    
    const avgBet = betPatterns.reduce((a, b) => a + b, 0) / betPatterns.length;
    const maxBet = Math.max(...betPatterns);
    const variability = this.calculateVariance(betPatterns);
    
    // High average bets, high max bets, and high variability indicate aggression
    const normalizedAvg = Math.min(avgBet / 100, 1); // Normalize to 0-1
    const normalizedMax = Math.min(maxBet / 500, 1);
    const normalizedVar = Math.min(variability / 10000, 1);
    
    return (normalizedAvg * 40 + normalizedMax * 40 + normalizedVar * 20);
  }

  /**
   * Calculate variance of an array
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Send notification to player via WebSocket
   */
  private notifyPlayer(player: Player, event: string, data: any): void {
    if (player.websocket && player.websocket.readyState === WebSocket.OPEN) {
      player.websocket.send(JSON.stringify({ event, data, timestamp: Date.now() }));
    }
  }

  /**
   * Get match by ID
   */
  public getMatch(matchId: string): Match | undefined {
    return this.activeMatches.get(matchId);
  }

  /**
   * Update match status
   */
  public updateMatchStatus(matchId: string, status: Match['status']): void {
    const match = this.activeMatches.get(matchId);
    if (match) {
      match.status = status;
      this.emit('matchStatusChanged', { matchId, status });
    }
  }

  /**
   * Get queue statistics
   */
  public getQueueStats(): any {
    return {
      waitingPlayers: this.waitingPlayers.size,
      activeMatches: this.activeMatches.size,
      averageWaitTime: this.calculateAverageWaitTime(),
      queueByGameMode: this.getQueueByGameMode()
    };
  }

  private calculateAverageWaitTime(): number {
    const now = Date.now();
    const waitTimes = Array.from(this.waitingPlayers.values())
      .map(request => now - (now - request.maxWaitTime));
    
    return waitTimes.length > 0 
      ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length 
      : 0;
  }

  private getQueueByGameMode(): Record<string, number> {
    const modes: Record<string, number> = {};
    for (const request of this.waitingPlayers.values()) {
      modes[request.gameMode] = (modes[request.gameMode] || 0) + 1;
    }
    return modes;
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.matchingInterval) {
      clearInterval(this.matchingInterval);
      this.matchingInterval = null;
    }
    this.waitingPlayers.clear();
    this.activeMatches.clear();
    this.removeAllListeners();
  }
}