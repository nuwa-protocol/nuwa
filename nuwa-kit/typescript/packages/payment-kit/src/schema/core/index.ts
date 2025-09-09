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

export const SerializableSubRAVSchema = z.object({
  version: z.string(),
  chainId: z.string(),
  channelId: z.string(),
  channelEpoch: z.string(),
  vmIdFragment: z.string(),
  accumulatedAmount: z.string(),
  nonce: z.string(),
});

export const SerializableSignedSubRAVSchema = z.object({
  subRav: SerializableSubRAVSchema,
  signature: z.string(),
});

// SerializableResponsePayload (Zod) – mirrors SerializableResponsePayloadSchema
export const SerializableResponsePayloadSchema = z.object({
  version: z.number(),
  clientTxRef: z.string().optional(),
  serviceTxRef: z.string().optional(),
  subRav: SerializableSubRAVSchema.optional(),
  cost: z.string().optional(),
  costUsd: z.string().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string().optional(),
    })
    .optional(),
});

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
export const ClaimTriggerPolicySchema = z.object({
  /** Minimum accumulated amount to trigger claim (in smallest unit) */
  minClaimAmount: createBigIntSchema(),
  /** Maximum number of concurrent claim operations */
  maxConcurrentClaims: z.number().optional(),
  /** Retry attempts for failed claims */
  maxRetries: z.number().optional(),
  /** Delay between retries in milliseconds */
  retryDelayMs: z.number().optional(),
  /** Whether to check hub balance before triggering claims */
  requireHubBalance: z.boolean().optional(),
  /** Fixed backoff for insufficient funds (ms) */
  insufficientFundsBackoffMs: z.number().optional(),
  /** Count insufficient funds as failures */
  countInsufficientAsFailure: z.boolean().optional(),
});

export type ClaimTriggerPolicy = z.infer<typeof ClaimTriggerPolicySchema>;

/**
 * Claim trigger service status schema (reactive)
 */
export const ClaimTriggerStatusSchema = z.object({
  /** Number of active claims currently processing */
  active: z.number(),
  /** Number of tasks queued for processing */
  queued: z.number(),
  /** Total successful claims */
  successCount: z.number(),
  /** Total failed claims */
  failedCount: z.number(),
  /** Total skipped claims */
  skippedCount: z.number(),
  /** Total insufficient funds occurrences */
  insufficientFundsCount: z.number(),
  /** Number of tasks in backoff (waiting for retry) */
  backoffCount: z.number(),
  /** Average claim processing time in milliseconds */
  avgProcessingTimeMs: z.number(),
  /** Claim trigger policy (reactive) */
  policy: ClaimTriggerPolicySchema,
});

export type ClaimTriggerStatus = z.infer<typeof ClaimTriggerStatusSchema>;

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
export const SystemStatusSchema = z.object({
  /** Reactive claim trigger status */
  claims: ClaimTriggerStatusSchema,
  /** Payment processing statistics */
  processor: PaymentProcessingStatsSchema,
  /** Response timestamp in ISO-8601 format */
  timestamp: z.string(),
});

export type SystemStatus = z.infer<typeof SystemStatusSchema>;

/**
 * Claim trigger request schema
 */
export const ClaimTriggerRequestSchema = z.object({
  /** Channel identifier to trigger claim for */
  channelId: z.string(),
});

export type ClaimTriggerRequest = z.infer<typeof ClaimTriggerRequestSchema>;

// Reactive mode: return queued/skipped summary rather than on-chain tx results
export const ClaimTriggerQueuedSchema = z.object({
  vmIdFragment: z.string(),
  delta: createBigIntSchema(),
});

export const ClaimTriggerSkippedSchema = z.object({
  vmIdFragment: z.string(),
  reason: z.enum(['no_delta', 'below_threshold']),
  delta: createBigIntSchema().optional(),
  threshold: createBigIntSchema().optional(),
});

/**
 * Claim trigger response schema
 */
export const ClaimTriggerResponseSchema = z.object({
  channelId: z.string(),
  queued: z.array(ClaimTriggerQueuedSchema),
  skipped: z.array(ClaimTriggerSkippedSchema),
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
  pendingSubRAV: SerializableSubRAVSchema.optional(),
  /** Last update timestamp (ISO string) */
  lastUpdated: z.string().optional(),
});

export type PersistedHttpClientState = z.infer<typeof PersistedHttpClientStateSchema>;
