/**
 * MCP Payment Kit End-to-End Tests
 *
 * This test suite tests the complete MCP payment workflow against a real Rooch node:
 * 1. Uses real blockchain connection and payment channels
 * 2. Tests the MCP server with FastMCP integration
 * 3. Tests the MCP client with payment flows
 * 4. Covers FREE and paid tool calls
 * 5. Tests streaming responses with payment settlement
 * 6. Tests built-in payment management tools
 */

import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { PaymentChannelMcpClient } from '../../src/integrations/mcp/PaymentChannelMcpClient';
import { createFastMcpServer } from '../../src/transport/mcp/FastMcpStarter';
import { PaymentHubClient } from '../../src/client/PaymentHubClient';
import { RoochPaymentChannelContract } from '../../src/rooch/RoochPaymentChannelContract';
import type { AssetInfo, PaymentInfo } from '../../src/core/types';
import { TestEnv, createSelfDid, CreateSelfDidResult, DebugLogger } from '@nuwa-ai/identity-kit';
import type { Server } from 'http';
import { HttpPaymentCodec } from '../../src/integrations/http/internal/codec';

// Helper function to format payment info consistently
function formatPaymentInfo(payment: PaymentInfo): string {
  return `Cost: ${payment.cost.toString()} units, USD: ${payment.costUsd.toString()} pUSD, Tx: ${payment.clientTxRef}`;
}

// Check if we should run E2E tests
const shouldRunE2ETests = () => {
  return process.env.PAYMENT_E2E === '1' && !TestEnv.skipIfNoNode();
};

describe('MCP Payment Kit E2E (Real Blockchain + MCP Server)', () => {
  let env: TestEnv;
  let payer: CreateSelfDidResult;
  let payee: CreateSelfDidResult;
  let testAsset: AssetInfo;
  let mcpServer: Server;
  let mcpClient: PaymentChannelMcpClient;
  let hubClient: PaymentHubClient;
  let logger: DebugLogger;
  let serverUrl: string;

  // Track unhandled rejections for debugging
  const unhandledRejections = new Set<any>();
  const unhandledRejectionListener = (reason: any, promise: Promise<any>) => {
    console.error('🚨 Unhandled promise rejection detected:', reason);
    console.error('Stack:', reason?.stack);
    unhandledRejections.add({ reason, promise });
  };

  beforeAll(async () => {
    process.on('unhandledRejection', unhandledRejectionListener);
    if (!shouldRunE2ETests()) {
      console.log('Skipping MCP E2E tests - PAYMENT_E2E not set or node not accessible');
      return;
    }

    DebugLogger.setGlobalLevel('debug');
    logger = DebugLogger.get('McpPaymentKit.e2e.test');
    logger.setLevel('debug');
    logger.debug('🚀 Starting MCP Payment Kit E2E Tests');

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

    // Start MCP server with payment capabilities
    const port = 8080 + Math.floor(Math.random() * 1000); // Random port to avoid conflicts
    serverUrl = `http://localhost:${port}/mcp`;

    const app = await createFastMcpServer({
      serviceId: 'mcp-e2e-test-service',
      signer: payee.signer,
      defaultAssetId: testAsset.assetId,
      rpcUrl: env.rpcUrl,
      network: 'local',
      port,
      debug: true,
    });

    // FREE tool
    app.freeTool({
      name: 'hello',
      description: 'Say hello (FREE)',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Name to greet' } },
      },
      execute: async (params: any) => ({
        message: `Hello, ${params.name || 'World'}!`,
        timestamp: new Date().toISOString(),
      }),
    });

    // FREE tool that reads DID from FastMCP context
    app.freeTool({
      name: 'whoami',
      description: 'Return signer DID from context (FREE)',
      parameters: { type: 'object', properties: {} },
      execute: async (_params: any, context?: any) => ({
        signerDid: context?.didInfo?.did || null,
        keyId: context?.didInfo?.keyId || null,
        timestamp: new Date().toISOString(),
      }),
    });

    // Paid tool
    app.paidTool({
      name: 'analyze',
      description: 'Analyze data (paid service)',
      pricePicoUSD: BigInt(1000000000), // 0.001 USD
      parameters: {
        type: 'object',
        properties: { data: { type: 'string', description: 'Data to analyze' } },
      },
      execute: async (params: any) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          analysis: `Analysis of "${params.data}": This data contains ${params.data.length} characters.`,
          confidence: 0.95,
          timestamp: new Date().toISOString(),
        };
      },
    });

    // Expensive tool
    app.paidTool({
      name: 'process',
      description: 'Process complex data (expensive)',
      pricePicoUSD: BigInt(10000000000), // 0.01 USD
      parameters: {
        type: 'object',
        properties: { operation: { type: 'string', description: 'Operation to perform' } },
      },
      execute: async (params: any) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          result: `Processed operation: ${params.operation}`,
          complexity: 'high',
          timestamp: new Date().toISOString(),
        };
      },
    });

    // Slow tool for non-stream testing (useful for concurrency or latency scenarios)
    app.paidTool({
      name: 'slow_process',
      description: 'Simulate a slow business operation (paid)',
      pricePicoUSD: BigInt(500000000), // 0.0005 USD
      parameters: {
        type: 'object',
        properties: {
          delayMs: { type: 'number', description: 'Artificial delay in milliseconds' },
        },
      },
      execute: async (params: any) => {
        const delayMs = typeof params?.delayMs === 'number' ? params.delayMs : 300;
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return { ok: true, delayMs, timestamp: new Date().toISOString() } as any;
      },
    });

    mcpServer = await app.start();

    // Create MCP client
    mcpClient = new PaymentChannelMcpClient({
      baseUrl: serverUrl,
      signer: payer.signer,
      keyId: `${payer.did}#${payer.vmIdFragment}`, // Use full DID key ID
      payerDid: payer.did,
      payeeDid: payee.did,
      defaultAssetId: testAsset.assetId,
      chainConfig: {
        chain: 'rooch' as const,
        rpcUrl: env.rpcUrl,
      },
      debug: true,
      maxAmount: BigInt(1000000000), // 10 RGas
    });

    // Fund the payer's hub
    hubClient = mcpClient.getPayerClient().getHubClient();
    const depositTx = await hubClient.deposit(testAsset.assetId, BigInt('1000000000')); // 10 RGas
    logger.debug('💰 Deposit tx:', depositTx);

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    logger.debug(`✅ MCP server started on ${serverUrl}`);
    logger.debug(`✅ MCP client created and funded`);
  }, 180000); // 3 minutes timeout for setup

  afterAll(async () => {
    process.removeListener('unhandledRejection', unhandledRejectionListener);
    if (unhandledRejections.size > 0) {
      console.error(`🚨 Total unhandled rejections: ${unhandledRejections.size}`);
    }
    if (!shouldRunE2ETests()) return;

    // Cleanup
    if (mcpServer) {
      await (mcpServer as any).stop?.();
      logger.debug('✅ MCP server shutdown');
    }

    DebugLogger.setGlobalLevel('error');
    logger.debug('🏁 MCP Payment Kit E2E Tests completed');
  }, 60000);

  test('Built-in FREE endpoints', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔍 Testing built-in FREE endpoints');

    // Test health check
    const health = await mcpClient.healthCheck();

    console.log('✅ Health check successful:', health);

    // Test discovery
    const discovery = await mcpClient.call('nuwa.discovery');
    expect(discovery.data).toEqual(
      expect.objectContaining({
        serviceId: 'mcp-e2e-test-service',
        serviceDid: payee.did,
        defaultAssetId: testAsset.assetId,
      })
    );
    expect(discovery.payment).toBeUndefined(); // FREE endpoint
    console.log('✅ Discovery successful:', discovery.data);

    // Test recovery
    const recoveryRaw = await mcpClient.recoverFromService();
    const recovery =
      recoveryRaw && (recoveryRaw as any).success ? (recoveryRaw as any).data : recoveryRaw;

    // channel/subChannel may be null for first-time clients
    expect(recovery).toHaveProperty('channel');
    expect(recovery).toHaveProperty('subChannel');
    console.log('✅ Recovery successful:', recovery);

    console.log('🎉 Built-in FREE endpoints test successful!');
  }, 60000);

  test('FREE business tool', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🆓 Testing FREE business tool');

    const result = await mcpClient.call('hello', { name: 'MCP Tester' });

    expect(result.data).toEqual(
      expect.objectContaining({
        message: 'Hello, MCP Tester!',
        timestamp: expect.any(String),
      })
    );
    expect(result.payment).toBeUndefined(); // FREE tool

    console.log('✅ FREE tool response:', result.data);
    console.log('✅ Payment info:', result.payment || 'None (FREE)');

    console.log('🎉 FREE business tool test successful!');
  }, 60000);

  test('DID available in handler via FastMCP context', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🪪 Testing DID exposure via context in handler');
    const result = await mcpClient.call('whoami', {});
    expect(result.data).toEqual(
      expect.objectContaining({
        signerDid: payer.did,
        keyId: `${payer.did}#${payer.vmIdFragment}`,
        timestamp: expect.any(String),
      })
    );
    expect(result.payment).toBeUndefined(); // FREE tool
    console.log('✅ DID from context:', result.data);
  }, 60000);

  test('Paid business tools with payment flow', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('💰 Testing paid business tools');

    // Test 1: Analyze tool (0.001 USD)
    console.log('📞 Request 1: Analyze tool');
    const analyzeResult = await mcpClient.call('analyze', {
      data: 'Sample data for MCP analysis',
    });

    expect(analyzeResult.data).toEqual(
      expect.objectContaining({
        analysis: expect.stringContaining('Sample data for MCP analysis'),
        confidence: 0.95,
        timestamp: expect.any(String),
      })
    );

    // Should have payment info
    expect(analyzeResult.payment).toBeTruthy();
    expect(analyzeResult.payment!.cost).toBe(BigInt('10000000')); // 1,000,000,000 picoUSD ÷ 100 picoUSD/unit = 10,000,000 RGas base units
    expect(analyzeResult.payment!.nonce).toBeGreaterThan(0n);

    // Assert nuwa:payment resource exists in contents
    const contents1 = mcpClient.getLastContents();
    expect(Array.isArray(contents1)).toBe(true);
    const paymentRes1 = (contents1 || []).find(
      (c: any) => c?.type === 'resource' && c.resource?.uri === 'nuwa:payment'
    );
    expect(!!paymentRes1).toBe(true);

    console.log('✅ Analyze response:', analyzeResult.data);
    console.log(`💰 Analyze payment - ${formatPaymentInfo(analyzeResult.payment!)}`);

    // Test 2: Process tool (0.01 USD)
    console.log('📞 Request 2: Process tool (more expensive)');
    const processResult = await mcpClient.call('process', {
      operation: 'complex data transformation',
    });

    expect(processResult.data).toEqual(
      expect.objectContaining({
        result: expect.stringContaining('complex data transformation'),
        complexity: 'high',
        timestamp: expect.any(String),
      })
    );

    // Should have higher payment cost
    expect(processResult.payment).toBeTruthy();
    expect(processResult.payment!.cost).toBe(BigInt('100000000')); // 10,000,000,000 picoUSD ÷ 100 picoUSD/unit = 100,000,000 RGas base units
    expect(processResult.payment!.nonce).toBeGreaterThan(analyzeResult.payment!.nonce);

    // Assert nuwa:payment resource exists in contents
    const contents2 = mcpClient.getLastContents();
    expect(Array.isArray(contents2)).toBe(true);
    const paymentRes2 = (contents2 || []).find(
      (c: any) => c?.type === 'resource' && c.resource?.uri === 'nuwa:payment'
    );
    expect(!!paymentRes2).toBe(true);

    console.log('✅ Process response:', processResult.data);
    console.log(`💰 Process payment - ${formatPaymentInfo(processResult.payment!)}`);

    // Verify cost difference
    expect(processResult.payment!.cost).toBeGreaterThan(analyzeResult.payment!.cost);
    console.log(
      `📊 Cost comparison: Process (${processResult.payment!.cost.toString()}) > Analyze (${analyzeResult.payment!.cost.toString()}): ✅`
    );

    console.log('🎉 Paid business tools test successful!');
  }, 120000);

  test('Slow tool with payment settlement (non-stream)', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🐢 Testing slow tool with payment settlement');

    const streamResult = await mcpClient.call('slow_process', { delayMs: 300 });

    expect(streamResult.data).toEqual(
      expect.objectContaining({
        ok: true,
        delayMs: 300,
        timestamp: expect.any(String),
      })
    );

    // Should have payment info
    expect(streamResult.payment).toBeTruthy();
    expect(streamResult.payment!.cost).toBe(BigInt('5000000')); // 500,000,000 picoUSD ÷ 100 picoUSD/unit = 5,000,000 RGas base units

    console.log('✅ Slow tool response:', streamResult.data);
    console.log(`💰 Slow tool payment - ${formatPaymentInfo(streamResult.payment!)}`);

    console.log('🎉 Slow tool test successful!');
  }, 120000);

  test('Multiple requests with nonce progression', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing multiple requests with nonce progression');

    const results: any[] = [];

    // Make 5 paid requests
    for (let i = 1; i <= 5; i++) {
      console.log(`📞 Request ${i}/5`);
      const result = await mcpClient.call('analyze', {
        data: `Test data ${i}`,
      });

      expect(result.payment).toBeTruthy();
      results.push(result);

      console.log(`💰 Request ${i} payment - ${formatPaymentInfo(result.payment!)}`);
    }

    // Verify nonce progression
    for (let i = 1; i < results.length; i++) {
      expect(results[i].payment!.nonce).toBeGreaterThan(results[i - 1].payment!.nonce);
    }

    console.log('✅ Nonce progression verified across multiple requests');
    console.log('🎉 Multiple requests test successful!');
  }, 120000);

  test('SubRAV management and commit', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing SubRAV management and commit');

    // Make a paid request to generate a pending SubRAV
    const result = await mcpClient.call('analyze', {
      data: 'Data for SubRAV test',
    });
    expect(result.payment).toBeTruthy();

    console.log(`💰 SubRAV test payment - ${formatPaymentInfo(result.payment!)}`);

    // Check for pending SubRAV
    const pendingSubRAV = mcpClient.getPendingSubRAV();
    if (pendingSubRAV) {
      console.log('📋 Pending SubRAV found:', {
        channelId: pendingSubRAV.channelId,
        nonce: pendingSubRAV.nonce.toString(),
        amount: pendingSubRAV.accumulatedAmount.toString(),
      });

      // Commit the SubRAV
      const signedSubRAV = await mcpClient.getPayerClient().signSubRAV(pendingSubRAV);
      const commitResult = await mcpClient.commitSubRAV(signedSubRAV);

      expect(commitResult).toEqual({ success: true });
      console.log('✅ SubRAV commit successful:', commitResult);

      // Verify SubRAV was cleared
      const clearedSubRAV = mcpClient.getPendingSubRAV();
      expect(clearedSubRAV).toBeNull();
      console.log('✅ Pending SubRAV cleared after commit');
    } else {
      console.log('ℹ️ No pending SubRAV found (may have been auto-committed)');
    }

    console.log('🎉 SubRAV management test successful!');
  }, 60000);

  test('Error handling for unknown tools', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('⚠️ Testing error handling for unknown tools');

    let errorCaught = false;
    try {
      await mcpClient.call('unknown_tool', { param: 'value' });
      expect(false).toBe(true); // Should not reach here
    } catch (error: any) {
      errorCaught = true;
      console.log('✅ Expected error caught:', error.message);
      expect(error.message).toMatch(/tool|method|not found/i);
    }

    expect(errorCaught).toBe(true);

    // Verify client remains functional after error
    const healthResult = await mcpClient.healthCheck();
    expect(healthResult.status).toBe('healthy');
    console.log('✅ Client remains functional after error');

    console.log('🎉 Error handling test successful!');
  }, 60000);

  test('Mixed FREE and paid requests', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing mixed FREE and paid requests');

    // FREE request
    const freeResult = await mcpClient.call('hello', { name: 'Mixed Test' });
    expect(freeResult.payment).toBeUndefined();
    console.log('✅ FREE request:', freeResult.data);

    // Paid request
    const paidResult = await mcpClient.call('analyze', { data: 'Mixed test data' });
    expect(paidResult.payment).toBeTruthy();
    console.log(`💰 Paid request - ${formatPaymentInfo(paidResult.payment!)}`);

    // Another FREE request
    const freeResult2 = await mcpClient.call('hello', { name: 'Mixed Test 2' });
    expect(freeResult2.payment).toBeUndefined();
    console.log('✅ Second FREE request:', freeResult2.data);

    // Another paid request
    const paidResult2 = await mcpClient.call('process', { operation: 'mixed test operation' });
    expect(paidResult2.payment).toBeTruthy();
    expect(paidResult2.payment!.nonce).toBeGreaterThan(paidResult.payment!.nonce);
    console.log(`💰 Second paid request - ${formatPaymentInfo(paidResult2.payment!)}`);

    console.log('🎉 Mixed FREE and paid requests test successful!');
  }, 120000);

  test('Channel state consistency', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing channel state consistency');

    // Make a paid request to ensure channel is active
    const result = await mcpClient.call('analyze', { data: 'Channel consistency test' });
    expect(result.payment).toBeTruthy();

    const channelId = result.payment!.channelId;
    console.log('📋 Channel ID:', channelId);

    // Get channel info from client
    const payerClient = mcpClient.getPayerClient();
    const clientChannelInfo = await payerClient.getChannelInfo(channelId);

    // Get channel info from blockchain
    const contract = new RoochPaymentChannelContract({
      rpcUrl: env.rpcUrl,
      network: 'local',
      debug: false,
    });

    const blockchainChannelInfo = await contract.getChannelStatus({
      channelId,
    });

    // Verify consistency
    expect(clientChannelInfo.channelId).toBe(blockchainChannelInfo.channelId);
    expect(clientChannelInfo.payerDid).toBe(blockchainChannelInfo.payerDid);
    expect(clientChannelInfo.payeeDid).toBe(blockchainChannelInfo.payeeDid);
    expect(clientChannelInfo.status).toBe(blockchainChannelInfo.status);

    console.log(`✅ Channel state consistent:
      Channel ID: ${clientChannelInfo.channelId}
      Payer DID: ${clientChannelInfo.payerDid}
      Payee DID: ${clientChannelInfo.payeeDid}
      Status: ${clientChannelInfo.status}
    `);

    console.log('🎉 Channel state consistency test successful!');
  }, 60000);

  test('Recovery functionality', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing recovery functionality');

    // Make a paid call to create a channel
    const result1 = await mcpClient.call('analyze', { data: 'Recovery test data' });
    expect(result1.data).toBeTruthy();
    expect(result1.payment).toBeTruthy();
    console.log(`💰 Paid call result - ${formatPaymentInfo(result1.payment!)}`);

    // Test recovery after paid call - should now have channel
    const recoveryAfter = await mcpClient.recoverFromService();
    console.log('Recovery after paid call:', JSON.stringify(recoveryAfter, null, 2));

    expect(recoveryAfter).toBeTruthy();
    expect(recoveryAfter.timestamp).toBeTruthy();
    expect(recoveryAfter.channel).toBeTruthy();
    expect(recoveryAfter.channel.channelId).toEqual(expect.any(String));
    // SubChannel might exist if auto-authorized
    if (recoveryAfter.subChannel) {
      expect(recoveryAfter.subChannel.vmIdFragment).toBeTruthy();
    }

    console.log('✅ Recovery data retrieved:', {
      hasChannel: !!recoveryAfter.channel,
      hasSubChannel: !!recoveryAfter.subChannel,
      timestamp: recoveryAfter.timestamp,
    });

    console.log('🎉 Recovery functionality test successful!');
  }, 60000);

  test('PAYMENT_REQUIRED auto retry', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔁 Testing PAYMENT_REQUIRED auto retry');

    // 1) First paid request to ensure server persists an unsigned SubRAV
    const first = await mcpClient.call('analyze', { data: 'trigger pending' });
    expect(first.payment).toBeTruthy();
    console.log(`💰 First payment - ${formatPaymentInfo(first.payment!)}`);

    const recovery = await mcpClient.recoverFromService();
    expect(recovery).toBeTruthy();
    expect(recovery.pendingSubRav).toBeTruthy();
    //const pendingSubRav = HttpPaymentCodec.deserializeSubRAV(recovery.pendingSubRav);

    // 2) Clear client local pending to simulate client unaware of server-pending
    mcpClient.clearPendingSubRAV();

    // 3) Second paid request should get PAYMENT_REQUIRED then auto sign+retry
    const second = await mcpClient.call('analyze', { data: 'auto retry should succeed' });
    expect(second.payment).toBeTruthy();
    expect(second.payment!.nonce).toBeGreaterThan(first.payment!.nonce);
    console.log(`✅ Auto retry succeeded - ${formatPaymentInfo(second.payment!)}`);
  }, 120000);
});
