import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { fork, ChildProcess } from 'child_process';
import waitOn from 'wait-on';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';
import type { MinimalConfig } from '../src/config.js';
import { PaymentChannelMcpClient } from '@nuwa-ai/payment-kit';
import { TestEnv, createSelfDid, type CreateSelfDidResult } from '@nuwa-ai/identity-kit';
import type { AssetInfo } from '@nuwa-ai/payment-kit';
import { createMcpClient } from '@nuwa-ai/payment-kit';

// Start mock upstream MCP server
async function startMockUpstream(): Promise<ChildProcess> {
  const proc = fork('./test/fixtures/http-mock-mcp.js', [], { stdio: 'ignore' });
  await new Promise<void>((resolve, reject) => {
    waitOn({ resources: ['tcp:4000'], timeout: 10000 }, err => {
      if (err) reject(err);
      else resolve();
    });
  });
  return proc;
}

// Start the actual proxy server directly using the exported startServer function
async function startProxyServer(
  payee: CreateSelfDidResult
): Promise<{ close: () => Promise<void> }> {
  // Export payee's key for the proxy server
  const keyIds = await payee.keyManager.listKeyIds();
  const serviceKey = await payee.keyManager.exportKeyToString(keyIds[0]);

  // Create test configuration
  const config: MinimalConfig = {
    port: 5100,
    endpoint: '/mcp',
    upstream: {
      type: 'httpStream',
      url: 'http://127.0.0.1:4000/mcp',
    },
    serviceId: 'test-service',
    serviceKey: serviceKey, // Use exported key string
    network: 'local',
    debug: false,
    defaultPricePicoUSD: '100000000', // 0.0001 USD - make upstream tools paid for testing
    register: {
      tools: [
        {
          name: 'custom.free',
          pricePicoUSD: '0',
        },
        {
          name: 'custom.paid',
          pricePicoUSD: '200000000', // 0.0002 USD
        },
      ],
    },
  };

  // Use the exported startServer function
  return await startServer(config);
}

// Check if we should run E2E tests
const shouldRunE2ETests = () => {
  return process.env.PAYMENT_E2E === '1' && !TestEnv.skipIfNoNode();
};

describe('Proxy MCP e2e', () => {
  let env: TestEnv;
  let payer: CreateSelfDidResult;
  let payee: CreateSelfDidResult;
  let testAsset: AssetInfo;
  let proxyServer: { close: () => Promise<void> } | undefined;
  let upstreamProc: ChildProcess | undefined;
  let mcpClient: PaymentChannelMcpClient;

  beforeAll(async () => {
    if (!shouldRunE2ETests()) {
      console.log('Skipping Proxy E2E tests - PAYMENT_E2E not set or node not accessible');
      return;
    }

    // Bootstrap test environment with real Rooch node
    env = await TestEnv.bootstrap({
      rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
      network: 'local',
      debug: false,
    });

    // Create test identities
    payer = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false,
    });

    payee = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false,
    });

    // Define test asset
    testAsset = {
      assetId: '0x3::gas_coin::RGas',
      decimals: 8,
    };

    console.log(`✅ Test setup completed:
      Payer DID: ${payer.did}
      Payee DID: ${payee.did}
      Test Asset: ${testAsset.assetId}
      Node URL: ${env.rpcUrl}
    `);

    // Start mock upstream first
    upstreamProc = await startMockUpstream();

    // Start the actual proxy server directly
    proxyServer = await startProxyServer(payee);

    // Create MCP client with payment capabilities
    mcpClient = await createMcpClient({
      baseUrl: 'http://127.0.0.1:5100/mcp',
      env: payer.identityEnv,
      debug: true,
      maxAmount: BigInt(100000000000), // 100 RGas - increase to handle higher costs
    });

    // Fund the payer's hub
    const hubClient = mcpClient.getPayerClient().getHubClient();
    const depositTx = await hubClient.deposit(testAsset.assetId, BigInt('1000000000')); // 10 RGas
    console.log('💰 Deposit tx:', depositTx);

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 180000); // 3 minutes timeout for setup

  afterAll(async () => {
    if (!shouldRunE2ETests()) return;

    try {
      await proxyServer?.close?.();
    } catch {}
    try {
      upstreamProc?.kill('SIGTERM');
    } catch {}
  });

  it('tools/list returns upstream forwarded tools', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔍 Testing proxy tool list');

    const tools = await mcpClient.listTools({
      includeBuiltinTools: true,
    });
    const list = Array.isArray((tools as any).tools) ? (tools as any).tools : (tools as any);
    const names = list.map((t: any) => t.name);
    console.log('Available tools:', names);

    // Should contain payment kit built-in tools
    expect(names).toContain('nuwa.health');
    expect(names).toContain('nuwa.discovery');

    // Should contain upstream 'echo' tool
    expect(names).toContain('echo');

    console.log('✅ Proxy tool list test successful!');
  });

  it('can forward calls to upstream MCP server', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing upstream forwarding');

    // The mock upstream has an 'echo' tool, which should be forwarded
    const res = await mcpClient.callTool('echo', { text: 'upstream test' });
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.content[0].type).toBe('text');
    expect(res.content[0].text).toBe('upstream test');

    console.log('✅ Upstream forwarding test successful!');
  });

  it('payment kit built-in tools are available', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🏥 Testing payment kit built-in tools');

    // Test health check
    const health = await mcpClient.healthCheck();
    expect(health.status).toBe('healthy');
    console.log('✅ Health check successful:', health);

    // Test discovery
    const discovery = await mcpClient.call('nuwa.discovery');
    expect(discovery.data).toEqual(
      expect.objectContaining({
        serviceId: 'test-service',
        serviceDid: payee.did,
      })
    );
    expect(discovery.payment).toBeUndefined(); // FREE endpoint
    console.log('✅ Discovery successful:', discovery.data);

    console.log('✅ Payment kit built-in tools test successful!');
  });

  it('can handle paid upstream tools with default pricing', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('💰 Testing paid upstream tool calls');

    // Call upstream echo tool (should be paid due to defaultPricePicoUSD)
    const result = await mcpClient.call('echo', { text: 'paid upstream test' });

    expect(result.data).toBeTruthy();
    expect(result.payment).toBeTruthy(); // Should have payment info
    expect(result.payment!.cost).toBe(BigInt('1000000')); // 100,000,000 picoUSD ÷ 100 picoUSD/unit = 1,000,000 RGas base units

    console.log('✅ Paid upstream tool response:', result.data);
    console.log('💰 Payment info:', {
      cost: result.payment!.cost.toString(),
      costUsd: result.payment!.costUsd.toString(),
      nonce: result.payment!.nonce.toString(),
      clientTxRef: result.payment!.clientTxRef,
    });

    console.log('✅ Paid upstream tools test successful!');
  });

  it('can handle custom FREE tools', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔧 Testing custom FREE tools');

    // Call custom free tool
    const result = await mcpClient.call('custom.free', { message: 'test message' });

    expect(result.data).toBeTruthy();
    expect(result.payment).toBeUndefined(); // Should be free
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain('Custom free tool executed with message: test message');

    console.log('✅ Custom FREE tool response:', result.data);
    console.log('✅ Payment info:', result.payment || 'None (FREE)');

    console.log('✅ Custom FREE tools test successful!');
  });

  it('can handle custom paid tools', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('💎 Testing custom paid tools');

    // Call custom paid tool
    const result = await mcpClient.call('custom.paid', { data: 'test data' });

    expect(result.data).toBeTruthy();
    expect(result.payment).toBeTruthy(); // Should have payment info
    expect(result.payment!.cost).toBe(BigInt('2000000')); // 200,000,000 picoUSD ÷ 100 picoUSD/unit = 2,000,000 RGas base units
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain('Custom paid tool executed with data: test data');

    console.log('✅ Custom paid tool response:', result.data);
    console.log('💰 Payment info:', {
      cost: result.payment!.cost.toString(),
      costUsd: result.payment!.costUsd.toString(),
      nonce: result.payment!.nonce.toString(),
      clientTxRef: result.payment!.clientTxRef,
    });

    console.log('✅ Custom paid tools test successful!');
  });

  it('tool list includes custom and upstream tools', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('📋 Testing comprehensive tool list');

    const tools = await mcpClient.listTools({
      includeBuiltinTools: true,
    });
    const list = Array.isArray((tools as any).tools) ? (tools as any).tools : (tools as any);
    const names = list.map((t: any) => t.name);
    console.log('All available tools:', names);

    // Should contain payment kit built-in tools
    expect(names).toContain('nuwa.health');
    expect(names).toContain('nuwa.discovery');

    // Should contain upstream 'echo' tool
    expect(names).toContain('echo');

    // Should contain custom tools
    expect(names).toContain('custom.free');
    expect(names).toContain('custom.paid');

    console.log('✅ Comprehensive tool list test successful!');
  });
});

// Start stdio mock MCP server
async function startStdioProxyServer(
  payee: CreateSelfDidResult
): Promise<{ close: () => Promise<void> }> {
  // Export payee's key for the proxy server
  const keyIds = await payee.keyManager.listKeyIds();
  const serviceKey = await payee.keyManager.exportKeyToString(keyIds[0]);

  // Create test configuration with stdio upstream
  const config: MinimalConfig = {
    port: 5200, // Different port to avoid conflicts
    endpoint: '/mcp',
    upstream: {
      type: 'stdio',
      command: ['node', './test/fixtures/stdio-mock-mcp.js'],
      cwd: process.cwd(),
    },
    serviceId: 'test-stdio-service',
    serviceKey: serviceKey,
    network: 'local',
    debug: false,
    defaultPricePicoUSD: '100000000', // 0.0001 USD
    register: {
      tools: [
        {
          name: 'stdio.free',
          pricePicoUSD: '0',
        },
        {
          name: 'stdio.paid',
          pricePicoUSD: '200000000', // 0.0002 USD
        },
      ],
    },
  };

  return await startServer(config);
}

describe('Proxy MCP e2e (Stdio Upstream)', () => {
  let env: TestEnv;
  let payer: CreateSelfDidResult;
  let payee: CreateSelfDidResult;
  let testAsset: AssetInfo;
  let proxyServer: { close: () => Promise<void> } | undefined;
  let mcpClient: PaymentChannelMcpClient;

  beforeAll(async () => {
    if (!shouldRunE2ETests()) {
      console.log('Skipping Stdio Proxy E2E tests - PAYMENT_E2E not set or node not accessible');
      return;
    }

    // Bootstrap test environment with real Rooch node
    env = await TestEnv.bootstrap({
      rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
      network: 'local',
      debug: false,
    });

    // Create test identities
    payer = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false,
    });

    payee = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false,
    });

    // Define test asset
    testAsset = {
      assetId: '0x3::gas_coin::RGas',
      decimals: 8,
    };

    console.log(`✅ Stdio Test setup completed:
      Payer DID: ${payer.did}
      Payee DID: ${payee.did}
      Test Asset: ${testAsset.assetId}
      Node URL: ${env.rpcUrl}
    `);

    // Start the stdio proxy server
    proxyServer = await startStdioProxyServer(payee);

    // Create MCP client with payment capabilities
    mcpClient = await createMcpClient({
      baseUrl: 'http://127.0.0.1:5200/mcp',
      env: payer.identityEnv,
      debug: true,
      maxAmount: BigInt(100000000000), // 100 RGas - increase to handle higher costs
    });

    // Trigger server type detection by calling health check
    await mcpClient.healthCheck();

    // Fund the payer's hub
    const hubClient = mcpClient.getPayerClient().getHubClient();
    const depositTx = await hubClient.deposit(testAsset.assetId, BigInt('1000000000')); // 10 RGas
    console.log('💰 Stdio Deposit tx:', depositTx);

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 180000); // 3 minutes timeout for setup

  afterAll(async () => {
    if (!shouldRunE2ETests()) return;

    try {
      await proxyServer?.close?.();
    } catch {}
  });

  it('stdio upstream tools/list returns forwarded tools', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔍 Testing stdio proxy tool list');

    const tools = await mcpClient.listTools({
      includeBuiltinTools: true,
    });
    const list = Array.isArray((tools as any).tools) ? (tools as any).tools : (tools as any);
    const names = list.map((t: any) => t.name);
    console.log('Available stdio tools:', names);

    // Should contain payment kit built-in tools
    expect(names).toContain('nuwa.health');
    expect(names).toContain('nuwa.discovery');

    // Should contain stdio upstream tools
    expect(names).toContain('echo');
    expect(names).toContain('stdio.free');
    expect(names).toContain('stdio.paid');

    console.log('✅ Stdio proxy tool list test successful!');
  });

  it('can forward calls to stdio upstream MCP server', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing stdio upstream forwarding');

    // The stdio mock upstream has an 'echo' tool
    const res = await mcpClient.callTool('echo', { text: 'stdio upstream test' });
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.content[0].type).toBe('text');
    expect(res.content[0].text).toBe('stdio upstream test');

    console.log('✅ Stdio upstream forwarding test successful!');
  });

  it('can handle stdio FREE tools', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔧 Testing stdio FREE tools');

    // Call stdio free tool
    const result = await mcpClient.call('stdio.free', { message: 'test stdio message' });

    expect(result.data).toBeTruthy();
    expect(result.payment).toBeUndefined(); // Should be free
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain('Stdio free tool executed with message: test stdio message');

    console.log('✅ Stdio FREE tool response:', result.data);
    console.log('✅ Payment info:', result.payment || 'None (FREE)');

    console.log('✅ Stdio FREE tools test successful!');
  });

  it('can handle stdio paid tools', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('💎 Testing stdio paid tools');

    // Call stdio paid tool
    const result = await mcpClient.call('stdio.paid', { data: 'test stdio data' });

    expect(result.data).toBeTruthy();
    expect(result.payment).toBeTruthy(); // Should have payment info
    expect(result.payment!.cost).toBe(BigInt('2000000')); // 200,000,000 picoUSD ÷ 100 picoUSD/unit = 2,000,000 RGas base units
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain('Stdio paid tool executed with data: test stdio data');

    console.log('✅ Stdio paid tool response:', result.data);
    console.log('💰 Payment info:', {
      cost: result.payment!.cost.toString(),
      costUsd: result.payment!.costUsd.toString(),
      nonce: result.payment!.nonce.toString(),
      clientTxRef: result.payment!.clientTxRef,
    });

    console.log('✅ Stdio paid tools test successful!');
  });

  it('can handle paid stdio upstream tools with default pricing', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('💰 Testing paid stdio upstream tool calls');

    // Call upstream echo tool (should be paid due to defaultPricePicoUSD)
    const result = await mcpClient.call('echo', { text: 'paid stdio upstream test' });

    expect(result.data).toBeTruthy();
    expect(result.payment).toBeTruthy(); // Should have payment info
    expect(result.payment!.cost).toBe(BigInt('1000000')); // 100,000,000 picoUSD ÷ 100 picoUSD/unit = 1,000,000 RGas base units

    console.log('✅ Paid stdio upstream tool response:', result.data);
    console.log('💰 Payment info:', {
      cost: result.payment!.cost.toString(),
      costUsd: result.payment!.costUsd.toString(),
      nonce: result.payment!.nonce.toString(),
      clientTxRef: result.payment!.clientTxRef,
    });

    console.log('✅ Paid stdio upstream tools test successful!');
  });
});
