import { PaymentProcessor } from '../PaymentProcessor';
import type { PaymentProcessorConfig } from '../PaymentProcessor';
import type { BillingContext } from '../../billing';

describe('PaymentProcessor + RavVerifier (integration-lite)', () => {
  function makeCtx(): BillingContext {
    // Provide a minimal signedSubRav so preProcess can derive channelId/vmId without DIDAuth
    const signedSubRav = {
      subRav: {
        version: 1,
        chainId: 4n,
        channelId: '0x'.padEnd(66, 'a'),
        channelEpoch: 0n,
        vmIdFragment: 'key-1',
        accumulatedAmount: 0n,
        nonce: 0n,
      },
      signature: new Uint8Array([1]),
    } as any;

    return {
      serviceId: 'svc',
      meta: {
        operation: 'OP',
        billingRule: { id: 'r1', strategy: { type: 'PerRequest' }, paymentRequired: true },
        signedSubRav,
      },
      state: {},
    } as BillingContext;
  }

  test('prefetch + verification short-circuits on CHANNEL_NOT_FOUND and SUBCHANNEL_NOT_AUTHORIZED', async () => {
    const config = {
      payeeClient: {
        getChannelInfo: jest.fn().mockResolvedValue(null),
        getSubChannelState: jest.fn(),
        getContract: jest.fn(),
        getRAVRepository: jest.fn(),
      },
      serviceId: 'svc',
      rateProvider: { getPricePicoUSD: jest.fn(), getLastUpdated: jest.fn() },
      pendingSubRAVStore: { save: jest.fn(), find: jest.fn(), remove: jest.fn(), findLatestBySubChannel: jest.fn(), cleanup: jest.fn() } as any,
      ravRepository: { save: jest.fn(), getLatest: jest.fn() } as any,
      debug: false,
      didResolver: { resolveDID: jest.fn() } as any,
    } as unknown as PaymentProcessorConfig;

    const processor = new PaymentProcessor(config);
    const ctx = makeCtx();
    const res = await processor.preProcess(ctx);
    // With signedSubRav provided, preProcess will derive channelId, then getChannelInfo returns null -> CHANNEL_NOT_FOUND
    expect(res.state?.error?.code).toBe('CHANNEL_NOT_FOUND');
  });
});


