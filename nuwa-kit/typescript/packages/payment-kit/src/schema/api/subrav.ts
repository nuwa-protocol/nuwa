import { z } from 'zod';
import { SignedSubRAVSchema } from '../core';

/**
 * Schema for GET /subrav request (query parameters)
 */
export const SubRavRequestSchema = z.object({
  /** Nonce as string (from query params), will be converted to BigInt in handler */
  nonce: z.string(),
});

export type SubRavRequest = z.infer<typeof SubRavRequestSchema>;

/**
 * Schema for GET /subrav response - returns a SignedSubRAV if found
 * Uses the core SignedSubRAVSchema for consistency
 */
export const SubRavResponseSchema = SignedSubRAVSchema;

export type SubRavResponse = z.infer<typeof SubRavResponseSchema>;
