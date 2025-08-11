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
  handleSubRavQuery,
} from './handlers';

import { createValidatedHandler } from './utils';
import {
  RecoveryRequestSchema,
  RecoveryResponseSchema,
  CommitRequestSchema,
  CommitResponseSchema,
  HealthRequestSchema,
  HealthResponseSchema,
  SubRavRequestSchema,
  SubRavResponseSchema,
  AdminRequestSchema,
  ClaimsStatusResponseSchema,
  // Import admin schemas from core since they're the same
  ClaimTriggerRequestSchema,
  ClaimTriggerResponseSchema,
} from '../schema';

/**
 * Configuration for a built-in API handler
 */
export interface ApiHandlerConfig {
  handler: Handler<ApiContext, any, any>;
  options: RouteOptions;
  description?: string;
  // HTTP method for REST adapters (MCP/JSON-RPC adapters may ignore this)
  method?: 'GET' | 'POST' | 'DELETE';
  // REST path for HTTP adapters (other adapters may ignore this)
  path?: string;
}

/**
 * Registry of built-in API handlers with their configuration
 * Key format: semantic handler name (protocol agnostic)
 */
export const BuiltInApiHandlers: Record<string, ApiHandlerConfig> = {
  // Note: Discovery endpoint is handled directly in ExpressPaymentKit at root level
  // to comply with well-known URI RFC specifications

  // Core payment operations
  recovery: {
    handler: createValidatedHandler({
      schema: {
        request: RecoveryRequestSchema,
        response: RecoveryResponseSchema,
      },
      handler: handleRecovery,
    }),
    method: 'GET',
    path: '/recovery',
    options: { pricing: '0', authRequired: true },
    description: 'Recover channel state and pending SubRAV',
  },

  commit: {
    handler: createValidatedHandler({
      schema: {
        request: CommitRequestSchema,
        response: CommitResponseSchema,
      },
      handler: handleCommit,
    }),
    method: 'POST',
    path: '/commit',
    options: { pricing: '0', authRequired: true },
    description: 'Commit a signed SubRAV to the service',
  },

  // System operations
  health: {
    handler: createValidatedHandler({
      schema: {
        request: HealthRequestSchema,
        response: HealthResponseSchema,
      },
      handler: handleHealth,
    }),
    method: 'GET',
    path: '/health',
    options: { pricing: '0', authRequired: false },
    description: 'Health check endpoint (public)',
  },

  subravQuery: {
    handler: createValidatedHandler({
      schema: {
        request: SubRavRequestSchema,
        response: SubRavResponseSchema,
      },
      handler: handleSubRavQuery,
    }),
    method: 'GET',
    path: '/subrav',
    options: { pricing: '0', authRequired: true },
    description: 'Get SubRAV details (requires auth, users can only query their own)',
  },

  // Admin operations
  adminClaims: {
    handler: createValidatedHandler({
      schema: {
        request: AdminRequestSchema,
        response: ClaimsStatusResponseSchema,
      },
      handler: handleAdminClaims,
    }),
    method: 'GET',
    path: '/admin/claims',
    options: { pricing: '0', adminOnly: true },
    description: 'Get claims status and statistics (admin only)',
  },

  adminClaimTrigger: {
    handler: createValidatedHandler({
      schema: {
        request: ClaimTriggerRequestSchema,
        response: ClaimTriggerResponseSchema,
      },
      handler: handleAdminClaimTrigger,
    }),
    method: 'POST',
    path: '/admin/claim-trigger',
    options: { pricing: '0', adminOnly: true },
    description: 'Manually trigger claim for a specific channel (admin only)',
  },
} as const;

export * from './handlers';
