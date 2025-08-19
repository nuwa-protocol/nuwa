import type { InternalClaimTriggerRequest, InternalSubRavRequest } from '../../types/internal';
import { createSuccessResponse, PaymentKitError } from '../../errors';
import type { Handler, ApiContext } from '../../types/api';
import { ErrorCode } from '../../types/api';
import type {
  HealthResponse,
  ClaimsStatusResponse,
  ClaimTriggerRequest,
  ClaimTriggerResponse,
} from '../../schema';

/**
 * Handle admin claims status endpoint requests
 * Admin only endpoint
 */
export const handleAdminClaims: Handler<ApiContext, {}, ClaimsStatusResponse> = async (
  ctx,
  req
) => {
  try {
    // Prefer reactive claim trigger status when available; fallback to legacy scheduler
    const triggerStats = ctx.claimTriggerService?.getStatus();
    const claimsStatus = triggerStats
      ? {
          active: triggerStats.active,
          queued: triggerStats.queued,
          successCount: triggerStats.successCount,
          failedCount: triggerStats.failedCount,
          backoffCount: triggerStats.backoffCount,
          avgProcessingTimeMs: triggerStats.avgProcessingTimeMs,
          policy: {
            minClaimAmount: ctx.claimTriggerService!['policy']?.minClaimAmount ?? 0n,
            maxConcurrentClaims: ctx.claimTriggerService!['policy']?.maxConcurrentClaims,
            maxRetries: ctx.claimTriggerService!['policy']?.maxRetries,
            retryDelayMs: ctx.claimTriggerService!['policy']?.retryDelayMs,
            requireHubBalance: ctx.claimTriggerService!['policy']?.requireHubBalance,
          },
        }
      : {
          active: 0,
          queued: 0,
          successCount: 0,
          failedCount: 0,
          backoffCount: 0,
          avgProcessingTimeMs: 0,
          policy: {
            minClaimAmount: 0n,
            maxConcurrentClaims: 0,
            maxRetries: 0,
            retryDelayMs: 0,
            requireHubBalance: false,
          },
        };
    const processingStats = ctx.processor.getProcessingStats();

    const result: ClaimsStatusResponse = {
      claimsStatus: {
        skippedCount: (triggerStats as any)?.skippedCount ?? 0,
        insufficientFundsCount: (triggerStats as any)?.insufficientFundsCount ?? 0,
        ...claimsStatus,
      } as any,
      processingStats,
      timestamp: new Date().toISOString(),
    };

    return createSuccessResponse(result);
  } catch (error) {
    throw new PaymentKitError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to retrieve claims status',
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
