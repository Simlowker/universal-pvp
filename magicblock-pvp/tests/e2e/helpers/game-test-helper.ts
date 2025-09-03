import { Page } from '@playwright/test';

export interface GameConfig {
  gameType?: string;
  betAmount?: string;
  maxPlayers?: number;
  timeLimit?: number;
  isPrivate?: boolean;
}

export interface UserData {
  id: string;
  username: string;
  email: string;
  token: string;
}

export class GameTestHelper {
  private testGames: string[] = [];

  /**
   * Setup test environment
   */
  async setupTestEnvironment(): Promise<void> {
    // Initialize test database state
    // Clear any existing test data
    // Setup mock services if needed
    console.log('Setting up test environment...');
  }

  /**
   * Cleanup test environment
   */
  async cleanupTestEnvironment(): Promise<void> {
    // Cleanup test games
    for (const gameId of this.testGames) {
      await this.cleanupGame(gameId);
    }
    
    this.testGames = [];
    console.log('Cleaned up test environment');
  }

  /**
   * Create a new game and return game ID
   */
  async createGame(page: Page, config: GameConfig = {}): Promise<string> {
    await page.click('[data-testid="create-game-btn"]');
    
    // Fill game configuration
    if (config.betAmount) {
      await page.fill('[data-testid="bet-amount"]', config.betAmount);
    }
    
    if (config.gameType) {
      await page.selectOption('[data-testid="game-type"]', config.gameType);
    }
    
    if (config.maxPlayers) {
      await page.fill('[data-testid="max-players"]', config.maxPlayers.toString());
    }
    
    if (config.timeLimit) {
      await page.fill('[data-testid="time-limit"]', config.timeLimit.toString());
    }
    
    if (config.isPrivate) {
      await page.check('[data-testid="private-game"]');
    }
    
    await page.click('[data-testid="confirm-create-game"]');
    
    // Wait for game creation and extract game ID
    await page.waitForSelector('[data-testid="game-id"]');
    const gameId = await page.getAttribute('[data-testid="game-id"]', 'data-game-id');
    
    if (!gameId) {
      throw new Error('Failed to create game - no game ID found');
    }
    
    this.testGames.push(gameId);
    return gameId;
  }

  /**
   * Join an existing game
   */
  async joinGame(page: Page, gameId: string, betAmount: string): Promise<void> {
    await page.goto(`/game/${gameId}`);
    await page.click('[data-testid="join-game-btn"]');
    await page.fill('[data-testid="bet-amount"]', betAmount);
    await page.click('[data-testid="confirm-join-game"]');
    
    // Wait for join confirmation
    await page.waitForSelector('[data-testid="game-status"]');
  }

  /**
   * Create a game and have two players join
   */
  async createAndJoinGame(
    player1Page: Page, 
    player2Page: Page, 
    betAmount: string = '1'
  ): Promise<string> {
    // Player 1 creates game
    await player1Page.goto('/');
    const gameId = await this.createGame(player1Page, { betAmount });
    
    // Player 2 joins game
    await this.joinGame(player2Page, gameId, betAmount);
    
    // Wait for both players to see active game
    await Promise.all([
      player1Page.waitForSelector('[data-testid="game-status"][data-status="active"]'),
      player2Page.waitForSelector('[data-testid="game-status"][data-status="active"]')
    ]);
    
    return gameId;
  }

  /**
   * Make a move in the game
   */
  async makeMove(
    page: Page, 
    moveType: 'attack' | 'defend' | 'special', 
    targetId?: string
  ): Promise<void> {
    // Wait for player's turn
    await page.waitForSelector('[data-testid="your-turn-indicator"]');
    
    // Click move type
    await page.click(`[data-testid="${moveType}-btn"]`);
    
    // Select target if needed
    if (targetId && moveType !== 'defend') {
      await page.selectOption('[data-testid="attack-target"]', targetId);
    }
    
    // Confirm move
    await page.click('[data-testid="confirm-move"]');
    
    // Wait for move to be processed
    await page.waitForSelector('[data-testid="move-result"]');
  }

  /**
   * Get current player turn
   */
  async getCurrentPlayerTurn(gameId: string): Promise<string> {
    // This would typically call the API to get current game state
    // For now, return a mock value
    return 'player-123';
  }

  /**
   * Wait for game to reach specific status
   */
  async waitForGameStatus(
    page: Page, 
    status: 'waiting' | 'active' | 'finished' | 'timeout',
    timeoutMs: number = 30000
  ): Promise<void> {
    await page.waitForSelector(
      `[data-testid="game-status"][data-status="${status}"]`,
      { timeout: timeoutMs }
    );
  }

  /**
   * Get game state from page
   */
  async getGameState(page: Page): Promise<{
    status: string;
    players: number;
    currentTurn?: string;
    moves: number;
  }> {
    const status = await page.getAttribute('[data-testid="game-status"]', 'data-status') || 'unknown';
    const playerCount = await page.locator('[data-testid="player-list"] [data-testid="player"]').count();
    const moveCount = await page.locator('[data-testid="move-history"] [data-testid="move"]').count();
    
    return {
      status,
      players: playerCount,
      moves: moveCount
    };
  }

  /**
   * Verify game metrics meet performance targets
   */
  async verifyPerformanceTargets(page: Page): Promise<{
    latencyMs: number;
    withinTarget: boolean;
  }> {
    // Get performance metrics from the page or API
    const startTime = Date.now();
    
    // Make a test API call
    await page.evaluate(() => {
      return fetch('/api/health/performance')
        .then(response => response.json());
    });
    
    const latencyMs = Date.now() - startTime;
    const withinTarget = latencyMs < 100; // P95 < 100ms target
    
    return {
      latencyMs,
      withinTarget
    };
  }

  /**
   * Simulate network conditions
   */
  async simulateNetworkConditions(
    page: Page,
    conditions: 'fast' | 'slow' | 'offline'
  ): Promise<void> {
    switch (conditions) {
      case 'slow':
        await page.route('**/*', route => {
          setTimeout(() => route.continue(), 1000); // 1s delay
        });
        break;
      
      case 'offline':
        await page.route('**/*', route => route.abort());
        break;
      
      case 'fast':
      default:
        await page.unroute('**/*');
        break;
    }
  }

  /**
   * Monitor real-time events
   */
  async monitorRealTimeEvents(
    page: Page,
    eventTypes: string[],
    duration: number = 10000
  ): Promise<any[]> {
    const events: any[] = [];
    
    // Setup WebSocket message listener
    await page.evaluateHandle((eventTypes) => {
      const ws = (window as any).gameWebSocket;
      if (ws) {
        const originalOnMessage = ws.onmessage;
        ws.onmessage = (event: MessageEvent) => {
          const data = JSON.parse(event.data);
          if (eventTypes.includes(data.type)) {
            (window as any).__testEvents = (window as any).__testEvents || [];
            (window as any).__testEvents.push(data);
          }
          if (originalOnMessage) originalOnMessage(event);
        };
      }
    }, eventTypes);
    
    // Wait for specified duration
    await page.waitForTimeout(duration);
    
    // Collect captured events
    const capturedEvents = await page.evaluate(() => {
      return (window as any).__testEvents || [];
    });
    
    return capturedEvents;
  }

  /**
   * Verify game data integrity
   */
  async verifyGameDataIntegrity(page: Page, gameId: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    
    // Check game ID exists
    const displayedGameId = await page.getAttribute('[data-testid="game-id"]', 'data-game-id');
    if (displayedGameId !== gameId) {
      errors.push(`Game ID mismatch: expected ${gameId}, got ${displayedGameId}`);
    }
    
    // Check player count consistency
    const playerListCount = await page.locator('[data-testid="player-list"] [data-testid="player"]').count();
    const headerPlayerCount = await page.textContent('[data-testid="player-count"]');
    const expectedCount = parseInt(headerPlayerCount?.split('/')[0] || '0');
    
    if (playerListCount !== expectedCount) {
      errors.push(`Player count mismatch: list shows ${playerListCount}, header shows ${expectedCount}`);
    }
    
    // Check move history consistency
    const moveCount = await page.locator('[data-testid="move-history"] [data-testid="move"]').count();
    const turnNumber = await page.textContent('[data-testid="turn-number"]');
    const expectedTurn = parseInt(turnNumber?.replace('Turn ', '') || '1');
    
    if (moveCount > expectedTurn) {
      errors.push(`Move history inconsistent: ${moveCount} moves but turn ${expectedTurn}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Take screenshot for debugging
   */
  async captureScreenshot(page: Page, name: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test-screenshot-${name}-${timestamp}.png`;
    
    await page.screenshot({
      path: `tests/screenshots/${filename}`,
      fullPage: true
    });
    
    return filename;
  }

  /**
   * Cleanup specific game
   */
  private async cleanupGame(gameId: string): Promise<void> {
    try {
      // Call cleanup API or database cleanup
      console.log(`Cleaning up test game: ${gameId}`);
      
      // Remove from tracking list
      const index = this.testGames.indexOf(gameId);
      if (index > -1) {
        this.testGames.splice(index, 1);
      }
    } catch (error) {
      console.error(`Failed to cleanup game ${gameId}:`, error);
    }
  }

  /**
   * Generate test data for load testing
   */
  generateTestGameData(count: number): GameConfig[] {
    const gameTypes = ['PVP'];
    const betAmounts = ['0.1', '0.5', '1.0', '2.0', '5.0'];
    const timeLimits = [30000, 60000, 120000, 300000];
    
    return Array.from({ length: count }, (_, i) => ({
      gameType: gameTypes[i % gameTypes.length],
      betAmount: betAmounts[i % betAmounts.length],
      maxPlayers: 2,
      timeLimit: timeLimits[i % timeLimits.length],
      isPrivate: i % 5 === 0 // 20% private games
    }));
  }

  /**
   * Measure game creation performance
   */
  async measureGameCreationPerformance(
    page: Page,
    iterations: number = 10
  ): Promise<{
    averageMs: number;
    p95Ms: number;
    successRate: number;
  }> {
    const measurements: number[] = [];
    let successCount = 0;
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      
      try {
        await this.createGame(page, {
          gameType: 'PVP',
          betAmount: '1',
          maxPlayers: 2,
          timeLimit: 30000
        });
        
        const duration = Date.now() - startTime;
        measurements.push(duration);
        successCount++;
        
      } catch (error) {
        console.error(`Game creation failed on iteration ${i + 1}:`, error);
      }
    }
    
    measurements.sort((a, b) => a - b);
    const averageMs = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    const p95Index = Math.floor(measurements.length * 0.95);
    const p95Ms = measurements[p95Index] || 0;
    const successRate = successCount / iterations;
    
    return {
      averageMs: Math.round(averageMs),
      p95Ms: Math.round(p95Ms),
      successRate
    };
  }
}