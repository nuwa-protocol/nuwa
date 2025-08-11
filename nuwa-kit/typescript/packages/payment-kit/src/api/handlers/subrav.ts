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
    if (ctx.config.debug) {
      console.log('📥 /subrav request received:', {
        nonce: req?.nonce,
        hasDidInfo: !!(req as any)?.didInfo,
        did: (req as any)?.didInfo?.did,
        keyId: (req as any)?.didInfo?.keyId,
      });
    }

    // Check if user is authenticated
    const internalReq = req as InternalSubRavRequest;
    if (!internalReq.didInfo || !internalReq.didInfo.did || !internalReq.didInfo.keyId) {
      if (ctx.config.debug) {
        console.log('❌ /subrav missing didInfo, returning 401');
      }
      throw new PaymentKitError(ErrorCode.UNAUTHORIZED, 'DID authentication required', 401);
    }

    const clientDid = internalReq.didInfo.did;

    // Derive the expected channelId for this user
    const defaultAssetId = ctx.config.defaultAssetId ?? '0x3::gas_coin::RGas';
    const channelId = deriveChannelId(clientDid, ctx.config.serviceDid, defaultAssetId);

    if (ctx.config.debug) {
      console.log('📋 SubRAV Query: Getting SubRAV for channel:', channelId, 'nonce:', req.nonce);
    }

    // Extract vmIdFragment from DID keyId (format: did:...#fragment)
    // Extract vmIdFragment from DID keyId (format: did:...#fragment)
    const keyParts = internalReq.didInfo.keyId.split('#');
    const vmIdFragment = keyParts.length > 1 ? keyParts[1] : '';
    if (!vmIdFragment) {
      throw new PaymentKitError(ErrorCode.BAD_REQUEST, 'Invalid DID keyId: missing fragment', 400);
    }
    const subRAV = await ctx.ravRepository.get(channelId, vmIdFragment, BigInt(req.nonce));

    if (subRAV) {
      if (ctx.config.debug) {
        console.log('✅ SubRAV Query: SubRAV found:', subRAV);
      }

      return createSuccessResponse(subRAV);
    } else {
      if (ctx.config.debug) {
        console.log(
          '❌ SubRAV Query: SubRAV not found for channel:',
          channelId,
          'nonce:',
          req.nonce
        );
      }

      throw new PaymentKitError(ErrorCode.NOT_FOUND, 'SubRAV not found', 404);
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
