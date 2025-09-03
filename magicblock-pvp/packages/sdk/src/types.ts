import { PublicKey, Transaction, Connection, Keypair } from '@solana/web3.js';
import { EventEmitter } from 'eventemitter3';

// Existing game types
export interface Player {
  publicKey: PublicKey;
  username: string;
  level: number;
  experience: number;
  wins: number;
  losses: number;
}

export interface Match {
  id: PublicKey;
  players: PublicKey[];
  status: MatchStatus;
  startTime: number;
  endTime?: number;
  winner?: PublicKey;
}

export enum MatchStatus {
  Pending = 0,
  Active = 1,
  Completed = 2,
  Cancelled = 3,
}

export interface GameAction {
  type: ActionType;
  player: PublicKey;
  data: any;
  timestamp: number;
}

export enum ActionType {
  Move = 0,
  Attack = 1,
  Defend = 2,
  UseItem = 3,
  Special = 4,
}

export interface GameState {
  match: Match;
  players: Player[];
  currentTurn: PublicKey;
  actions: GameAction[];
}

// MagicBlock SDK Configuration Types
export interface MagicBlockConfig {
  connection: Connection;
  rollupUrl: string;
  chainId: number;
  gaslessEnabled: boolean;
  sessionTimeout: number;
  maxRetries: number;
}

export interface VRFConfig {
  curve: 'edwards25519';
  hashSuite: 'sha512';
  seed?: Uint8Array;
  latencyTarget: number; // <10ms
}

export interface SessionConfig {
  maxDuration: number;
  gaslessTransactions: boolean;
  autoRenew: boolean;
  batchSize: number;
}

export interface GameClientConfig extends MagicBlockConfig {
  vrf: VRFConfig;
  session: SessionConfig;
  teeVerification: boolean;
}

// VRF Types (ECVRF per RFC 9381)
export interface VRFKeyPair {
  publicKey: Uint8Array; // 32 bytes for Edwards25519
  secretKey: Uint8Array; // 32 bytes
}

export interface VRFProof {
  gamma: Uint8Array; // 32 bytes
  c: Uint8Array; // 16 bytes  
  s: Uint8Array; // 32 bytes
  alpha: Uint8Array; // Input message
}

export interface VRFOutput {
  beta: Uint8Array; // 32 bytes hash output
  proof: VRFProof;
  isValid: boolean;
}

export interface VRFVerificationResult {
  isValid: boolean;
  output?: Uint8Array;
  error?: string;
  latency: number;
}

// TEE Attestation Types
export interface TEEAttestation {
  vendor: 'intel-sgx' | 'amd-sev' | 'arm-trustzone' | 'generic';
  quote: Uint8Array;
  signature: Uint8Array;
  certificate: Uint8Array;
  timestamp: number;
  mrenclave?: Uint8Array; // Intel SGX
  mrsigner?: Uint8Array;  // Intel SGX
  reportData?: Uint8Array; // AMD SEV
}

export interface TEEVerificationResult {
  isValid: boolean;
  vendor: string;
  timestamp: number;
  error?: string;
}

// Session Management Types
export interface SessionState {
  id: string;
  publicKey: PublicKey;
  isActive: boolean;
  createdAt: number;
  expiresAt: number;
  gaslessTransactions: number;
  totalCost: number;
}

export interface SessionMetrics {
  transactionsProcessed: number;
  gasUsed: number;
  costInSOL: number;
  averageLatency: number;
  successRate: number;
}

// Transaction Queue Types
export interface TransactionWithMetadata {
  transaction: Transaction;
  priority: 'low' | 'medium' | 'high' | 'critical';
  maxFee: number;
  timeout: number;
  retries: number;
  metadata: Record<string, any>;
}

export interface QueueMetrics {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  averageProcessingTime: number;
}

// Cost Estimation Types
export interface CostEstimate {
  baseFee: number;
  priorityFee: number;
  computeUnits: number;
  totalCost: number;
  confidence: number; // 0-1
}

export interface CostTracking {
  totalSpent: number;
  transactionCount: number;
  averageCost: number;
  hourlySpend: number;
  projectedDailySpend: number;
}

// Rollup Proof Types
export interface RollupProof {
  stateRoot: Uint8Array;
  blockHash: Uint8Array;
  transactionHash: Uint8Array;
  signature: Uint8Array;
  timestamp: number;
  blockNumber: number;
}

export interface ProofVerificationResult {
  isValid: boolean;
  blockNumber: number;
  timestamp: number;
  error?: string;
}

// Event Types
export interface SDKEvents {
  // Session events
  'session:created': (session: SessionState) => void;
  'session:expired': (sessionId: string) => void;
  
  // Transaction events
  'transaction:queued': (tx: TransactionWithMetadata) => void;
  'transaction:confirmed': (signature: string) => void;
  'transaction:failed': (error: Error, tx: TransactionWithMetadata) => void;
  
  // VRF events
  'vrf:generated': (output: VRFOutput) => void;
  'winners:selected': (result: WinnerSelectionResult) => void;
  
  // Proof events
  'proof:verified': (result: ProofVerificationResult) => void;
  
  // Cost events
  'cost:updated': (tracking: CostTracking) => void;
  
  // Game events
  'initialized': (data: { vrfPublicKey: string }) => void;
  'match:created': (data: { match: Match; vrfOutput?: VRFOutput }) => void;
  'match:completed': (data: { match: Match; winnerSelection: WinnerSelectionResult }) => void;
  'match:committed': (data: { matchId: string; signature: string }) => void;
  'action:executed': (data: { matchId: string; action: GameAction; vrfOutput?: VRFOutput }) => void;
}

// Winner Selection Types (for VRF)
export interface WinnerSelectionConfig {
  totalParticipants: number;
  winnerCount: number;
  seed: Uint8Array;
  weights?: number[]; // Optional weighted selection
}

export interface WinnerSelectionResult {
  winners: number[]; // Indices of winners
  proof: VRFProof;
  randomness: Uint8Array;
  selectionTime: number;
}

// Error Types
export class MagicBlockError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'MagicBlockError';
  }
}

export class VRFError extends MagicBlockError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'VRF_ERROR', details);
    this.name = 'VRFError';
  }
}

export class TEEError extends MagicBlockError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'TEE_ERROR', details);
    this.name = 'TEEError';
  }
}

export class SessionError extends MagicBlockError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'SESSION_ERROR', details);
    this.name = 'SessionError';
  }
}