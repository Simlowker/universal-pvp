
/**
 * MagicBlock Service - Updated to use real SDK
 */

import { 
  initializeMagicBlockSDK, 
  MagicBlockSDKInstance,
  MagicBlockStatus,
  MagicBlockMetrics 
} from '../magicblock/index';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';

export class MagicBlockService {
  private sdk: MagicBlockSDKInstance | null = null;
  private isInitialized = false;
  
  async initialize(authority: Keypair): Promise<void> {
    if (this.isInitialized) return;
    
    this.sdk = await initializeMagicBlockSDK({
      network: 'devnet',
      authority,
      enableVRF: true,
      enableRollups: true,
      enableGasless: true,
      maxLatencyMs: 30,
      autoOptimize: true
    });
    
    this.isInitialized = true;
  }
  
  getSDK(): MagicBlockSDKInstance {
    if (!this.sdk) {
      throw new Error('MagicBlock SDK not initialized');
    }
    return this.sdk;
  }
  
  async getStatus(): Promise<MagicBlockStatus> {
    return this.getSDK().getStatus();
  }
  
  getMetrics(): MagicBlockMetrics {
    return this.getSDK().getMetrics();
  }
  
  async cleanup(): Promise<void> {
    if (this.sdk) {
      await this.sdk.cleanup();
      this.sdk = null;
      this.isInitialized = false;
    }
  }
}

export default MagicBlockService;
