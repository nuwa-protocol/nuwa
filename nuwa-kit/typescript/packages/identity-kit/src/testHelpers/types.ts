import { KeyManager } from '../keys/KeyManager';
import { SignerInterface } from '../signers/types';
import { KeyType } from '../types/crypto';
import type { IdentityEnv } from '../IdentityEnv';

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
  /** The VM ID fragment associated with this DID */
  vmIdFragment: string;
  /** KeyManager with the account key imported */
  keyManager: KeyManager;
  /** Signer interface for this DID */
  signer: SignerInterface;
  /** Pre-configured IdentityEnv for this DID (convenient for Payment Kit integration) */
  identityEnv: IdentityEnv;
}

/**
 * Options for creating a self-managed DID
 */
export interface CreateSelfDidOptions {
  /** Key type to use for the account key */
  keyType?: KeyType;
  secretKey?: string;
  /** Custom fragment for the account key */
  keyFragment?: string;
  /** Skip funding the account (useful if account already has funds) */
  skipFunding?: boolean;
  /** Custom session key scopes (for Rooch VDR) */
  customScopes?: string[];
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
