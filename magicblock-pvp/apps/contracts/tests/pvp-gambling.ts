import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PvpGambling } from "../target/types/pvp_gambling";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";
import crypto from "crypto";

describe("PvP Gambling Tests", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PvpGambling as Program<PvpGambling>;
  const connection = provider.connection;

  // Test keypairs
  let initializer: Keypair;
  let player1: Keypair;
  let player2: Keypair;
  let gameId: anchor.BN;
  let betAmount: anchor.BN;

  // PDAs
  let gameEscrowPda: PublicKey;
  let gameAuthorityPda: PublicKey;
  let player1StatePda: PublicKey;
  let player2StatePda: PublicKey;
  let vrfAuthorityPda: PublicKey;

  beforeEach(async () => {
    // Create fresh keypairs for each test
    initializer = Keypair.generate();
    player1 = Keypair.generate();
    player2 = Keypair.generate();

    // Airdrop SOL to test accounts
    await connection.requestAirdrop(initializer.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.requestAirdrop(player1.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.requestAirdrop(player2.publicKey, 2 * LAMPORTS_PER_SOL);

    // Wait for airdrops
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Generate unique game ID
    gameId = new anchor.BN(Date.now() + Math.floor(Math.random() * 1000));
    betAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL

    // Derive PDAs
    [gameAuthorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("game_authority"), gameId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [gameEscrowPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("game_escrow"),
        gameId.toArrayLike(Buffer, "le", 8),
        gameAuthorityPda.toBuffer(),
      ],
      program.programId
    );

    [player1StatePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("player_state"),
        player1.publicKey.toBuffer(),
        gameEscrowPda.toBuffer(),
      ],
      program.programId
    );

    [player2StatePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("player_state"),
        player2.publicKey.toBuffer(),
        gameEscrowPda.toBuffer(),
      ],
      program.programId
    );

    [vrfAuthorityPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vrf_authority")],
      program.programId
    );
  });

  describe("Initialize Game", () => {
    it("Should initialize a new game successfully", async () => {
      const tx = await program.methods
        .initializeGame(
          gameId,
          betAmount,
          player1.publicKey,
          player2.publicKey,
          false, // gasless_mode
          null   // max_cost_cap
        )
        .accounts({
          initializer: initializer.publicKey,
          gameEscrow: gameEscrowPda,
          gameAuthority: gameAuthorityPda,
          player1State: player1StatePda,
          player2State: player2StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([initializer])
        .rpc();

      // Verify game escrow account
      const gameEscrow = await program.account.gameEscrow.fetch(gameEscrowPda);
      expect(gameEscrow.gameId.toString()).to.equal(gameId.toString());
      expect(gameEscrow.player1.toString()).to.equal(player1.publicKey.toString());
      expect(gameEscrow.player2.toString()).to.equal(player2.publicKey.toString());
      expect(gameEscrow.betAmount.toString()).to.equal(betAmount.toString());
      expect(gameEscrow.gameState).to.deep.equal({ waitingForDeposits: {} });
      expect(gameEscrow.gaslessMode).to.equal(false);
      expect(gameEscrow.totalAmount.toString()).to.equal("0");

      // Verify player states
      const player1State = await program.account.playerState.fetch(player1StatePda);
      expect(player1State.player.toString()).to.equal(player1.publicKey.toString());
      expect(player1State.hasDeposited).to.equal(false);
      expect(player1State.depositedAmount.toString()).to.equal("0");

      const player2State = await program.account.playerState.fetch(player2StatePda);
      expect(player2State.player.toString()).to.equal(player2.publicKey.toString());
      expect(player2State.hasDeposited).to.equal(false);
      expect(player2State.depositedAmount.toString()).to.equal("0");
    });

    it("Should initialize gasless game with cost cap", async () => {
      const maxCostCap = new anchor.BN(50000); // 50k lamports

      await program.methods
        .initializeGame(
          gameId,
          betAmount,
          player1.publicKey,
          player2.publicKey,
          true,        // gasless_mode
          maxCostCap   // max_cost_cap
        )
        .accounts({
          initializer: initializer.publicKey,
          gameEscrow: gameEscrowPda,
          gameAuthority: gameAuthorityPda,
          player1State: player1StatePda,
          player2State: player2StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([initializer])
        .rpc();

      const gameEscrow = await program.account.gameEscrow.fetch(gameEscrowPda);
      expect(gameEscrow.gaslessMode).to.equal(true);
      expect(gameEscrow.maxCostCap.toString()).to.equal(maxCostCap.toString());
    });

    it("Should reject game with same players", async () => {
      try {
        await program.methods
          .initializeGame(
            gameId,
            betAmount,
            player1.publicKey,
            player1.publicKey, // Same player
            false,
            null
          )
          .accounts({
            initializer: initializer.publicKey,
            gameEscrow: gameEscrowPda,
            gameAuthority: gameAuthorityPda,
            player1State: player1StatePda,
            player2State: player2StatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([initializer])
          .rpc();

        expect.fail("Should have failed with InvalidPlayer error");
      } catch (error) {
        expect(error.toString()).to.include("InvalidPlayer");
      }
    });

    it("Should reject invalid bet amounts", async () => {
      const invalidBetAmount = new anchor.BN(1000); // Too small (< 0.01 SOL)

      try {
        await program.methods
          .initializeGame(
            gameId,
            invalidBetAmount,
            player1.publicKey,
            player2.publicKey,
            false,
            null
          )
          .accounts({
            initializer: initializer.publicKey,
            gameEscrow: gameEscrowPda,
            gameAuthority: gameAuthorityPda,
            player1State: player1StatePda,
            player2State: player2StatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([initializer])
          .rpc();

        expect.fail("Should have failed with InvalidBetAmount error");
      } catch (error) {
        expect(error.toString()).to.include("InvalidBetAmount");
      }
    });
  });

  describe("Deposit Cap", () => {
    beforeEach(async () => {
      // Initialize game before each deposit test
      await program.methods
        .initializeGame(
          gameId,
          betAmount,
          player1.publicKey,
          player2.publicKey,
          false,
          null
        )
        .accounts({
          initializer: initializer.publicKey,
          gameEscrow: gameEscrowPda,
          gameAuthority: gameAuthorityPda,
          player1State: player1StatePda,
          player2State: player2StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([initializer])
        .rpc();
    });

    it("Should allow player 1 to deposit", async () => {
      const initialBalance = await connection.getBalance(player1.publicKey);

      await program.methods
        .depositCap(betAmount)
        .accounts({
          player: player1.publicKey,
          gameEscrow: gameEscrowPda,
          playerState: player1StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player1])
        .rpc();

      // Verify game escrow updated
      const gameEscrow = await program.account.gameEscrow.fetch(gameEscrowPda);
      expect(gameEscrow.totalAmount.toString()).to.equal(betAmount.toString());

      // Verify player state updated
      const player1State = await program.account.playerState.fetch(player1StatePda);
      expect(player1State.hasDeposited).to.equal(true);
      expect(player1State.depositedAmount.toString()).to.equal(betAmount.toString());

      // Verify SOL was transferred
      const finalBalance = await connection.getBalance(player1.publicKey);
      const expectedBalance = initialBalance - betAmount.toNumber();
      // Allow for transaction fees
      expect(finalBalance).to.be.closeTo(expectedBalance, 10000);
    });

    it("Should transition to ReadyToSettle after both deposits", async () => {
      // Player 1 deposits
      await program.methods
        .depositCap(betAmount)
        .accounts({
          player: player1.publicKey,
          gameEscrow: gameEscrowPda,
          playerState: player1StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player1])
        .rpc();

      // Player 2 deposits
      await program.methods
        .depositCap(betAmount)
        .accounts({
          player: player2.publicKey,
          gameEscrow: gameEscrowPda,
          playerState: player2StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player2])
        .rpc();

      // Verify game state transitioned
      const gameEscrow = await program.account.gameEscrow.fetch(gameEscrowPda);
      expect(gameEscrow.gameState).to.deep.equal({ readyToSettle: {} });
      expect(gameEscrow.totalAmount.toString()).to.equal(
        betAmount.mul(new anchor.BN(2)).toString()
      );
    });

    it("Should reject deposits from non-players", async () => {
      const nonPlayer = Keypair.generate();
      await connection.requestAirdrop(nonPlayer.publicKey, LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        await program.methods
          .depositCap(betAmount)
          .accounts({
            player: nonPlayer.publicKey,
            gameEscrow: gameEscrowPda,
            playerState: player1StatePda, // Wrong player state
            systemProgram: SystemProgram.programId,
          })
          .signers([nonPlayer])
          .rpc();

        expect.fail("Should have failed with InvalidPlayer error");
      } catch (error) {
        expect(error.toString()).to.include("InvalidPlayer");
      }
    });

    it("Should reject double deposits", async () => {
      // First deposit
      await program.methods
        .depositCap(betAmount)
        .accounts({
          player: player1.publicKey,
          gameEscrow: gameEscrowPda,
          playerState: player1StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player1])
        .rpc();

      // Second deposit should fail
      try {
        await program.methods
          .depositCap(betAmount)
          .accounts({
            player: player1.publicKey,
            gameEscrow: gameEscrowPda,
            playerState: player1StatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([player1])
          .rpc();

        expect.fail("Should have failed with InvalidStateTransition error");
      } catch (error) {
        expect(error.toString()).to.include("InvalidStateTransition");
      }
    });
  });

  describe("Settle Game", () => {
    beforeEach(async () => {
      // Initialize and fund game
      await program.methods
        .initializeGame(
          gameId,
          betAmount,
          player1.publicKey,
          player2.publicKey,
          false,
          null
        )
        .accounts({
          initializer: initializer.publicKey,
          gameEscrow: gameEscrowPda,
          gameAuthority: gameAuthorityPda,
          player1State: player1StatePda,
          player2State: player2StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([initializer])
        .rpc();

      // Both players deposit
      await program.methods
        .depositCap(betAmount)
        .accounts({
          player: player1.publicKey,
          gameEscrow: gameEscrowPda,
          playerState: player1StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player1])
        .rpc();

      await program.methods
        .depositCap(betAmount)
        .accounts({
          player: player2.publicKey,
          gameEscrow: gameEscrowPda,
          playerState: player2StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player2])
        .rpc();
    });

    it("Should settle game with VRF proof", async () => {
      // Generate mock VRF proof (in production, this would be generated off-chain)
      const mockVrfProof = new Uint8Array(80);
      crypto.randomFillSync(mockVrfProof);

      // Generate alpha string
      const gameEscrow = await program.account.gameEscrow.fetch(gameEscrowPda);
      const alphaString = generateAlphaString(
        gameId,
        player1.publicKey,
        player2.publicKey,
        betAmount,
        gameEscrow.createdAt
      );

      // For this test, assume player1 wins (deterministic based on mock proof)
      const winnerAccount = player1.publicKey;

      const initialWinnerBalance = await connection.getBalance(winnerAccount);

      await program.methods
        .settleGame(Array.from(mockVrfProof), Array.from(alphaString))
        .accounts({
          settler: initializer.publicKey,
          gameEscrow: gameEscrowPda,
          gameAuthority: gameAuthorityPda,
          player1State: player1StatePda,
          player2State: player2StatePda,
          winnerAccount: winnerAccount,
          vrfAuthority: vrfAuthorityPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([initializer])
        .rpc();

      // Verify game was settled
      const finalGameEscrow = await program.account.gameEscrow.fetch(gameEscrowPda);
      expect(finalGameEscrow.gameState).to.deep.equal({ settled: {} });
      expect(finalGameEscrow.winner).to.not.be.null;
      expect(finalGameEscrow.settledAt).to.not.be.null;

      // Verify winner received payout
      const finalWinnerBalance = await connection.getBalance(winnerAccount);
      const expectedPayout = betAmount.mul(new anchor.BN(2)); // Should receive both bets
      expect(finalWinnerBalance).to.be.greaterThan(initialWinnerBalance);
    });

    it("Should reject settlement before both players deposit", async () => {
      // Create a new game with only one deposit
      const newGameId = new anchor.BN(Date.now() + 5000);
      const [newGameAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("game_authority"), newGameId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const [newGameEscrowPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("game_escrow"),
          newGameId.toArrayLike(Buffer, "le", 8),
          newGameAuthorityPda.toBuffer(),
        ],
        program.programId
      );

      const [newPlayer1StatePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("player_state"),
          player1.publicKey.toBuffer(),
          newGameEscrowPda.toBuffer(),
        ],
        program.programId
      );

      const [newPlayer2StatePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("player_state"),
          player2.publicKey.toBuffer(),
          newGameEscrowPda.toBuffer(),
        ],
        program.programId
      );

      // Initialize new game
      await program.methods
        .initializeGame(
          newGameId,
          betAmount,
          player1.publicKey,
          player2.publicKey,
          false,
          null
        )
        .accounts({
          initializer: initializer.publicKey,
          gameEscrow: newGameEscrowPda,
          gameAuthority: newGameAuthorityPda,
          player1State: newPlayer1StatePda,
          player2State: newPlayer2StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([initializer])
        .rpc();

      // Only player 1 deposits
      await program.methods
        .depositCap(betAmount)
        .accounts({
          player: player1.publicKey,
          gameEscrow: newGameEscrowPda,
          playerState: newPlayer1StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player1])
        .rpc();

      const mockVrfProof = new Uint8Array(80);
      const gameEscrow = await program.account.gameEscrow.fetch(newGameEscrowPda);
      const alphaString = generateAlphaString(
        newGameId,
        player1.publicKey,
        player2.publicKey,
        betAmount,
        gameEscrow.createdAt
      );

      try {
        await program.methods
          .settleGame(Array.from(mockVrfProof), Array.from(alphaString))
          .accounts({
            settler: initializer.publicKey,
            gameEscrow: newGameEscrowPda,
            gameAuthority: newGameAuthorityPda,
            player1State: newPlayer1StatePda,
            player2State: newPlayer2StatePda,
            winnerAccount: player1.publicKey,
            vrfAuthority: vrfAuthorityPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([initializer])
          .rpc();

        expect.fail("Should have failed with InvalidStateTransition error");
      } catch (error) {
        expect(error.toString()).to.include("InvalidStateTransition");
      }
    });
  });

  describe("Abort Game", () => {
    beforeEach(async () => {
      await program.methods
        .initializeGame(
          gameId,
          betAmount,
          player1.publicKey,
          player2.publicKey,
          false,
          null
        )
        .accounts({
          initializer: initializer.publicKey,
          gameEscrow: gameEscrowPda,
          gameAuthority: gameAuthorityPda,
          player1State: player1StatePda,
          player2State: player2StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([initializer])
        .rpc();
    });

    it("Should abort game and refund deposits", async () => {
      // Both players deposit
      await program.methods
        .depositCap(betAmount)
        .accounts({
          player: player1.publicKey,
          gameEscrow: gameEscrowPda,
          playerState: player1StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player1])
        .rpc();

      await program.methods
        .depositCap(betAmount)
        .accounts({
          player: player2.publicKey,
          gameEscrow: gameEscrowPda,
          playerState: player2StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player2])
        .rpc();

      const initialPlayer1Balance = await connection.getBalance(player1.publicKey);
      const initialPlayer2Balance = await connection.getBalance(player2.publicKey);

      // Player 1 aborts the game
      await program.methods
        .abortGame()
        .accounts({
          aborter: player1.publicKey,
          gameEscrow: gameEscrowPda,
          gameAuthority: gameAuthorityPda,
          player1State: player1StatePda,
          player2State: player2StatePda,
          player1Account: player1.publicKey,
          player2Account: player2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([player1])
        .rpc();

      // Verify game state
      const gameEscrow = await program.account.gameEscrow.fetch(gameEscrowPda);
      expect(gameEscrow.gameState).to.deep.equal({ aborted: {} });
      expect(gameEscrow.settledAt).to.not.be.null;

      // Verify refunds (allow for transaction fees)
      const finalPlayer1Balance = await connection.getBalance(player1.publicKey);
      const finalPlayer2Balance = await connection.getBalance(player2.publicKey);

      expect(finalPlayer1Balance).to.be.greaterThan(initialPlayer1Balance);
      expect(finalPlayer2Balance).to.be.greaterThan(initialPlayer2Balance);
    });

    it("Should allow abort even with no deposits", async () => {
      await program.methods
        .abortGame()
        .accounts({
          aborter: player1.publicKey,
          gameEscrow: gameEscrowPda,
          gameAuthority: gameAuthorityPda,
          player1State: player1StatePda,
          player2State: player2StatePda,
          player1Account: player1.publicKey,
          player2Account: player2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([player1])
        .rpc();

      const gameEscrow = await program.account.gameEscrow.fetch(gameEscrowPda);
      expect(gameEscrow.gameState).to.deep.equal({ aborted: {} });
    });

    it("Should reject abort from unauthorized user", async () => {
      const unauthorizedUser = Keypair.generate();
      await connection.requestAirdrop(unauthorizedUser.publicKey, LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        await program.methods
          .abortGame()
          .accounts({
            aborter: unauthorizedUser.publicKey,
            gameEscrow: gameEscrowPda,
            gameAuthority: gameAuthorityPda,
            player1State: player1StatePda,
            player2State: player2StatePda,
            player1Account: player1.publicKey,
            player2Account: player2.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([unauthorizedUser])
          .rpc();

        expect.fail("Should have failed with Unauthorized error");
      } catch (error) {
        expect(error.toString()).to.include("Unauthorized");
      }
    });
  });

  describe("Gasless Mode", () => {
    beforeEach(async () => {
      const maxCostCap = new anchor.BN(100000); // 100k lamports

      await program.methods
        .initializeGame(
          gameId,
          betAmount,
          player1.publicKey,
          player2.publicKey,
          true,        // gasless_mode
          maxCostCap   // max_cost_cap
        )
        .accounts({
          initializer: initializer.publicKey,
          gameEscrow: gameEscrowPda,
          gameAuthority: gameAuthorityPda,
          player1State: player1StatePda,
          player2State: player2StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([initializer])
        .rpc();
    });

    it("Should track costs in gasless mode", async () => {
      // Players deposit
      await program.methods
        .depositCap(betAmount)
        .accounts({
          player: player1.publicKey,
          gameEscrow: gameEscrowPda,
          playerState: player1StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player1])
        .rpc();

      await program.methods
        .depositCap(betAmount)
        .accounts({
          player: player2.publicKey,
          gameEscrow: gameEscrowPda,
          playerState: player2StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player2])
        .rpc();

      const gameEscrow = await program.account.gameEscrow.fetch(gameEscrowPda);
      
      // Should have accumulated costs from initialization and deposits
      expect(gameEscrow.accumulatedCosts.toNumber()).to.be.greaterThan(0);
      expect(gameEscrow.signatureCount).to.be.greaterThan(0);
    });

    it("Should deduct costs from payout in gasless mode", async () => {
      // Players deposit
      await program.methods
        .depositCap(betAmount)
        .accounts({
          player: player1.publicKey,
          gameEscrow: gameEscrowPda,
          playerState: player1StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player1])
        .rpc();

      await program.methods
        .depositCap(betAmount)
        .accounts({
          player: player2.publicKey,
          gameEscrow: gameEscrowPda,
          playerState: player2StatePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([player2])
        .rpc();

      const preSettleEscrow = await program.account.gameEscrow.fetch(gameEscrowPda);
      const accumulatedCosts = preSettleEscrow.accumulatedCosts;

      // Generate mock VRF proof and settle
      const mockVrfProof = new Uint8Array(80);
      crypto.randomFillSync(mockVrfProof);
      const alphaString = generateAlphaString(
        gameId,
        player1.publicKey,
        player2.publicKey,
        betAmount,
        preSettleEscrow.createdAt
      );

      const initialWinnerBalance = await connection.getBalance(player1.publicKey);

      await program.methods
        .settleGame(Array.from(mockVrfProof), Array.from(alphaString))
        .accounts({
          settler: initializer.publicKey,
          gameEscrow: gameEscrowPda,
          gameAuthority: gameAuthorityPda,
          player1State: player1StatePda,
          player2State: player2StatePda,
          winnerAccount: player1.publicKey,
          vrfAuthority: vrfAuthorityPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([initializer])
        .rpc();

      const finalWinnerBalance = await connection.getBalance(player1.publicKey);
      const payout = finalWinnerBalance - initialWinnerBalance;
      const totalDeposits = betAmount.mul(new anchor.BN(2)).toNumber();

      // Payout should be less than total deposits due to cost deduction
      expect(payout).to.be.lessThan(totalDeposits);
      expect(payout).to.be.greaterThan(totalDeposits - accumulatedCosts.toNumber() - 50000); // Allow for settlement costs
    });
  });

  // Helper function to generate alpha string for VRF
  function generateAlphaString(
    gameId: anchor.BN,
    player1: PublicKey,
    player2: PublicKey,
    betAmount: anchor.BN,
    timestamp: anchor.BN
  ): Buffer {
    const hash = crypto.createHash('sha256');
    hash.update('PVP_GAMBLING_VRF_V1:');
    hash.update(gameId.toArrayLike(Buffer, 'le', 8));
    hash.update(player1.toBuffer());
    hash.update(player2.toBuffer());
    hash.update(betAmount.toArrayLike(Buffer, 'le', 8));
    hash.update(timestamp.toArrayLike(Buffer, 'le', 8));
    return hash.digest();
  }
});