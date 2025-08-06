import { z } from 'zod';
import { ServiceDiscoverySchema } from '../core';

/**
 * Schema for GET /.well-known/payment-service response (Discovery)
 * Uses the core ServiceDiscoverySchema for consistency
 */
export const DiscoveryResponseSchema = ServiceDiscoverySchema;

export type DiscoveryResponse = z.infer<typeof DiscoveryResponseSchema>;

/**
 * Discovery endpoint doesn't accept request parameters
 */
export const DiscoveryRequestSchema = z.object({}).passthrough();

export type DiscoveryRequest = z.infer<typeof DiscoveryRequestSchema>;