import { z } from 'zod';
import { 
  ClaimsStatusSchema,
  ClaimTriggerRequestSchema as CoreClaimTriggerRequestSchema,
  ClaimTriggerResponseSchema as CoreClaimTriggerResponseSchema,
  CleanupRequestSchema as CoreCleanupRequestSchema,
  CleanupResponseSchema as CoreCleanupResponseSchema
} from '../core';

/**
 * Schema for GET /admin/claims response
 * Uses the core ClaimsStatusSchema for consistency
 */
export const ClaimsStatusResponseSchema = ClaimsStatusSchema;

export type ClaimsStatusResponse = z.infer<typeof ClaimsStatusResponseSchema>;

/**
 * Schema for POST /admin/claim-trigger request
 * Uses the core ClaimTriggerRequestSchema for consistency
 */
export const ClaimTriggerRequestSchema = CoreClaimTriggerRequestSchema;

export type ClaimTriggerRequest = z.infer<typeof ClaimTriggerRequestSchema>;

/**
 * Schema for POST /admin/claim-trigger response
 * Uses the core ClaimTriggerResponseSchema for consistency
 */
export const ClaimTriggerResponseSchema = CoreClaimTriggerResponseSchema;

export type ClaimTriggerResponse = z.infer<typeof ClaimTriggerResponseSchema>;

/**
 * Schema for DELETE /admin/cleanup request
 * Uses the core CleanupRequestSchema for consistency
 */
export const CleanupRequestSchema = CoreCleanupRequestSchema;

export type CleanupRequest = z.infer<typeof CleanupRequestSchema>;

/**
 * Schema for DELETE /admin/cleanup response
 * Uses the core CleanupResponseSchema for consistency
 */
export const CleanupResponseSchema = CoreCleanupResponseSchema;

export type CleanupResponse = z.infer<typeof CleanupResponseSchema>;

/**
 * Admin endpoints that don't accept request parameters use passthrough empty objects
 */
export const AdminRequestSchema = z.object({}).passthrough();

export type AdminRequest = z.infer<typeof AdminRequestSchema>;