import type { InternalSubRavRequest } from '../../types/internal';
import { PaymentKitError, createSuccessResponse } from '../../errors';
import type { Handler, ApiContext } from '../../types/api';
import { ErrorCode } from '../../types/api';
import type { SubRavRequest } from '../../schema';
import { deriveChannelId } from '../../rooch/ChannelUtils';

/**
 * Handle SubRAV query endpoint requests
 * Requires DID authentication
 * Users can only query SubRAVs from channels they own
 */
export const handleSubRavQuery: Handler<ApiContext, SubRavRequest, any> = async (ctx, req) => {
  try {
    // Keep handler free of direct console logging

    // Check if user is authenticated
    const internalReq = req as InternalSubRavRequest;
    if (!internalReq.didInfo || !internalReq.didInfo.did || !internalReq.didInfo.keyId) {
      throw new PaymentKitError(ErrorCode.UNAUTHORIZED, 'DID authentication required', 401);
    }

    const clientDid = internalReq.didInfo.did;

    // Derive the expected channelId for this user
    const defaultAssetId = ctx.config.defaultAssetId ?? '0x3::gas_coin::RGas';
    const channelId = deriveChannelId(clientDid, ctx.config.serviceDid, defaultAssetId);

    // Extract vmIdFragment from DID keyId (format: did:...#fragment)
    // Extract vmIdFragment from DID keyId (format: did:...#fragment)
    const keyParts = internalReq.didInfo.keyId.split('#');
    const vmIdFragment = keyParts.length > 1 ? keyParts[1] : '';
    if (!vmIdFragment) {
      throw new PaymentKitError(ErrorCode.BAD_REQUEST, 'Invalid DID keyId: missing fragment', 400);
    }
    const subRAV = await ctx.ravRepository.get(channelId, vmIdFragment, BigInt(req.nonce));

    if (subRAV) {
      return createSuccessResponse(subRAV);
    } else {
      throw new PaymentKitError(ErrorCode.NOT_FOUND, 'SubRAV not found', 404);
    }
  } catch (error) {
    if (error instanceof PaymentKitError) {
      throw error;
    }

    throw new PaymentKitError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to retrieve SubRAV',
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
};
