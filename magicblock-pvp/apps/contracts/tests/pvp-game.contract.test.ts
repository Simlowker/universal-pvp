import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Keypair, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } from '@solana/spl-token';
import { PvpGame } from '../target/types/pvp_game';
import { expect } from 'chai';

describe('PvP Game Contract Tests', () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PvpGame as Program<PvpGame>;
  
  let gameKeypair: Keypair;
  let escrowKeypair: Keypair;
  let player1: Keypair;
  let player2: Keypair;
  let mint: PublicKey;
  let player1TokenAccount: PublicKey;
  let player2TokenAccount: PublicKey;
  let escrowTokenAccount: PublicKey;

  beforeEach(async () => {
    gameKeypair = Keypair.generate();
    escrowKeypair = Keypair.generate();
    player1 = Keypair.generate();
    player2 = Keypair.generate();

    // Airdrop SOL to test accounts
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(player1.publicKey, 2 * LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(player2.publicKey, 2 * LAMPORTS_PER_SOL)
    );

    // Create test token mint
    mint = await createMint(
      provider.connection,
      player1,
      player1.publicKey,
      null,
      9 // 9 decimal places
    );

    // Create token accounts for players and escrow
    player1TokenAccount = await createAccount(
      provider.connection,
      player1,
      mint,
      player1.publicKey
    );

    player2TokenAccount = await createAccount(
      provider.connection,
      player2,
      mint,
      player2.publicKey
    );

    escrowTokenAccount = await createAccount(
      provider.connection,
      player1,
      mint,
      escrowKeypair.publicKey
    );

    // Mint tokens to players
    await mintTo(
      provider.connection,
      player1,
      mint,
      player1TokenAccount,
      player1,
      1000 * LAMPORTS_PER_SOL
    );

    await mintTo(
      provider.connection,
      player1,
      mint,
      player2TokenAccount,
      player1,
      1000 * LAMPORTS_PER_SOL
    );
  });

  describe('Game Initialization', () => {
    it('Should initialize a new game correctly', async () => {
      const betAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);
      const maxPlayers = 2;
      const timeLimit = new anchor.BN(60); // 60 seconds

      await program.methods
        .initializeGame(betAmount, maxPlayers, timeLimit)
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          creator: player1.publicKey,
          mint: mint,
          escrowTokenAccount: escrowTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([gameKeypair, escrowKeypair, player1])
        .rpc();

      const gameAccount = await program.account.game.fetch(gameKeypair.publicKey);
      
      expect(gameAccount.creator.toString()).to.equal(player1.publicKey.toString());
      expect(gameAccount.betAmount.toString()).to.equal(betAmount.toString());
      expect(gameAccount.maxPlayers).to.equal(maxPlayers);
      expect(gameAccount.timeLimit.toString()).to.equal(timeLimit.toString());
      expect(gameAccount.status).to.deep.equal({ waiting: {} });
      expect(gameAccount.players).to.have.lengthOf(0);
    });

    it('Should reject invalid bet amounts', async () => {
      const zeroBet = new anchor.BN(0);
      
      try {
        await program.methods
          .initializeGame(zeroBet, 2, new anchor.BN(60))
          .accounts({
            game: gameKeypair.publicKey,
            escrow: escrowKeypair.publicKey,
            creator: player1.publicKey,
            mint: mint,
            escrowTokenAccount: escrowTokenAccount,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([gameKeypair, escrowKeypair, player1])
          .rpc();
        
        expect.fail('Should have thrown an error for zero bet');
      } catch (error) {
        expect(error.error.errorCode.code).to.equal('InvalidBetAmount');
      }
    });

    it('Should reject invalid player count', async () => {
      try {
        await program.methods
          .initializeGame(new anchor.BN(LAMPORTS_PER_SOL), 0, new anchor.BN(60))
          .accounts({
            game: gameKeypair.publicKey,
            escrow: escrowKeypair.publicKey,
            creator: player1.publicKey,
            mint: mint,
            escrowTokenAccount: escrowTokenAccount,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([gameKeypair, escrowKeypair, player1])
          .rpc();
        
        expect.fail('Should have thrown an error for zero players');
      } catch (error) {
        expect(error.error.errorCode.code).to.equal('InvalidPlayerCount');
      }
    });

    it('Should reject invalid time limits', async () => {
      const tooShort = new anchor.BN(0);
      
      try {
        await program.methods
          .initializeGame(new anchor.BN(LAMPORTS_PER_SOL), 2, tooShort)
          .accounts({
            game: gameKeypair.publicKey,
            escrow: escrowKeypair.publicKey,
            creator: player1.publicKey,
            mint: mint,
            escrowTokenAccount: escrowTokenAccount,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([gameKeypair, escrowKeypair, player1])
          .rpc();
        
        expect.fail('Should have thrown an error for invalid time limit');
      } catch (error) {
        expect(error.error.errorCode.code).to.equal('InvalidTimeLimit');
      }
    });
  });

  describe('Player Joining', () => {
    beforeEach(async () => {
      // Initialize a game for joining tests
      await program.methods
        .initializeGame(new anchor.BN(LAMPORTS_PER_SOL), 2, new anchor.BN(60))
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          creator: player1.publicKey,
          mint: mint,
          escrowTokenAccount: escrowTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([gameKeypair, escrowKeypair, player1])
        .rpc();
    });

    it('Should allow player to join game', async () => {
      await program.methods
        .joinGame()
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          player: player2.publicKey,
          playerTokenAccount: player2TokenAccount,
          escrowTokenAccount: escrowTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([player2])
        .rpc();

      const gameAccount = await program.account.game.fetch(gameKeypair.publicKey);
      
      expect(gameAccount.players).to.have.lengthOf(1);
      expect(gameAccount.players[0].toString()).to.equal(player2.publicKey.toString());
      expect(gameAccount.status).to.deep.equal({ active: {} });
    });

    it('Should reject creator joining own game', async () => {
      try {
        await program.methods
          .joinGame()
          .accounts({
            game: gameKeypair.publicKey,
            escrow: escrowKeypair.publicKey,
            player: player1.publicKey,
            playerTokenAccount: player1TokenAccount,
            escrowTokenAccount: escrowTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([player1])
          .rpc();
        
        expect.fail('Creator should not be able to join own game');
      } catch (error) {
        expect(error.error.errorCode.code).to.equal('CreatorCannotJoin');
      }
    });

    it('Should reject joining full game', async () => {
      // Player 2 joins
      await program.methods
        .joinGame()
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          player: player2.publicKey,
          playerTokenAccount: player2TokenAccount,
          escrowTokenAccount: escrowTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([player2])
        .rpc();

      // Try to join a third player
      const player3 = Keypair.generate();
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(player3.publicKey, LAMPORTS_PER_SOL)
      );

      const player3TokenAccount = await createAccount(
        provider.connection,
        player3,
        mint,
        player3.publicKey
      );

      await mintTo(
        provider.connection,
        player1,
        mint,
        player3TokenAccount,
        player1,
        1000 * LAMPORTS_PER_SOL
      );

      try {
        await program.methods
          .joinGame()
          .accounts({
            game: gameKeypair.publicKey,
            escrow: escrowKeypair.publicKey,
            player: player3.publicKey,
            playerTokenAccount: player3TokenAccount,
            escrowTokenAccount: escrowTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([player3])
          .rpc();
        
        expect.fail('Should not be able to join full game');
      } catch (error) {
        expect(error.error.errorCode.code).to.equal('GameIsFull');
      }
    });

    it('Should reject joining with insufficient funds', async () => {
      // Create player with insufficient tokens
      const poorPlayer = Keypair.generate();
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(poorPlayer.publicKey, LAMPORTS_PER_SOL)
      );

      const poorTokenAccount = await createAccount(
        provider.connection,
        poorPlayer,
        mint,
        poorPlayer.publicKey
      );

      // Mint only half the required amount
      await mintTo(
        provider.connection,
        player1,
        mint,
        poorTokenAccount,
        player1,
        0.5 * LAMPORTS_PER_SOL
      );

      try {
        await program.methods
          .joinGame()
          .accounts({
            game: gameKeypair.publicKey,
            escrow: escrowKeypair.publicKey,
            player: poorPlayer.publicKey,
            playerTokenAccount: poorTokenAccount,
            escrowTokenAccount: escrowTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([poorPlayer])
          .rpc();
        
        expect.fail('Should not be able to join with insufficient funds');
      } catch (error) {
        expect(error.error.errorCode.code).to.equal('InsufficientFunds');
      }
    });
  });

  describe('Game Moves', () => {
    beforeEach(async () => {
      // Initialize game and have player 2 join
      await program.methods
        .initializeGame(new anchor.BN(LAMPORTS_PER_SOL), 2, new anchor.BN(300))
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          creator: player1.publicKey,
          mint: mint,
          escrowTokenAccount: escrowTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([gameKeypair, escrowKeypair, player1])
        .rpc();

      await program.methods
        .joinGame()
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          player: player2.publicKey,
          playerTokenAccount: player2TokenAccount,
          escrowTokenAccount: escrowTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([player2])
        .rpc();
    });

    it('Should accept valid moves', async () => {
      const moveType = { attack: {} };
      const target = player2.publicKey;
      const damage = new anchor.BN(25);

      await program.methods
        .submitMove(moveType, target, damage)
        .accounts({
          game: gameKeypair.publicKey,
          player: player1.publicKey,
        })
        .signers([player1])
        .rpc();

      const gameAccount = await program.account.game.fetch(gameKeypair.publicKey);
      expect(gameAccount.moves).to.have.lengthOf(1);
      expect(gameAccount.moves[0].player.toString()).to.equal(player1.publicKey.toString());
      expect(gameAccount.moves[0].moveType).to.deep.equal(moveType);
    });

    it('Should reject moves from non-players', async () => {
      const intruder = Keypair.generate();
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(intruder.publicKey, LAMPORTS_PER_SOL)
      );

      try {
        await program.methods
          .submitMove({ attack: {} }, player2.publicKey, new anchor.BN(25))
          .accounts({
            game: gameKeypair.publicKey,
            player: intruder.publicKey,
          })
          .signers([intruder])
          .rpc();
        
        expect.fail('Non-player should not be able to submit moves');
      } catch (error) {
        expect(error.error.errorCode.code).to.equal('PlayerNotInGame');
      }
    });

    it('Should enforce turn order', async () => {
      const gameAccount = await program.account.game.fetch(gameKeypair.publicKey);
      const currentPlayer = gameAccount.currentTurn;
      const otherPlayer = currentPlayer.toString() === player1.publicKey.toString() ? player2 : player1;

      try {
        await program.methods
          .submitMove({ attack: {} }, player1.publicKey, new anchor.BN(25))
          .accounts({
            game: gameKeypair.publicKey,
            player: otherPlayer.publicKey,
          })
          .signers([otherPlayer])
          .rpc();
        
        expect.fail('Should not be able to move out of turn');
      } catch (error) {
        expect(error.error.errorCode.code).to.equal('NotYourTurn');
      }
    });

    it('Should validate move parameters', async () => {
      // Test excessive damage
      try {
        await program.methods
          .submitMove({ attack: {} }, player2.publicKey, new anchor.BN(1000))
          .accounts({
            game: gameKeypair.publicKey,
            player: player1.publicKey,
          })
          .signers([player1])
          .rpc();
        
        expect.fail('Should reject excessive damage');
      } catch (error) {
        expect(error.error.errorCode.code).to.equal('InvalidMoveParameters');
      }

      // Test invalid target (self)
      try {
        await program.methods
          .submitMove({ attack: {} }, player1.publicKey, new anchor.BN(25))
          .accounts({
            game: gameKeypair.publicKey,
            player: player1.publicKey,
          })
          .signers([player1])
          .rpc();
        
        expect.fail('Should not be able to target self');
      } catch (error) {
        expect(error.error.errorCode.code).to.equal('CannotTargetSelf');
      }
    });

    it('Should update game state after moves', async () => {
      // Player 1 attacks
      await program.methods
        .submitMove({ attack: {} }, player2.publicKey, new anchor.BN(30))
        .accounts({
          game: gameKeypair.publicKey,
          player: player1.publicKey,
        })
        .signers([player1])
        .rpc();

      let gameAccount = await program.account.game.fetch(gameKeypair.publicKey);
      expect(gameAccount.currentTurn.toString()).to.equal(player2.publicKey.toString());

      // Player 2 defends
      await program.methods
        .submitMove({ defend: {} }, player1.publicKey, new anchor.BN(0))
        .accounts({
          game: gameKeypair.publicKey,
          player: player2.publicKey,
        })
        .signers([player2])
        .rpc();

      gameAccount = await program.account.game.fetch(gameKeypair.publicKey);
      expect(gameAccount.currentTurn.toString()).to.equal(player1.publicKey.toString());
      expect(gameAccount.moves).to.have.lengthOf(2);
    });
  });

  describe('VRF Integration', () => {
    beforeEach(async () => {
      await program.methods
        .initializeGame(new anchor.BN(LAMPORTS_PER_SOL), 2, new anchor.BN(300))
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          creator: player1.publicKey,
          mint: mint,
          escrowTokenAccount: escrowTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([gameKeypair, escrowKeypair, player1])
        .rpc();

      await program.methods
        .joinGame()
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          player: player2.publicKey,
          playerTokenAccount: player2TokenAccount,
          escrowTokenAccount: escrowTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([player2])
        .rpc();
    });

    it('Should request VRF for random events', async () => {
      const vrfSeed = Buffer.from('test-seed-12345678');

      await program.methods
        .requestVrf(vrfSeed)
        .accounts({
          game: gameKeypair.publicKey,
          player: player1.publicKey,
        })
        .signers([player1])
        .rpc();

      const gameAccount = await program.account.game.fetch(gameKeypair.publicKey);
      expect(gameAccount.pendingVrf).to.be.true;
    });

    it('Should process VRF callback', async () => {
      const vrfSeed = Buffer.from('test-seed-12345678');
      const randomValue = Buffer.from('random-value-32-bytes-for-testing');
      const proof = Buffer.from('vrf-proof-data-for-verification-test');

      // First request VRF
      await program.methods
        .requestVrf(vrfSeed)
        .accounts({
          game: gameKeypair.publicKey,
          player: player1.publicKey,
        })
        .signers([player1])
        .rpc();

      // Then simulate VRF callback (in real implementation, this would be called by the VRF oracle)
      await program.methods
        .processVrfCallback(Array.from(randomValue), Array.from(proof))
        .accounts({
          game: gameKeypair.publicKey,
        })
        .rpc();

      const gameAccount = await program.account.game.fetch(gameKeypair.publicKey);
      expect(gameAccount.pendingVrf).to.be.false;
      expect(gameAccount.lastRandomValue).to.deep.equal(Array.from(randomValue));
    });

    it('Should reject unauthorized VRF callbacks', async () => {
      const unauthorizedAccount = Keypair.generate();
      const randomValue = Buffer.from('unauthorized-random-value-test-32b');
      const proof = Buffer.from('unauthorized-proof-data-verification');

      try {
        await program.methods
          .processVrfCallback(Array.from(randomValue), Array.from(proof))
          .accounts({
            game: gameKeypair.publicKey,
          })
          .signers([unauthorizedAccount])
          .rpc();
        
        expect.fail('Unauthorized VRF callback should be rejected');
      } catch (error) {
        expect(error.error.errorCode.code).to.equal('UnauthorizedVrfCallback');
      }
    });
  });

  describe('Game Completion', () => {
    beforeEach(async () => {
      await program.methods
        .initializeGame(new anchor.BN(LAMPORTS_PER_SOL), 2, new anchor.BN(300))
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          creator: player1.publicKey,
          mint: mint,
          escrowTokenAccount: escrowTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([gameKeypair, escrowKeypair, player1])
        .rpc();

      await program.methods
        .joinGame()
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          player: player2.publicKey,
          playerTokenAccount: player2TokenAccount,
          escrowTokenAccount: escrowTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([player2])
        .rpc();
    });

    it('Should complete game and determine winner', async () => {
      const winner = player1.publicKey;

      await program.methods
        .completeGame(winner)
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          escrowTokenAccount: escrowTokenAccount,
          winnerTokenAccount: player1TokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const gameAccount = await program.account.game.fetch(gameKeypair.publicKey);
      expect(gameAccount.status).to.deep.equal({ finished: {} });
      expect(gameAccount.winner.toString()).to.equal(winner.toString());
    });

    it('Should transfer winnings to winner', async () => {
      const initialBalance = await provider.connection.getTokenAccountBalance(player1TokenAccount);
      const winner = player1.publicKey;

      await program.methods
        .completeGame(winner)
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          escrowTokenAccount: escrowTokenAccount,
          winnerTokenAccount: player1TokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const finalBalance = await provider.connection.getTokenAccountBalance(player1TokenAccount);
      const winnings = finalBalance.value.uiAmount! - initialBalance.value.uiAmount!;
      
      expect(winnings).to.equal(2.0); // Won both bets (2 SOL)
    });

    it('Should handle timeout scenarios', async () => {
      // Create game with very short timeout for testing
      const shortGameKeypair = Keypair.generate();
      const shortEscrowKeypair = Keypair.generate();
      
      const shortEscrowTokenAccount = await createAccount(
        provider.connection,
        player1,
        mint,
        shortEscrowKeypair.publicKey
      );

      await program.methods
        .initializeGame(new anchor.BN(LAMPORTS_PER_SOL), 2, new anchor.BN(1)) // 1 second timeout
        .accounts({
          game: shortGameKeypair.publicKey,
          escrow: shortEscrowKeypair.publicKey,
          creator: player1.publicKey,
          mint: mint,
          escrowTokenAccount: shortEscrowTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([shortGameKeypair, shortEscrowKeypair, player1])
        .rpc();

      await program.methods
        .joinGame()
        .accounts({
          game: shortGameKeypair.publicKey,
          escrow: shortEscrowKeypair.publicKey,
          player: player2.publicKey,
          playerTokenAccount: player2TokenAccount,
          escrowTokenAccount: shortEscrowTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([player2])
        .rpc();

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 2000));

      await program.methods
        .handleTimeout()
        .accounts({
          game: shortGameKeypair.publicKey,
          escrow: shortEscrowKeypair.publicKey,
          escrowTokenAccount: shortEscrowTokenAccount,
          player1TokenAccount: player1TokenAccount,
          player2TokenAccount: player2TokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const gameAccount = await program.account.game.fetch(shortGameKeypair.publicKey);
      expect(gameAccount.status).to.deep.equal({ timeout: {} });
    });

    it('Should prevent double completion', async () => {
      const winner = player1.publicKey;

      await program.methods
        .completeGame(winner)
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          escrowTokenAccount: escrowTokenAccount,
          winnerTokenAccount: player1TokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      try {
        await program.methods
          .completeGame(winner)
          .accounts({
            game: gameKeypair.publicKey,
            escrow: escrowKeypair.publicKey,
            escrowTokenAccount: escrowTokenAccount,
            winnerTokenAccount: player1TokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        
        expect.fail('Should not be able to complete game twice');
      } catch (error) {
        expect(error.error.errorCode.code).to.equal('GameAlreadyFinished');
      }
    });
  });

  describe('Error Handling', () => {
    it('Should handle program derived address correctly', async () => {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('game'), gameKeypair.publicKey.toBuffer()],
        program.programId
      );

      expect(pda).to.be.instanceOf(PublicKey);
    });

    it('Should validate account ownership', async () => {
      const fakeProgram = Keypair.generate();
      
      try {
        await program.methods
          .initializeGame(new anchor.BN(LAMPORTS_PER_SOL), 2, new anchor.BN(60))
          .accounts({
            game: gameKeypair.publicKey,
            escrow: escrowKeypair.publicKey,
            creator: player1.publicKey,
            mint: mint,
            escrowTokenAccount: escrowTokenAccount,
            systemProgram: fakeProgram.publicKey, // Wrong program
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([gameKeypair, escrowKeypair, player1])
          .rpc();
        
        expect.fail('Should reject invalid system program');
      } catch (error) {
        expect(error).to.exist;
      }
    });

    it('Should handle insufficient account space', async () => {
      // This test would require creating an account with insufficient space
      // Implementation depends on specific Anchor setup
    });

    it('Should validate signer requirements', async () => {
      try {
        await program.methods
          .initializeGame(new anchor.BN(LAMPORTS_PER_SOL), 2, new anchor.BN(60))
          .accounts({
            game: gameKeypair.publicKey,
            escrow: escrowKeypair.publicKey,
            creator: player1.publicKey,
            mint: mint,
            escrowTokenAccount: escrowTokenAccount,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([gameKeypair, escrowKeypair]) // Missing player1 signature
          .rpc();
        
        expect.fail('Should require all necessary signers');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });

  describe('Security Tests', () => {
    it('Should prevent reentrancy attacks', async () => {
      // Initialize and fill game
      await program.methods
        .initializeGame(new anchor.BN(LAMPORTS_PER_SOL), 2, new anchor.BN(300))
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          creator: player1.publicKey,
          mint: mint,
          escrowTokenAccount: escrowTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([gameKeypair, escrowKeypair, player1])
        .rpc();

      await program.methods
        .joinGame()
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          player: player2.publicKey,
          playerTokenAccount: player2TokenAccount,
          escrowTokenAccount: escrowTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([player2])
        .rpc();

      // Attempt to complete game multiple times quickly
      const promises = [1, 2, 3].map(() =>
        program.methods
          .completeGame(player1.publicKey)
          .accounts({
            game: gameKeypair.publicKey,
            escrow: escrowKeypair.publicKey,
            escrowTokenAccount: escrowTokenAccount,
            winnerTokenAccount: player1TokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc()
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled');
      
      expect(successful).to.have.lengthOf(1); // Only one should succeed
    });

    it('Should protect against integer overflow', async () => {
      const maxU64 = new anchor.BN('18446744073709551615'); // Max u64 value

      try {
        await program.methods
          .initializeGame(maxU64, 2, new anchor.BN(60))
          .accounts({
            game: gameKeypair.publicKey,
            escrow: escrowKeypair.publicKey,
            creator: player1.publicKey,
            mint: mint,
            escrowTokenAccount: escrowTokenAccount,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([gameKeypair, escrowKeypair, player1])
          .rpc();
        
        expect.fail('Should prevent overflow');
      } catch (error) {
        expect(error.error.errorCode.code).to.equal('InvalidBetAmount');
      }
    });

    it('Should validate all account constraints', async () => {
      const wrongMint = await createMint(
        provider.connection,
        player1,
        player1.publicKey,
        null,
        9
      );

      const wrongTokenAccount = await createAccount(
        provider.connection,
        player1,
        wrongMint,
        escrowKeypair.publicKey
      );

      try {
        await program.methods
          .initializeGame(new anchor.BN(LAMPORTS_PER_SOL), 2, new anchor.BN(60))
          .accounts({
            game: gameKeypair.publicKey,
            escrow: escrowKeypair.publicKey,
            creator: player1.publicKey,
            mint: mint,
            escrowTokenAccount: wrongTokenAccount, // Wrong mint
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([gameKeypair, escrowKeypair, player1])
          .rpc();
        
        expect.fail('Should validate token account mint');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });

  describe('Performance Tests', () => {
    it('Should handle instruction within compute budget', async () => {
      const startCU = await provider.connection.getRecentPerformanceSamples(1);
      
      await program.methods
        .initializeGame(new anchor.BN(LAMPORTS_PER_SOL), 2, new anchor.BN(60))
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          creator: player1.publicKey,
          mint: mint,
          escrowTokenAccount: escrowTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([gameKeypair, escrowKeypair, player1])
        .rpc();

      const endCU = await provider.connection.getRecentPerformanceSamples(1);
      
      // Verify instruction completed successfully (if it didn't, it would throw)
      expect(endCU).to.exist;
    });

    it('Should handle maximum move history efficiently', async () => {
      await program.methods
        .initializeGame(new anchor.BN(LAMPORTS_PER_SOL), 2, new anchor.BN(3000))
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          creator: player1.publicKey,
          mint: mint,
          escrowTokenAccount: escrowTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([gameKeypair, escrowKeypair, player1])
        .rpc();

      await program.methods
        .joinGame()
        .accounts({
          game: gameKeypair.publicKey,
          escrow: escrowKeypair.publicKey,
          player: player2.publicKey,
          playerTokenAccount: player2TokenAccount,
          escrowTokenAccount: escrowTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([player2])
        .rpc();

      // Make many moves to test performance
      for (let i = 0; i < 50; i++) {
        const currentPlayer = i % 2 === 0 ? player1 : player2;
        const target = i % 2 === 0 ? player2.publicKey : player1.publicKey;

        await program.methods
          .submitMove({ attack: {} }, target, new anchor.BN(1))
          .accounts({
            game: gameKeypair.publicKey,
            player: currentPlayer.publicKey,
          })
          .signers([currentPlayer])
          .rpc();
      }

      const gameAccount = await program.account.game.fetch(gameKeypair.publicKey);
      expect(gameAccount.moves).to.have.lengthOf(50);
    });
  });
});