import { z } from 'zod';
import { HealthCheckSchema } from '../core';

/**
 * Schema for GET /health response
 * Uses the core HealthCheckSchema for consistency
 */
export const HealthResponseSchema = HealthCheckSchema;

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * Health endpoint doesn't accept request parameters
 */
export const HealthRequestSchema = z.object({}).passthrough();

export type HealthRequest = z.infer<typeof HealthRequestSchema>;
