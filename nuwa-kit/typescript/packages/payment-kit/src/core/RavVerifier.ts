import type { SignedSubRAV } from './types';
import type { BillingContext } from '../billing';
import type { PendingSubRAVRepository } from '../storage/interfaces/PendingSubRAVRepository';
import type { RAVRepository } from '../storage/interfaces/RAVRepository';
import type { DIDResolver } from '@nuwa-ai/identity-kit';
import { SubRAVSigner } from './SubRav';

export interface RavVerifyDeps {
  pendingRepo: PendingSubRAVRepository;
  ravRepo?: RAVRepository; // kept for compatibility if needed later
  debug?: boolean;
  didResolver?: DIDResolver; // optional direct signature verification
}

export type RavDecision =
  | 'ALLOW'
  | 'REQUIRE_SIGNATURE_402'
  | 'CONFLICT'
  | 'CHANNEL_NOT_FOUND';

export interface RavVerifyResult {
  decision: RavDecision;
  signedVerified: boolean;
  pendingMatched: boolean;
  error?: { code: string; message: string };
  debugTrace: Array<{ step: string; info?: unknown }>;
}

export async function verify(
  ctx: BillingContext,
  deps: RavVerifyDeps
): Promise<RavVerifyResult> {
  const trace: Array<{ step: string; info?: unknown }> = [];
  const result: RavVerifyResult = {
    decision: 'ALLOW',
    signedVerified: !ctx.meta.signedSubRav, // default to true if no signedSubRav is provided
    pendingMatched: false,
    debugTrace: trace,
  };

  try {
    const signed = ctx.meta.signedSubRav;
    const billingRule = ctx.meta.billingRule;
    const isFreeRoute = !!billingRule && billingRule.paymentRequired === false;

    // 1) determine channelId / vmIdFragment using provided context/state
    let channelId: string | undefined;
    let vmIdFragment: string | undefined;

    if (signed) {
      channelId = signed.subRav.channelId;
      vmIdFragment = signed.subRav.vmIdFragment;
      trace.push({ step: 'channel.fromSigned', info: { channelId, vmIdFragment } });
    } else {
      // Try from state baselines first (pre-fetched in preProcess)
      channelId = ctx.state?.subChannelState?.channelId
        || ctx.state?.latestSignedSubRav?.subRav?.channelId
        || ctx.state?.channelInfo?.channelId
        || undefined;
      if (ctx.meta.didInfo?.keyId) {
        const keyId = ctx.meta.didInfo.keyId;
        const parts = keyId.split('#');
        if (parts.length === 2) vmIdFragment = parts[1];
      }
      trace.push({ step: 'channel.fromStateOrDid', info: { channelId, vmIdFragment } });
    }

    // 2) pending priority check
    if (channelId && vmIdFragment) {
      const latestPending = await deps.pendingRepo.findLatestBySubChannel(channelId, vmIdFragment);
      if (latestPending) {
        trace.push({ step: 'pending.found', info: { nonce: latestPending.nonce.toString() } });

        if (!signed) {
          if (!isFreeRoute) {
            result.decision = 'REQUIRE_SIGNATURE_402';
            result.error = { code: 'PAYMENT_REQUIRED', message: `Signature required for pending proposal (channel: ${channelId}, nonce: ${latestPending.nonce})` };
            return finalize();
          }
        } else {
          const matches =
            signed.subRav.channelId === channelId &&
            signed.subRav.vmIdFragment === vmIdFragment &&
            signed.subRav.nonce === latestPending.nonce;
          if (!matches) {
            result.decision = 'CONFLICT';
            result.error = { code: 'SUBRAV_CONFLICT', message: `SignedSubRAV does not match pending proposal (expected nonce: ${latestPending.nonce}, received: ${signed.subRav.nonce})` };
            return finalize();
          }
          result.pendingMatched = true;
        }
      } else {
        trace.push({ step: 'pending.none', info: {} });
      }
    }

    // 3) signature verification (if SignedSubRAV is provided)
    if (signed) {
      try {
        if (deps.didResolver) {
          const payerDid = ctx.meta.didInfo?.did || ctx.state?.channelInfo?.payerDid;
          if (payerDid) {
            const ok = await SubRAVSigner.verifyWithResolver(signed, payerDid, deps.didResolver);
            result.signedVerified = !!ok;
            trace.push({ step: 'signature.verify.resolver', info: { ok } });
            if (!ok) return finalize();
          } else {
            // No payerDid available to verify
            result.signedVerified = true; // do not fail verification in Phase 1
            trace.push({ step: 'signature.verify.skipped.noPayerDid' });
          }
        } else {
          // No resolver provided: skip signature check to preserve Phase 1 behavior
          result.signedVerified = true;
          trace.push({ step: 'signature.verify.skipped.noResolver' });
        }
      } catch (e) {
        result.signedVerified = false;
        trace.push({ step: 'signature.exception', info: String(e) });
        return finalize();
      }
    }

    return finalize();

  } catch (e) {
    trace.push({ step: 'verify.exception', info: String(e) });
    return finalize();
  }

  function finalize(): RavVerifyResult {
    if (deps.debug) {
      // eslint-disable-next-line no-console
      console.log('[RavVerifier]', ...trace.map(t => ({ [t.step]: t.info })));
    }
    return result;
  }
}


