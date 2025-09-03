import { test, expect, Page, BrowserContext } from '@playwright/test';
import { GameTestHelper } from './helpers/game-test-helper';
import { UserTestHelper } from './helpers/user-test-helper';
import { WebSocketTestHelper } from './helpers/websocket-test-helper';

test.describe('Complete Game Flow E2E Tests', () => {
  let gameHelper: GameTestHelper;
  let userHelper: UserTestHelper;
  let wsHelper: WebSocketTestHelper;
  let player1Page: Page;
  let player2Page: Page;
  let context1: BrowserContext;
  let context2: BrowserContext;

  test.beforeEach(async ({ browser }) => {
    // Create two browser contexts for two players
    context1 = await browser.newContext();
    context2 = await browser.newContext();
    
    player1Page = await context1.newPage();
    player2Page = await context2.newPage();

    gameHelper = new GameTestHelper();
    userHelper = new UserTestHelper();
    wsHelper = new WebSocketTestHelper();

    // Setup test environment
    await gameHelper.setupTestEnvironment();
  });

  test.afterEach(async () => {
    await gameHelper.cleanupTestEnvironment();
    await context1.close();
    await context2.close();
  });

  test('Complete PvP game flow - Create, Join, Play, Finish', async () => {
    // Step 1: Player 1 creates an account and logs in
    await player1Page.goto('/');
    const player1 = await userHelper.createAndLoginUser(player1Page, {
      username: 'player1',
      email: 'player1@test.com'
    });

    // Step 2: Player 2 creates an account and logs in
    await player2Page.goto('/');
    const player2 = await userHelper.createAndLoginUser(player2Page, {
      username: 'player2',
      email: 'player2@test.com'
    });

    // Step 3: Player 1 creates a new game
    await player1Page.click('[data-testid="create-game-btn"]');
    await player1Page.fill('[data-testid="bet-amount"]', '1');
    await player1Page.selectOption('[data-testid="game-type"]', 'PVP');
    await player1Page.click('[data-testid="confirm-create-game"]');

    // Verify game creation
    await expect(player1Page.locator('[data-testid="game-status"]')).toHaveText('Waiting for players...');
    
    const gameId = await player1Page.getAttribute('[data-testid="game-id"]', 'data-game-id');
    expect(gameId).toBeTruthy();

    // Step 4: Player 2 joins the game
    await player2Page.goto(`/game/${gameId}`);
    await player2Page.click('[data-testid="join-game-btn"]');
    await player2Page.fill('[data-testid="bet-amount"]', '1');
    await player2Page.click('[data-testid="confirm-join-game"]');

    // Verify both players see game as active
    await expect(player1Page.locator('[data-testid="game-status"]')).toHaveText('Active', { timeout: 5000 });
    await expect(player2Page.locator('[data-testid="game-status"]')).toHaveText('Active');

    // Verify player list
    await expect(player1Page.locator('[data-testid="player-list"] [data-testid="player"]')).toHaveCount(2);
    await expect(player2Page.locator('[data-testid="player-list"] [data-testid="player"]')).toHaveCount(2);

    // Step 5: Setup WebSocket listeners for real-time updates
    const player1WS = await wsHelper.connectToGame(gameId, player1.token);
    const player2WS = await wsHelper.connectToGame(gameId, player2.token);

    // Step 6: Play the game - Player 1's turn
    await expect(player1Page.locator('[data-testid="your-turn-indicator"]')).toBeVisible();
    await player1Page.click('[data-testid="attack-btn"]');
    await player1Page.selectOption('[data-testid="attack-target"]', player2.id);
    await player1Page.click('[data-testid="confirm-move"]');

    // Verify move was processed
    const moveEvent = await wsHelper.waitForEvent(player2WS, 'move_submitted', 5000);
    expect(moveEvent.data.move.type).toBe('attack');

    // Verify UI updates
    await expect(player1Page.locator('[data-testid="move-result"]')).toBeVisible();
    await expect(player2Page.locator('[data-testid="opponent-move"]')).toContainText('attacked you');

    // Step 7: Player 2's turn
    await expect(player2Page.locator('[data-testid="your-turn-indicator"]')).toBeVisible();
    await player2Page.click('[data-testid="defend-btn"]');
    await player2Page.click('[data-testid="confirm-move"]');

    // Verify defensive move
    const defendEvent = await wsHelper.waitForEvent(player1WS, 'move_submitted', 5000);
    expect(defendEvent.data.move.type).toBe('defend');

    // Step 8: Continue game until completion
    let gameComplete = false;
    let turnCount = 0;
    const maxTurns = 20; // Prevent infinite loops

    while (!gameComplete && turnCount < maxTurns) {
      // Check if game is complete
      const status1 = await player1Page.locator('[data-testid="game-status"]').textContent();
      if (status1 === 'Finished') {
        gameComplete = true;
        break;
      }

      // Determine whose turn it is and make a move
      const currentPlayer = await gameHelper.getCurrentPlayerTurn(gameId);
      const activePage = currentPlayer === player1.id ? player1Page : player2Page;

      await activePage.click('[data-testid="attack-btn"]');
      const otherPlayerId = currentPlayer === player1.id ? player2.id : player1.id;
      await activePage.selectOption('[data-testid="attack-target"]', otherPlayerId);
      await activePage.click('[data-testid="confirm-move"]');

      // Wait for move to be processed
      await activePage.waitForTimeout(1000);
      turnCount++;
    }

    // Step 9: Verify game completion
    await expect(player1Page.locator('[data-testid="game-status"]')).toHaveText('Finished', { timeout: 10000 });
    await expect(player2Page.locator('[data-testid="game-status"]')).toHaveText('Finished');

    // Verify winner is displayed
    await expect(player1Page.locator('[data-testid="game-result"]')).toBeVisible();
    await expect(player2Page.locator('[data-testid="game-result"]')).toBeVisible();

    const winner1 = await player1Page.locator('[data-testid="winner"]').textContent();
    const winner2 = await player2Page.locator('[data-testid="winner"]').textContent();
    expect(winner1).toBe(winner2); // Both should show same winner

    // Step 10: Verify payout was processed
    if (winner1 === player1.username) {
      await expect(player1Page.locator('[data-testid="payout-amount"]')).toContainText('2.0'); // Won 2 SOL
      await expect(player2Page.locator('[data-testid="payout-amount"]')).toContainText('0.0'); // Lost bet
    } else {
      await expect(player2Page.locator('[data-testid="payout-amount"]')).toContainText('2.0');
      await expect(player1Page.locator('[data-testid="payout-amount"]')).toContainText('0.0');
    }

    // Step 11: Verify transaction history
    await player1Page.click('[data-testid="view-transactions"]');
    await expect(player1Page.locator('[data-testid="transaction-list"] [data-testid="transaction"]')).toHaveCountGreaterThan(0);

    await player2Page.click('[data-testid="view-transactions"]');
    await expect(player2Page.locator('[data-testid="transaction-list"] [data-testid="transaction"]')).toHaveCountGreaterThan(0);

    // Cleanup WebSocket connections
    await wsHelper.disconnect(player1WS);
    await wsHelper.disconnect(player2WS);
  });

  test('Game timeout handling', async () => {
    // Create a game with short timeout
    await player1Page.goto('/');
    const player1 = await userHelper.createAndLoginUser(player1Page, {
      username: 'timeout_player1',
      email: 'timeout1@test.com'
    });

    await player1Page.click('[data-testid="create-game-btn"]');
    await player1Page.fill('[data-testid="bet-amount"]', '0.5');
    await player1Page.fill('[data-testid="time-limit"]', '5'); // 5 seconds
    await player1Page.click('[data-testid="confirm-create-game"]');

    const gameId = await player1Page.getAttribute('[data-testid="game-id"]', 'data-game-id');

    // Second player joins
    await player2Page.goto('/');
    const player2 = await userHelper.createAndLoginUser(player2Page, {
      username: 'timeout_player2',
      email: 'timeout2@test.com'
    });

    await player2Page.goto(`/game/${gameId}`);
    await player2Page.click('[data-testid="join-game-btn"]');
    await player2Page.fill('[data-testid="bet-amount"]', '0.5');
    await player2Page.click('[data-testid="confirm-join-game"]');

    // Wait for game to start
    await expect(player1Page.locator('[data-testid="game-status"]')).toHaveText('Active');

    // Don't make any moves, wait for timeout
    await expect(player1Page.locator('[data-testid="game-status"]')).toHaveText('Finished', { timeout: 15000 });
    await expect(player2Page.locator('[data-testid="game-status"]')).toHaveText('Finished');

    // Verify timeout result
    await expect(player1Page.locator('[data-testid="game-result"]')).toContainText('timeout');
    await expect(player2Page.locator('[data-testid="game-result"]')).toContainText('timeout');
  });

  test('Spectator mode', async () => {
    // Create and start a game between two players
    const player1 = await userHelper.createAndLoginUser(player1Page, {
      username: 'spectator_player1',
      email: 'spec1@test.com'
    });

    const player2 = await userHelper.createAndLoginUser(player2Page, {
      username: 'spectator_player2', 
      email: 'spec2@test.com'
    });

    // Player 1 creates game
    await player1Page.goto('/');
    await player1Page.click('[data-testid="create-game-btn"]');
    await player1Page.fill('[data-testid="bet-amount"]', '1');
    await player1Page.click('[data-testid="allow-spectators"]');
    await player1Page.click('[data-testid="confirm-create-game"]');

    const gameId = await player1Page.getAttribute('[data-testid="game-id"]', 'data-game-id');

    // Player 2 joins
    await player2Page.goto(`/game/${gameId}`);
    await player2Page.click('[data-testid="join-game-btn"]');
    await player2Page.fill('[data-testid="bet-amount"]', '1');
    await player2Page.click('[data-testid="confirm-join-game"]');

    // Create spectator context
    const spectatorContext = await player1Page.context().browser()!.newContext();
    const spectatorPage = await spectatorContext.newPage();
    const spectator = await userHelper.createAndLoginUser(spectatorPage, {
      username: 'spectator',
      email: 'spectator@test.com'
    });

    // Spectator joins as observer
    await spectatorPage.goto(`/game/${gameId}/spectate`);
    await expect(spectatorPage.locator('[data-testid="spectator-mode"]')).toBeVisible();

    // Verify spectator can see game but not interact
    await expect(spectatorPage.locator('[data-testid="game-status"]')).toHaveText('Active');
    await expect(spectatorPage.locator('[data-testid="player-list"] [data-testid="player"]')).toHaveCount(2);
    await expect(spectatorPage.locator('[data-testid="make-move-btn"]')).not.toBeVisible();

    // Make moves and verify spectator sees updates
    await player1Page.click('[data-testid="attack-btn"]');
    await player1Page.selectOption('[data-testid="attack-target"]', player2.id);
    await player1Page.click('[data-testid="confirm-move"]');

    await expect(spectatorPage.locator('[data-testid="latest-move"]')).toContainText('attacked');

    await spectatorContext.close();
  });

  test('Reconnection and state sync', async () => {
    // Start a game
    const player1 = await userHelper.createAndLoginUser(player1Page, {
      username: 'reconnect_player1',
      email: 'recon1@test.com'
    });

    const player2 = await userHelper.createAndLoginUser(player2Page, {
      username: 'reconnect_player2',
      email: 'recon2@test.com'
    });

    await gameHelper.createAndJoinGame(player1Page, player2Page, '1');

    const gameId = await player1Page.getAttribute('[data-testid="game-id"]', 'data-game-id');

    // Player 1 makes a move
    await player1Page.click('[data-testid="attack-btn"]');
    await player1Page.selectOption('[data-testid="attack-target"]', player2.id);
    await player1Page.click('[data-testid="confirm-move"]');

    // Simulate connection loss by closing and reopening browser
    await context1.close();
    context1 = await player1Page.context().browser()!.newContext();
    player1Page = await context1.newPage();

    // Player 1 logs back in and navigates to game
    await userHelper.loginExistingUser(player1Page, player1.username, 'password');
    await player1Page.goto(`/game/${gameId}`);

    // Verify game state is properly restored
    await expect(player1Page.locator('[data-testid="game-status"]')).toHaveText('Active');
    await expect(player1Page.locator('[data-testid="move-history"] [data-testid="move"]')).toHaveCountGreaterThan(0);

    // Verify player can continue playing
    if (await player1Page.locator('[data-testid="your-turn-indicator"]').isVisible()) {
      await player1Page.click('[data-testid="defend-btn"]');
      await player1Page.click('[data-testid="confirm-move"]');
      await expect(player1Page.locator('[data-testid="move-result"]')).toBeVisible();
    }
  });

  test('Multi-game concurrent handling', async () => {
    // Create multiple games simultaneously
    const players = await Promise.all([
      userHelper.createAndLoginUser(await context1.newPage(), { username: 'multi1', email: 'm1@test.com' }),
      userHelper.createAndLoginUser(await context1.newPage(), { username: 'multi2', email: 'm2@test.com' }),
      userHelper.createAndLoginUser(await context2.newPage(), { username: 'multi3', email: 'm3@test.com' }),
      userHelper.createAndLoginUser(await context2.newPage(), { username: 'multi4', email: 'm4@test.com' })
    ]);

    const pages = await Promise.all([
      context1.newPage(),
      context1.newPage(), 
      context2.newPage(),
      context2.newPage()
    ]);

    // Log in all players
    for (let i = 0; i < players.length; i++) {
      await userHelper.loginExistingUser(pages[i], players[i].username, 'password');
    }

    // Create two games concurrently
    const game1Promise = gameHelper.createAndJoinGame(pages[0], pages[1], '0.5');
    const game2Promise = gameHelper.createAndJoinGame(pages[2], pages[3], '1.0');

    await Promise.all([game1Promise, game2Promise]);

    // Verify both games are running independently
    await expect(pages[0].locator('[data-testid="game-status"]')).toHaveText('Active');
    await expect(pages[1].locator('[data-testid="game-status"]')).toHaveText('Active');
    await expect(pages[2].locator('[data-testid="game-status"]')).toHaveText('Active'); 
    await expect(pages[3].locator('[data-testid="game-status"]')).toHaveText('Active');

    // Make moves in both games simultaneously
    await Promise.all([
      gameHelper.makeMove(pages[0], 'attack', players[1].id),
      gameHelper.makeMove(pages[2], 'attack', players[3].id)
    ]);

    // Verify both games processed moves correctly
    await expect(pages[0].locator('[data-testid="move-result"]')).toBeVisible();
    await expect(pages[2].locator('[data-testid="move-result"]')).toBeVisible();

    // Close additional pages
    for (const page of pages) {
      await page.close();
    }
  });

  test('Error handling and recovery', async () => {
    // Test network error simulation
    const player1 = await userHelper.createAndLoginUser(player1Page, {
      username: 'error_player1',
      email: 'error1@test.com'
    });

    await player1Page.goto('/');
    
    // Simulate network failure during game creation
    await player1Page.route('**/api/games', route => route.abort());
    
    await player1Page.click('[data-testid="create-game-btn"]');
    await player1Page.fill('[data-testid="bet-amount"]', '1');
    await player1Page.click('[data-testid="confirm-create-game"]');

    // Verify error handling
    await expect(player1Page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(player1Page.locator('[data-testid="error-message"]')).toContainText('Failed to create game');

    // Test retry functionality
    await player1Page.unroute('**/api/games');
    await player1Page.click('[data-testid="retry-btn"]');

    // Verify successful retry
    await expect(player1Page.locator('[data-testid="game-status"]')).toHaveText('Waiting for players...');
  });

  test('Performance under load', async () => {
    // Create multiple concurrent games to test performance
    const concurrency = 5;
    const contexts = await Promise.all(
      Array(concurrency * 2).fill(null).map(() => player1Page.context().browser()!.newContext())
    );

    const pages = await Promise.all(
      contexts.map(ctx => ctx.newPage())
    );

    const users = await Promise.all(
      pages.map((page, i) => userHelper.createAndLoginUser(page, {
        username: `perf_user_${i}`,
        email: `perf${i}@test.com`
      }))
    );

    const startTime = Date.now();

    // Create games concurrently
    const gamePromises = [];
    for (let i = 0; i < concurrency; i++) {
      const playerIndex1 = i * 2;
      const playerIndex2 = i * 2 + 1;
      
      gamePromises.push(
        gameHelper.createAndJoinGame(pages[playerIndex1], pages[playerIndex2], '0.1')
      );
    }

    await Promise.all(gamePromises);

    const setupTime = Date.now() - startTime;

    // Verify all games are active
    for (let i = 0; i < concurrency * 2; i++) {
      await expect(pages[i].locator('[data-testid="game-status"]')).toHaveText('Active');
    }

    // Make concurrent moves
    const moveStartTime = Date.now();
    const movePromises = [];
    
    for (let i = 0; i < concurrency; i++) {
      const playerIndex1 = i * 2;
      const targetPlayerId = users[i * 2 + 1].id;
      
      movePromises.push(
        gameHelper.makeMove(pages[playerIndex1], 'attack', targetPlayerId)
      );
    }

    await Promise.all(movePromises);
    const moveTime = Date.now() - moveStartTime;

    // Performance assertions
    expect(setupTime).toBeLessThan(10000); // Setup within 10 seconds
    expect(moveTime).toBeLessThan(5000); // Moves within 5 seconds

    // Cleanup
    await Promise.all(contexts.map(ctx => ctx.close()));
  });
});