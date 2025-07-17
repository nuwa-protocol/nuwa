import { DIDDocument } from '../types/did';
import { KeyManager } from '../keys/KeyManager';
import { SignerInterface } from '../signers/types';
import { KeyType } from '../types/crypto';

/**
 * Options for bootstrapping test environment
 */
export interface TestEnvOptions {
  /** Rooch RPC endpoint URL, defaults to ROOCH_NODE_URL env var or http://localhost:6767 */
  rpcUrl?: string;
  /** Network type */
  network?: 'local' | 'dev' | 'test' | 'main';
  /** Auto start local node if RPC URL is not accessible (useful for CI) */
  autoStartLocalNode?: boolean;
  /** Amount to fund new accounts via faucet */
  faucetAmount?: bigint;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Result of creating a self-managed DID
 */
export interface CreateSelfDidResult {
  /** The created DID string */
  did: string;
  /** KeyManager with the account key imported */
  keyManager: KeyManager;
  /** Signer interface for this DID */
  signer: SignerInterface;
  /** The Rooch address associated with this DID */
  address: string;
}

/**
 * Options for creating a self-managed DID
 */
export interface CreateSelfDidOptions {
  /** Key type to use for the account key */
  keyType?: KeyType;
  /** Custom fragment for the account key */
  keyFragment?: string;
  /** Skip funding the account (useful if account already has funds) */
  skipFunding?: boolean;
}



/**
 * Options for creating a CADOP DID scenario
 */
export interface CreateCadopDidOptions {
  /** Key type for the user's did:key */
  userKeyType?: KeyType;
  /** Key type for the custodian's service key */
  custodianKeyType?: KeyType;
  /** Skip funding accounts */
  skipFunding?: boolean;
}

/**
 * Environment check result
 */
export interface EnvironmentCheck {
  /** Whether tests should be skipped */
  shouldSkip: boolean;
  /** Reason for skipping (if any) */
  reason?: string;
  /** Available RPC URL */
  rpcUrl?: string;
} 