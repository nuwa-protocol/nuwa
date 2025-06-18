// Environment configuration utility
// This module centralizes how the cadop-web application figures out
// backend endpoint URLs. It first honours explicitly supplied Vite
// environment variables (VITE_ROOCH_RPC_URL, VITE_API_URL). If they are
// not set it derives sensible defaults from the current hostname so
// that deployments do not have to provide env vars explicitly.

export interface AppEnvConfig {
  roochRpcUrl: string;
  apiUrl: string;
}

// These are the canonical endpoint values for each deployment tier.
const PRODUCTION_CONFIG: AppEnvConfig = {
  roochRpcUrl: 'https://main-seed.rooch.network',
  apiUrl: 'https://cadop.nuwa.dev',
};

const TESTNET_CONFIG: AppEnvConfig = {
  roochRpcUrl: 'https://test-seed.rooch.network',
  apiUrl: 'https://test-cadop.nuwa.dev',
};

const LOCAL_CONFIG: AppEnvConfig = {
  roochRpcUrl: 'http://localhost:6767',
  apiUrl: 'http://localhost:8080',
};

/**
 * Deduce the environment configuration from the current hostname.
 *
 * 1. Hosts that start with `test-` OR equal `test-id.nuwa.dev` are treated as testnet.
 * 2. Hosts that end with `id.nuwa.dev` are treated as production.
 * 3. Everything else falls back to the local development defaults.
 */
function resolveFromHost(hostname: string): AppEnvConfig {
  const lowerHost = hostname.toLowerCase();

  // Testnet detection
  if (lowerHost.startsWith('test-') || lowerHost === 'test-id.nuwa.dev') {
    return TESTNET_CONFIG;
  }

  // Production detection
  if (lowerHost === 'id.nuwa.dev' || lowerHost.endsWith('.id.nuwa.dev')) {
    return PRODUCTION_CONFIG;
  }

  // Fallback to testnet config
  return TESTNET_CONFIG;
}

function buildConfig(): AppEnvConfig {
  const envRooch = import.meta.env.VITE_ROOCH_RPC_URL as string | undefined;
  const envApi = import.meta.env.VITE_API_URL as string | undefined;

  // If both env vars are provided, honour them directly.
  if (envRooch && envApi) {
    return { roochRpcUrl: envRooch, apiUrl: envApi };
  }

  // Otherwise derive from hostname.
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return resolveFromHost(window.location.hostname);
  }

  // As a final safeguard use local defaults.
  return LOCAL_CONFIG;
}

const CONFIG = buildConfig();

export const ROOCH_RPC_URL = CONFIG.roochRpcUrl;
export const API_URL = CONFIG.apiUrl; 