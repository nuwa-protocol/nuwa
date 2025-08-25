import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { TestEnv, createSelfDid, DebugLogger } from '@nuwa-ai/identity-kit';
import type { CreateSelfDidResult } from '@nuwa-ai/identity-kit';
import { createMcpPaymentKit } from '../../src/transport/mcp/McpPaymentKit';
import { registerHandlersForMcp } from '../../src/transport/mcp/HandlerMcpAdapter';
import { BuiltInApiHandlers } from '../../src/api';
import type { ApiContext } from '../../src/types/api';
import { PaymentChannelMcpClient, type McpTransport } from '../../src/integrations/mcp';
import type { PaymentResult } from '../../src/core/types';

class InMemoryMcpServer {
  private handlers: Record<string, (params: any, meta?: any) => Promise<any>> = {};
  register(name: string, fn: (params: any, meta?: any) => Promise<any>) {
    this.handlers[name] = fn;
  }
  async call(method: string, params?: any, meta?: any) {
    const fn = this.handlers[method];
    if (!fn) throw new Error(`No MCP handler registered for ${method}`);
    return await fn(params || {}, meta);
  }
}

describe('MCP Payment Kit E2E (In-memory transport)', () => {
  let env: TestEnv;
  let payer: CreateSelfDidResult;
  let payee: CreateSelfDidResult;
  let server: InMemoryMcpServer;
  let client: PaymentChannelMcpClient;

  beforeAll(async () => {
    if (!(process.env.PAYMENT_E2E === '1') || TestEnv.skipIfNoNode()) {
      console.log('Skipping MCP E2E tests - PAYMENT_E2E not set or node not accessible');
      return;
    }
    DebugLogger.setGlobalLevel('debug');

    env = await TestEnv.bootstrap({
      rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
      network: 'local',
      debug: false,
    });

    payer = await createSelfDid(env, { keyType: 'EcdsaSecp256k1VerificationKey2019' as any, skipFunding: false });
    payee = await createSelfDid(env, { keyType: 'EcdsaSecp256k1VerificationKey2019' as any, skipFunding: false });

    // Server: create MCP payment kit
    const kit = await createMcpPaymentKit({
      serviceId: 'mcp-e2e-service',
      signer: payee.signer,
      network: 'local',
      rpcUrl: env.rpcUrl,
      defaultAssetId: '0x3::gas_coin::RGas',
      defaultPricePicoUSD: '1000000000',
      adminDid: [payee.did, payer.did],
      debug: true,
    });

    // Register built-in handlers into kit
    const ctx: ApiContext = {
      config: {
        serviceId: 'mcp-e2e-service',
        serviceDid: await payee.signer.getDid(),
        defaultAssetId: '0x3::gas_coin::RGas',
        defaultPricePicoUSD: '1000000000',
        adminDid: [payee.did, payer.did],
        debug: true,
      },
      payeeClient: (kit as any).payeeClient,
      rateProvider: (kit as any).rateProvider,
      claimTriggerService: undefined,
      processor: (kit as any).processor,
      ravRepository: (kit as any).ravRepo,
      channelRepo: (kit as any).channelRepo,
      pendingSubRAVStore: (kit as any).pendingSubRAVRepo,
    } as any;

    registerHandlersForMcp(kit as any, ctx, { pathPrefix: '/payment-channel' });
    // Add a paid MCP tool to exercise deferred billing
    (kit as any).register(
      'echo',
      { pricing: '1000000000' },
      async (params: any) => ({ data: { echo: params?.q || 'hello', timestamp: Date.now() } })
    );

    // Wire handlers into in-memory server
    server = new InMemoryMcpServer();
    const handlers = (kit as any).getHandlers() as Record<string, (params: any, meta?: any) => Promise<any>>;
    (Object.entries(handlers) as Array<[string, (params: any, meta?: any) => Promise<any>]>).forEach(
      ([name, fn]) => server.register(name, fn)
    );

    // Client: simple in-memory transport calling the server
    const keyIds = await payer.signer.listKeyIds();
    const keyId = keyIds[0];
    const transport: McpTransport = {
      call: async (method, params, _meta) =>
        server.call(method, params, { didInfo: { did: payer.did, keyId } }),
    };
    client = new PaymentChannelMcpClient({
      transport,
      chainConfig: { rpcUrl: env.rpcUrl, network: 'local' } as any,
      signer: payer.signer,
      defaultAssetId: '0x3::gas_coin::RGas',
      maxAmount: BigInt('50000000000'),
      debug: true,
    });
  }, 180000);

  afterAll(async () => {
    // Nothing specific to clean up for in-memory server
  });

  test('Complete MCP deferred payment flow (in-memory)', async () => {
    if (!(process.env.PAYMENT_E2E === '1') || TestEnv.skipIfNoNode()) return;

    // 1. First call (handshake on paid endpoint should produce proposal for next)
    const r1 = await client.call<any>('echo', { q: 'hello' });
    expect(r1.data).toBeTruthy();

    // 2. Second call settles the first (deferred)
    const r2 = await client.call<any>('echo', { q: 'world' });
    expect(r2.payment).toBeTruthy();
    expect(r2.payment!.cost).toBeGreaterThanOrEqual(0n);

    // 3. Recovery works
    const recovery = await client.recoverFromService();
    expect(recovery).toBeTruthy();
  }, 120000);
});


