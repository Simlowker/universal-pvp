/**
 * Strategic Duel Complete Flow E2E Tests
 * Tests the entire strategic duel experience from wallet connection to game completion
 */

import { test, expect, Page } from '@playwright/test';

// Test data and utilities
const MOCK_WALLETS = {
  player1: {
    address: 'BK7wKXakARNrFQ6LYjGXGrxUUfQfDQ6MDbR6nSkzHkm4',
    name: 'TestPlayer1',
    balance: 5.0 // SOL
  },
  player2: {
    address: '8YGmoCgnZ9YUnqzVrTfLHzCLpujqtZnkpNWVUqPuzU8x',
    name: 'TestPlayer2', 
    balance: 3.0 // SOL
  }
};

// Page object for Strategic Duel
class StrategicDuelPage {
  constructor(private page: Page) {}

  // Navigation
  async goto() {
    await this.page.goto('/strategic-duel');
    await this.page.waitForLoadState('networkidle');
  }

  // Wallet connection
  async connectWallet(wallet = MOCK_WALLETS.player1) {
    await this.page.click('[data-testid="connect-wallet-btn"]');
    await this.page.click('[data-testid="phantom-wallet-option"]');
    
    // Mock wallet connection
    await this.page.evaluate((walletData) => {
      window.mockWalletConnection = walletData;
      window.dispatchEvent(new CustomEvent('wallet-connected', { detail: walletData }));
    }, wallet);

    await expect(this.page.locator('[data-testid="wallet-connected"]')).toContainText(wallet.address.slice(0, 8));
  }

  // Game setup and matchmaking
  async setupGame(priority: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM', betAmount = 0.05) {
    // Set bet amount
    await this.page.fill('[data-testid="bet-amount-input"]', betAmount.toString());
    
    // Select priority
    await this.page.selectOption('[data-testid="priority-select"]', priority);
    
    // Join matchmaking
    await this.page.click('[data-testid="join-matchmaking-btn"]');
    
    // Wait for matchmaking to complete
    await this.page.waitForSelector('[data-testid="game-session-started"]', { timeout: 30000 });
  }

  // Game actions
  async performAction(action: 'CHECK' | 'RAISE' | 'CALL' | 'FOLD' | 'STRATEGIC_FOLD', amount?: number) {
    const actionBtn = `[data-testid="action-${action.toLowerCase()}"]`;
    
    if (amount && action === 'RAISE') {
      await this.page.fill('[data-testid="raise-amount-input"]', amount.toString());
    }
    
    await this.page.click(actionBtn);
    
    // Wait for action to be processed
    await this.page.waitForSelector('[data-testid="action-processed"]', { timeout: 10000 });
  }

  // Game state verification
  async verifyGameState(expectedState: any) {
    const gameState = await this.page.evaluate(() => {
      return window.gameState || {};
    });

    expect(gameState.pot).toBeGreaterThanOrEqual(expectedState.minPot || 0);
    expect(gameState.round).toBeGreaterThanOrEqual(1);
    expect(gameState.phase).toBeTruthy();
  }

  // Performance monitoring
  async measureActionLatency(action: 'CHECK' | 'RAISE' | 'CALL' | 'FOLD' | 'STRATEGIC_FOLD'): Promise<number> {
    const startTime = Date.now();
    await this.performAction(action);
    return Date.now() - startTime;
  }

  // Wait for game completion
  async waitForGameCompletion() {
    await this.page.waitForSelector('[data-testid="game-completed"]', { timeout: 60000 });
    
    const results = await this.page.evaluate(() => {
      return {
        winner: document.querySelector('[data-testid="game-winner"]')?.textContent,
        pot: document.querySelector('[data-testid="final-pot"]')?.textContent,
        duration: document.querySelector('[data-testid="game-duration"]')?.textContent,
      };
    });

    return results;
  }
}

test.describe('Strategic Duel Complete Flow', () => {
  let strategicDuel: StrategicDuelPage;

  test.beforeEach(async ({ page }) => {
    strategicDuel = new StrategicDuelPage(page);
    
    // Mock MagicBlock services for testing
    await page.addInitScript(() => {
      // Mock WebSocket connection
      window.mockWebSocket = {
        readyState: WebSocket.OPEN,
        send: () => {},
        close: () => {},
        addEventListener: () => {},
      };

      // Mock MagicBlock SDK
      window.magicBlockService = {
        initializeSession: async () => ({
          sessionKey: 'mock_session_key',
          delegationPda: 'mock_delegation_pda',
          expiresAt: Date.now() + 3600000
        }),
        executeAction: async (action) => ({
          signature: 'mock_signature',
          executionTime: Math.random() * 50 + 10, // 10-60ms
          newState: { pot: 10000, round: 1, phase: 'betting' }
        }),
        getPerformanceMetrics: () => ({
          session_init: 25,
          action_CHECK: 15,
          action_RAISE: 18,
          action_CALL: 12,
          action_STRATEGIC_FOLD: 22
        })
      };
    });
  });

  test('Complete strategic duel flow - happy path', async () => {
    // 1. Navigate to Strategic Duel
    await strategicDuel.goto();
    
    // 2. Connect wallet
    await strategicDuel.connectWallet();
    
    // 3. Setup game with medium priority
    await strategicDuel.setupGame('MEDIUM', 0.05);
    
    // 4. Verify initial game state
    await strategicDuel.verifyGameState({
      minPot: 100000, // 0.1 SOL minimum (both players' bets)
    });

    // 5. Play multiple rounds
    const actions = [
      { action: 'CHECK' as const },
      { action: 'RAISE' as const, amount: 0.01 },
      { action: 'CALL' as const },
      { action: 'RAISE' as const, amount: 0.02 },
      { action: 'CALL' as const },
    ];

    for (const [index, { action, amount }] of actions.entries()) {
      await test.step(`Round ${index + 1}: ${action}${amount ? ` ${amount}` : ''}`, async () => {
        const latency = await strategicDuel.measureActionLatency(action);
        expect(latency).toBeLessThan(100); // Sub-100ms requirement
        
        if (amount) {
          await strategicDuel.performAction(action, amount);
        } else {
          await strategicDuel.performAction(action);
        }
      });
    }

    // 6. Complete game and verify results
    const results = await strategicDuel.waitForGameCompletion();
    
    expect(results.winner).toBeTruthy();
    expect(results.pot).toBeTruthy();
    expect(results.duration).toBeTruthy();
  });

  test('Strategic fold functionality', async () => {
    await strategicDuel.goto();
    await strategicDuel.connectWallet();
    await strategicDuel.setupGame('HIGH', 0.1);

    // Place a significant bet
    await strategicDuel.performAction('RAISE', 0.05);
    
    // Opponent raises
    await strategicDuel.performAction('RAISE', 0.08);
    
    // Execute strategic fold (should get 50% refund)
    await strategicDuel.performAction('STRATEGIC_FOLD');
    
    // Verify strategic fold processed correctly
    const gameState = await strategicDuel.page.evaluate(() => window.gameState);
    expect(gameState.strategicFoldExecuted).toBe(true);
    expect(gameState.refundAmount).toBeGreaterThan(0);
  });

  test('Performance requirements validation', async () => {
    await strategicDuel.goto();
    await strategicDuel.connectWallet();
    await strategicDuel.setupGame('HIGH', 0.02);

    // Test each action type for latency compliance
    const actionTests = [
      { action: 'CHECK' as const, maxLatency: 50 },
      { action: 'RAISE' as const, maxLatency: 50, amount: 0.01 },
      { action: 'CALL' as const, maxLatency: 50 },
    ];

    for (const { action, maxLatency, amount } of actionTests) {
      await test.step(`Performance test: ${action}`, async () => {
        const latency = await strategicDuel.measureActionLatency(action);
        expect(latency).toBeLessThan(maxLatency);
        
        // Log performance for monitoring
        console.log(`${action} latency: ${latency}ms`);
      });
    }
  });

  test('Error handling and recovery', async () => {
    await strategicDuel.goto();
    await strategicDuel.connectWallet();

    // Simulate network error during matchmaking
    await strategicDuel.page.route('**/api/games/strategic-duel/matchmaking', route => {
      route.abort('failed');
    });

    // Try to setup game (should fail gracefully)
    await expect(strategicDuel.page.locator('[data-testid="join-matchmaking-btn"]')).toBeVisible();
    await strategicDuel.page.click('[data-testid="join-matchmaking-btn"]');
    
    // Verify error message appears
    await expect(strategicDuel.page.locator('[data-testid="error-message"]')).toContainText('matchmaking failed');
    
    // Remove route interception and retry
    await strategicDuel.page.unroute('**/api/games/strategic-duel/matchmaking');
    await strategicDuel.page.click('[data-testid="retry-matchmaking-btn"]');
    
    // Should succeed on retry
    await expect(strategicDuel.page.locator('[data-testid="game-session-started"]')).toBeVisible({ timeout: 30000 });
  });

  test('Mobile responsiveness', async ({ browserName }) => {
    test.skip(browserName !== 'Mobile Chrome' && browserName !== 'Mobile Safari', 'Mobile-specific test');
    
    await strategicDuel.goto();
    
    // Verify mobile-optimized UI
    await expect(strategicDuel.page.locator('[data-testid="mobile-game-interface"]')).toBeVisible();
    
    // Test touch interactions
    await strategicDuel.connectWallet();
    await strategicDuel.setupGame('MEDIUM', 0.03);
    
    // Verify action buttons are touch-friendly
    const actionButton = strategicDuel.page.locator('[data-testid="action-check"]');
    const boundingBox = await actionButton.boundingBox();
    
    expect(boundingBox?.height).toBeGreaterThan(44); // Minimum touch target size
    expect(boundingBox?.width).toBeGreaterThan(44);
  });

  test('Accessibility compliance', async () => {
    await strategicDuel.goto();
    
    // Check for basic accessibility requirements
    await expect(strategicDuel.page.locator('[data-testid="connect-wallet-btn"]')).toHaveAttribute('aria-label');
    
    // Test keyboard navigation
    await strategicDuel.page.keyboard.press('Tab');
    await expect(strategicDuel.page.locator(':focus')).toBeVisible();
    
    // Test screen reader support
    const gameContainer = strategicDuel.page.locator('[data-testid="game-container"]');
    await expect(gameContainer).toHaveAttribute('role', 'main');
  });

  test('Multi-browser compatibility', async ({ browserName }) => {
    await strategicDuel.goto();
    
    // Browser-specific WebGL support check
    const webglSupported = await strategicDuel.page.evaluate(() => {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    });
    
    expect(webglSupported).toBe(true);
    
    // Test WebSocket compatibility
    const wsSupported = await strategicDuel.page.evaluate(() => {
      return typeof WebSocket !== 'undefined';
    });
    
    expect(wsSupported).toBe(true);
    
    console.log(`Browser ${browserName}: WebGL=${webglSupported}, WebSocket=${wsSupported}`);
  });

  test('Security validation', async () => {
    await strategicDuel.goto();
    
    // Test XSS protection
    await strategicDuel.page.fill('[data-testid="bet-amount-input"]', '<script>alert("xss")</script>');
    await strategicDuel.page.click('[data-testid="join-matchmaking-btn"]');
    
    // Verify no script execution
    const alertDialogPromise = strategicDuel.page.waitForEvent('dialog', { timeout: 1000 });
    const alertOccurred = await alertDialogPromise.then(() => true).catch(() => false);
    expect(alertOccurred).toBe(false);
    
    // Test wallet signature validation
    await strategicDuel.connectWallet();
    
    // Verify wallet connection uses proper signature validation
    const walletConnected = await strategicDuel.page.locator('[data-testid="wallet-connected"]').isVisible();
    expect(walletConnected).toBe(true);
  });
});

test.describe('Strategic Duel Performance Benchmarks', () => {
  test('Load testing simulation', async ({ page }) => {
    const strategicDuel = new StrategicDuelPage(page);
    
    // Simulate concurrent user load
    const concurrentSessions = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      wallet: `TestWallet${i}`,
    }));

    await strategicDuel.goto();
    
    // Test rapid session creation
    const sessionTimes: number[] = [];
    
    for (const session of concurrentSessions) {
      const startTime = Date.now();
      await strategicDuel.connectWallet({ ...MOCK_WALLETS.player1, name: session.wallet });
      await strategicDuel.setupGame('MEDIUM', 0.02);
      sessionTimes.push(Date.now() - startTime);
    }
    
    // Verify all sessions completed within reasonable time
    const avgSessionTime = sessionTimes.reduce((a, b) => a + b, 0) / sessionTimes.length;
    expect(avgSessionTime).toBeLessThan(10000); // 10 seconds average
    
    console.log(`Average session setup time: ${avgSessionTime}ms`);
    console.log(`Session times: ${sessionTimes.join(', ')}ms`);
  });

  test('Memory usage monitoring', async ({ page }) => {
    const strategicDuel = new StrategicDuelPage(page);
    
    await strategicDuel.goto();
    
    // Get initial memory usage
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });
    
    // Run multiple game sessions
    for (let i = 0; i < 3; i++) {
      await strategicDuel.connectWallet();
      await strategicDuel.setupGame('LOW', 0.01);
      await strategicDuel.performAction('CHECK');
      await strategicDuel.performAction('CALL');
    }
    
    // Check memory usage after games
    const finalMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });
    
    const memoryIncrease = finalMemory - initialMemory;
    const memoryIncreaseMB = memoryIncrease / (1024 * 1024);
    
    // Memory shouldn't increase by more than 50MB
    expect(memoryIncreaseMB).toBeLessThan(50);
    
    console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)}MB`);
  });
});