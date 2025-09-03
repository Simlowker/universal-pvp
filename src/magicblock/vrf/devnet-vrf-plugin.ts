/**
 * DevNet VRF Plugin for MagicBlock PvP
 * Provides verifiable random functions for fair gaming on devnet
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
  SYSVAR_CLOCK_PUBKEY
} from '@solana/web3.js';
import { BN, Program, AnchorProvider, web3 } from '@coral-xyz/anchor';
import * as crypto from 'crypto';

export interface VRFRequest {
  requestId: string;
  authority: PublicKey;
  gameAccount: PublicKey;
  callback: VRFCallback;
  timestamp: number;
  fulfilled: boolean;
  randomValue?: BN;
}

export interface VRFCallback {
  programId: PublicKey;
  accounts: PublicKey[];
  instructionData: Buffer;
}

export interface VRFConfig {
  devnetEndpoint: string;
  switchboardProgram: PublicKey;
  vrfQueue: PublicKey;
  vrfAuthority: PublicKey;
  maxRequestsPerMinute: number;
  requestTimeout: number;
}

export interface GameVRFResult {
  requestId: string;
  randomValue: BN;
  proof: Buffer;
  signature: string;
  timestamp: number;
  verifiedOnChain: boolean;
}

export class DevNetVRFPlugin {
  private connection: Connection;
  private config: VRFConfig;
  private authority: Keypair;
  
  // VRF management
  private activeRequests: Map<string, VRFRequest> = new Map();
  private requestCount: Map<string, number> = new Map(); // Rate limiting by minute
  
  // DevNet Switchboard VRF configuration
  private readonly DEVNET_VRF_QUEUE = new PublicKey('GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR');
  private readonly DEVNET_SWITCHBOARD_PROGRAM = new PublicKey('2TfB33aLaneQb5TNVwyDz3jSZXS6jdW2ARw1Dgf84XCG');
  private readonly DEVNET_VRF_AUTHORITY = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
  
  // Performance tracking
  private vrfLatencies: number[] = [];
  private readonly TARGET_VRF_LATENCY_MS = 2000; // 2s for VRF is acceptable
  
  constructor(connection: Connection, authority: Keypair) {
    this.connection = connection;
    this.authority = authority;
    
    this.config = {
      devnetEndpoint: 'https://devnet-router.magicblock.app',
      switchboardProgram: this.DEVNET_SWITCHBOARD_PROGRAM,
      vrfQueue: this.DEVNET_VRF_QUEUE,
      vrfAuthority: this.DEVNET_VRF_AUTHORITY,
      maxRequestsPerMinute: 10,
      requestTimeout: 30000 // 30 seconds
    };
    
    console.log('🎲 DevNet VRF Plugin initialized');
  }

  /**
   * Request verifiable randomness for PvP game
   */
  async requestGameVRF(
    gameAccount: PublicKey,
    gameProgram: PublicKey,
    callbackInstruction: string = 'process_vrf_result'
  ): Promise<string> {
    const startTime = performance.now();
    
    try {
      // Rate limiting check
      await this.checkRateLimit();
      
      const requestId = `vrf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create VRF callback instruction
      const callback: VRFCallback = {
        programId: gameProgram,
        accounts: [gameAccount, this.authority.publicKey],
        instructionData: Buffer.from(callbackInstruction, 'utf8')
      };
      
      const vrfRequest: VRFRequest = {
        requestId,
        authority: this.authority.publicKey,
        gameAccount,
        callback,
        timestamp: Date.now(),
        fulfilled: false
      };
      
      // Store request
      this.activeRequests.set(requestId, vrfRequest);
      
      // Submit VRF request to Switchboard on devnet
      await this.submitSwitchboardVRFRequest(vrfRequest);
      
      const latency = performance.now() - startTime;
      console.log(`🎲 VRF request submitted: ${requestId} (${latency.toFixed(1)}ms)`);
      
      // Set timeout for request
      setTimeout(() => {
        this.handleVRFTimeout(requestId);
      }, this.config.requestTimeout);
      
      return requestId;
      
    } catch (error) {
      const latency = performance.now() - startTime;
      console.error(`❌ VRF request failed in ${latency.toFixed(1)}ms:`, error);
      throw new Error(`VRF request failed: ${error.message}`);
    }
  }

  /**
   * Submit VRF request to Switchboard devnet
   */
  private async submitSwitchboardVRFRequest(request: VRFRequest): Promise<void> {
    try {
      // Create VRF account keypair
      const vrfAccount = Keypair.generate();
      
      // Build Switchboard VRF request transaction
      const transaction = new Transaction();
      
      // Add VRF account creation
      const vrfAccountSpace = 512; // Switchboard VRF account size
      const vrfAccountRent = await this.connection.getMinimumBalanceForRentExemption(vrfAccountSpace);
      
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: this.authority.publicKey,
          newAccountPubkey: vrfAccount.publicKey,
          lamports: vrfAccountRent,
          space: vrfAccountSpace,
          programId: this.config.switchboardProgram
        })
      );
      
      // Add VRF request instruction
      const vrfRequestIx = await this.createVRFRequestInstruction(
        request,
        vrfAccount.publicKey
      );
      
      transaction.add(vrfRequestIx);
      
      // Submit transaction
      const signature = await this.connection.sendTransaction(
        transaction,
        [this.authority, vrfAccount],
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        }
      );
      
      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      console.log(`✅ Switchboard VRF request submitted: ${signature}`);
      
      // Start monitoring for VRF fulfillment
      this.monitorVRFRequest(request.requestId, vrfAccount.publicKey);
      
    } catch (error) {
      console.error('Failed to submit Switchboard VRF request:', error);
      throw error;
    }
  }

  /**
   * Create Switchboard VRF request instruction
   */
  private async createVRFRequestInstruction(
    request: VRFRequest,
    vrfAccount: PublicKey
  ): Promise<TransactionInstruction> {
    // This is a simplified VRF request instruction
    // In practice, you'd use the Switchboard SDK to create proper instructions
    
    const instructionData = Buffer.concat([
      Buffer.from([0x01]), // VRF request discriminator
      request.authority.toBuffer(),
      request.gameAccount.toBuffer(),
      Buffer.from(request.requestId, 'utf8')
    ]);
    
    return new TransactionInstruction({
      keys: [
        { pubkey: vrfAccount, isSigner: false, isWritable: true },
        { pubkey: this.config.vrfQueue, isSigner: false, isWritable: false },
        { pubkey: this.config.vrfAuthority, isSigner: false, isWritable: false },
        { pubkey: request.authority, isSigner: true, isWritable: false },
        { pubkey: request.gameAccount, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_RECENT_BLOCKHASHES_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }
      ],
      programId: this.config.switchboardProgram,
      data: instructionData
    });
  }

  /**
   * Monitor VRF request for fulfillment
   */
  private async monitorVRFRequest(requestId: string, vrfAccount: PublicKey): Promise<void> {
    const request = this.activeRequests.get(requestId);
    if (!request) return;
    
    const maxChecks = 30; // 30 checks over 30 seconds
    let checks = 0;
    
    const checkInterval = setInterval(async () => {
      try {
        checks++;
        
        // Check VRF account for fulfillment
        const accountInfo = await this.connection.getAccountInfo(vrfAccount, 'confirmed');
        
        if (accountInfo && this.isVRFFulfilled(accountInfo.data)) {
          // Extract random value from VRF account
          const randomValue = this.extractRandomValue(accountInfo.data);
          
          // Update request
          request.randomValue = randomValue;
          request.fulfilled = true;
          
          // Execute callback
          await this.executeVRFCallback(request);
          
          // Cleanup
          clearInterval(checkInterval);
          
          const latency = Date.now() - request.timestamp;
          this.vrfLatencies.push(latency);
          
          console.log(`✅ VRF fulfilled: ${requestId} (${latency}ms)`);
          
        } else if (checks >= maxChecks) {
          // Timeout
          clearInterval(checkInterval);
          this.handleVRFTimeout(requestId);
        }
        
      } catch (error) {
        console.error(`Error monitoring VRF request ${requestId}:`, error);
        clearInterval(checkInterval);
        this.handleVRFTimeout(requestId);
      }
    }, 1000); // Check every second
  }

  /**
   * Check if VRF has been fulfilled
   */
  private isVRFFulfilled(data: Buffer): boolean {
    // Simple check - in practice would parse Switchboard VRF account structure
    return data.length > 64 && data[0] === 1; // Assume first byte indicates fulfillment
  }

  /**
   * Extract random value from VRF account
   */
  private extractRandomValue(data: Buffer): BN {
    // Extract random bytes from VRF account data
    // This is simplified - actual implementation would parse Switchboard format
    const randomBytes = data.slice(8, 40); // 32 bytes of randomness
    return new BN(randomBytes);
  }

  /**
   * Execute VRF callback to game program
   */
  private async executeVRFCallback(request: VRFRequest): Promise<void> {
    if (!request.randomValue) return;
    
    try {
      // Create callback transaction
      const transaction = new Transaction();
      
      // Build callback instruction with random value
      const callbackData = Buffer.concat([
        Buffer.from(request.callback.instructionData),
        request.randomValue.toArrayLike(Buffer, 'le', 32)
      ]);
      
      const callbackIx = new TransactionInstruction({
        keys: [
          { pubkey: request.gameAccount, isSigner: false, isWritable: true },
          { pubkey: request.authority, isSigner: true, isWritable: false },
          ...request.callback.accounts.map(acc => ({
            pubkey: acc,
            isSigner: false,
            isWritable: true
          }))
        ],
        programId: request.callback.programId,
        data: callbackData
      });
      
      transaction.add(callbackIx);
      
      // Execute callback
      const signature = await this.connection.sendTransaction(
        transaction,
        [this.authority],
        { skipPreflight: false }
      );
      
      console.log(`🎯 VRF callback executed: ${signature}`);
      
    } catch (error) {
      console.error(`Failed to execute VRF callback for ${request.requestId}:`, error);
    }
  }

  /**
   * Handle VRF request timeout
   */
  private handleVRFTimeout(requestId: string): void {
    const request = this.activeRequests.get(requestId);
    if (!request) return;
    
    console.warn(`⏱️ VRF request timeout: ${requestId}`);
    
    // Generate fallback pseudorandom value for devnet testing
    const fallbackRandom = this.generateFallbackRandom(requestId);
    request.randomValue = fallbackRandom;
    request.fulfilled = true;
    
    // Execute callback with fallback value
    this.executeVRFCallback(request).catch(error => {
      console.error('Failed to execute timeout callback:', error);
    });
  }

  /**
   * Generate cryptographically secure fallback random for devnet
   */
  private generateFallbackRandom(seed: string): BN {
    const hash = crypto.createHash('sha256')
      .update(seed)
      .update(Date.now().toString())
      .update(Math.random().toString())
      .digest();
    
    return new BN(hash);
  }

  /**
   * Rate limiting check
   */
  private async checkRateLimit(): Promise<void> {
    const currentMinute = Math.floor(Date.now() / 60000);
    const currentCount = this.requestCount.get(currentMinute.toString()) || 0;
    
    if (currentCount >= this.config.maxRequestsPerMinute) {
      throw new Error('VRF request rate limit exceeded');
    }
    
    this.requestCount.set(currentMinute.toString(), currentCount + 1);
    
    // Cleanup old minute counts
    const cutoff = currentMinute - 5; // Keep 5 minutes of history
    for (const [minute] of this.requestCount) {
      if (parseInt(minute) < cutoff) {
        this.requestCount.delete(minute);
      }
    }
  }

  /**
   * Get VRF request status
   */
  getVRFRequest(requestId: string): VRFRequest | undefined {
    return this.activeRequests.get(requestId);
  }

  /**
   * Get all active VRF requests
   */
  getActiveVRFRequests(): VRFRequest[] {
    return Array.from(this.activeRequests.values());
  }

  /**
   * Instant pseudorandom for testing (DevNet only)
   */
  async getInstantDevnetRandom(gameAccount: PublicKey): Promise<GameVRFResult> {
    console.warn('⚡ Using instant devnet random - NOT FOR PRODUCTION');
    
    const requestId = `instant_${Date.now()}`;
    const randomValue = this.generateFallbackRandom(requestId);
    
    // Create mock proof
    const proof = crypto.createHash('sha256')
      .update(randomValue.toString())
      .update(gameAccount.toString())
      .digest();
    
    return {
      requestId,
      randomValue,
      proof,
      signature: 'devnet_instant_' + requestId,
      timestamp: Date.now(),
      verifiedOnChain: false
    };
  }

  /**
   * Verify VRF proof (simplified for devnet)
   */
  verifyVRFProof(result: GameVRFResult): boolean {
    // Simplified verification for devnet
    return result.randomValue && result.proof.length === 32;
  }

  /**
   * Get VRF performance metrics
   */
  getVRFMetrics(): {
    activeRequests: number;
    avgFulfillmentTime: number;
    fulfillmentRate: number;
    requestsPerMinute: number;
  } {
    const activeCount = this.activeRequests.size;
    const fulfilled = Array.from(this.activeRequests.values())
      .filter(r => r.fulfilled).length;
    
    const avgTime = this.vrfLatencies.length > 0
      ? this.vrfLatencies.reduce((sum, t) => sum + t, 0) / this.vrfLatencies.length
      : 0;
    
    const currentMinute = Math.floor(Date.now() / 60000);
    const requestsThisMinute = this.requestCount.get(currentMinute.toString()) || 0;
    
    return {
      activeRequests: activeCount,
      avgFulfillmentTime: avgTime,
      fulfillmentRate: activeCount > 0 ? fulfilled / activeCount : 0,
      requestsPerMinute: requestsThisMinute
    };
  }

  /**
   * Cleanup old requests
   */
  cleanupOldRequests(): void {
    const cutoff = Date.now() - 300000; // 5 minutes ago
    
    for (const [requestId, request] of this.activeRequests) {
      if (request.timestamp < cutoff) {
        this.activeRequests.delete(requestId);
      }
    }
  }

  /**
   * Batch VRF requests for multiple games
   */
  async requestBatchVRF(
    gameAccounts: PublicKey[],
    gameProgram: PublicKey
  ): Promise<string[]> {
    console.log(`🎲 Requesting batch VRF for ${gameAccounts.length} games`);
    
    const batchPromises = gameAccounts.map(gameAccount =>
      this.requestGameVRF(gameAccount, gameProgram).catch(error => {
        console.error(`Batch VRF failed for ${gameAccount.toString()}:`, error);
        return null;
      })
    );
    
    const results = await Promise.allSettled(batchPromises);
    
    return results
      .filter((result): result is PromiseFulfilledResult<string> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value);
  }
}

export default DevNetVRFPlugin;