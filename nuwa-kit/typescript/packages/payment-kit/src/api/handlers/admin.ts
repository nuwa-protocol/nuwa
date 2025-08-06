import type { 
  Handler, 
  ApiContext, 
  HealthResponse, 
  ClaimsStatusResponse,
  ClaimTriggerResponse,
  CleanupRequest,
  CleanupResponse
} from '../../types/api';
import type { InternalClaimTriggerRequest, InternalSubRavRequest } from '../../types/internal';
import { createSuccessResponse, PaymentKitError } from '../../errors';
import { ErrorCode } from '../../types/api';


/**
 * Handle admin claims status endpoint requests
 * Admin only endpoint
 */
export const handleAdminClaims: Handler<ApiContext, void, ClaimsStatusResponse> = async (ctx) => {
  try {
    if (ctx.config.debug) {
      console.log('📊 Admin: Getting claims status...');
    }
    
    const claimsStatus = ctx.middleware.getClaimStatus();
    if (ctx.config.debug) {
      console.log('📊 Claims status:', claimsStatus);
    }
    
    const processingStats = ctx.middleware.getProcessingStats();
    if (ctx.config.debug) {
      console.log('📊 Processing stats:', processingStats);
    }
    
    const result: ClaimsStatusResponse = { 
      claimsStatus,
      processingStats,
      timestamp: new Date().toISOString()
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
export const handleAdminClaimTrigger: Handler<ApiContext, InternalClaimTriggerRequest, ClaimTriggerResponse> = async (ctx, req) => {
  try {
    if (ctx.config.debug) {
      console.log('🚀 Admin: Triggering claim for channel:', req.channelId);
    }
    
    const success = await ctx.middleware.manualClaim(req.channelId);
    
    if (ctx.config.debug) {
      console.log('✅ Admin: Claim trigger result:', success);
    }
    
    return createSuccessResponse({ success, channelId: req.channelId });
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

/**
 * Handle admin cleanup endpoint requests
 * Admin only endpoint
 */
export const handleAdminCleanup: Handler<ApiContext, CleanupRequest, CleanupResponse> = async (ctx, req) => {
  try {
    const maxAge = req.maxAge || 30;
    
    if (ctx.config.debug) {
      console.log('🧹 Admin: Cleaning up expired proposals, max age:', maxAge, 'minutes');
    }
    
    const clearedCount = await ctx.middleware.clearExpiredProposals(maxAge);
    
    if (ctx.config.debug) {
      console.log('✅ Admin: Cleanup completed, cleared count:', clearedCount);
    }
    
    return createSuccessResponse({ clearedCount, maxAgeMinutes: maxAge });
  } catch (error) {
    if (ctx.config.debug) {
      console.error('❌ Admin: Failed to cleanup expired proposals:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    }
    
    throw new PaymentKitError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to cleanup expired proposals',
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
};