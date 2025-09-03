/**
 * End-to-End Tests with Cypress
 * Tests complete user journeys and game flows
 */

describe('SOL Duel Game - Complete Game Flow', () => {
  beforeEach(() => {
    // Setup test environment
    cy.task('db:seed');
    cy.task('blockchain:reset');
    
    // Mock wallet connection
    cy.window().then((win) => {
      win.solana = {
        isPhantom: true,
        connect: cy.stub().resolves({
          publicKey: new win.PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9')
        }),
        signMessage: cy.stub().resolves(new Uint8Array(64)),
        signTransaction: cy.stub().resolves({})
      };
    });
  });

  describe('User Onboarding Flow', () => {
    it('should complete first-time user registration', () => {
      cy.visit('/');
      
      // Landing page
      cy.get('[data-testid="connect-wallet-btn"]').should('be.visible');
      cy.get('[data-testid="game-title"]').should('contain', 'SOL Duel');
      
      // Connect wallet
      cy.get('[data-testid="connect-wallet-btn"]').click();
      cy.get('[data-testid="wallet-modal"]').should('be.visible');
      cy.get('[data-testid="phantom-wallet-option"]').click();
      
      // Wallet connection simulation
      cy.wait(1000);
      cy.get('[data-testid="wallet-connected"]').should('be.visible');
      
      // First-time user setup
      cy.get('[data-testid="username-input"]').type('CypressTestUser');
      cy.get('[data-testid="player-class-warrior"]').click();
      cy.get('[data-testid="complete-setup-btn"]').click();
      
      // Should redirect to lobby
      cy.url().should('include', '/lobby');
      cy.get('[data-testid="user-profile"]').should('contain', 'CypressTestUser');
    });

    it('should handle returning user login', () => {
      // Pre-seed with existing user
      cy.task('db:createUser', {
        wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
        username: 'ExistingUser',
        playerClass: 'mage'
      });

      cy.visit('/');
      cy.get('[data-testid="connect-wallet-btn"]').click();
      cy.get('[data-testid="phantom-wallet-option"]').click();
      
      // Should skip setup and go straight to lobby
      cy.url().should('include', '/lobby');
      cy.get('[data-testid="user-profile"]').should('contain', 'ExistingUser');
    });
  });

  describe('Match Creation and Joining', () => {
    beforeEach(() => {
      // Login as test user
      cy.loginAsTestUser();
      cy.visit('/lobby');
    });

    it('should create and join a match successfully', () => {
      // Create match
      cy.get('[data-testid="create-match-btn"]').click();
      cy.get('[data-testid="create-match-modal"]').should('be.visible');
      
      cy.get('[data-testid="max-players-input"]').clear().type('2');
      cy.get('[data-testid="entry-fee-input"]').clear().type('0.1');
      cy.get('[data-testid="turn-timeout-input"]').clear().type('60');
      
      cy.get('[data-testid="confirm-create-match"]').click();
      
      // Should see match in lobby
      cy.get('[data-testid="match-card"]').should('be.visible');
      cy.get('[data-testid="match-creator"]').should('contain', 'CypressTestUser');
      cy.get('[data-testid="match-players"]').should('contain', '1/2 players');
      
      // Open new tab as second player
      cy.window().then((win) => {
        const newWindow = win.open('/lobby', '_blank');
        cy.wrap(newWindow).as('player2Window');
      });

      // Switch to second player context
      cy.get('@player2Window').then((win) => {
        cy.wrap(win).its('document').then((doc) => {
          // Login as second player
          cy.task('createSecondTestUser').then((user2) => {
            // Simulate login for second player
            cy.wrap(doc).find('[data-testid="connect-wallet-btn"]').click();
            
            // Join the match
            cy.wrap(doc).find('[data-testid="join-match-btn"]').first().click();
            cy.wrap(doc).find('[data-testid="confirm-join"]').click();
          });
        });
      });

      // Back to first player - match should start
      cy.get('[data-testid="match-status"]').should('contain', 'In Progress', { timeout: 10000 });
      cy.url().should('include', '/game');
    });

    it('should handle match filtering and sorting', () => {
      // Create multiple matches with different configurations
      cy.task('db:createMultipleMatches');
      
      cy.visit('/lobby');
      
      // Test filtering
      cy.get('[data-testid="filter-status"]').select('waiting');
      cy.get('[data-testid="match-card"]').each(($card) => {
        cy.wrap($card).find('[data-testid="match-status"]').should('contain', 'Waiting');
      });
      
      // Test sorting
      cy.get('[data-testid="sort-by"]').select('entryFee');
      cy.get('[data-testid="match-entry-fee"]').then(($fees) => {
        const fees = $fees.toArray().map(el => parseFloat(el.textContent?.replace(' SOL', '') || '0'));
        expect(fees).to.deep.equal([...fees].sort((a, b) => b - a));
      });
    });
  });

  describe('Game Combat Flow', () => {
    beforeEach(() => {
      cy.setupGameInProgress();
    });

    it('should complete a full combat sequence', () => {
      cy.visit('/game/test-match-id');
      
      // Verify game state
      cy.get('[data-testid="game-board"]').should('be.visible');
      cy.get('[data-testid="player1-health"]').should('be.visible');
      cy.get('[data-testid="player2-health"]').should('be.visible');
      cy.get('[data-testid="turn-indicator"]').should('be.visible');
      
      // Execute first turn
      cy.get('[data-testid="action-attack"]').click();
      cy.get('[data-testid="target-player2"]').click();
      cy.get('[data-testid="power-slider"]').invoke('val', 75).trigger('change');
      cy.get('[data-testid="confirm-action"]').click();
      
      // Should see action result
      cy.get('[data-testid="combat-log"]').should('contain', 'Attack dealt');
      cy.get('[data-testid="player2-health"]').should('not.contain', '100');
      
      // Turn should change
      cy.get('[data-testid="turn-indicator"]').should('contain', 'Opponent Turn');
      cy.get('[data-testid="action-buttons"]').should('be.disabled');
      
      // Simulate opponent turn (via WebSocket)
      cy.window().its('gameSocket').then((socket) => {
        socket.emit('execute_combat_action', {
          matchId: 'test-match-id',
          action: {
            type: 'defend',
            power: 50
          }
        });
      });
      
      // Should be player's turn again
      cy.get('[data-testid="turn-indicator"]').should('contain', 'Your Turn');
      cy.get('[data-testid="action-buttons"]').should('be.enabled');
    });

    it('should handle special abilities and critical hits', () => {
      cy.visit('/game/test-match-id');
      
      // Use special ability
      cy.get('[data-testid="action-special"]').click();
      cy.get('[data-testid="ability-list"]').should('be.visible');
      cy.get('[data-testid="ability-fireball"]').click();
      cy.get('[data-testid="target-player2"]').click();
      cy.get('[data-testid="confirm-action"]').click();
      
      // Should consume mana
      cy.get('[data-testid="player1-mana"]').should('not.contain', '100');
      
      // Check for critical hit indicator
      cy.get('[data-testid="combat-log"]').then(($log) => {
        if ($log.text().includes('Critical Hit!')) {
          cy.get('[data-testid="critical-hit-animation"]').should('be.visible');
        }
      });
    });

    it('should end game when player health reaches zero', () => {
      cy.visit('/game/test-match-id');
      
      // Simulate low health scenario
      cy.task('setPlayerHealth', { playerId: 'player2', health: 10 });
      cy.reload();
      
      // Execute finishing move
      cy.get('[data-testid="action-attack"]').click();
      cy.get('[data-testid="target-player2"]').click();
      cy.get('[data-testid="power-slider"]').invoke('val', 100).trigger('change');
      cy.get('[data-testid="confirm-action"]').click();
      
      // Should show game over
      cy.get('[data-testid="game-over-modal"]', { timeout: 5000 }).should('be.visible');
      cy.get('[data-testid="victory-message"]').should('contain', 'Victory!');
      cy.get('[data-testid="match-rewards"]').should('be.visible');
      cy.get('[data-testid="experience-gained"]').should('be.visible');
      cy.get('[data-testid="rating-change"]').should('be.visible');
    });
  });

  describe('Wallet Integration', () => {
    it('should handle transaction signing for match entry', () => {
      cy.loginAsTestUser();
      cy.visit('/lobby');
      
      // Create match with entry fee
      cy.get('[data-testid="create-match-btn"]').click();
      cy.get('[data-testid="entry-fee-input"]').clear().type('0.5');
      cy.get('[data-testid="confirm-create-match"]').click();
      
      // Should prompt for transaction approval
      cy.get('[data-testid="transaction-modal"]').should('be.visible');
      cy.get('[data-testid="transaction-details"]').should('contain', '0.5 SOL');
      cy.get('[data-testid="approve-transaction"]').click();
      
      // Should show transaction pending
      cy.get('[data-testid="transaction-status"]').should('contain', 'Pending');
      
      // Simulate blockchain confirmation
      cy.task('confirmTransaction', 'test-tx-hash');
      
      // Should show success and create match
      cy.get('[data-testid="transaction-status"]').should('contain', 'Confirmed');
      cy.get('[data-testid="match-card"]').should('be.visible');
    });

    it('should handle insufficient balance gracefully', () => {
      // Mock wallet with low balance
      cy.task('setWalletBalance', { balance: 0.01 });
      
      cy.loginAsTestUser();
      cy.visit('/lobby');
      
      // Try to create expensive match
      cy.get('[data-testid="create-match-btn"]').click();
      cy.get('[data-testid="entry-fee-input"]').clear().type('1.0');
      cy.get('[data-testid="confirm-create-match"]').click();
      
      // Should show insufficient balance error
      cy.get('[data-testid="error-message"]').should('contain', 'Insufficient balance');
      cy.get('[data-testid="create-match-modal"]').should('be.visible'); // Modal should stay open
    });

    it('should handle wallet disconnection during game', () => {
      cy.setupGameInProgress();
      cy.visit('/game/test-match-id');
      
      // Simulate wallet disconnection
      cy.window().then((win) => {
        win.solana = null;
      });
      
      // Trigger action that requires wallet
      cy.get('[data-testid="action-attack"]').click();
      cy.get('[data-testid="confirm-action"]').click();
      
      // Should show wallet connection prompt
      cy.get('[data-testid="wallet-disconnected-modal"]').should('be.visible');
      cy.get('[data-testid="reconnect-wallet-btn"]').should('be.visible');
    });
  });

  describe('Real-time Updates and Synchronization', () => {
    it('should synchronize game state across multiple tabs', () => {
      cy.setupGameInProgress();
      
      // Open game in first tab
      cy.visit('/game/test-match-id');
      cy.get('[data-testid="game-board"]').should('be.visible');
      
      // Open second tab
      cy.window().then((win) => {
        win.open('/game/test-match-id', '_blank');
      });
      
      // Execute action in first tab
      cy.get('[data-testid="action-attack"]').click();
      cy.get('[data-testid="target-player2"]').click();
      cy.get('[data-testid="confirm-action"]').click();
      
      // Both tabs should show the same state
      cy.getAllWindows().each((win) => {
        cy.wrap(win).its('document').then((doc) => {
          cy.wrap(doc).find('[data-testid="combat-log"]').should('contain', 'Attack dealt');
        });
      });
    });

    it('should handle connection drops and reconnection', () => {
      cy.visit('/game/test-match-id');
      
      // Simulate connection drop
      cy.window().its('gameSocket').then((socket) => {
        socket.disconnect();
      });
      
      // Should show connection lost indicator
      cy.get('[data-testid="connection-status"]').should('contain', 'Disconnected');
      cy.get('[data-testid="reconnecting-indicator"]').should('be.visible');
      
      // Simulate reconnection
      cy.wait(3000);
      
      // Should reconnect and sync state
      cy.get('[data-testid="connection-status"]').should('contain', 'Connected');
      cy.get('[data-testid="game-board"]').should('be.visible');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle server errors gracefully', () => {
      cy.intercept('POST', '/api/matches', { statusCode: 500 }).as('serverError');
      
      cy.loginAsTestUser();
      cy.visit('/lobby');
      
      cy.get('[data-testid="create-match-btn"]').click();
      cy.get('[data-testid="confirm-create-match"]').click();
      
      cy.wait('@serverError');
      
      // Should show error message
      cy.get('[data-testid="error-toast"]').should('contain', 'Server error');
      cy.get('[data-testid="create-match-modal"]').should('be.visible');
    });

    it('should validate user input properly', () => {
      cy.loginAsTestUser();
      cy.visit('/lobby');
      
      cy.get('[data-testid="create-match-btn"]').click();
      
      // Test invalid inputs
      cy.get('[data-testid="max-players-input"]').clear().type('0');
      cy.get('[data-testid="confirm-create-match"]').click();
      cy.get('[data-testid="field-error"]').should('contain', 'Must be at least 2');
      
      cy.get('[data-testid="max-players-input"]').clear().type('17');
      cy.get('[data-testid="confirm-create-match"]').click();
      cy.get('[data-testid="field-error"]').should('contain', 'Must be 16 or fewer');
      
      cy.get('[data-testid="entry-fee-input"]').clear().type('-1');
      cy.get('[data-testid="confirm-create-match"]').click();
      cy.get('[data-testid="field-error"]').should('contain', 'Must be positive');
    });

    it('should handle timeout scenarios', () => {
      cy.setupGameInProgress();
      cy.visit('/game/test-match-id');
      
      // Start turn
      cy.get('[data-testid="turn-timer"]').should('be.visible');
      
      // Let timer run out (simulate with task)
      cy.task('simulateTurnTimeout', 'test-match-id');
      
      // Should auto-skip turn
      cy.get('[data-testid="turn-skipped-message"]').should('be.visible');
      cy.get('[data-testid="turn-indicator"]').should('contain', 'Opponent Turn');
    });
  });

  describe('Mobile Responsiveness', () => {
    it('should work correctly on mobile viewport', () => {
      cy.viewport('iphone-8');
      
      cy.loginAsTestUser();
      cy.visit('/lobby');
      
      // Mobile layout should be active
      cy.get('[data-testid="mobile-menu-toggle"]').should('be.visible');
      cy.get('[data-testid="desktop-sidebar"]').should('not.be.visible');
      
      // Create match on mobile
      cy.get('[data-testid="create-match-btn"]').click();
      cy.get('[data-testid="create-match-modal"]').should('be.visible');
      
      // Form should be mobile-optimized
      cy.get('[data-testid="mobile-form-layout"]').should('be.visible');
      
      // Game should work on mobile
      cy.setupGameInProgress();
      cy.visit('/game/test-match-id');
      
      cy.get('[data-testid="mobile-game-interface"]').should('be.visible');
      cy.get('[data-testid="action-buttons"]').should('be.visible');
    });
  });

  describe('Performance Tests', () => {
    it('should load lobby within performance budget', () => {
      cy.loginAsTestUser();
      
      const start = performance.now();
      cy.visit('/lobby');
      cy.get('[data-testid="match-list"]').should('be.visible');
      
      cy.window().then(() => {
        const loadTime = performance.now() - start;
        expect(loadTime).to.be.below(3000); // Should load within 3 seconds
      });
    });

    it('should handle large numbers of matches efficiently', () => {
      cy.task('createManyMatches', 100);
      
      cy.loginAsTestUser();
      cy.visit('/lobby');
      
      // Should render with virtual scrolling
      cy.get('[data-testid="virtual-match-list"]').should('be.visible');
      cy.get('[data-testid="match-card"]').should('have.length.at.most', 20); // Only render visible items
      
      // Scrolling should work smoothly
      cy.get('[data-testid="match-list"]').scrollTo('bottom');
      cy.get('[data-testid="match-card"]').should('be.visible'); // More items loaded
    });
  });

  describe('Accessibility', () => {
    it('should be navigable with keyboard only', () => {
      cy.loginAsTestUser();
      cy.visit('/lobby');
      
      // Tab navigation
      cy.get('body').tab();
      cy.focused().should('have.attr', 'data-testid', 'create-match-btn');
      
      cy.focused().tab();
      cy.focused().should('have.attr', 'data-testid', 'filter-dropdown');
      
      // Enter should activate buttons
      cy.get('[data-testid="create-match-btn"]').focus();
      cy.focused().type('{enter}');
      cy.get('[data-testid="create-match-modal"]').should('be.visible');
      
      // Escape should close modals
      cy.focused().type('{esc}');
      cy.get('[data-testid="create-match-modal"]').should('not.exist');
    });

    it('should have proper ARIA labels and announcements', () => {
      cy.loginAsTestUser();
      cy.visit('/lobby');
      
      cy.get('[data-testid="match-list"]').should('have.attr', 'aria-label', 'Available matches');
      cy.get('[data-testid="create-match-btn"]').should('have.attr', 'aria-describedby');
      
      // Screen reader announcements
      cy.get('[data-testid="sr-announcements"]').should('exist');
      
      // High contrast mode
      cy.get('body').should('have.css', 'color-scheme', 'light');
      
      // Focus indicators
      cy.get('[data-testid="create-match-btn"]').focus();
      cy.focused().should('have.css', 'outline-width').and('not.equal', '0px');
    });
  });
});

// Custom Cypress commands for this test suite
Cypress.Commands.add('loginAsTestUser', () => {
  cy.window().then((win) => {
    win.localStorage.setItem('authToken', 'test-auth-token');
    win.localStorage.setItem('userProfile', JSON.stringify({
      id: 'test-user-id',
      username: 'CypressTestUser',
      wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
      playerClass: 'warrior',
      level: 5,
      rating: 1200
    }));
  });
});

Cypress.Commands.add('setupGameInProgress', () => {
  cy.task('db:createMatchInProgress', {
    id: 'test-match-id',
    players: [
      { id: 'test-user-id', username: 'CypressTestUser' },
      { id: 'opponent-id', username: 'OpponentUser' }
    ],
    status: 'in_progress'
  });
});

Cypress.Commands.add('getAllWindows', () => {
  return cy.window().then((win) => {
    return [win, ...Object.values(win.open.history || {})];
  });
});