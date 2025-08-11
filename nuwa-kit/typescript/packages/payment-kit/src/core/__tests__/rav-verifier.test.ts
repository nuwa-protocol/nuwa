import { verify as verifyRav } from '../RavVerifier';
import { SubRAVSigner } from '../SubRav';
import type { BillingContext } from '../../billing';
import type { PendingSubRAVRepository } from '../../storage/interfaces/PendingSubRAVRepository';
import type { RAVRepository } from '../../storage/interfaces/RAVRepository';
import type { SignedSubRAV } from '../types';

describe('RavVerifier (unit) – pending priority and signature verification', () => {
  const channelId = '0x'.padEnd(66, 'a');
  const vmId = 'key-1';
  const epoch = 1n;

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

  function createCtx(overrides: Partial<BillingContext> = {}): BillingContext {
    return {
      serviceId: 'svc',
      meta: {
        operation: 'OP',
        billingRule: { id: 'r1', strategy: { type: 'PerRequest' }, paymentRequired: true },
      },
      ...overrides,
    } as BillingContext;
  }

  function createPendingRepo(pendingNonce?: bigint) {
    const repo: jest.Mocked<PendingSubRAVRepository> = {
      save: jest.fn(),
      find: jest.fn(),
      remove: jest.fn(),
      findLatestBySubChannel: jest.fn(),
      cleanup: jest.fn(),
    } as any;
    if (pendingNonce !== undefined) {
      repo.findLatestBySubChannel.mockResolvedValue({
        version: 1,
        chainId: 4n,
        channelId,
        channelEpoch: epoch,
        vmIdFragment: vmId,
        accumulatedAmount: 0n,
        nonce: pendingNonce,
      });
    } else {
      repo.findLatestBySubChannel.mockResolvedValue(null);
    }
    return repo;
  }

  const dummyRavRepo: jest.Mocked<RAVRepository> = {
    save: jest.fn(),
    getLatest: jest.fn(),
  } as any;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('paid route: pending exists and no signature → REQUIRE_SIGNATURE_402', async () => {
    const pendingRepo = createPendingRepo(2n);
    const ctx = createCtx({
      meta: { operation: 'OP', billingRule: { id: 'r1', strategy: { type: 'PerRequest' }, paymentRequired: true } },
      state: { subChannelState: { channelId, epoch, accumulatedAmount: 0n, nonce: 1n, lastUpdated: Date.now() } },
    });
    // no signedSubRav, need didAuth.keyId to derive vmId
    (ctx.meta as any).didInfo = { did: 'did:example:payer', keyId: `did:example:payer#${vmId}` };

    const res = await verifyRav(ctx, { pendingRepo, ravRepo: dummyRavRepo, debug: false });
    expect(res.decision).toBe('REQUIRE_SIGNATURE_402');
  });

  test('pending exists but signed nonce mismatches → CONFLICT', async () => {
    const pendingRepo = createPendingRepo(2n);
    const signed = createSignedSubRav(3n, 10n);
    const ctx = createCtx({ meta: { operation: 'OP', billingRule: { id: 'r1', strategy: { type: 'PerRequest' }, paymentRequired: true }, signedSubRav: signed } });

    const res = await verifyRav(ctx, { pendingRepo, ravRepo: dummyRavRepo, debug: false });
    expect(res.decision).toBe('CONFLICT');
  });

  test('pending exists and signed matches → pendingMatched=true', async () => {
    const pendingRepo = createPendingRepo(2n);
    const signed = createSignedSubRav(2n, 10n);
    const ctx = createCtx({ meta: { operation: 'OP', billingRule: { id: 'r1', strategy: { type: 'PerRequest' }, paymentRequired: true }, signedSubRav: signed } });

    // skip actual signature verification
    const res = await verifyRav(ctx, { pendingRepo, ravRepo: dummyRavRepo, debug: false });
    expect(res.decision).toBe('ALLOW');
    expect(res.pendingMatched).toBe(true);
  });

  test('signature verification via didResolver succeeds (payerDid from didInfo)', async () => {
    const pendingRepo = createPendingRepo(undefined);
    const signed = createSignedSubRav(1n, 0n);
    const ctx = createCtx({
      meta: { operation: 'OP', billingRule: { id: 'r1', strategy: { type: 'PerRequest' }, paymentRequired: true }, signedSubRav: signed, didInfo: { did: 'did:example:payer', keyId: `did:example:payer#${vmId}` } },
    });

    const verifySpy = jest.spyOn(SubRAVSigner, 'verifyWithResolver').mockResolvedValue(true);
    const didResolver: any = { resolveDID: jest.fn().mockResolvedValue({ id: 'did:example:payer', verificationMethod: [{ id: `did:example:payer#${vmId}`, type: 'Ed25519VerificationKey2020', publicKeyMultibase: 'z...' }] }) };

    const res = await verifyRav(ctx, { pendingRepo, ravRepo: dummyRavRepo, debug: false, didResolver });
    expect(verifySpy).toHaveBeenCalled();
    expect(res.signedVerified).toBe(true);
  });

  test('signature verification via didResolver uses channelInfo.payerDid if didInfo missing', async () => {
    const pendingRepo = createPendingRepo(undefined);
    const signed = createSignedSubRav(1n, 0n);
    const ctx = createCtx({
      meta: { operation: 'OP', billingRule: { id: 'r1', strategy: { type: 'PerRequest' }, paymentRequired: true }, signedSubRav: signed },
      state: { channelInfo: { channelId, payerDid: 'did:example:payer', payeeDid: 'did:example:payee', assetId: 'asset', epoch, status: 'active' } as any },
    });

    const verifySpy = jest.spyOn(SubRAVSigner, 'verifyWithResolver').mockResolvedValue(true);
    const didResolver: any = { resolveDID: jest.fn().mockResolvedValue({ id: 'did:example:payer', verificationMethod: [{ id: `did:example:payer#${vmId}`, type: 'Ed25519VerificationKey2020', publicKeyMultibase: 'z...' }] }) };

    const res = await verifyRav(ctx, { pendingRepo, ravRepo: dummyRavRepo, debug: false, didResolver });
    expect(verifySpy).toHaveBeenCalled();
    expect(res.signedVerified).toBe(true);
  });

  test('no didResolver provided → signature step skipped (Phase 1 compatible)', async () => {
    const pendingRepo = createPendingRepo(undefined);
    const signed = createSignedSubRav(1n, 0n);
    const ctx = createCtx({ meta: { operation: 'OP', billingRule: { id: 'r1', strategy: { type: 'PerRequest' }, paymentRequired: true }, signedSubRav: signed } });

    const res = await verifyRav(ctx, { pendingRepo, ravRepo: dummyRavRepo, debug: false });
    expect(res.signedVerified).toBe(true);
  });
});


