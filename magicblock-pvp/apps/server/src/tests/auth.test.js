const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Server = require('../server');
const { Player } = require('../database/models');

// Mock database models
jest.mock('../database/models');
jest.mock('../utils/redis');

describe('Auth API', () => {
  let app;
  let server;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';
    
    server = new Server();
    await server.initialize();
    app = server.app;
  });

  afterAll(async () => {
    if (server) {
      await server.shutdown();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    const validRegistrationData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      walletAddress: 'So11111111111111111111111111111111111111112'
    };

    it('should register a new user successfully', async () => {
      // Mock database calls
      Player.findByEmail.mockResolvedValue(null);
      Player.findByUsername.mockResolvedValue(null);
      Player.create.mockResolvedValue('user-id-123');

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.player.username).toBe('testuser');
      expect(Player.create).toHaveBeenCalledWith(expect.objectContaining({
        username: 'testuser',
        email: 'test@example.com',
        walletAddress: 'So11111111111111111111111111111111111111112'
      }));
    });

    it('should reject registration with invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...validRegistrationData,
          email: 'invalid-email'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });

    it('should reject registration with short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...validRegistrationData,
          password: '123'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });

    it('should reject registration if email already exists', async () => {
      Player.findByEmail.mockResolvedValue({ id: 'existing-user' });

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('User Already Exists');
    });

    it('should reject registration if username already exists', async () => {
      Player.findByEmail.mockResolvedValue(null);
      Player.findByUsername.mockResolvedValue({ id: 'existing-user' });

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistrationData);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Username Taken');
    });
  });

  describe('POST /api/auth/login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'password123'
    };

    it('should login successfully with valid credentials', async () => {
      const mockPlayer = {
        id: 'user-id-123',
        username: 'testuser',
        email: 'test@example.com',
        password: await bcrypt.hash('password123', 12),
        walletAddress: 'So11111111111111111111111111111111111111112',
        eloRating: 1200,
        isVerified: true,
        stats: {}
      };

      Player.findByEmail.mockResolvedValue(mockPlayer);
      Player.updateLastLogin.mockResolvedValue();

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLoginData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.player.username).toBe('testuser');
      expect(Player.updateLastLogin).toHaveBeenCalledWith('user-id-123');
    });

    it('should reject login with invalid email', async () => {
      Player.findByEmail.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLoginData);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication Failed');
    });

    it('should reject login with invalid password', async () => {
      const mockPlayer = {
        id: 'user-id-123',
        password: await bcrypt.hash('different-password', 12)
      };

      Player.findByEmail.mockResolvedValue(mockPlayer);

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLoginData);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication Failed');
    });

    it('should reject login with invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: 'password123'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });
  });

  describe('POST /api/auth/verify-wallet', () => {
    const validWalletVerification = {
      walletAddress: 'So11111111111111111111111111111111111111112',
      signature: 'mock-signature',
      message: 'Verify wallet ownership'
    };

    it('should verify wallet successfully', async () => {
      const mockPlayer = {
        id: 'user-id-123',
        username: 'testuser',
        walletAddress: 'So11111111111111111111111111111111111111112',
        isVerified: false
      };

      Player.findByWalletAddress.mockResolvedValue(mockPlayer);
      Player.verifyWallet.mockResolvedValue();

      const response = await request(app)
        .post('/api/auth/verify-wallet')
        .send(validWalletVerification);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.player.isVerified).toBe(true);
      expect(Player.verifyWallet).toHaveBeenCalledWith('user-id-123');
    });

    it('should reject verification for non-existent wallet', async () => {
      Player.findByWalletAddress.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/verify-wallet')
        .send(validWalletVerification);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Player Not Found');
    });

    it('should reject verification with missing signature', async () => {
      const response = await request(app)
        .post('/api/auth/verify-wallet')
        .send({
          walletAddress: 'So11111111111111111111111111111111111111112',
          message: 'Verify wallet ownership'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const mockPlayer = {
        id: 'user-id-123',
        walletAddress: 'So11111111111111111111111111111111111111112'
      };

      // Create a valid refresh token
      const refreshToken = jwt.sign(
        { playerId: 'user-id-123' },
        process.env.JWT_REFRESH_SECRET || 'refresh-secret',
        { expiresIn: '30d' }
      );

      Player.findById.mockResolvedValue(mockPlayer);

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
    });

    it('should reject refresh with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid Token');
    });

    it('should reject refresh with missing token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No Refresh Token');
    });
  });

  describe('Authentication Middleware', () => {
    let validToken;

    beforeEach(() => {
      validToken = jwt.sign(
        { playerId: 'user-id-123' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
    });

    it('should allow access with valid token', async () => {
      const mockPlayer = {
        id: 'user-id-123',
        username: 'testuser',
        status: 'active'
      };

      Player.findById.mockResolvedValue(mockPlayer);

      const response = await request(app)
        .get('/api/players/profile')
        .set('Authorization', `Bearer ${validToken}`);

      // Should not be 401 Unauthorized
      expect(response.status).not.toBe(401);
    });

    it('should reject access without token', async () => {
      const response = await request(app)
        .get('/api/players/profile');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Access Denied');
    });

    it('should reject access with invalid token', async () => {
      const response = await request(app)
        .get('/api/players/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Access Denied');
    });

    it('should reject access for banned players', async () => {
      const mockPlayer = {
        id: 'user-id-123',
        username: 'testuser',
        status: 'banned'
      };

      Player.findById.mockResolvedValue(mockPlayer);

      const response = await request(app)
        .get('/api/players/profile')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Account Banned');
    });
  });
});