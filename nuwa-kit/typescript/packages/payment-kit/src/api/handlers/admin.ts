import type { 
  Handler, 
  ApiContext, 
  HealthResponse, 
  ClaimsStatusResponse,
  ClaimTriggerRequest,
  ClaimTriggerResponse,
  SubRavRequest,
  CleanupRequest,
  CleanupResponse
} from '../../types/api';
import { createSuccessResponse, PaymentKitError } from '../../errors';
import { ErrorCode } from '../../types/api';
import { serializeBigInt, bigintReplacer, createSuccessResponseWithBigInt } from '../../utils';

/**
 * Handle admin health endpoint requests
 * Public endpoint, no authentication required
 */
export const handleAdminHealth: Handler<ApiContext, void, HealthResponse> = async (ctx) => {
  const response: HealthResponse = {
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    paymentKitEnabled: true
  };

  return createSuccessResponse(response);
};

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
      console.log('📊 Claims status:', JSON.stringify(claimsStatus, bigintReplacer));
    }
    
    const processingStats = ctx.middleware.getProcessingStats();
    if (ctx.config.debug) {
      console.log('📊 Processing stats:', JSON.stringify(processingStats, bigintReplacer));
    }
    
    const result: ClaimsStatusResponse = { 
      claimsStatus,
      processingStats,
      timestamp: new Date().toISOString()
    };
    
    if (ctx.config.debug) {
      console.log('✅ Admin: Claims data retrieved successfully');
    }
    
    return createSuccessResponseWithBigInt(result);
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
export const handleAdminClaimTrigger: Handler<ApiContext, ClaimTriggerRequest, ClaimTriggerResponse> = async (ctx, req) => {
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
 * Handle admin SubRAV endpoint requests
 * Admin only endpoint
 */
export const handleAdminSubRav: Handler<ApiContext, SubRavRequest, any> = async (ctx, req) => {
  try {
    if (ctx.config.debug) {
      console.log('📋 Admin: Getting SubRAV for channel:', req.channelId, 'nonce:', req.nonce);
    }
    
    const subRAV = await ctx.middleware.findPendingProposal(req.channelId, BigInt(req.nonce));
    
    if (subRAV) {
      if (ctx.config.debug) {
        console.log('✅ Admin: SubRAV found:', JSON.stringify(subRAV, bigintReplacer));
      }
      
      return createSuccessResponseWithBigInt(subRAV);
    } else {
      if (ctx.config.debug) {
        console.log('❌ Admin: SubRAV not found for channel:', req.channelId, 'nonce:', req.nonce);
      }
      
      throw new PaymentKitError(
        ErrorCode.NOT_FOUND,
        'SubRAV not found',
        404
      );
    }
  } catch (error) {
    if (error instanceof PaymentKitError) {
      throw error;
    }
    
    if (ctx.config.debug) {
      console.error('❌ Admin: Failed to get SubRAV:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    }
    
    throw new PaymentKitError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to retrieve SubRAV',
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