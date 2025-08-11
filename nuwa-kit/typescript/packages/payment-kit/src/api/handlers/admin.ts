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
    if (ctx.config.debug) {
      console.log('📊 Admin: Getting claims status...');
    }

    const claimsStatus = ctx.claimScheduler.getStatus();
    if (ctx.config.debug) {
      console.log('📊 Claims status:', claimsStatus);
    }

    const processingStats = ctx.processor.getProcessingStats();
    if (ctx.config.debug) {
      console.log('📊 Processing stats:', processingStats);
    }

    const result: ClaimsStatusResponse = {
      claimsStatus,
      processingStats,
      timestamp: new Date().toISOString(),
    };

    if (ctx.config.debug) {
      console.log('✅ Admin: Claims data retrieved successfully');
    }

    return createSuccessResponse(result);
  } catch (error) {
    if (ctx.config.debug) {
      console.error('❌ Admin: Failed to get claims status:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    }

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
    if (ctx.config.debug) {
      console.log('🚀 Admin: Triggering claim for channel:', req.channelId);
    }

    const results = await ctx.claimScheduler.triggerClaim(req.channelId);

    if (ctx.config.debug) {
      console.log('✅ Admin: Claim trigger result:', results);
    }

    return createSuccessResponse({ results, channelId: req.channelId });
  } catch (error) {
    if (ctx.config.debug) {
      console.error('❌ Admin: Failed to trigger claim:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    }

    throw new PaymentKitError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to trigger claim',
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
};
