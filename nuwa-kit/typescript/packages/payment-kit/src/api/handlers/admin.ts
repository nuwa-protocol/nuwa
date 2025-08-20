import type { InternalClaimTriggerRequest, InternalSubRavRequest } from '../../types/internal';
import { createSuccessResponse, PaymentKitError } from '../../errors';
import type { Handler, ApiContext } from '../../types/api';
import { ErrorCode } from '../../types/api';
import type {
  HealthResponse,
  SystemStatusResponse,
  ClaimTriggerRequest,
  ClaimTriggerResponse,
} from '../../schema';
import { DebugLogger } from '@nuwa-ai/identity-kit';

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
    // Diagnostic/manual trigger: enqueue a reactive claim for all known sub-channels under the channelId
    // Behavior:
    // - Reads latest SignedSubRAVs for each vmIdFragment under the channel (from ravRepo)
    // - Computes delta vs current SubChannelInfo
    // - If delta >= minClaimAmount, queue claim via ClaimTriggerService
    // - Returns an empty results array immediately; status can be observed via /admin/status

    if (!ctx.claimTriggerService) {
      return createSuccessResponse({ channelId: req.channelId, queued: [], skipped: [] });
    }

    const channelId = req.channelId;
    const queued: { vmIdFragment: string; delta: bigint }[] = [];
    const skipped: {
      vmIdFragment: string;
      reason: 'no_delta' | 'below_threshold';
      delta?: bigint;
      threshold?: bigint;
    }[] = [];

    try {
      // List all sub-channels we have state for
      const subStates = await ctx.channelRepo.listSubChannelStates(channelId);
      const vmIds = Object.keys(subStates);

      for (const vmIdFragment of vmIds) {
        const latest = await ctx.ravRepository.getLatest(channelId, vmIdFragment);
        const state = subStates[vmIdFragment];
        if (!latest || !state) continue;

        const accumulated = latest.subRav.accumulatedAmount;
        const lastClaimed = state.lastClaimedAmount;
        const delta = accumulated > lastClaimed ? accumulated - lastClaimed : 0n;

        if (delta <= 0n) {
          skipped.push({ vmIdFragment, reason: 'no_delta' });
          continue;
        }
        // enqueue regardless of threshold; ClaimTriggerService will decide to skip/queue by policy
        await ctx.claimTriggerService.maybeQueue(channelId, vmIdFragment, delta);
        queued.push({ vmIdFragment, delta });
      }
    } catch (e) {
      DebugLogger.error('Failed to trigger claim', e);
      // swallow diagnostic errors; return partial
    }

    // Response schema expects ScheduledClaimResult[]; in reactive mode we return an empty list
    // and rely on /admin/status for detailed progress.
    return createSuccessResponse({ channelId, queued, skipped });
  } catch (error) {
    throw new PaymentKitError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to trigger claim',
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
};
