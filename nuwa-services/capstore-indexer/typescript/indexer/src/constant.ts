import { getRoochNodeUrl } from "@roochnetwork/rooch-sdk";
import { config } from "dotenv";
import type { Target } from "./type.js";

config();

export const TARGET: Target = (process.env.TARGET as Target) || 'local';
export const SUPABASE_URL = process.env.SUPABASE_URL || (() => { throw new Error('SUPABASE_URL is required') })();
export const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || (() => { throw new Error('SUPABASE_ANON_KEY is required') })();
export const IPFS_GATEWAY = process.env.IPFS_GATEWAY || (TARGET === 'local' ? 'http://localhost:5001' : 'https://ipfs.io/ipfs');
export const IPFS_NODE_URL = process.env.IPFS_NODE_URL
export const IPFS_NODE = process.env.IPFS_NODE || (TARGET === 'local' ? 'localhost' : (() => { throw new Error('IPFS_NODE is required') })());
export const IPFS_NODE_PORT = process.env.IPFS_NODE_PORT || (TARGET === 'local' ? '5001' : (() => { throw new Error('IPFS_NODE_PORT is required') })());
export const PACKAGE_ID = process.env.PACKAGE_ID || (() => { throw new Error('PACKAGE_ID is required') })();
export const ROOCH_NODE_URL = TARGET === 'local' ? getRoochNodeUrl('localnet') : process.env.ROOCH_NODE_URL || getRoochNodeUrl('testnet');