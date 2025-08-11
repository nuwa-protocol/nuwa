import type { ChannelInfo, SignedSubRAV, SubChannelState, SubRAV } from './types';
import type { BillingContext, BillingRule } from '../billing';
import type { PendingSubRAVRepository } from '../storage/interfaces/PendingSubRAVRepository';
import type { RAVRepository } from '../storage/interfaces/RAVRepository';
import type { DIDDocument } from '@nuwa-ai/identity-kit';
import { SubRAVSigner } from './SubRav';

export interface RavVerifyDeps {
  pendingRepo: PendingSubRAVRepository;
  ravRepo: RAVRepository;
  debug?: boolean;
}

export type RavDecision = 'ALLOW' | 'REQUIRE_SIGNATURE_402' | 'CONFLICT' | 'CHANNEL_NOT_FOUND';

export interface RavVerifyResult {
  decision: RavDecision;
  signedVerified: boolean;
  pendingMatched: boolean;
  error?: { code: string; message: string };
}

export interface RavVerifyParams {
  channelInfo: ChannelInfo;
  subChannelState: SubChannelState;
  billingRule: BillingRule;
  payerDidDoc: DIDDocument;
  /** Signed SubRAV from client (optional in FREE mode) */
  signedSubRav?: SignedSubRAV;
  /** Latest pending SubRAV from pending repository, it should match the signed SubRAV */
  latestPendingSubRav?: SubRAV;
  /** Latest signed SubRAV from repository, it is the previous version of the signed SubRAV */
  latestSignedSubRav?: SignedSubRAV;
  /** Debug mode */
  debug?: boolean;
}

export async function verify(params: RavVerifyParams): Promise<RavVerifyResult> {
  const result: RavVerifyResult = {
    decision: 'ALLOW',
    signedVerified: !params.signedSubRav, // default to true if no signedSubRav is provided
    pendingMatched: false,
  };

  const signed = params.signedSubRav;
  const billingRule = params.billingRule;
  const isFreeRoute = !!billingRule && billingRule.paymentRequired === false;

  // 3) signature verification (if SignedSubRAV is provided)
  if (signed) {
    const ok = await SubRAVSigner.verify(signed, { didDocument: params.payerDidDoc });
    result.signedVerified = !!ok;
    if (!ok) {
      result.error = { code: 'INVALID_SIGNATURE', message: `Invalid signature for signed SubRAV` };
      return finalize();
    }
  }

  // 2) pending priority check

  if (params.latestPendingSubRav) {
    if (!signed) {
      if (!isFreeRoute) {
        result.decision = 'REQUIRE_SIGNATURE_402';
        result.error = {
          code: 'PAYMENT_REQUIRED',
          message: `Signature required for pending proposal (channel: ${params.channelInfo.channelId}, nonce: ${params.latestPendingSubRav.nonce})`,
        };
        return finalize();
      }
    } else {
      const matches =
        signed.subRav.channelId === params.channelInfo.channelId &&
        signed.subRav.vmIdFragment === params.subChannelState.vmIdFragment &&
        signed.subRav.nonce === params.latestPendingSubRav.nonce;
      if (!matches) {
        result.decision = 'CONFLICT';
        result.error = {
          code: 'SUBRAV_CONFLICT',
          message: `SignedSubRAV does not match pending proposal (expected nonce: ${params.latestPendingSubRav.nonce}, received: ${signed.subRav.nonce})`,
        };
        return finalize();
      }
      result.pendingMatched = true;
    }
  } else {
    //if no pending, it means the server lost the pending proposal.
    //we check the signed subrav with the latest signed subrav or subchannel state
    if (signed) {
      if (params.latestSignedSubRav) {
        if (
          signed.subRav.channelId === params.latestSignedSubRav.subRav.channelId &&
          signed.subRav.vmIdFragment === params.latestSignedSubRav.subRav.vmIdFragment &&
          signed.subRav.nonce > params.latestSignedSubRav.subRav.nonce &&
          signed.subRav.accumulatedAmount > params.latestSignedSubRav.subRav.accumulatedAmount
        ) {
          result.decision = 'ALLOW';
        } else {
          result.decision = 'CONFLICT';
          result.error = {
            code: 'SUBRAV_CONFLICT',
            message: `SignedSubRAV does not match latest signed SubRAV (expected nonce: ${params.latestSignedSubRav.subRav.nonce}, received: ${signed.subRav.nonce})`,
          };
          return finalize();
        }
      } else {
        //there no latestSignedSubRav, it means the server lost the signed subrav.
        //we check the signed subrav with the subchannel state
        if (
          signed.subRav.channelId === params.subChannelState.channelId &&
          signed.subRav.vmIdFragment === params.subChannelState.vmIdFragment &&
          signed.subRav.nonce > params.subChannelState.lastConfirmedNonce &&
          signed.subRav.accumulatedAmount > params.subChannelState.lastClaimedAmount
        ) {
          result.decision = 'ALLOW';
        } else {
          result.decision = 'CONFLICT';
          result.error = {
            code: 'SUBRAV_CONFLICT',
            message: `SignedSubRAV does not match subchannel state (expected nonce: ${params.subChannelState.lastConfirmedNonce}, received: ${signed.subRav.nonce})`,
          };
          return finalize();
        }
      }
    }
  }

  return finalize();

  function finalize(): RavVerifyResult {
    if (params.debug) {
      // eslint-disable-next-line no-console
      console.log('[RavVerifier]', result);
    }
    return result;
  }
}
