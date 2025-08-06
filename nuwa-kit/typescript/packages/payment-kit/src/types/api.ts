/**
 * Common API types shared between server and client
 */

/**
 * Standard API response envelope
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

/**
 * Standard API error structure
 */
export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
  httpStatus?: number;
}

/**
 * Standard error codes
 */
export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  
  // Payment related
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  CONFLICT = 'CONFLICT',
  
  // General errors
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

/**
 * Handler context interface
 */
export interface ApiContext {
  config: {
    serviceId: string;
    serviceDid: string;
    defaultAssetId: string;
    defaultPricePicoUSD?: string;
    adminDid?: string | string[];
    debug?: boolean;
  };
  payeeClient: any; // PaymentChannelPayeeClient
  rateProvider: any; // RateProvider
  middleware: any; // HttpBillingMiddleware
  claimScheduler?: any; // ClaimScheduler
}

/**
 * Framework-agnostic handler signature
 */
export type Handler<Ctx = ApiContext, Req = any, Res = any> =
  (ctx: Ctx, req: Req) => Promise<ApiResponse<Res>>;


// ====== Recovery API Types ======

/**
 * Client-side recovery request (no parameters needed)
 */
export interface RecoveryRequest {
  // Empty - recovery is based on authenticated user's DID
}

export interface RecoveryResponse {
  channel: any | null;
  pendingSubRav: any | null; // SubRAV | null
  timestamp: string;
}

// ====== Commit API Types ======

/**
 * Client-side commit request
 */
export interface CommitRequest {
  subRav: any; // SignedSubRAV
}

export interface CommitResponse {
  success: boolean;
}

// ====== Admin API Types ======

export interface HealthResponse {
  success: boolean;
  status: string;
  timestamp: string;
  paymentKitEnabled: boolean;
}

export interface ClaimsStatusResponse {
  claimsStatus: any;
  processingStats: any;
  timestamp: string;
}

/**
 * Client-side claim trigger request
 */
export interface ClaimTriggerRequest {
  channelId: string;
}

export interface ClaimTriggerResponse {
  success: boolean;
  channelId: string;
}

/**
 * Client-side SubRAV query request
 */
export interface SubRavRequest {
  channelId: string;
  nonce: string;
}

export interface CleanupRequest {
  maxAge?: number; // minutes
}

export interface CleanupResponse {
  clearedCount: number;
  maxAgeMinutes: number;
}

// ====== Discovery API Types ======

export interface DiscoveryResponse {
  version: number;
  serviceId: string;
  serviceDid: string;
  network: string;
  defaultAssetId: string;
  defaultPricePicoUSD?: string;
  basePath: string;
}