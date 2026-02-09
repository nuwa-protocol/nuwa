import { KeyType } from '../types/crypto';

export type CliNetwork = 'main' | 'test';

export interface DidCliProfile {
  did?: string;
  network: CliNetwork;
  roochRpcUrl?: string;
  cadopDomain: string;
  keyFragment: string;
  keyFile: string;
}

export interface DidCliConfig {
  version: 2;
  activeProfile: string;
  profiles: Record<string, DidCliProfile>;
}

export interface ActiveProfile {
  name: string;
  profile: DidCliProfile;
}

export interface NewProfileInput {
  name: string;
  network: CliNetwork;
  roochRpcUrl?: string;
  cadopDomain: string;
  keyFragment: string;
  did?: string;
}

export interface AgentKeyMaterial {
  keyType: KeyType;
  publicKeyMultibase: string;
  privateKeyMultibase: string;
  keyFragment: string;
  createdAt: string;
}

export const DEFAULT_PROFILE_NAME = 'default';

export function makeDefaultConfig(): DidCliConfig {
  return makeSingleProfileConfig({
    name: DEFAULT_PROFILE_NAME,
    network: 'main',
    cadopDomain: 'https://id.nuwa.dev',
    keyFragment: 'agent-auth-1',
  });
}

export function makeSingleProfileConfig(input: NewProfileInput): DidCliConfig {
  return {
    version: 2,
    activeProfile: input.name,
    profiles: {
      [input.name]: {
        did: input.did,
        network: input.network,
        roochRpcUrl: input.roochRpcUrl,
        cadopDomain: input.cadopDomain,
        keyFragment: input.keyFragment,
        keyFile: `keys/${input.name}.json`,
      },
    },
  };
}
