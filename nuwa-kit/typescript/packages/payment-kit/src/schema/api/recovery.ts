import { z } from 'zod';
import { SubRAVSchema, ChannelInfoSchema } from '../core';

/**
 * Schema for GET /recovery response
 * Uses core schemas for proper type safety and validation
 */
export const RecoveryResponseSchema = z.object({
  /** Channel information if channel exists */
  channel: ChannelInfoSchema.nullable(),
  /** Pending SubRAV if any exists for recovery */
  pendingSubRav: SubRAVSchema.nullable(),
  /** Response timestamp in ISO-8601 format */
  timestamp: z.string(),
});

export type RecoveryResponse = z.infer<typeof RecoveryResponseSchema>;

/**
 * The recovery endpoint currently does not accept any request body.
 * We still declare an empty schema so that the helper utilities work
 * consistently across every endpoint.
 */
export const RecoveryRequestSchema = z.object({}).passthrough();

export type RecoveryRequest = z.infer<typeof RecoveryRequestSchema>;
