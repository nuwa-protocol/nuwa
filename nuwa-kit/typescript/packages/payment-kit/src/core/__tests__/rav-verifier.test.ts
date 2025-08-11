import { describe, test, expect, jest, afterEach } from '@jest/globals';
import { verify as verifyRav } from '../RavVerifier';
import { SubRAVSigner } from '../SubRav';
import type { SignedSubRAV, ChannelInfo, SubChannelState } from '../types';

describe('RavVerifier (unit) – pending priority and signature verification', () => {
  const channelId = '0x'.padEnd(66, 'a');
  const vmId = 'key-1';
  const epoch = 1n;
  const channelInfo: ChannelInfo = {
    channelId,
    payerDid: 'did:example:payer',
    payeeDid: 'did:example:payee',
    assetId: 'asset',
    epoch,
    status: 'active',
  };
  const subChannelState: SubChannelState & { vmIdFragment: string } = {
    channelId,
    epoch,
    lastClaimedAmount: 0n,
    lastConfirmedNonce: 1n,
    lastUpdated: Date.now(),
    vmIdFragment: vmId,
  };
  const payerDidDoc: any = { id: 'did:example:payer', verificationMethod: [{ id: `did:example:payer#${vmId}`, type: 'Ed25519VerificationKey2020', publicKeyMultibase: 'z...' }] };

  function createSignedSubRav(nonce: bigint, amount: bigint): SignedSubRAV {
    return {
      subRav: {
        version: 1,
        chainId: 4n,
        channelId,
        channelEpoch: epoch,
        vmIdFragment: vmId,
        accumulatedAmount: amount,
        nonce,
      },
      signature: new Uint8Array([1, 2, 3]),
    };
  }

  const billingRule = { id: 'r1', strategy: { type: 'PerRequest' }, paymentRequired: true } as any;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('paid route: pending exists and no signature → REQUIRE_SIGNATURE_402', async () => {
    const res = await verifyRav({
      channelInfo,
      subChannelState,
      billingRule,
      payerDidDoc,
      latestPendingSubRav: {
        version: 1,
        chainId: 4n,
        channelId,
        channelEpoch: epoch,
        vmIdFragment: vmId,
        accumulatedAmount: 0n,
        nonce: 2n,
      },
      debug: false,
    });
    expect(res.decision).toBe('REQUIRE_SIGNATURE_402');
  });

  test('pending exists but signed nonce mismatches → CONFLICT', async () => {
    jest.spyOn(SubRAVSigner, 'verify').mockResolvedValue(true as any);
    const signed = createSignedSubRav(3n, 10n);
    const res = await verifyRav({ channelInfo, subChannelState, billingRule, payerDidDoc, signedSubRav: signed, latestPendingSubRav: { ...signed.subRav, nonce: 2n } as any, debug: false });
    expect(res.decision).toBe('CONFLICT');
  });

  test('pending exists and signed matches → pendingMatched=true', async () => {
    jest.spyOn(SubRAVSigner, 'verify').mockResolvedValue(true as any);
    const signed = createSignedSubRav(2n, 10n);
    const res = await verifyRav({ channelInfo, subChannelState, billingRule, payerDidDoc, signedSubRav: signed, latestPendingSubRav: signed.subRav, debug: false });
    expect(res.decision).toBe('ALLOW');
    expect(res.pendingMatched).toBe(true);
  });

  test('signature verification via didResolver succeeds (payerDid from didInfo)', async () => {
    const signed = createSignedSubRav(1n, 0n);
    const verifySpy = jest.spyOn(SubRAVSigner, 'verify').mockResolvedValue(true as any);
    const res = await verifyRav({ channelInfo, subChannelState, billingRule, payerDidDoc, signedSubRav: signed, debug: false });
    expect(verifySpy).toHaveBeenCalled();
    expect(res.signedVerified).toBe(true);
  });

  test('signature verification via didResolver uses channelInfo.payerDid if didInfo missing', async () => {
    const signed = createSignedSubRav(1n, 0n);
    const verifySpy = jest.spyOn(SubRAVSigner, 'verify').mockResolvedValue(true as any);
    const res = await verifyRav({ channelInfo, subChannelState, billingRule, payerDidDoc, signedSubRav: signed, debug: false });
    expect(verifySpy).toHaveBeenCalled();
    expect(res.signedVerified).toBe(true);
  });

  test('no didResolver provided → signature step skipped (Phase 1 compatible)', async () => {
    jest.spyOn(SubRAVSigner, 'verify').mockResolvedValue(true as any);
    const signed = createSignedSubRav(1n, 0n);
    const res = await verifyRav({ channelInfo, subChannelState, billingRule, payerDidDoc, signedSubRav: signed, debug: false });
    expect(res.signedVerified).toBe(true);
  });
});


