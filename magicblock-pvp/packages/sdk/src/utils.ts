import { PublicKey, Connection } from '@solana/web3.js';

export class GameUtils {
  static validatePublicKey(key: string): boolean {
    try {
      new PublicKey(key);
      return true;
    } catch {
      return false;
    }
  }

  static async waitForConfirmation(
    connection: Connection,
    signature: string,
    maxRetries: number = 30
  ): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const confirmation = await connection.getSignatureStatus(signature);
        if (confirmation.value?.confirmationStatus === 'confirmed' || 
            confirmation.value?.confirmationStatus === 'finalized') {
          return true;
        }
      } catch (error) {
        console.warn(`Confirmation check failed (attempt ${i + 1}):`, error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return false;
  }

  static generateMatchId(): string {
    return `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static calculateExperience(level: number, won: boolean): number {
    const baseXP = 100;
    const levelMultiplier = 1 + (level * 0.1);
    const winBonus = won ? 1.5 : 0.5;
    
    return Math.floor(baseXP * levelMultiplier * winBonus);
  }
}

export function formatPubkey(pubkey: PublicKey, length: number = 8): string {
  const str = pubkey.toString();
  return `${str.slice(0, length)}...${str.slice(-length)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}