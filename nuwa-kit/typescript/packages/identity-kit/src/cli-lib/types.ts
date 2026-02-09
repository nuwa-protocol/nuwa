import { KeyType } from '../types/crypto';

export interface DidCliConfig {
  network: 'main' | 'test';
  roochRpcUrl?: string;
  cadopDomain: string;
  idFragment: string;
}

export interface AgentKeyMaterial {
  keyType: KeyType;
  publicKeyMultibase: string;
  privateKeyMultibase: string;
  idFragment: string;
  createdAt: string;
}

export const DEFAULT_CONFIG: DidCliConfig = {
  network: 'main',
  roochRpcUrl: 'https://seed.rooch.network',
  cadopDomain: 'https://id.nuwa.dev',
  idFragment: 'agent-auth-1',
};

