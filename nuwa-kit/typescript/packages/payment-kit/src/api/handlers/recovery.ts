import type { Handler, ApiContext, RecoveryResponse } from '../../types/api';
import { createSuccessResponse, PaymentKitError } from '../../errors';
import { ErrorCode } from '../../types/api';
import { deriveChannelId } from '../../rooch/ChannelUtils';

/**
 * Serialize BigInt values in an object to strings
 */
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => serializeBigInt(item));
  }
  
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  
  return obj;
}

export interface RecoveryRequest {
  didInfo: {
    did: string;
  };
}

/**
 * Handle recovery endpoint requests
 * Requires DID authentication
 */
export const handleRecovery: Handler<ApiContext, RecoveryRequest, RecoveryResponse> = async (ctx, req) => {
  try {
    if (!req.didInfo || !req.didInfo.did) {
      throw new PaymentKitError(
        ErrorCode.UNAUTHORIZED,
        'DID authentication required',
        401
      );
    }
    
    const clientDid = req.didInfo.did;

    // Derive channelId deterministically using ChannelUtils
    const defaultAssetId = ctx.config.defaultAssetId ?? '0x3::gas_coin::RGas';
    const channelId = deriveChannelId(clientDid, ctx.config.serviceDid, defaultAssetId);

    let channel: any = null;
    try {
      channel = await ctx.payeeClient.getChannelInfo(channelId);
    } catch (_) {
      // Channel doesn't exist yet - this is normal for first-time clients
    }

    // Find the latest pending SubRAV for this channel (for recovery scenarios)
    const pending = await ctx.middleware.findLatestPendingProposal(channelId);

    const response: RecoveryResponse = {
      channel: channel ?? null,
      pendingSubRav: pending ?? null,
      timestamp: new Date().toISOString()
    };
    
    // Serialize BigInt values before sending response
    const serializedResponse = serializeBigInt(response);
    return createSuccessResponse(serializedResponse);
  } catch (error) {
    if (error instanceof PaymentKitError) {
      throw error;
    }
    throw new PaymentKitError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to perform recovery',
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
};