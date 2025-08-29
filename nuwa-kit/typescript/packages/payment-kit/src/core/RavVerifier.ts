import type { ChannelInfo, SignedSubRAV, SubChannelInfo, SubRAV } from './types';
import type { BillingContext, BillingRule } from '../billing';
import { PaymentErrorCode } from '../errors/codes';
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
  subChannelInfo: SubChannelInfo;
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
      result.error = {
        code: PaymentErrorCode.INVALID_SIGNATURE,
        message: `Invalid signature for signed SubRAV`,
      } as any;
      return finalize();
    }
  }

  // 2) pending priority check

  if (params.latestPendingSubRav) {
    if (!signed) {
      if (!isFreeRoute) {
        result.decision = 'REQUIRE_SIGNATURE_402';
        result.error = {
          code: PaymentErrorCode.PAYMENT_REQUIRED,
          message: `Signature required for pending proposal (channel: ${params.channelInfo.channelId}, nonce: ${params.latestPendingSubRav.nonce})`,
        } as any;
        return finalize();
      }
    } else {
      const matches =
        signed.subRav.channelId === params.latestPendingSubRav.channelId &&
        signed.subRav.vmIdFragment === params.latestPendingSubRav.vmIdFragment &&
        signed.subRav.nonce === params.latestPendingSubRav.nonce;
      if (!matches) {
        result.decision = 'CONFLICT';
        result.error = {
          code: PaymentErrorCode.RAV_CONFLICT,
          message: `SignedSubRAV does not match pending proposal (expected nonce: ${params.latestPendingSubRav.nonce}, accumulatedAmount: ${params.latestPendingSubRav.accumulatedAmount}, received: ${signed.subRav.nonce}, ${signed.subRav.accumulatedAmount})`,
        } as any;
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
        } else if (
          // Special case: Allow nonce that is exactly +1 from latest signed SubRAV
          // This handles the race condition where server sent a proposal via in-band frame
          // but hasn't persisted it to pendingSubRAVStore yet
          signed.subRav.channelId === params.latestSignedSubRav.subRav.channelId &&
          signed.subRav.vmIdFragment === params.latestSignedSubRav.subRav.vmIdFragment &&
          signed.subRav.nonce === params.latestSignedSubRav.subRav.nonce + 1n &&
          signed.subRav.accumulatedAmount >= params.latestSignedSubRav.subRav.accumulatedAmount
        ) {
          // TODO: This is a temporary workaround for the race condition in streaming responses
          // where the in-band payment frame is sent before the pending SubRAV is persisted.
          // A proper fix would be to ensure the pending SubRAV is saved before sending the frame.
          result.decision = 'ALLOW';
        } else {
          result.decision = 'CONFLICT';
          result.error = {
            code: PaymentErrorCode.RAV_CONFLICT,
            message: `SignedSubRAV does not match latest signed SubRAV (expected nonce: ${params.latestSignedSubRav.subRav.nonce} accumulatedAmount: ${params.latestSignedSubRav.subRav.accumulatedAmount}, received: ${signed.subRav.nonce}, ${signed.subRav.accumulatedAmount})`,
          } as any;
          return finalize();
        }
      } else {
        //there no latestSignedSubRav, it means the server lost the signed subrav.
        //we check the signed subrav with the subchannel state
        if (
          signed.subRav.channelId === params.subChannelInfo.channelId &&
          signed.subRav.vmIdFragment === params.subChannelInfo.vmIdFragment &&
          signed.subRav.nonce > params.subChannelInfo.lastConfirmedNonce &&
          signed.subRav.accumulatedAmount >= params.subChannelInfo.lastClaimedAmount
        ) {
          result.decision = 'ALLOW';
        } else {
          result.decision = 'CONFLICT';
          result.error = {
            code: PaymentErrorCode.RAV_CONFLICT,
            message: `SignedSubRAV does not match subchannel state (expected nonce: ${params.subChannelInfo.lastConfirmedNonce}, accumulatedAmount: ${params.subChannelInfo.lastClaimedAmount}, received: ${signed.subRav.nonce}, ${signed.subRav.accumulatedAmount})`,
          } as any;
          return finalize();
        }
      }
    }
  }

  return finalize();

  function finalize(): RavVerifyResult {
    // Leave detailed logging to caller using DebugLogger
    return result;
  }
}

/**
 * Assert monotonic progression between previous and next SubRAV deltas.
 * - next.nonce must equal prev.nonce + 1
 * - next.accumulatedAmount must be > prev.accumulatedAmount
 *   (set allowSameAccumulated=true to allow equality in special cases)
 */
export function assertRavProgression(
  prevNonce: bigint,
  prevAccumulatedAmount: bigint,
  nextNonce: bigint,
  nextAccumulatedAmount: bigint,
  allowSameAccumulated: boolean = false
): void {
  const expectedNonce = prevNonce + 1n;
  if (nextNonce !== expectedNonce) {
    throw new Error(`Invalid nonce: expected ${expectedNonce}, got ${nextNonce}`);
  }

  if (allowSameAccumulated) {
    if (nextAccumulatedAmount < prevAccumulatedAmount) {
      throw new Error(
        `Amount must not decrease: previous ${prevAccumulatedAmount}, new ${nextAccumulatedAmount}`
      );
    }
  } else {
    if (nextAccumulatedAmount <= prevAccumulatedAmount) {
      throw new Error(
        `Amount must increase: previous ${prevAccumulatedAmount}, new ${nextAccumulatedAmount}`
      );
    }
  }
}

/**
 * Convenience helper to assert progression using SubRAV objects.
 */
export function assertSubRavProgression(
  prev: Pick<SubRAV, 'nonce' | 'accumulatedAmount'>,
  next: Pick<SubRAV, 'nonce' | 'accumulatedAmount'>,
  allowSameAccumulated: boolean = false
): void {
  assertRavProgression(
    prev.nonce,
    prev.accumulatedAmount,
    next.nonce,
    next.accumulatedAmount,
    allowSameAccumulated
  );
}
