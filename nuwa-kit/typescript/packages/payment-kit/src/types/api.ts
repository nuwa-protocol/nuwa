/**
 * Framework-level API types for Payment Kit
 *
 * This file contains types for the API framework itself (handlers, context, etc.)
 * rather than specific data models which are defined in schema/.
 */

import { RAVRepository } from '../storage/interfaces/RAVRepository';
import type { ErrorCodeType, ApiError } from '../schema/core';
import { ChannelRepository } from '../storage/interfaces/ChannelRepository';
import { PendingSubRAVRepository } from '../storage/interfaces/PendingSubRAVRepository';
import { ClaimTriggerService } from '../core/ClaimTriggerService';
import { PaymentChannelPayeeClient } from '../client/PaymentChannelPayeeClient';
import { RateProvider } from '../billing';
import { PaymentProcessor } from '../core/PaymentProcessor';

/**
 * Standard API response envelope
 * Generic container for all API responses
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

/**
 * Standard error codes enum for convenient access
 * Note: The authoritative schema is in schema/core/ErrorCodeSchema
 */
export const ErrorCode = {
  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED' as const,
  FORBIDDEN: 'FORBIDDEN' as const,

  // Payment related
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED' as const,
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS' as const,
  CONFLICT: 'CONFLICT' as const,

  // General errors
  NOT_FOUND: 'NOT_FOUND' as const,
  BAD_REQUEST: 'BAD_REQUEST' as const,
  INTERNAL_ERROR: 'INTERNAL_ERROR' as const,
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE' as const,
} as const;

export type ErrorCode = ErrorCodeType;

/**
 * Handler context interface
 * Contains all dependencies and configuration needed by API handlers
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
  payeeClient: PaymentChannelPayeeClient;
  rateProvider: RateProvider;
  claimTriggerService?: ClaimTriggerService;
  processor: PaymentProcessor;
  ravRepository: RAVRepository;
  channelRepo: ChannelRepository;
  pendingSubRAVStore: PendingSubRAVRepository;
}

/**
 * Framework-agnostic handler signature
 * All API handlers must conform to this signature
 */
export type Handler<Ctx = ApiContext, Req = any, Res = any> = (
  ctx: Ctx,
  req: Req
) => Promise<ApiResponse<Res>>;
