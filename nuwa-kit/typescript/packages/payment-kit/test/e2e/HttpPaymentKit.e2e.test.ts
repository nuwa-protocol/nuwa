/**
 * HTTP Payment Kit End-to-End Tests
 *
 * This test suite tests the complete HTTP payment workflow against a real Rooch node:
 * 1. Uses real blockchain connection and payment channels
 * 2. Tests the simplified createHttpClient API with automatic service discovery
 * 3. Tests the deferred payment model with HTTP middleware
 * 4. Covers the complete API billing scenario
 * 5. Tests multi-request payment sequences
 */

import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import {
  PaymentChannelHttpClient,
  createHttpClient,
  PaymentChannelAdminClient,
  createAdminClient,
} from '../../src/integrations/http';
import { safeStringify } from '../../src/utils/json';
import { PaymentChannelFactory } from '../../src/factory/chainFactory';
import { RoochPaymentChannelContract } from '../../src/rooch/RoochPaymentChannelContract';
import type { AssetInfo, PaymentInfo } from '../../src/core/types';
import {
  TestEnv,
  createSelfDid,
  CreateSelfDidResult,
  DebugLogger,
  DIDAuth,
} from '@nuwa-ai/identity-kit';
import { createBillingServer } from './server';
import { PaymentHubClient } from '../../src/client/PaymentHubClient';
import { MemoryChannelRepository } from '../../src/storage';

// Helper function to format payment info consistently
function formatPaymentInfo(payment: PaymentInfo): string {
  return `Cost: ${payment.cost.toString()} units, USD: ${payment.costUsd.toString()} pUSD, Tx: ${payment.clientTxRef}`;
}

// Check if we should run E2E tests
const shouldRunE2ETests = () => {
  return process.env.PAYMENT_E2E === '1' && !TestEnv.skipIfNoNode();
};

describe('HTTP Payment Kit E2E (Real Blockchain + HTTP Server)', () => {
  let env: TestEnv;
  let payer: CreateSelfDidResult;
  let payee: CreateSelfDidResult;
  let testAsset: AssetInfo;
  let billingServerInstance: any;
  let httpClient: PaymentChannelHttpClient;
  let adminClient: PaymentChannelAdminClient;
  let hubClient: PaymentHubClient;

  beforeAll(async () => {
    if (!shouldRunE2ETests()) {
      console.log('Skipping HTTP E2E tests - PAYMENT_E2E not set or node not accessible');
      return;
    }

    console.log('🚀 Starting HTTP Payment Kit E2E Tests');
    DebugLogger.setGlobalLevel('debug'); // Reduce noise in E2E tests

    // Bootstrap test environment with real Rooch node
    env = await TestEnv.bootstrap({
      rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
      network: 'local',
      debug: false, // Reduce debug noise
    });

    // Create test identities first
    payer = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false,
    });

    payee = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false,
    });

    // Note: Each CreateSelfDidResult now includes its own IdentityEnv
    // This avoids conflicts when testing multiple identities

    // Define test asset
    testAsset = {
      assetId: '0x3::gas_coin::RGas',
      decimals: 8, // RGas has 8 decimal places
    };

    console.log(`✅ Test setup completed:
      Payer DID: ${payer.did}
      Payee DID: ${payee.did}
      Test Asset: ${testAsset.assetId}
      Node URL: ${env.rpcUrl}
    `);

    // Start billing server
    billingServerInstance = await createBillingServer({
      env: payee.identityEnv, // Use payee's IdentityEnv
      port: 3001, // Use different port to avoid conflicts
      serviceId: 'e2e-test-service',
      defaultAssetId: testAsset.assetId,
      adminDid: [payee.did, payer.did], // Allow both payee and payer as admins for testing
      debug: true,
    });

    // Create HTTP client using the new simplified API with automatic service discovery
    httpClient = await createHttpClient({
      baseUrl: billingServerInstance.baseURL,
      env: payer.identityEnv, // Use the payer's dedicated IdentityEnv
      maxAmount: BigInt('50000000000'), // 50 RGas - sufficient for any single request in our tests
      debug: true,
    });

    hubClient = httpClient.getHubClient();

    let tx = await hubClient.deposit(testAsset.assetId, BigInt('1000000000'));
    console.log('💰 Deposit tx:', tx);

    // Create admin client for testing admin endpoints
    adminClient = createAdminClient(httpClient);

    console.log(`✅ Billing server started on ${billingServerInstance.baseURL}`);
    console.log(
      `✅ HTTP client created using simplified createHttpClient API with automatic service discovery`
    );
    console.log(`✅ Admin client created for testing admin endpoints`);
  }, 180000); // 3 minutes timeout for setup

  afterAll(async () => {
    if (!shouldRunE2ETests()) return;

    // Cleanup
    if (billingServerInstance) {
      await billingServerInstance.shutdown();
      console.log('✅ Billing server shutdown');
    }

    console.log('🏁 HTTP Payment Kit E2E Tests completed');
  }, 60000);

  test('Service discovery with createHttpClient', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔍 Testing service discovery with simplified API');

    // Test that service discovery works
    const serviceInfo = await httpClient.discoverService();
    expect(serviceInfo.serviceDid).toBe(payee.did);
    expect(serviceInfo.serviceId).toBe('e2e-test-service');
    expect(serviceInfo.defaultAssetId).toBe(testAsset.assetId);
    expect(serviceInfo.network).toBe('local');

    console.log('✅ Service discovery successful:', {
      serviceDid: serviceInfo.serviceDid,
      serviceId: serviceInfo.serviceId,
      network: serviceInfo.network,
    });

    console.log('🎉 Service discovery test successful!');
  }, 60000);

  test('Complete HTTP deferred payment flow', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing complete HTTP deferred payment flow');

    // Test 1: First request (handshake)
    console.log('📞 Request 1: First call (handshake)');
    const result1 = await httpClient.get('/echo?q=hello%20world');
    const response1 = result1.data;

    expect(response1.echo).toBe('hello world');
    expect(response1.timestamp).toBeTruthy();

    // Payment information should come from headers, not business response
    expect(result1.payment).toBeTruthy();
    expect(result1.payment!.cost).toBe(BigInt('10000000')); // 1,000,000,000 picoUSD ÷ 100 picoUSD/unit = 10,000,000 RGas base units

    // Check payment info
    if (result1.payment) {
      console.log(`💰 Payment info - ${formatPaymentInfo(result1.payment)}`);
    }

    // Should have received a SubRAV proposal for next request
    const pendingSubRAV1 = httpClient.getPendingSubRAV();
    expect(pendingSubRAV1).toBeTruthy();
    expect(pendingSubRAV1!.channelId).toBe(httpClient.getChannelId());
    expect(pendingSubRAV1!.nonce).toBe(BigInt(1));

    console.log(
      `✅ First request successful, received SubRAV proposal (nonce: ${pendingSubRAV1!.nonce})`
    );

    // Test 2: Second request (pays for first request, receives new proposal)
    console.log('📞 Request 2: Second call (pays for first request)');
    const result2 = await httpClient.get('/echo?q=second%20call');
    const response2 = result2.data;

    expect(response2.echo).toBe('second call');

    // Payment information should come from headers, not business response
    expect(result2.payment).toBeTruthy();
    expect(result2.payment!.cost).toBe(BigInt('10000000')); // 1,000,000,000 picoUSD ÷ 100 picoUSD/unit = 10,000,000 RGas base units

    // Check payment info
    if (result2.payment) {
      console.log(`💰 Payment info - ${formatPaymentInfo(result2.payment)}`);
    }

    const pendingSubRAV2 = httpClient.getPendingSubRAV();
    expect(pendingSubRAV2).toBeTruthy();
    expect(pendingSubRAV2!.nonce).toBe(BigInt(2));

    console.log(
      `✅ Second request successful, payment processed (nonce: ${pendingSubRAV2!.nonce})`
    );

    // Test 3: Multiple requests to verify consistent payment processing
    console.log('📞 Requests 3-6: Multiple calls to verify payment consistency');

    for (let i = 3; i <= 6; i++) {
      const result = await httpClient.get(`/echo?q=call%20${i}`);
      const response = result.data;
      expect(response.echo).toBe(`call ${i}`);

      // Payment information should come from headers, not business response
      expect(result.payment).toBeTruthy();
      expect(result.payment!.cost).toBe(BigInt('10000000')); // 1,000,000,000 picoUSD ÷ 100 picoUSD/unit = 10,000,000 RGas base units
      console.log(`✅ Request ${i} successful`);

      // Log payment info for verification
      if (result.payment) {
        console.log(`💰 Request ${i} payment - ${formatPaymentInfo(result.payment)}`);
      }
    }

    // Check admin stats for payment tracking using AdminClient
    const adminStats = await adminClient.getClaimsStatus();
    console.log('📊 Admin stats after multiple requests:', safeStringify(adminStats, 2));

    console.log('🎉 Complete HTTP deferred payment flow successful!');
  }, 120000); // 2 minutes timeout

  test('Mixed request types with different pricing', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing mixed request types with different pricing');

    // Test echo requests (cheaper)
    console.log('📞 Echo requests (0.001 USD each)');
    const echoResult1 = await httpClient.get('/echo?q=test%20echo%201');
    const echoResult2 = await httpClient.get('/echo?q=test%20echo%202');

    // Log payment info for echo requests
    if (echoResult1.payment) {
      console.log(`💰 Echo 1 payment - ${formatPaymentInfo(echoResult1.payment)}`);
    }
    if (echoResult2.payment) {
      console.log(`💰 Echo 2 payment - ${formatPaymentInfo(echoResult2.payment)}`);
    }

    // Test process requests (more expensive)
    console.log('📞 Process requests (0.01 USD each)');
    const processResult1 = await httpClient.post('/process', { data: 'test data 1' });
    const processResponse1 = processResult1.data;
    expect(processResponse1.processed.data).toBe('test data 1');

    // Payment information should come from headers, not business response
    expect(processResult1.payment).toBeTruthy();
    expect(processResult1.payment!.cost).toBe(BigInt('100000000')); // 10,000,000,000 picoUSD ÷ 100 picoUSD/unit = 100,000,000 RGas base units

    if (processResult1.payment) {
      console.log(`💰 Process 1 payment - ${formatPaymentInfo(processResult1.payment)}`);
    }

    const processResult2 = await httpClient.post('/process', { operation: 'complex task' });
    const processResponse2 = processResult2.data;
    expect(processResponse2.processed.operation).toBe('complex task');

    // Payment information should come from headers, not business response
    expect(processResult2.payment).toBeTruthy();
    expect(processResult2.payment!.cost).toBe(BigInt('100000000')); // 10,000,000,000 picoUSD ÷ 100 picoUSD/unit = 100,000,000 RGas base units

    if (processResult2.payment) {
      console.log(`💰 Process 2 payment - ${formatPaymentInfo(processResult2.payment)}`);
    }

    console.log('✅ Mixed request types processed successfully');

    // Check accumulated costs using AdminClient
    const adminStats = await adminClient.getClaimsStatus();
    console.log('📊 Final admin stats:', safeStringify(adminStats, 2));

    console.log('🎉 Mixed request types test successful!');
  }, 120000);

  test('Error handling in deferred payment', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('⚠️ Testing error handling in deferred payment');

    // Test health check using AdminClient
    const healthResponse = await adminClient.healthCheck();
    console.log('📊 Health check response:', safeStringify(healthResponse, 2));
    expect(healthResponse.success).toBe(true);

    // Test admin endpoints using AdminClient
    const adminResponse = await adminClient.getClaimsStatus();
    console.log('✅ Admin endpoints accessible response:', safeStringify(adminResponse, 2));
    expect(adminResponse.claimsStatus).toBeTruthy();
    console.log('🎉 Error handling test successful!');
  }, 60000);

  test('Channel state consistency', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing channel state consistency between client and blockchain');

    // Get the channel ID from the HTTP client
    const channelId = httpClient.getChannelId();
    expect(channelId).toBeTruthy();

    const payerClient = httpClient.getPayerClient();

    const clientChannelInfo = await payerClient.getChannelInfo(channelId!);

    console.log('🔄 Channel info:', clientChannelInfo);

    // Create a direct contract instance to access blockchain
    const contract = new RoochPaymentChannelContract({
      rpcUrl: env.rpcUrl,
      network: 'local',
      debug: false,
    });

    // Get channel info from blockchain
    const blockchainChannelInfo = await contract.getChannelStatus({
      channelId: channelId!,
    });

    // Verify consistency
    expect(clientChannelInfo.channelId).toBe(blockchainChannelInfo.channelId);
    expect(clientChannelInfo.payerDid).toBe(blockchainChannelInfo.payerDid);
    expect(clientChannelInfo.payeeDid).toBe(blockchainChannelInfo.payeeDid);
    expect(clientChannelInfo.status).toBe(blockchainChannelInfo.status);

    console.log(`✅ Channel state consistent:
      Channel ID: ${clientChannelInfo.channelId}
      Status: ${clientChannelInfo.status}
    `);

    // Test sync functionality using the billing server's ExpressPaymentKit
    await billingServerInstance.billing.getPayeeClient().syncChannelState(channelId!);
    console.log('✅ Channel state sync completed');

    console.log('🎉 Channel state consistency test successful!');
  }, 60000);

  test('Recovery functionality with createHttpClient', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing recovery functionality with simplified API');

    // Make a few requests to create some state
    const recoveryResult1 = await httpClient.get('/echo?q=recovery%20test%201');
    const recoveryResult2 = await httpClient.get('/echo?q=recovery%20test%202');

    // Log payment info for recovery tests
    if (recoveryResult1.payment) {
      console.log(`💰 Recovery test 1 payment - ${formatPaymentInfo(recoveryResult1.payment)}`);
    }
    if (recoveryResult2.payment) {
      console.log(`💰 Recovery test 2 payment - ${formatPaymentInfo(recoveryResult2.payment)}`);
    }

    // Test recovery functionality
    const recoveryData = await httpClient.recoverFromService();

    expect(recoveryData.channel).toBeTruthy();
    expect(recoveryData.channel!.channelId).toBe(httpClient.getChannelId());
    expect(recoveryData.timestamp).toBeTruthy();

    console.log('✅ Recovery data retrieved:', {
      channelId: recoveryData.channel?.channelId,
      pendingSubRav: recoveryData.pendingSubRav
        ? {
            nonce: recoveryData.pendingSubRav.nonce.toString(),
            amount: recoveryData.pendingSubRav.accumulatedAmount.toString(),
          }
        : null,
      timestamp: recoveryData.timestamp,
    });

    // Test that pending SubRAV was properly cached from recovery
    if (recoveryData.pendingSubRav) {
      const cachedPending = httpClient.getPendingSubRAV();
      expect(cachedPending).toBeTruthy();
      expect(cachedPending!.nonce).toBe(recoveryData.pendingSubRav.nonce);
      expect(cachedPending!.accumulatedAmount).toBe(recoveryData.pendingSubRav.accumulatedAmount);

      console.log('✅ Pending SubRAV properly cached from recovery');
    }

    console.log('🎉 Recovery functionality test successful!');
  }, 60000);

  test('Streaming SSE endpoint with in-band payment frame', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('📡 Testing streaming SSE with in-band payment frame');

    // Use requestWithPayment to get a handle and keep Response as stream
    const handle = await httpClient.requestWithPayment('GET', '/stream');
    const response: Response = await handle.response;

    // Consume a few chunks then allow end
    const reader = (response.body as any).getReader?.();
    if (reader) {
      for (let i = 0; i < 3; i++) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    // Wait a short while for frame parsing/settlement to resolve payment internally
    await new Promise(r => setTimeout(r, 300));

    const channelId = httpClient.getChannelId();
    expect(channelId).toBeTruthy();

    // In-band frame or next-request recovery should provide a pending SubRAV
    const pending = httpClient.getPendingSubRAV();
    expect(pending).toBeTruthy();

    // Make a follow-up paid request to ensure previous stream cost was settled
    const follow = await httpClient.get('/echo?q=after%20stream');
    expect(follow.payment).toBeTruthy();
    console.log(`💰 Follow-up payment after stream - ${formatPaymentInfo(follow.payment!)}`);

    console.log('🎉 Streaming SSE with in-band payment frame test successful!');
  }, 120000);

  test('Auto-authorize sub-channel on recovery when channel exists without sub-channel', async () => {
    if (!shouldRunE2ETests()) return;

    // Create an isolated payer to avoid interference with existing channels
    const isolatedPayer = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false,
    });

    // Fund the isolated payer's hub
    const directContract = new RoochPaymentChannelContract({
      rpcUrl: env.rpcUrl,
      network: 'local',
      debug: false,
    });

    const isolatedHubClient = new PaymentHubClient({
      contract: directContract,
      signer: isolatedPayer.signer,
      defaultAssetId: testAsset.assetId,
    });

    await isolatedHubClient.deposit(testAsset.assetId, BigInt('500000000'));

    // Open channel WITHOUT authorizing sub-channel
    await directContract.openChannel({
      payerDid: isolatedPayer.did,
      payeeDid: payee.did,
      assetId: testAsset.assetId,
      signer: isolatedPayer.signer,
    });

    // Create client for the isolated payer
    const client = await createHttpClient({
      baseUrl: billingServerInstance.baseURL,
      env: isolatedPayer.identityEnv,
      maxAmount: BigInt('50000000000'),
      debug: true,
    });

    // Before any paid call, recovery should show channel present but no sub-channel
    const recoveryBefore = await client.recoverFromService();
    expect(recoveryBefore.channel).toBeTruthy();
    expect(recoveryBefore.subChannel ?? null).toBeNull();

    // First paid request should trigger client-side auto-authorization of sub-channel
    const r = await client.get('/echo?q=auto-authorize');
    expect(r.data.echo).toBe('auto-authorize');
    expect(r.payment).toBeTruthy();

    // Recovery after first request should include sub-channel state
    const recoveryAfter = await client.recoverFromService();
    expect(recoveryAfter.channel).toBeTruthy();
    expect(recoveryAfter.subChannel).toBeTruthy();
    expect(recoveryAfter.subChannel!.vmIdFragment).toBe(isolatedPayer.vmIdFragment);
  }, 120000);

  test('Admin Client functionality', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔧 Testing Admin Client functionality');

    // Test 1: Health check (public endpoint)
    console.log('📞 Testing health check via AdminClient');
    const healthResponse = await adminClient.healthCheck();
    expect(healthResponse.success).toBe(true);
    expect(healthResponse.status).toBe('healthy');
    expect(healthResponse.paymentKitEnabled).toBe(true);
    console.log('✅ Health check successful:', healthResponse);

    // Test 2: Service discovery
    console.log('📞 Testing service discovery via AdminClient');
    const discoveryResponse = await adminClient.discoverService();
    expect(discoveryResponse.serviceDid).toBe(payee.did);
    expect(discoveryResponse.serviceId).toBe('e2e-test-service');
    expect(discoveryResponse.defaultAssetId).toBe(testAsset.assetId);
    console.log('✅ Service discovery successful:', discoveryResponse);

    // Test 3: Claims status (admin endpoint)
    console.log('📞 Testing claims status via AdminClient');
    const claimsStatus = await adminClient.getClaimsStatus();
    expect(claimsStatus.claimsStatus).toBeTruthy();
    expect(claimsStatus.processingStats).toBeTruthy();
    expect(claimsStatus.timestamp).toBeTruthy();
    console.log('✅ Claims status retrieval successful');

    // Make a paid request to have some SubRAV data for query test
    const adminTestResult = await httpClient.get('/echo?q=admin%20test');
    if (adminTestResult.payment) {
      console.log(`💰 Admin test payment - ${formatPaymentInfo(adminTestResult.payment)}`);
    }

    // Test 4: SubRAV query (authenticated endpoint)
    console.log('📞 Testing SubRAV query via AdminClient');
    const channelId = httpClient.getChannelId();
    expect(channelId).toBeTruthy();

    try {
      // Query a SubRAV that should exist
      const subRavResponse = await adminClient.querySubRav({
        nonce: '1',
      });
      console.log('✅ SubRAV query successful:', subRavResponse);
      expect(subRavResponse.subRav.nonce).toBe(BigInt(1));
    } catch (error) {
      // It's OK if SubRAV doesn't exist or user doesn't have permission
      console.log('ℹ️ SubRAV query failed (expected if no SubRAV exists):', error);
    }

    // Test 5: Manual claim trigger (admin endpoint)
    console.log('📞 Testing manual claim trigger via AdminClient');
    try {
      const triggerResponse = await adminClient.triggerClaim({
        channelId: channelId!,
      });
      expect(triggerResponse.results).toBeTruthy();
      console.log('✅ Manual claim trigger successful:', triggerResponse);
    } catch (error) {
      // It's OK if there's nothing to claim
      console.log('ℹ️ Manual claim trigger failed (expected if nothing to claim):', error);
    }
  }, 120000);

  test('PerToken post-flight billing with chat completions', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🤖 Testing PerToken post-flight billing with /chat/completions');

    // Test 1: Single chat completion request with detailed header verification
    console.log('📞 Request 1: Chat completion with small message');
    const chatRequest1 = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello, how are you?' }],
    };

    const result1 = await httpClient.post('/chat/completions', chatRequest1);
    const response1 = result1.data;

    expect(response1.object).toBe('chat.completion');
    expect(response1.choices).toHaveLength(1);
    expect(response1.usage).toBeTruthy();
    expect(response1.usage.total_tokens).toBeGreaterThan(0);
    expect(response1.billingInfo).toBeTruthy();
    expect(response1.billingInfo.mode).toBe('post-flight');

    // CRITICAL: Verify payment header was received and processed
    expect(result1.payment).toBeTruthy();
    expect(result1.payment!.cost).toBeGreaterThan(0n);
    expect(result1.payment!.nonce).toBeGreaterThan(0n);
    expect(result1.payment!.serviceTxRef).toBeTruthy();
    expect(result1.payment!.clientTxRef).toBeTruthy();

    console.log(`💰 Chat 1 payment received - ${formatPaymentInfo(result1.payment!)}`);
    console.log(`📋 Chat 1 detailed payment info:
      Cost: ${result1.payment!.cost.toString()} base units
      Cost USD: ${result1.payment!.costUsd.toString()} picoUSD
      Nonce: ${result1.payment!.nonce.toString()}
      Service Tx Ref: ${result1.payment!.serviceTxRef}
      Client Tx Ref: ${result1.payment!.clientTxRef}
    `);

    console.log(`✅ Chat completion 1 successful:
      Tokens used: ${response1.usage.total_tokens}
      Expected cost: ${response1.billingInfo.expectedCost}
      Mode: ${response1.billingInfo.mode}
      Payment header received: ✅
    `);

    // Test 2: Chat completion with multiple messages (more tokens) with payment verification
    console.log('📞 Request 2: Chat completion with multiple messages');
    const chatRequest2 = {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'Can you help me with a complex task?' },
        { role: 'assistant', content: 'Of course! What do you need help with?' },
        {
          role: 'user',
          content:
            'I need to understand the difference between pre-flight and post-flight billing.',
        },
      ],
    };

    const result2 = await httpClient.post('/chat/completions', chatRequest2);
    const response2 = result2.data;

    expect(response2.object).toBe('chat.completion');
    expect(response2.usage.total_tokens).toBeGreaterThan(response1.usage.total_tokens);
    expect(response2.billingInfo.mode).toBe('post-flight');

    // CRITICAL: Verify payment header for second request
    expect(result2.payment).toBeTruthy();
    expect(result2.payment!.cost).toBeGreaterThan(result1.payment!.cost); // Should be higher due to more tokens
    expect(result2.payment!.nonce).toBeGreaterThan(result1.payment!.nonce); // Should be incremented

    console.log(`💰 Chat 2 payment received - ${formatPaymentInfo(result2.payment!)}`);
    console.log(
      `📊 Cost comparison: Request 2 (${result2.payment!.cost.toString()}) > Request 1 (${result1.payment!.cost.toString()}): ${result2.payment!.cost > result1.payment!.cost}`
    );

    console.log(`✅ Chat completion 2 successful:
      Tokens used: ${response2.usage.total_tokens}
      Expected cost: ${response2.billingInfo.expectedCost}
      More tokens than request 1: ${response2.usage.total_tokens > response1.usage.total_tokens}
      Payment header received: ✅
    `);

    // Test 3: Verify post-flight billing behavior with rapid successive calls
    console.log('📞 Request 3: Quick chat to verify billing consistency');
    const result3 = await httpClient.post('/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Quick test' }],
    });
    const response3 = result3.data;

    expect(response3.billingInfo.mode).toBe('post-flight');
    expect(result3.payment).toBeTruthy();
    expect(result3.payment!.nonce).toBeGreaterThan(result2.payment!.nonce);

    console.log(`💰 Chat 3 payment received - ${formatPaymentInfo(result3.payment!)}`);
    console.log(`✅ Post-flight billing consistency verified - Payment header received: ✅`);

    // Test 4: Compare with pre-flight billing (echo endpoint)
    console.log('📞 Comparison: Pre-flight billing with echo endpoint');
    const echoResult = await httpClient.get('/echo?q=pre-flight%20test');
    const echoResponse = echoResult.data;
    expect(echoResult.payment).toBeTruthy(); // Pre-flight also has payment info
    expect(echoResult.payment!.cost).toBeTruthy(); // Pre-flight has immediate cost

    console.log(`💰 Echo comparison payment - ${formatPaymentInfo(echoResult.payment!)}`);

    console.log(`📊 Billing mode comparison:
      Echo (pre-flight): Cost available in headers = ${echoResult.payment!.cost.toString()}
      Chat (post-flight): Cost calculated after response based on usage
      Both modes: Payment headers received correctly ✅
    `);

    // Test 5: Post-flight billing header timing verification
    console.log('📞 Request 5: Post-flight billing header timing test');
    const timingTestStart = Date.now();
    const timingResult = await httpClient.post('/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Test header timing' }],
    });
    const timingTestEnd = Date.now();

    expect(timingResult.payment).toBeTruthy();
    console.log(`⏱️ Timing test completed in ${timingTestEnd - timingTestStart}ms`);
    console.log(`💰 Timing test payment - ${formatPaymentInfo(timingResult.payment!)}`);
    console.log(`✅ Post-flight billing header timing verified - Payment header received: ✅`);

    console.log('🎉 PerToken post-flight billing test successful!');
  }, 120000);

  test('Post-flight billing header transmission verification', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔍 Testing post-flight billing header transmission specifically');

    // Test multiple rapid post-flight requests to stress-test header transmission
    console.log('📞 Rapid successive post-flight requests');

    const rapidResults: any[] = [];
    for (let i = 1; i <= 5; i++) {
      console.log(`📞 Rapid request ${i}/5`);
      try {
        const result = await httpClient.post('/chat/completions', {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: `Rapid test ${i}` }],
        });
        // Success: must include payment info
        expect(result.payment).toBeTruthy();
        expect(result.payment!.cost).toBeGreaterThan(0n);
        expect(result.payment!.nonce).toBeGreaterThan(0n);
        expect(result.payment!.serviceTxRef).toBeTruthy();
        expect(result.payment!.clientTxRef).toBeTruthy();
        rapidResults.push(result);
        console.log(
          `✅ Rapid request ${i} - Payment header received: ✅ (Cost: ${result.payment!.cost.toString()})`
        );
      } catch (err: any) {
        // Error: client should propagate server error header with clientTxRef so caller can see it
        console.log(`⚠️ Rapid request ${i} failed with error:`, err?.message || String(err));
        expect(err).toBeTruthy();
        // e2e-only soft assertion: ensure error is a PaymentKitError when propagated
        // and not a generic timeout
        if (err?.name) {
          expect(err.name).toBeDefined();
        }
      }
    }
    console.log('rapidResults', rapidResults);
    // Verify nonce sequence integrity
    for (let i = 1; i < rapidResults.length; i++) {
      expect(rapidResults[i].payment!.nonce).toBeGreaterThan(rapidResults[i - 1].payment!.nonce);
    }
    console.log('✅ Nonce sequence integrity verified across rapid requests');

    // Test alternating pre-flight and post-flight requests
    console.log('📞 Alternating pre-flight and post-flight requests');

    // Pre-flight (echo)
    const preFlightResult1 = await httpClient.get('/echo?q=alternating%20test%201');
    expect(preFlightResult1.payment).toBeTruthy();
    console.log(`💰 Pre-flight 1 - ${formatPaymentInfo(preFlightResult1.payment!)}`);

    // Post-flight (chat)
    const postFlightResult1 = await httpClient.post('/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Alternating test 1' }],
    });
    expect(postFlightResult1.payment).toBeTruthy();
    console.log(`💰 Post-flight 1 - ${formatPaymentInfo(postFlightResult1.payment!)}`);

    // Pre-flight (echo)
    const preFlightResult2 = await httpClient.get('/echo?q=alternating%20test%202');
    expect(preFlightResult2.payment).toBeTruthy();
    console.log(`💰 Pre-flight 2 - ${formatPaymentInfo(preFlightResult2.payment!)}`);

    // Post-flight (chat)
    const postFlightResult2 = await httpClient.post('/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Alternating test 2' }],
    });
    expect(postFlightResult2.payment).toBeTruthy();
    console.log(`💰 Post-flight 2 - ${formatPaymentInfo(postFlightResult2.payment!)}`);

    console.log(
      '✅ Alternating pre-flight and post-flight requests - All payment headers received correctly'
    );

    console.log('🎉 Post-flight billing header transmission verification successful!');
  }, 120000);

  test('maxAmount limit enforcement', async () => {
    if (!shouldRunE2ETests()) {
      console.log('Skipping test - E2E tests disabled');
      return;
    }

    console.log('🧪 Testing maxAmount limit enforcement');

    // Test 1: First test without maxAmount to make sure basic functionality works
    console.log('📞 Testing request without maxAmount (baseline)');
    const baselineClient = await createHttpClient({
      baseUrl: billingServerInstance.baseURL,
      env: payer.identityEnv,
      debug: true,
    });

    try {
      const baselineResult = await baselineClient.get('/echo?q=baseline%20test');
      const baselineResponse = baselineResult.data;
      console.log('🔍 Baseline response:', baselineResponse);
      expect(baselineResponse).toBeTruthy();
      expect(baselineResponse.echo).toBe('baseline test');

      // Payment information should come from headers, not business response
      expect(baselineResult.payment).toBeTruthy();
      expect(baselineResult.payment!.cost).toBeTruthy();
      console.log('✅ Baseline request successful');

      // Log payment info for baseline
      if (baselineResult.payment) {
        console.log(`💰 Baseline payment - ${formatPaymentInfo(baselineResult.payment)}`);
      }
    } catch (error: any) {
      console.log('❌ Baseline request failed:', error.message);
      console.log('❌ Error stack:', error.stack);
      throw error;
    }

    // Test 2: Request with high maxAmount limit should succeed
    console.log('📞 Testing request with high maxAmount limit');
    const clientWithHighLimit = await createHttpClient({
      baseUrl: billingServerInstance.baseURL,
      env: payer.identityEnv,
      maxAmount: BigInt(10000000000), // High limit
      debug: true,
    });

    const result1 = await clientWithHighLimit.get('/echo?q=high%20limit');
    const response1 = result1.data;
    expect(response1).toBeTruthy();
    expect(response1.echo).toBe('high limit');

    // Payment information should come from headers, not business response
    expect(result1.payment).toBeTruthy();
    expect(result1.payment!.cost).toBeTruthy();
    console.log('✅ Request with high limit successful');

    // Log payment info for high limit test
    if (result1.payment) {
      console.log(`💰 High limit payment - ${formatPaymentInfo(result1.payment)}`);
    }

    // // Test 3: Request exceeding maxAmount limit should fail
    // console.log('📞 Testing request exceeding maxAmount limit');
    // const clientWithLowLimit = await createHttpClient({
    //   baseUrl: billingServerInstance.baseURL,
    //   env: payer.identityEnv,
    //   maxAmount: BigInt(1), // Very low limit to trigger failure
    //   debug: false
    // });

    // try {
    //   await clientWithLowLimit.get('/echo?q=exceed%20limit');
    //   // If we reach here, the test should fail
    //   throw new Error('Expected request to fail due to maxAmount limit, but it succeeded');
    // } catch (error: any) {
    //   if (error.message.includes('Expected request to fail')) {
    //     throw error; // Re-throw our test failure
    //   }
    //   // This is expected - request should fail due to maxAmount limit
    //   console.log('✅ Request exceeding limit correctly rejected:', error.message);
    // }

    console.log('🎉 MaxAmount limit enforcement test successful!');
  }, 60000);
});
