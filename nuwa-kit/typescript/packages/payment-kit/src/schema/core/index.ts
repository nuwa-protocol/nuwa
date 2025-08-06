import { z } from 'zod';
import { LosslessNumber } from 'lossless-json';

/**
 * Helper to create a schema that accepts either BigInt, string, number, or LosslessNumber
 * and transforms it to BigInt for our internal use
 */
export const createBigIntSchema = () => z
  .union([
    z.bigint(),
    z.string().transform(BigInt),
    z.number().transform(BigInt),
    z.instanceof(LosslessNumber).transform(val => BigInt(val.toString())),
  ]);

/**
 * Core SubRAV schema that matches the SubRAV interface from core/types.ts
 * This is the authoritative schema for SubRAV objects across the entire payment-kit
 */
export const SubRAVSchema = z.object({
  /** Protocol version (default: 1) */
  version: z.number(),
  /** Blockchain identifier (e.g., 4 for Rooch testnet) */
  chainId: createBigIntSchema(),
  /** Deterministic channel identifier (32-byte hex string) */
  channelId: z.string(),
  /** Channel epoch to prevent replay attacks across channel resets */
  channelEpoch: createBigIntSchema(),
  /** DID verification method fragment (e.g., 'key-1') */
  vmIdFragment: z.string(),
  /** Total amount ever sent through this sub-channel */
  accumulatedAmount: createBigIntSchema(),
  /** Strictly increasing nonce per sub-channel */
  nonce: createBigIntSchema(),
});

export type SubRAV = z.infer<typeof SubRAVSchema>;

/**
 * SignedSubRAV schema that includes signature fields
 * This matches the SignedSubRAV interface from core/types.ts
 */
export const SignedSubRAVSchema = SubRAVSchema.extend({
  /** Cryptographic signature over the SubRAV */
  signature: z.string(),
  /** Recovery ID for signature verification (optional) */
  recoveryId: z.number().optional(),
});

export type SignedSubRAV = z.infer<typeof SignedSubRAVSchema>;

/**
 * Asset information schema
 */
export const AssetInfoSchema = z.object({
  /** Asset identifier (e.g., "0x3::gas_coin::RGas") */
  id: z.string(),
  /** Asset symbol (e.g., "RGas") */
  symbol: z.string(),
  /** Asset name (e.g., "Rooch Gas") */
  name: z.string(),
  /** Number of decimal places */
  decimals: z.number(),
});

export type AssetInfo = z.infer<typeof AssetInfoSchema>;

/**
 * Channel status enumeration
 */
export const ChannelStatusSchema = z.enum(['Open', 'Closed', 'Disputed']);

export type ChannelStatus = z.infer<typeof ChannelStatusSchema>;

/**
 * Channel information schema
 */
export const ChannelInfoSchema = z.object({
  /** Channel identifier */
  channelId: z.string(),
  /** Channel status */
  status: ChannelStatusSchema,
  /** Current channel epoch */
  channelEpoch: createBigIntSchema(),
  /** Total deposited amount */
  depositedAmount: createBigIntSchema(),
  /** Total claimed amount */
  claimedAmount: createBigIntSchema(),
  /** Asset information */
  asset: AssetInfoSchema,
  /** Channel creation timestamp */
  createdAt: z.string().optional(),
  /** Last update timestamp */
  updatedAt: z.string().optional(),
});

export type ChannelInfo = z.infer<typeof ChannelInfoSchema>;

/**
 * Service discovery information schema
 */
export const ServiceDiscoverySchema = z.object({
  /** Protocol version */
  version: z.number(),
  /** Service identifier */
  serviceId: z.string(),
  /** Service DID */
  serviceDid: z.string(),
  /** Network identifier */
  network: z.string(),
  /** Default asset identifier */
  defaultAssetId: z.string(),
  /** Default price in pico USD (optional) */
  defaultPricePicoUSD: z.string().optional(),
  /** API base path */
  basePath: z.string(),
});

export type ServiceDiscovery = z.infer<typeof ServiceDiscoverySchema>;

/**
 * Health check response schema
 */
export const HealthCheckSchema = z.object({
  /** Operation success status */
  success: z.boolean(),
  /** Health status description */
  status: z.string(),
  /** Response timestamp in ISO-8601 format */
  timestamp: z.string(),
  /** Whether payment kit is enabled */
  paymentKitEnabled: z.boolean(),
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;

/**
 * Claims status information schema
 */
export const ClaimsStatusSchema = z.object({
  /** Current claims status data */
  claimsStatus: z.any(), // TODO: Define more specific schema based on actual structure
  /** Processing statistics */
  processingStats: z.any(), // TODO: Define more specific schema based on actual structure  
  /** Response timestamp in ISO-8601 format */
  timestamp: z.string(),
});

export type ClaimsStatus = z.infer<typeof ClaimsStatusSchema>;

/**
 * Claim trigger request schema
 */
export const ClaimTriggerRequestSchema = z.object({
  /** Channel identifier to trigger claim for */
  channelId: z.string(),
});

export type ClaimTriggerRequest = z.infer<typeof ClaimTriggerRequestSchema>;

/**
 * Claim trigger response schema
 */
export const ClaimTriggerResponseSchema = z.object({
  /** Operation success status */
  success: z.boolean(),
  /** Channel identifier that was processed */
  channelId: z.string(),
});

export type ClaimTriggerResponse = z.infer<typeof ClaimTriggerResponseSchema>;

/**
 * Cleanup request schema
 */
export const CleanupRequestSchema = z.object({
  /** Maximum age in minutes (optional) */
  maxAge: z.number().optional(),
});

export type CleanupRequest = z.infer<typeof CleanupRequestSchema>;

/**
 * Cleanup response schema
 */
export const CleanupResponseSchema = z.object({
  /** Number of items cleared */
  clearedCount: z.number(),
  /** Maximum age in minutes that was used */
  maxAgeMinutes: z.number(),
});

export type CleanupResponse = z.infer<typeof CleanupResponseSchema>;

/**
 * Standard error codes enumeration - kept here as it's used for validating error responses
 */
export const ErrorCodeSchema = z.enum([
  // Authentication & Authorization
  'UNAUTHORIZED',
  'FORBIDDEN',
  
  // Payment related
  'PAYMENT_REQUIRED',
  'INSUFFICIENT_FUNDS',
  'CONFLICT',
  
  // General errors
  'NOT_FOUND',
  'BAD_REQUEST',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
]);

export type ErrorCodeType = z.infer<typeof ErrorCodeSchema>;

/**
 * Standard API error structure - kept here as it's validated in responses
 */
export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.any().optional(),
  httpStatus: z.number().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;