import { z } from 'zod';
import { SystemStatusSchema, ClaimTriggerRequestSchema as CoreClaimTriggerRequestSchema, ClaimTriggerResponseSchema as CoreClaimTriggerResponseSchema } from '../core';

/**
 * Schema for GET /admin/status response
 */
export const SystemStatusResponseSchema = SystemStatusSchema;

export type SystemStatusResponse = z.infer<typeof SystemStatusResponseSchema>;

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
 * Admin endpoints that don't accept request parameters use passthrough empty objects
 */
export const AdminRequestSchema = z.object({}).passthrough();

export type AdminRequest = z.infer<typeof AdminRequestSchema>;
