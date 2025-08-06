import type { Handler, ApiContext } from '../../types/api';
import { PaymentKitError } from '../../errors';
import { ErrorCode } from '../../types/api';
import { deriveChannelId } from '../../rooch/ChannelUtils';
import { createSuccessResponseWithBigInt, bigintReplacer } from '../../utils';

export interface SubRavQueryRequest {
  channelId: string;
  nonce: string;
  didInfo?: {
    did: string;
  };
}

/**
 * Handle SubRAV query endpoint requests
 * Requires DID authentication
 * Users can only query SubRAVs from channels they own
 */
export const handleSubRavQuery: Handler<ApiContext, SubRavQueryRequest, any> = async (ctx, req) => {
  try {
    if (ctx.config.debug) {
      console.log('📋 SubRAV Query: Getting SubRAV for channel:', req.channelId, 'nonce:', req.nonce);
    }
    
    // Check if user is authenticated
    if (!req.didInfo || !req.didInfo.did) {
      throw new PaymentKitError(
        ErrorCode.UNAUTHORIZED,
        'DID authentication required',
        401
      );
    }

    const clientDid = req.didInfo.did;
    
    // Derive the expected channelId for this user
    const defaultAssetId = ctx.config.defaultAssetId ?? '0x3::gas_coin::RGas';
    const expectedChannelId = deriveChannelId(clientDid, ctx.config.serviceDid, defaultAssetId);
    
    // Check if user is trying to access their own channel
    if (req.channelId !== expectedChannelId) {
      if (ctx.config.debug) {
        console.log('❌ SubRAV Query: Access denied. User channel:', expectedChannelId, 'Requested:', req.channelId);
      }
      throw new PaymentKitError(
        ErrorCode.FORBIDDEN,
        'Access denied: You can only query your own SubRAVs',
        403
      );
    }
    
    const subRAV = await ctx.middleware.findPendingProposal(req.channelId, BigInt(req.nonce));
    
    if (subRAV) {
      if (ctx.config.debug) {
        console.log('✅ SubRAV Query: SubRAV found:', JSON.stringify(subRAV, bigintReplacer));
      }
      
      return createSuccessResponseWithBigInt(subRAV);
    } else {
      if (ctx.config.debug) {
        console.log('❌ SubRAV Query: SubRAV not found for channel:', req.channelId, 'nonce:', req.nonce);
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
      console.error('❌ SubRAV Query: Failed to get SubRAV:', error);
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