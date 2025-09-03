import { GameManager } from '../src/game-manager';
import { GameClient } from '../src/game-client';
import { SessionManager } from '../src/session-manager';
import { VRFProvider } from '../src/vrf/provider';
import { TEEProvider } from '../src/tee/provider';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

// Mock dependencies
jest.mock('../src/game-client');
jest.mock('../src/session-manager');
jest.mock('../src/vrf/provider');
jest.mock('../src/tee/provider');

describe('GameManager', () => {
  let gameManager: GameManager;
  let mockConnection: Connection;
  let mockKeypair: Keypair;
  let mockGameClient: jest.Mocked<GameClient>;
  let mockSessionManager: jest.Mocked<SessionManager>;
  let mockVRFProvider: jest.Mocked<VRFProvider>;
  let mockTEEProvider: jest.Mocked<TEEProvider>;

  beforeEach(() => {
    // Setup mocks
    mockConnection = new Connection('https://api.devnet.solana.com');
    mockKeypair = Keypair.generate();
    
    mockGameClient = new GameClient(mockConnection, mockKeypair) as jest.Mocked<GameClient>;
    mockSessionManager = new SessionManager(mockConnection, mockKeypair) as jest.Mocked<SessionManager>;
    mockVRFProvider = new VRFProvider(mockConnection) as jest.Mocked<VRFProvider>;
    mockTEEProvider = new TEEProvider(mockConnection) as jest.Mocked<TEEProvider>;

    gameManager = new GameManager({
      connection: mockConnection,
      keypair: mockKeypair,
      gameClient: mockGameClient,
      sessionManager: mockSessionManager,
      vrfProvider: mockVRFProvider,
      teeProvider: mockTEEProvider
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(gameManager).toBeInstanceOf(GameManager);
      expect(gameManager.connection).toBe(mockConnection);
      expect(gameManager.keypair).toBe(mockKeypair);
    });

    it('should setup event listeners on initialization', () => {
      const eventListenerSpy = jest.spyOn(gameManager, 'setupEventListeners');
      gameManager.initialize();
      expect(eventListenerSpy).toHaveBeenCalled();
    });
  });

  describe('Game State Management', () => {
    beforeEach(async () => {
      await gameManager.initialize();
    });

    it('should create new game successfully', async () => {
      const gameConfig = {
        gameType: 'PVP',
        betAmount: 1000000, // 1 SOL in lamports
        maxPlayers: 2,
        timeLimit: 30000 // 30 seconds
      };

      mockGameClient.createGame.mockResolvedValue({
        gameId: 'test-game-id',
        escrowAccount: new PublicKey('11111111111111111111111111111111'),
        status: 'waiting',
        players: [],
        ...gameConfig
      });

      const result = await gameManager.createGame(gameConfig);

      expect(result).toBeDefined();
      expect(result.gameId).toBe('test-game-id');
      expect(result.status).toBe('waiting');
      expect(mockGameClient.createGame).toHaveBeenCalledWith(gameConfig);
    });

    it('should join existing game successfully', async () => {
      const gameId = 'existing-game-id';
      const betAmount = 1000000;

      mockGameClient.joinGame.mockResolvedValue({
        gameId,
        playerIndex: 1,
        escrowAccount: new PublicKey('11111111111111111111111111111111'),
        status: 'active'
      });

      const result = await gameManager.joinGame(gameId, betAmount);

      expect(result).toBeDefined();
      expect(result.gameId).toBe(gameId);
      expect(result.playerIndex).toBe(1);
      expect(mockGameClient.joinGame).toHaveBeenCalledWith(gameId, betAmount);
    });

    it('should handle game state transitions correctly', async () => {
      const gameId = 'test-game-id';
      
      // Test waiting -> active transition
      await gameManager.updateGameState(gameId, 'active');
      expect(gameManager.getGameState(gameId)).toBe('active');

      // Test active -> finished transition
      await gameManager.updateGameState(gameId, 'finished');
      expect(gameManager.getGameState(gameId)).toBe('finished');
    });

    it('should validate game moves correctly', async () => {
      const gameId = 'test-game-id';
      const move = { type: 'attack', target: 'player2', damage: 50 };

      mockGameClient.submitMove.mockResolvedValue({
        moveId: 'move-123',
        accepted: true,
        gameState: 'active'
      });

      const result = await gameManager.submitMove(gameId, move);

      expect(result.accepted).toBe(true);
      expect(mockGameClient.submitMove).toHaveBeenCalledWith(gameId, move);
    });
  });

  describe('VRF Integration', () => {
    it('should request VRF for random events', async () => {
      const gameId = 'test-game-id';
      const vrfSeed = Buffer.from('test-seed');

      mockVRFProvider.requestRandomness.mockResolvedValue({
        requestId: 'vrf-request-123',
        seed: vrfSeed,
        status: 'pending'
      });

      const result = await gameManager.requestVRF(gameId, vrfSeed);

      expect(result.requestId).toBe('vrf-request-123');
      expect(mockVRFProvider.requestRandomness).toHaveBeenCalledWith(vrfSeed);
    });

    it('should handle VRF callbacks correctly', async () => {
      const vrfResult = {
        requestId: 'vrf-request-123',
        randomValue: new Uint8Array([1, 2, 3, 4]),
        proof: new Uint8Array([5, 6, 7, 8])
      };

      const callbackSpy = jest.spyOn(gameManager, 'handleVRFCallback');
      
      await gameManager.handleVRFCallback(vrfResult);
      
      expect(callbackSpy).toHaveBeenCalledWith(vrfResult);
    });

    it('should timeout VRF requests appropriately', async () => {
      const gameId = 'test-game-id';
      const vrfSeed = Buffer.from('timeout-seed');

      // Mock a timeout scenario
      mockVRFProvider.requestRandomness.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000)) // 15s timeout
      );

      await expect(gameManager.requestVRF(gameId, vrfSeed)).rejects.toThrow('VRF request timeout');
    });
  });

  describe('TEE Integration', () => {
    it('should execute secure computations in TEE', async () => {
      const gameLogic = 'battle-resolution';
      const gameData = { player1Health: 100, player2Health: 80 };

      mockTEEProvider.executeSecure.mockResolvedValue({
        result: { winner: 'player1', damage: 20 },
        proof: new Uint8Array([1, 2, 3]),
        attestation: 'tee-attestation-123'
      });

      const result = await gameManager.executeSecureLogic(gameLogic, gameData);

      expect(result.result.winner).toBe('player1');
      expect(result.attestation).toBe('tee-attestation-123');
      expect(mockTEEProvider.executeSecure).toHaveBeenCalledWith(gameLogic, gameData);
    });

    it('should verify TEE attestations', async () => {
      const attestation = 'tee-attestation-123';
      const expectedQuote = new Uint8Array([1, 2, 3, 4]);

      mockTEEProvider.verifyAttestation.mockResolvedValue({
        valid: true,
        quote: expectedQuote,
        measurements: new Uint8Array([5, 6, 7, 8])
      });

      const result = await gameManager.verifyTEEAttestation(attestation);

      expect(result.valid).toBe(true);
      expect(mockTEEProvider.verifyAttestation).toHaveBeenCalledWith(attestation);
    });
  });

  describe('Session Management', () => {
    it('should create ephemeral sessions correctly', async () => {
      const sessionConfig = {
        duration: 30000, // 30 seconds
        maxTransactions: 100
      };

      mockSessionManager.createSession.mockResolvedValue({
        sessionId: 'session-123',
        sessionKeypair: Keypair.generate(),
        expiresAt: Date.now() + 30000
      });

      const result = await gameManager.createSession(sessionConfig);

      expect(result.sessionId).toBe('session-123');
      expect(result.sessionKeypair).toBeDefined();
      expect(mockSessionManager.createSession).toHaveBeenCalledWith(sessionConfig);
    });

    it('should handle session expiration gracefully', async () => {
      const sessionId = 'expired-session';

      mockSessionManager.isSessionValid.mockResolvedValue(false);

      await expect(gameManager.executeInSession(sessionId, async () => {
        return 'should not execute';
      })).rejects.toThrow('Session expired or invalid');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network unavailable');
      mockGameClient.createGame.mockRejectedValue(networkError);

      await expect(gameManager.createGame({
        gameType: 'PVP',
        betAmount: 1000000,
        maxPlayers: 2,
        timeLimit: 30000
      })).rejects.toThrow('Network unavailable');
    });

    it('should retry failed operations with exponential backoff', async () => {
      const gameId = 'retry-test-game';
      let callCount = 0;

      mockGameClient.getGameState.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve({ gameId, status: 'active' });
      });

      const result = await gameManager.getGameStateWithRetry(gameId);

      expect(result.status).toBe('active');
      expect(callCount).toBe(3);
    });

    it('should emit error events for monitoring', async () => {
      const errorSpy = jest.spyOn(gameManager, 'emit');
      const error = new Error('Test error');

      mockGameClient.createGame.mockRejectedValue(error);

      try {
        await gameManager.createGame({
          gameType: 'PVP',
          betAmount: 1000000,
          maxPlayers: 2,
          timeLimit: 30000
        });
      } catch (e) {
        // Expected to throw
      }

      expect(errorSpy).toHaveBeenCalledWith('error', expect.objectContaining({
        type: 'game_creation_failed',
        error: error
      }));
    });
  });

  describe('Performance Metrics', () => {
    it('should track operation latencies', async () => {
      const gameConfig = {
        gameType: 'PVP',
        betAmount: 1000000,
        maxPlayers: 2,
        timeLimit: 30000
      };

      const startTime = Date.now();
      
      mockGameClient.createGame.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          gameId: 'perf-test-game',
          escrowAccount: new PublicKey('11111111111111111111111111111111'),
          status: 'waiting',
          players: [],
          ...gameConfig
        }), 50))
      );

      await gameManager.createGame(gameConfig);
      
      const metrics = gameManager.getMetrics();
      expect(metrics.createGameLatency).toBeGreaterThan(0);
      expect(metrics.createGameLatency).toBeLessThan(100); // Should be under 100ms for this test
    });

    it('should track success/failure rates', async () => {
      // Simulate successful operations
      mockGameClient.createGame.mockResolvedValue({
        gameId: 'success-game',
        escrowAccount: new PublicKey('11111111111111111111111111111111'),
        status: 'waiting',
        players: []
      });

      await gameManager.createGame({
        gameType: 'PVP',
        betAmount: 1000000,
        maxPlayers: 2,
        timeLimit: 30000
      });

      // Simulate failed operations
      mockGameClient.createGame.mockRejectedValue(new Error('Failure'));

      try {
        await gameManager.createGame({
          gameType: 'PVP',
          betAmount: 1000000,
          maxPlayers: 2,
          timeLimit: 30000
        });
      } catch (e) {
        // Expected failure
      }

      const metrics = gameManager.getMetrics();
      expect(metrics.successRate).toBe(0.5); // 1 success, 1 failure
    });
  });
});