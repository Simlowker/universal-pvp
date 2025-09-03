// MagicBlock SDK - Main Export
export * from './types';
export * from './utils';
export * from './clients/magicblock-client';
export * from './clients/game-client';
export * from './vrf/vrf-client';
export * from './vrf/ecvrf';
export * from './tee/attestation';
export * from './session/session-manager';
export * from './session/cost-tracker';
export * from './session/transaction-queue';
export * from './proof/rollup-verifier';

// Re-export commonly used types
export type {
  MagicBlockConfig,
  VRFConfig,
  SessionConfig,
  GameClientConfig,
  VRFProof,
  VRFOutput,
  TEEAttestation,
  RollupProof,
  TransactionWithMetadata,
  CostEstimate,
  SessionState
} from './types';