import type { InternalClaimTriggerRequest, InternalSubRavRequest } from '../../types/internal';
import { createSuccessResponse, PaymentKitError } from '../../errors';
import type { Handler, ApiContext } from '../../types/api';
import { ErrorCode } from '../../types/api';
import type { HealthResponse, SystemStatusResponse, ClaimTriggerRequest, ClaimTriggerResponse } from '../../schema';

/**
 * Handle admin system status endpoint requests
 * Admin only endpoint
 */
export const handleAdminStatus: Handler<ApiContext, {}, SystemStatusResponse> = async (
  ctx,
  req
) => {
  try {
    // Prefer reactive claim trigger status when available; fallback to legacy scheduler
    const stats = ctx.claimTriggerService?.getStatus();
    const claimsStatus = stats
      ? {
          active: stats.active,
          queued: stats.queued,
          successCount: stats.successCount,
          failedCount: stats.failedCount,
          skippedCount: stats.skippedCount,
          insufficientFundsCount: stats.insufficientFundsCount,
          backoffCount: stats.backoffCount,
          avgProcessingTimeMs: stats.avgProcessingTimeMs,
          policy: {
            minClaimAmount: stats.policy.minClaimAmount,
            maxConcurrentClaims: stats.policy.maxConcurrentClaims,
            maxRetries: stats.policy.maxRetries,
            retryDelayMs: stats.policy.retryDelayMs,
            requireHubBalance: stats.policy.requireHubBalance,
            insufficientFundsBackoffMs: stats.policy.insufficientFundsBackoffMs,
            countInsufficientAsFailure: stats.policy.countInsufficientAsFailure,
          },
        }
      : {
          active: 0,
          queued: 0,
          successCount: 0,
          failedCount: 0,
          skippedCount: 0,
          insufficientFundsCount: 0,
          backoffCount: 0,
          avgProcessingTimeMs: 0,
          policy: {
            minClaimAmount: 0n,
            maxConcurrentClaims: 0,
            maxRetries: 0,
            retryDelayMs: 0,
            requireHubBalance: false,
            insufficientFundsBackoffMs: 0,
            countInsufficientAsFailure: false,
          },
        };
    const processingStats = ctx.processor.getProcessingStats();

    const result: SystemStatusResponse = {
      claims: claimsStatus,
      processor: processingStats,
      timestamp: new Date().toISOString(),
    };

    return createSuccessResponse(result);
  } catch (error) {
    throw new PaymentKitError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to retrieve system status',
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
};

/**
 * Handle admin claim trigger endpoint requests
 * Admin only endpoint
 */
export const handleAdminClaimTrigger: Handler<
  ApiContext,
  ClaimTriggerRequest,
  ClaimTriggerResponse
> = async (ctx, req) => {
  try {
    // For reactive mode, simply acknowledge since claims are event-driven.
    // Legacy fallback: allow manual trigger via scheduler when present.
    const results: any[] = [];

    return createSuccessResponse({ results, channelId: req.channelId });
  } catch (error) {
    throw new PaymentKitError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to trigger claim',
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
};
