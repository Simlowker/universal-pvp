const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const { Connection, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const nacl = require('tweetnacl');

const { Player } = require('../database/models');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  walletAddress: Joi.string().required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const walletVerifySchema = Joi.object({
  walletAddress: Joi.string().required(),
  signature: Joi.string().required(),
  message: Joi.string().required()
});

// Register new player
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }

    const { username, email, password, walletAddress } = value;

    // Check if user already exists
    const existingUser = await Player.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        error: 'User Already Exists',
        message: 'A user with this email already exists'
      });
    }

    // Check if username is taken
    const existingUsername = await Player.findByUsername(username);
    if (existingUsername) {
      return res.status(409).json({
        error: 'Username Taken',
        message: 'This username is already taken'
      });
    }

    // Validate Solana wallet address
    try {
      new PublicKey(walletAddress);
    } catch (err) {
      return res.status(400).json({
        error: 'Invalid Wallet',
        message: 'Invalid Solana wallet address'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create new player
    const playerId = await Player.create({
      username,
      email,
      password: hashedPassword,
      walletAddress,
      eloRating: 1200, // Starting ELO rating
      isVerified: false
    });

    // Generate JWT token
    const token = jwt.sign(
      { playerId, walletAddress },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    logger.info(`New player registered: ${username} (${email})`);

    res.status(201).json({
      success: true,
      message: 'Player registered successfully',
      token,
      player: {
        id: playerId,
        username,
        email,
        walletAddress,
        eloRating: 1200,
        isVerified: false
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to register player'
    });
  }
});

// Login player
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }

    const { email, password } = value;

    // Find player by email
    const player = await Player.findByEmail(email);
    if (!player) {
      return res.status(401).json({
        error: 'Authentication Failed',
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, player.password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Authentication Failed',
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { playerId: player.id, walletAddress: player.walletAddress },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Update last login
    await Player.updateLastLogin(player.id);

    logger.info(`Player logged in: ${player.username} (${email})`);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      player: {
        id: player.id,
        username: player.username,
        email: player.email,
        walletAddress: player.walletAddress,
        eloRating: player.eloRating,
        isVerified: player.isVerified,
        stats: player.stats
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to login'
    });
  }
});

// Verify wallet signature
router.post('/verify-wallet', async (req, res) => {
  try {
    const { error, value } = walletVerifySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }

    const { walletAddress, signature, message } = value;

    // Verify the signature
    try {
      const publicKey = new PublicKey(walletAddress);
      const signatureBuffer = bs58.decode(signature);
      const messageBuffer = new TextEncoder().encode(message);
      
      const isValid = nacl.sign.detached.verify(
        messageBuffer,
        signatureBuffer,
        publicKey.toBuffer()
      );

      if (!isValid) {
        return res.status(400).json({
          error: 'Invalid Signature',
          message: 'Wallet signature verification failed'
        });
      }

      // Find player by wallet address
      const player = await Player.findByWalletAddress(walletAddress);
      if (!player) {
        return res.status(404).json({
          error: 'Player Not Found',
          message: 'No player found with this wallet address'
        });
      }

      // Mark wallet as verified
      await Player.verifyWallet(player.id);

      // Generate JWT token
      const token = jwt.sign(
        { playerId: player.id, walletAddress: player.walletAddress },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      logger.info(`Wallet verified for player: ${player.username}`);

      res.json({
        success: true,
        message: 'Wallet verified successfully',
        token,
        player: {
          id: player.id,
          username: player.username,
          walletAddress: player.walletAddress,
          isVerified: true
        }
      });

    } catch (error) {
      logger.error('Signature verification error:', error);
      return res.status(400).json({
        error: 'Verification Error',
        message: 'Invalid signature or wallet address'
      });
    }

  } catch (error) {
    logger.error('Wallet verification error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify wallet'
    });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({
        error: 'No Refresh Token',
        message: 'Refresh token is required'
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const player = await Player.findById(decoded.playerId);
    
    if (!player) {
      return res.status(401).json({
        error: 'Invalid Token',
        message: 'Player not found'
      });
    }

    // Generate new tokens
    const newToken = jwt.sign(
      { playerId: player.id, walletAddress: player.walletAddress },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const newRefreshToken = jwt.sign(
      { playerId: player.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({
      error: 'Invalid Token',
      message: 'Failed to refresh token'
    });
  }
});

module.exports = router;