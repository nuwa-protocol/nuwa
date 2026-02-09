import { KeyType } from '../types/crypto';

export interface DidCliConfig {
  network: 'main' | 'test';
  roochRpcUrl?: string;
  cadopDomain: string;
  keyFragment: string;
}

export interface AgentKeyMaterial {
  keyType: KeyType;
  publicKeyMultibase: string;
  privateKeyMultibase: string;
  keyFragment: string;
  createdAt: string;
}

export const DEFAULT_CONFIG: DidCliConfig = {
  network: 'main',
  cadopDomain: 'https://id.nuwa.dev',
  keyFragment: 'agent-auth-1',
};
