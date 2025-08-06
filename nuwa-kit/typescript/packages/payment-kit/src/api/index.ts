/**
 * Built-in API handlers registry for Payment Kit
 */

import type { Handler, ApiContext } from '../types/api';
import type { RouteOptions } from '../transport/express/BillableRouter';
import {
  handlePrice,
  handleRecovery,
  handleCommit,
  handleAdminHealth,
  handleAdminClaims,
  handleAdminClaimTrigger,
  handleAdminSubRav,
  handleAdminCleanup
} from './handlers';

/**
 * Configuration for a built-in API handler
 */
export interface ApiHandlerConfig {
  handler: Handler<ApiContext, any, any>;
  options: RouteOptions;
  description?: string;
}

/**
 * Registry of built-in API handlers with their configuration
 * Key format: "METHOD /path"
 */
export const BuiltInApiHandlers: Record<string, ApiHandlerConfig> = {
  // Note: Discovery endpoint is handled directly in ExpressPaymentKit at root level
  // to comply with well-known URI RFC specifications
  
  // Price endpoint (public, no auth)
  'GET /price': {
    handler: handlePrice,
    options: { pricing: '0', authRequired: false },
    description: 'Get asset price information'
  },
  
  // Recovery endpoint (auth required)
  'GET /recovery': {
    handler: handleRecovery,
    options: { pricing: '0', authRequired: true },
    description: 'Recover channel state and pending SubRAV'
  },
  
  // Commit endpoint (auth required)
  'POST /commit': {
    handler: handleCommit,
    options: { pricing: '0', authRequired: true },
    description: 'Commit a signed SubRAV to the service'
  },
  
  // Admin endpoints
  'GET /admin/health': {
    handler: handleAdminHealth,
    options: { pricing: '0', authRequired: false },
    description: 'Health check endpoint (public)'
  },
  'GET /admin/claims': {
    handler: handleAdminClaims,
    options: { pricing: '0', adminOnly: true },
    description: 'Get claims status and statistics (admin only)'
  },
  'POST /admin/claim/:channelId': {
    handler: handleAdminClaimTrigger,
    options: { pricing: '0', adminOnly: true },
    description: 'Manually trigger claim for a specific channel (admin only)'
  },
  'GET /admin/subrav/:channelId/:nonce': {
    handler: handleAdminSubRav,
    options: { pricing: '0', adminOnly: true },
    description: 'Get SubRAV details for debugging (admin only)'
  },
  'DELETE /admin/cleanup': {
    handler: handleAdminCleanup,
    options: { pricing: '0', adminOnly: true },
    description: 'Clean up old processed SubRAVs (admin only)'
  },
} as const;

export * from './handlers';