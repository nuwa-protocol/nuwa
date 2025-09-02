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

    // Streaming tool
    app.paidTool({
      name: 'stream_data',
      description: 'Stream data chunks (paid per call)',
      pricePicoUSD: BigInt(500000000), // 0.0005 USD
      streaming: true,
      parameters: {
        type: 'object',
        properties: { count: { type: 'number', description: 'Number of chunks to stream' } },
      },
      execute: async (params: any) => {
        const count = params.count || 3;
        const chunks: any[] = [];
        for (let i = 0; i < count; i++) {
          chunks.push({
            chunk: i + 1,
            data: `Streaming chunk ${i + 1}/${count}`,
            timestamp: new Date().toISOString(),
          });
          if (i < count - 1) await new Promise(resolve => setTimeout(resolve, 100));
        }
        return { chunks, total: count };
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
    expect(health).toEqual(
      expect.objectContaining({
        status: 'healthy',
        service: expect.any(String),
      })
    );
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

    console.log('✅ Process response:', processResult.data);
    console.log(`💰 Process payment - ${formatPaymentInfo(processResult.payment!)}`);

    // Verify cost difference
    expect(processResult.payment!.cost).toBeGreaterThan(analyzeResult.payment!.cost);
    console.log(
      `📊 Cost comparison: Process (${processResult.payment!.cost.toString()}) > Analyze (${analyzeResult.payment!.cost.toString()}): ✅`
    );

    console.log('🎉 Paid business tools test successful!');
  }, 120000);

  test('Streaming tool with payment settlement', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('📡 Testing streaming tool with payment settlement');

    const streamResult = await mcpClient.call('stream_data', { count: 3 });

    expect(streamResult.data).toEqual(
      expect.objectContaining({
        chunks: expect.arrayContaining([
          expect.objectContaining({
            chunk: 1,
            data: expect.stringContaining('Streaming chunk 1/3'),
            timestamp: expect.any(String),
          }) as any,
          expect.objectContaining({
            chunk: 2,
            data: expect.stringContaining('Streaming chunk 2/3'),
            timestamp: expect.any(String),
          }) as any,
          expect.objectContaining({
            chunk: 3,
            data: expect.stringContaining('Streaming chunk 3/3'),
            timestamp: expect.any(String),
          }) as any,
        ]),
        total: 3,
      })
    );

    // Should have payment info for streaming
    expect(streamResult.payment).toBeTruthy();
    expect(streamResult.payment!.cost).toBe(BigInt('5000000')); // 500,000,000 picoUSD ÷ 100 picoUSD/unit = 5,000,000 RGas base units

    console.log('✅ Stream response:', streamResult.data);
    console.log(`💰 Stream payment - ${formatPaymentInfo(streamResult.payment!)}`);

    console.log('🎉 Streaming tool test successful!');
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

    // Make some requests to create state
    const result1 = await mcpClient.call('analyze', { data: 'Recovery test 1' });
    const result2 = await mcpClient.call('process', { operation: 'Recovery test 2' });

    expect(result1.payment).toBeTruthy();
    expect(result2.payment).toBeTruthy();

    console.log(`💰 Recovery test 1 - ${formatPaymentInfo(result1.payment!)}`);
    console.log(`💰 Recovery test 2 - ${formatPaymentInfo(result2.payment!)}`);

    // Test recovery
    const recoveryRaw = await mcpClient.recoverFromService();
    const recoveryData =
      recoveryRaw && (recoveryRaw as any).success ? (recoveryRaw as any).data : recoveryRaw;

    expect(recoveryData).toBeTruthy();
    expect(recoveryData.timestamp).toBeTruthy();
    expect(recoveryData.channel).toBeTruthy();
    expect(recoveryData.channel.channelId).toEqual(expect.any(String));

    console.log('✅ Recovery data retrieved:', {
      channelCount: recoveryData.channel ? 1 : 0,
      timestamp: recoveryData.timestamp,
    });

    console.log('🎉 Recovery functionality test successful!');
  }, 60000);
});
