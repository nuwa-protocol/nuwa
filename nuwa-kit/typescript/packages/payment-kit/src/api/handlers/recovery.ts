import type { InternalRecoveryRequest } from '../../types/internal';
import { PaymentKitError, createSuccessResponse } from '../../errors';
import type { Handler, ApiContext } from '../../types/api';
import { ErrorCode } from '../../types/api';
import type { RecoveryResponse } from '../../schema';
import { deriveChannelId } from '../../rooch/ChannelUtils';

/**
 * Handle recovery endpoint requests
 * Requires DID authentication
 */
export const handleRecovery: Handler<ApiContext, {}, RecoveryResponse> = async (ctx, req) => {
  try {
    const internalReq = req as InternalRecoveryRequest;
    if (!internalReq.didInfo || !internalReq.didInfo.did || !internalReq.didInfo.keyId) {
      throw new PaymentKitError(ErrorCode.UNAUTHORIZED, 'DID authentication required', 401);
    }

    const clientDid = internalReq.didInfo.did;

    // Derive channelId deterministically using ChannelUtils
    const defaultAssetId = ctx.config.defaultAssetId ?? '0x3::gas_coin::RGas';
    const channelId = deriveChannelId(clientDid, ctx.config.serviceDid, defaultAssetId);

    let channel: any = null;
    try {
      channel = await ctx.payeeClient.getChannelInfo(channelId);
    } catch (_) {
      // Channel doesn't exist yet - this is normal for first-time clients
    }

    // Extract vmIdFragment from DID keyId and find latest pending for sub-channel
    const keyParts = internalReq.didInfo.keyId.split('#');
    const vmIdFragment = keyParts.length > 1 ? keyParts[1] : '';
    const pending = vmIdFragment
      ? await ctx.pendingSubRAVStore.findLatestBySubChannel(channelId, vmIdFragment)
      : null;

    // Try to get sub-channel state for this vmIdFragment (authorized -> state exists)
    let subChannel = null as any;
    if (channel && vmIdFragment) {
      try {
        const state = await ctx.payeeClient.getSubChannelState(channelId, vmIdFragment);
        if (state) {
          subChannel = state;
        }
      } catch (_) {
        // sub-channel may not be authorized yet; that's fine
      }
    }

    const response: RecoveryResponse = {
      channel: channel ?? null,
      pendingSubRav: pending ?? null,
      subChannel: subChannel ?? null,
      timestamp: new Date().toISOString(),
    };

    return createSuccessResponse(response);
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
