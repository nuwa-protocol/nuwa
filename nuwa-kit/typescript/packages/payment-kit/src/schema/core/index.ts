import { z } from 'zod';
import { LosslessNumber } from 'lossless-json';

/**
 * Helper to create a schema that accepts either BigInt, string, number, or LosslessNumber
 * and transforms it to BigInt for our internal use
 */
export const createBigIntSchema = () =>
  z.union([
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
export const SignedSubRAVSchema = z.object({
  /** SubRAV */
  subRav: SubRAVSchema,
  /** Cryptographic signature over the SubRAV */
  signature: z.string(),
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
 * Channel status enumeration (matches core/types.ts)
 */
export const ChannelStatusSchema = z.enum(['active', 'closing', 'closed']);

export type ChannelStatus = z.infer<typeof ChannelStatusSchema>;

/**
 * Channel information schema (matches core/types.ts ChannelInfo interface)
 */
export const ChannelInfoSchema = z.object({
  /** Channel identifier */
  channelId: z.string(),
  /** Payer DID */
  payerDid: z.string(),
  /** Payee DID */
  payeeDid: z.string(),
  /** Asset identifier */
  assetId: z.string(),
  /** Channel epoch */
  epoch: createBigIntSchema(),
  /** Channel status */
  status: ChannelStatusSchema,
});

export type ChannelInfo = z.infer<typeof ChannelInfoSchema>;

/**
 * Sub-channel state schema (matches contracts/IPaymentChannelContract SubChannelInfo)
 * Exposed for API schemas that need to serialize sub-channel state (e.g., recovery endpoint)
 */
export const SubChannelStateSchema = z.object({
  /** Associated channel ID */
  channelId: z.string(),
  /** Channel epoch */
  epoch: createBigIntSchema(),
  /** DID verification method fragment */
  vmIdFragment: z.string(),
  /** Optional public key for the verification method */
  publicKey: z.string().optional(),
  /** Optional DID method type for the verification method */
  methodType: z.string().optional(),
  /** Last on-chain claimed amount for this sub-channel */
  lastClaimedAmount: createBigIntSchema(),
  /** Last on-chain confirmed nonce for this sub-channel */
  lastConfirmedNonce: createBigIntSchema(),
  /** Optional last updated timestamp (ms) for local caches */
  lastUpdated: z.number().optional(),
});

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
 * Claims policy configuration schema
 */
export const ClaimPolicySchema = z.object({
  /** Minimum accumulated amount to trigger claim (in smallest unit) */
  minClaimAmount: createBigIntSchema(),
  /** Maximum number of concurrent claim operations */
  maxConcurrentClaims: z.number().optional(),
  /** Retry attempts for failed claims */
  maxRetries: z.number().optional(),
  /** Delay between retries in milliseconds */
  retryDelayMs: z.number().optional(),
});

export type ClaimPolicy = z.infer<typeof ClaimPolicySchema>;

/**
 * Claim scheduler status schema
 */
export const ClaimSchedulerStatusSchema = z.object({
  /** Whether scheduler is currently running */
  isRunning: z.boolean(),
  /** Number of active claim operations */
  activeClaims: z.number(),
  /** Number of failed claim attempts */
  failedAttempts: z.number(),
  /** Last poll timestamp */
  lastPollTime: z.number(),
  /** Current claiming policy */
  policy: ClaimPolicySchema,
});

export type ClaimSchedulerStatus = z.infer<typeof ClaimSchedulerStatusSchema>;

/**
 * Payment processing statistics schema
 */
export const PaymentProcessingStatsSchema = z.object({
  /** Total number of payment requests processed */
  totalRequests: z.number(),
  /** Number of successful payments */
  successfulPayments: z.number(),
  /** Number of failed payments */
  failedPayments: z.number(),
  /** Number of auto claims triggered */
  autoClaimsTriggered: z.number(),
});

export type PaymentProcessingStats = z.infer<typeof PaymentProcessingStatsSchema>;

/**
 * Claims status information schema
 */
export const ClaimsStatusSchema = z.object({
  /** Current claims scheduler status */
  claimsStatus: ClaimSchedulerStatusSchema,
  /** Payment processing statistics */
  processingStats: PaymentProcessingStatsSchema,
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

export const ScheduledClaimResultSchema = z.object({
  /** VM ID fragment that was processed */
  vmIdFragment: z.string(),
  /** Amount claimed */
  claimedAmount: createBigIntSchema(),
  /** Transaction hash of the claim */
  txHash: z.string(),
  /** Timestamp of the claim */
  timestamp: z.number(),
});

/**
 * Claim trigger response schema
 */
export const ClaimTriggerResponseSchema = z.object({
  /** Channel identifier that was processed */
  channelId: z.string(),
  /** Results of the claim trigger operation */
  results: z.array(ScheduledClaimResultSchema),
});

export type ClaimTriggerResponse = z.infer<typeof ClaimTriggerResponseSchema>;

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

/**
 * Persisted HTTP client state schema for JSON serialization
 * Used by HostChannelMappingStore for safe BigInt handling
 */
export const PersistedHttpClientStateSchema = z.object({
  /** Channel identifier */
  channelId: z.string().optional(),
  /** Pending SubRAV data */
  pendingSubRAV: SubRAVSchema.optional(),
  /** Last update timestamp (ISO string) */
  lastUpdated: z.string().optional(),
});

export type PersistedHttpClientState = z.infer<typeof PersistedHttpClientStateSchema>;
