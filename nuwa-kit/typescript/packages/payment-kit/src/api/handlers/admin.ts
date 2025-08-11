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
    const claimsStatus = ctx.claimScheduler.getStatus();
    const processingStats = ctx.processor.getProcessingStats();

    const result: ClaimsStatusResponse = {
      claimsStatus,
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
    const results = await ctx.claimScheduler.triggerClaim(req.channelId);

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
