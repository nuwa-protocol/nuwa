import { z } from 'zod';
import { SerializableSignedSubRAVSchema } from '../core';

/**
 * Schema for POST /commit request
 */
export const CommitRequestSchema = z.object({
  /** Signed SubRAV to be committed */
  subRav: SerializableSignedSubRAVSchema,
});

export type CommitRequest = z.infer<typeof CommitRequestSchema>;

/**
 * Schema for POST /commit response
 */
export const CommitResponseSchema = z.object({
  success: z.boolean(),
});

export type CommitResponse = z.infer<typeof CommitResponseSchema>;
