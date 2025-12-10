import { getRoochNodeUrl } from '@roochnetwork/rooch-sdk';
import { config } from 'dotenv';
import type { Target } from './type.js';

config();

const normalizeTarget = (value: string | undefined): Target => {
  const normalized = (value || '').toLowerCase();
  switch (normalized) {
    case 'main':
    case 'mainnet':
      return 'main';
    case 'test':
    case 'testnet':
      return 'test';
    case 'dev':
    case 'devnet':
      return 'dev';
    case 'local':
    case 'localnet':
    default:
      return 'local';
  }
};

// Allow ROOCH_NETWORK as an alias for TARGET to unify network config
export const TARGET: Target = normalizeTarget(
  process.env.ROOCH_NETWORK || process.env.TARGET || 'local'
);
export const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  (() => {
    throw new Error('SUPABASE_URL is required');
  })();
export const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  (() => {
    throw new Error('SUPABASE_ANON_KEY is required');
  })();
export const IPFS_GATEWAY =
  process.env.IPFS_GATEWAY ||
  (TARGET === 'local' ? 'http://localhost:5001' : 'https://ipfs.io/ipfs');
export const IPFS_NODE_URL = process.env.IPFS_NODE_URL;
export const IPFS_NODE =
  process.env.IPFS_NODE ||
  (TARGET === 'local'
    ? 'localhost'
    : (() => {
        throw new Error('IPFS_NODE is required');
      })());
export const IPFS_NODE_PORT =
  process.env.IPFS_NODE_PORT ||
  (TARGET === 'local'
    ? '5001'
    : (() => {
        throw new Error('IPFS_NODE_PORT is required');
      })());
const DEFAULT_PACKAGE_IDS: Partial<Record<Target, string>> = {
  main: '0x701c21bf1c8cd5af8c42983890d8ca55e7a820171b8e744c13f2d9998bf76cc3',
  test: '0xeb1deb6f1190f86cd4e05a82cfa5775a8a5929da49fac3ab8f5bf23e9181e625',
};

export const PACKAGE_ID =
  process.env.PACKAGE_ID ||
  DEFAULT_PACKAGE_IDS[TARGET] ||
  (() => {
    throw new Error('PACKAGE_ID is required');
  })();

const roochNetworkName =
  TARGET === 'local' ? 'localnet' : TARGET === 'main' ? 'mainnet' : 'testnet';

export const ROOCH_NODE_URL =
  process.env.ROOCH_NODE_URL || getRoochNodeUrl(roochNetworkName);
