import { Page } from '@playwright/test';

export interface UserCredentials {
  username: string;
  email: string;
  password?: string;
}

export interface UserData extends UserCredentials {
  id: string;
  token: string;
}

export class UserTestHelper {
  private testUsers: string[] = [];

  /**
   * Create a new user account and log in
   */
  async createAndLoginUser(page: Page, credentials: UserCredentials): Promise<UserData> {
    const password = credentials.password || 'TestPassword123!';
    
    // Navigate to registration page
    await page.goto('/auth/register');
    
    // Fill registration form
    await page.fill('[data-testid="username-input"]', credentials.username);
    await page.fill('[data-testid="email-input"]', credentials.email);
    await page.fill('[data-testid="password-input"]', password);
    await page.fill('[data-testid="confirm-password-input"]', password);
    
    // Submit registration
    await page.click('[data-testid="register-submit"]');
    
    // Wait for registration success or handle email verification
    try {
      // Try to wait for dashboard (direct login)
      await page.waitForURL('/dashboard', { timeout: 5000 });
    } catch {
      // Handle email verification flow
      await this.handleEmailVerification(page, credentials.email);
    }
    
    // Extract user data from the page or local storage
    const userData = await page.evaluate(() => {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return {
        id: user.id,
        token: user.token || localStorage.getItem('authToken')
      };
    });
    
    const user: UserData = {
      ...credentials,
      password,
      id: userData.id || `user_${Date.now()}`,
      token: userData.token || `token_${Date.now()}`
    };
    
    this.testUsers.push(user.id);
    return user;
  }

  /**
   * Login with existing user credentials
   */
  async loginExistingUser(page: Page, username: string, password: string): Promise<UserData> {
    // Navigate to login page
    await page.goto('/auth/login');
    
    // Fill login form
    await page.fill('[data-testid="username-input"]', username);
    await page.fill('[data-testid="password-input"]', password);
    
    // Submit login
    await page.click('[data-testid="login-submit"]');
    
    // Wait for successful login
    await page.waitForURL('/dashboard');
    
    // Extract user data
    const userData = await page.evaluate(() => {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        token: user.token || localStorage.getItem('authToken')
      };
    });
    
    return {
      username: userData.username || username,
      email: userData.email || `${username}@test.com`,
      id: userData.id,
      token: userData.token
    };
  }

  /**
   * Logout current user
   */
  async logoutUser(page: Page): Promise<void> {
    try {
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-btn"]');
      
      // Wait for redirect to login page
      await page.waitForURL('/auth/login');
    } catch (error) {
      // If logout button not found, clear storage directly
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      
      await page.goto('/auth/login');
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(page: Page, updates: Partial<UserCredentials>): Promise<void> {
    await page.goto('/profile');
    
    if (updates.username) {
      await page.fill('[data-testid="profile-username"]', updates.username);
    }
    
    if (updates.email) {
      await page.fill('[data-testid="profile-email"]', updates.email);
    }
    
    await page.click('[data-testid="save-profile"]');
    
    // Wait for success message
    await page.waitForSelector('[data-testid="profile-success"]');
  }

  /**
   * Change user password
   */
  async changePassword(page: Page, oldPassword: string, newPassword: string): Promise<void> {
    await page.goto('/profile/security');
    
    await page.fill('[data-testid="current-password"]', oldPassword);
    await page.fill('[data-testid="new-password"]', newPassword);
    await page.fill('[data-testid="confirm-new-password"]', newPassword);
    
    await page.click('[data-testid="change-password"]');
    
    // Wait for success message
    await page.waitForSelector('[data-testid="password-changed"]');
  }

  /**
   * Get user balance/wallet info
   */
  async getUserBalance(page: Page): Promise<{
    sol: number;
    tokens: Record<string, number>;
  }> {
    await page.goto('/wallet');
    
    const balanceText = await page.textContent('[data-testid="sol-balance"]');
    const solBalance = parseFloat(balanceText?.replace(' SOL', '') || '0');
    
    // Get token balances
    const tokenElements = await page.locator('[data-testid="token-balance"]').all();
    const tokens: Record<string, number> = {};
    
    for (const element of tokenElements) {
      const tokenText = await element.textContent();
      const [amount, symbol] = (tokenText || '').split(' ');
      tokens[symbol] = parseFloat(amount || '0');
    }
    
    return {
      sol: solBalance,
      tokens
    };
  }

  /**
   * Add funds to user wallet (test environment)
   */
  async addTestFunds(page: Page, amount: number): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Test funds can only be added in test environment');
    }
    
    await page.goto('/wallet');
    await page.click('[data-testid="add-test-funds"]');
    await page.fill('[data-testid="fund-amount"]', amount.toString());
    await page.click('[data-testid="confirm-add-funds"]');
    
    // Wait for balance update
    await page.waitForSelector('[data-testid="funds-added"]');
  }

  /**
   * Connect external wallet
   */
  async connectWallet(page: Page, walletType: 'phantom' | 'solflare' | 'metamask'): Promise<void> {
    await page.goto('/wallet');
    
    await page.click('[data-testid="connect-wallet"]');
    await page.click(`[data-testid="connect-${walletType}"]`);
    
    // Handle wallet connection popup (would need to be mocked in tests)
    await page.waitForSelector('[data-testid="wallet-connected"]');
  }

  /**
   * Get user game history
   */
  async getUserGameHistory(page: Page): Promise<Array<{
    gameId: string;
    status: string;
    betAmount: number;
    result?: 'won' | 'lost' | 'draw';
    createdAt: string;
  }>> {
    await page.goto('/profile/games');
    
    const gameRows = await page.locator('[data-testid="game-history-row"]').all();
    const games = [];
    
    for (const row of gameRows) {
      const gameId = await row.getAttribute('data-game-id') || '';
      const status = await row.locator('[data-testid="game-status"]').textContent() || '';
      const betAmount = parseFloat(
        await row.locator('[data-testid="bet-amount"]').textContent() || '0'
      );
      const result = await row.locator('[data-testid="game-result"]').textContent() as any;
      const createdAt = await row.locator('[data-testid="created-at"]').textContent() || '';
      
      games.push({
        gameId,
        status,
        betAmount,
        result: result === 'Won' ? 'won' : result === 'Lost' ? 'lost' : undefined,
        createdAt
      });
    }
    
    return games;
  }

  /**
   * Get user stats/achievements
   */
  async getUserStats(page: Page): Promise<{
    gamesPlayed: number;
    gamesWon: number;
    totalWinnings: number;
    winRate: number;
    achievements: string[];
  }> {
    await page.goto('/profile/stats');
    
    const gamesPlayed = parseInt(
      await page.textContent('[data-testid="games-played"]') || '0'
    );
    const gamesWon = parseInt(
      await page.textContent('[data-testid="games-won"]') || '0'
    );
    const totalWinnings = parseFloat(
      await page.textContent('[data-testid="total-winnings"]') || '0'
    );
    const winRate = parseFloat(
      await page.textContent('[data-testid="win-rate"]') || '0'
    );
    
    const achievementElements = await page.locator('[data-testid="achievement"]').all();
    const achievements = [];
    
    for (const element of achievementElements) {
      const achievement = await element.textContent();
      if (achievement) {
        achievements.push(achievement);
      }
    }
    
    return {
      gamesPlayed,
      gamesWon,
      totalWinnings,
      winRate,
      achievements
    };
  }

  /**
   * Handle email verification flow
   */
  private async handleEmailVerification(page: Page, email: string): Promise<void> {
    // Wait for verification page
    await page.waitForSelector('[data-testid="email-verification"]');
    
    // In test environment, we might auto-verify or use a test verification code
    if (process.env.NODE_ENV === 'test') {
      const testCode = '123456'; // Mock verification code
      await page.fill('[data-testid="verification-code"]', testCode);
      await page.click('[data-testid="verify-email"]');
      
      // Wait for verification success
      await page.waitForURL('/dashboard');
    } else {
      throw new Error('Email verification required - not supported in test environment');
    }
  }

  /**
   * Generate random user credentials
   */
  generateRandomUser(): UserCredentials {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    
    return {
      username: `testuser_${timestamp}_${random}`,
      email: `test_${timestamp}_${random}@example.com`,
      password: 'TestPassword123!'
    };
  }

  /**
   * Create multiple test users in parallel
   */
  async createMultipleUsers(
    pages: Page[], 
    count: number
  ): Promise<UserData[]> {
    const userPromises = pages.slice(0, count).map(async (page, index) => {
      const credentials = this.generateRandomUser();
      credentials.username = `${credentials.username}_${index}`;
      
      return this.createAndLoginUser(page, credentials);
    });
    
    return Promise.all(userPromises);
  }

  /**
   * Simulate user behavior patterns
   */
  async simulateUserBehavior(
    page: Page,
    behavior: 'casual' | 'aggressive' | 'conservative'
  ): Promise<void> {
    switch (behavior) {
      case 'casual':
        // Casual player: longer delays, fewer games
        await page.waitForTimeout(2000 + Math.random() * 3000);
        break;
      
      case 'aggressive':
        // Aggressive player: quick actions, multiple games
        await page.waitForTimeout(200 + Math.random() * 800);
        break;
      
      case 'conservative':
        // Conservative player: careful decisions, research
        await page.hover('[data-testid="game-rules"]'); // Read rules
        await page.waitForTimeout(5000 + Math.random() * 5000);
        break;
    }
  }

  /**
   * Test user input validation
   */
  async testInputValidation(page: Page): Promise<{
    usernameErrors: string[];
    emailErrors: string[];
    passwordErrors: string[];
  }> {
    await page.goto('/auth/register');
    
    const results = {
      usernameErrors: [] as string[],
      emailErrors: [] as string[],
      passwordErrors: [] as string[]
    };
    
    // Test invalid username
    const invalidUsernames = ['', 'ab', 'user@name', 'very-long-username-that-exceeds-limits'];
    
    for (const username of invalidUsernames) {
      await page.fill('[data-testid="username-input"]', username);
      await page.blur('[data-testid="username-input"]');
      
      const error = await page.textContent('[data-testid="username-error"]');
      if (error) {
        results.usernameErrors.push(error);
      }
    }
    
    // Test invalid emails
    const invalidEmails = ['', 'invalid', 'test@', '@domain.com'];
    
    for (const email of invalidEmails) {
      await page.fill('[data-testid="email-input"]', email);
      await page.blur('[data-testid="email-input"]');
      
      const error = await page.textContent('[data-testid="email-error"]');
      if (error) {
        results.emailErrors.push(error);
      }
    }
    
    // Test invalid passwords
    const invalidPasswords = ['', '123', 'password', 'NoNumbers!'];
    
    for (const password of invalidPasswords) {
      await page.fill('[data-testid="password-input"]', password);
      await page.blur('[data-testid="password-input"]');
      
      const error = await page.textContent('[data-testid="password-error"]');
      if (error) {
        results.passwordErrors.push(error);
      }
    }
    
    return results;
  }

  /**
   * Cleanup all test users
   */
  async cleanup(): Promise<void> {
    // In a real implementation, this would call an API to cleanup test users
    console.log(`Cleaning up ${this.testUsers.length} test users`);
    this.testUsers = [];
  }

  /**
   * Mock user authentication for faster testing
   */
  async mockAuthentication(page: Page, user: UserData): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Mock authentication only available in test environment');
    }
    
    // Set authentication data directly in browser storage
    await page.evaluate((userData) => {
      localStorage.setItem('user', JSON.stringify({
        id: userData.id,
        username: userData.username,
        email: userData.email
      }));
      localStorage.setItem('authToken', userData.token);
    }, user);
    
    // Navigate to dashboard
    await page.goto('/dashboard');
    
    // Verify authentication worked
    await page.waitForSelector('[data-testid="user-profile"]');
  }
}