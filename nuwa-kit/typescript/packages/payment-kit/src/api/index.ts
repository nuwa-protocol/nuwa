/**
 * Built-in API handlers registry for Payment Kit
 */

import type { Handler, ApiContext } from '../types/api';
import {
  handleDiscovery,
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
 * Registry of built-in API handlers
 * Key format: "METHOD /path"
 */
export const BuiltInApiHandlers: Record<string, Handler<ApiContext, any, any>> = {
  // Note: Discovery endpoint is handled directly in ExpressPaymentKit at root level
  // to comply with well-known URI RFC specifications
  
  // Price endpoint (public, no auth)
  'GET /price': handlePrice,
  
  // Recovery endpoint (auth required)
  'GET /recovery': handleRecovery,
  
  // Commit endpoint (auth required)
  'POST /commit': handleCommit,
  
  // Admin endpoints
  'GET /admin/health': handleAdminHealth, // public
  'GET /admin/claims': handleAdminClaims, // admin only
  'POST /admin/claim/:channelId': handleAdminClaimTrigger, // admin only
  'GET /admin/subrav/:channelId/:nonce': handleAdminSubRav, // admin only
  'DELETE /admin/cleanup': handleAdminCleanup, // admin only
} as const;

export * from './handlers';