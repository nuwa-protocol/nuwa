import type { Handler, ApiContext, RecoveryResponse } from '../../types/api';
import { PaymentKitError } from '../../errors';
import { ErrorCode } from '../../types/api';
import { deriveChannelId } from '../../rooch/ChannelUtils';
import { createSuccessResponseWithBigInt } from '../../utils';

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
    
    return createSuccessResponseWithBigInt(response);
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