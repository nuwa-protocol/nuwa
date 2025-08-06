/**
 * Built-in API handlers registry for Payment Kit
 */

import type { Handler, ApiContext } from '../types/api';
import type { RouteOptions } from '../transport/express/BillableRouter';
import {
  handleRecovery,
  handleCommit,
  handleHealth,
  handleAdminClaims,
  handleAdminClaimTrigger,
  handleAdminCleanup,
  handleSubRavQuery
} from './handlers';

/**
 * Configuration for a built-in API handler
 */
export interface ApiHandlerConfig {
  handler: Handler<ApiContext, any, any>;
  options: RouteOptions;
  description?: string;
  // Suggested HTTP method (adapters may ignore this)
  method?: 'GET' | 'POST' | 'DELETE';
}

/**
 * Registry of built-in API handlers with their configuration
 * Key format: "/path" (no HTTP method, no path variables)
 */
export const BuiltInApiHandlers: Record<string, ApiHandlerConfig> = {
  // Note: Discovery endpoint is handled directly in ExpressPaymentKit at root level
  // to comply with well-known URI RFC specifications
  

  // Recovery endpoint (auth required)
  '/recovery': {
    handler: handleRecovery,
    method: 'GET',
    options: { pricing: '0', authRequired: true },
    description: 'Recover channel state and pending SubRAV'
  },
  
  // Commit endpoint (auth required)
  '/commit': {
    handler: handleCommit,
    method: 'POST',
    options: { pricing: '0', authRequired: true },
    description: 'Commit a signed SubRAV to the service'
  },
  
  // Health endpoint (public, no auth)
  '/health': {
    handler: handleHealth,
    method: 'GET',
    options: { pricing: '0', authRequired: false },
    description: 'Health check endpoint (public)'
  },

  '/subrav': {
    handler: handleSubRavQuery,
    method: 'GET',
    options: { pricing: '0', authRequired: true },  // Changed: auth required but not admin-only
    description: 'Get SubRAV details (requires auth, users can only query their own)'
  },
  
  // Admin endpoints
  '/admin/claims': {
    handler: handleAdminClaims,
    method: 'GET',
    options: { pricing: '0', adminOnly: true },
    description: 'Get claims status and statistics (admin only)'
  },
  '/admin/claim-trigger': {
    handler: handleAdminClaimTrigger,
    method: 'POST',
    options: { pricing: '0', adminOnly: true },
    description: 'Manually trigger claim for a specific channel (admin only)'
  },

  '/admin/cleanup': {
    handler: handleAdminCleanup,
    method: 'DELETE',
    options: { pricing: '0', adminOnly: true },
    description: 'Clean up old processed SubRAVs (admin only)'
  },
} as const;

export * from './handlers';