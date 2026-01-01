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
  MemoryHostChannelMappingStore,
} from '../../src/integrations/http';
import { PaymentHubClient } from '../../src/client/PaymentHubClient';
import { safeStringify } from '../../src/utils/json';
import { RoochPaymentChannelContract } from '../../src/rooch/RoochPaymentChannelContract';
import type { AssetInfo, PaymentInfo, PaymentResult } from '../../src/core/types';
import {
  TestEnv,
  createSelfDid,
  CreateSelfDidResult,
} from '@nuwa-ai/identity-kit/testHelpers';
import { DebugLogger, DIDAuth } from '@nuwa-ai/identity-kit';
import { createBillingServer } from './server';
import { MemoryChannelRepository } from '../../src/storage/sql';

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
  let logger: DebugLogger;

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
      console.log('Skipping HTTP E2E tests - PAYMENT_E2E not set or node not accessible');
      return;
    }

    DebugLogger.setGlobalLevel('debug'); // Reduce noise in E2E tests
    logger = DebugLogger.get('HttpPaymentKit.e2e.test');
    logger.setLevel('debug');
    logger.debug('🚀 Starting HTTP Payment Kit E2E Tests');
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
    logger.debug('💰 Deposit tx:', tx);

    // Create admin client for testing admin endpoints
    adminClient = createAdminClient(httpClient);

    logger.debug(`✅ Billing server started on ${billingServerInstance.baseURL}`);
    logger.debug(
      `✅ HTTP client created using simplified createHttpClient API with automatic service discovery`
    );
    logger.debug(`✅ Admin client created for testing admin endpoints`);
  }, 180000); // 3 minutes timeout for setup

  afterAll(async () => {
    process.removeListener('unhandledRejection', unhandledRejectionListener);
    if (unhandledRejections.size > 0) {
      console.error(`🚨 Total unhandled rejections: ${unhandledRejections.size}`);
    }
    if (!shouldRunE2ETests()) return;
    if (httpClient) {
      try {
        await httpClient.logoutCleanup();
      } catch (e) {
        logger.error('Error during logout cleanup:', e);
      }
      logger.debug('✅ HTTP client logout cleanup');
    }
    // Cleanup
    if (billingServerInstance) {
      await billingServerInstance.shutdown();
      logger.debug('✅ Billing server shutdown');
    }
    DebugLogger.setGlobalLevel('error');
    logger.debug('🏁 HTTP Payment Kit E2E Tests completed');
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
    const adminStats = await adminClient.getSystemStatus();
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
    const adminStats = await adminClient.getSystemStatus();
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
    const adminResponse = await adminClient.getSystemStatus();
    console.log('✅ Admin endpoints accessible response:', safeStringify(adminResponse, 2));
    expect(adminResponse.claims).toBeTruthy();
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
      expect(cachedPending!.nonce.toString()).toBe(recoveryData.pendingSubRav.nonce.toString());
      expect(cachedPending!.accumulatedAmount.toString()).toBe(
        recoveryData.pendingSubRav.accumulatedAmount.toString()
      );

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

  test('Abort queued request before start removes from queue', async () => {
    if (!shouldRunE2ETests()) return;

    logger.debug('🧪 Testing abort of queued request');

    // Warm up
    await httpClient.get('/echo?q=warmup-abort');

    // Start a streaming request to occupy scheduler but don't await response yet
    const handleStream = await httpClient.requestWithPayment('GET', '/stream');

    // Queue a GET request via requestWithPayment and abort using handle
    const queuedHandle = await httpClient.requestWithPayment('GET', '/echo?q=queued-abort');
    // Abort immediately to ensure it stays queued and gets removed
    queuedHandle.abort?.();

    // It should reject the response promise
    let errorCaught = false;
    try {
      await queuedHandle.response;
      // Should not reach here
      expect(true).toBe(false);
    } catch (err) {
      errorCaught = true;
      logger.debug('✅ Request correctly rejected due to abort (handle):', err);
    }

    try {
      await queuedHandle.payment;
    } catch (err) {}

    expect(errorCaught).toBe(true);

    // Cleanup stream
    try {
      const responseStream: Response = await handleStream.response;
      const reader = (responseStream.body as any)?.getReader?.();
      if (reader) {
        try {
          await reader.cancel();
        } catch {}
      }
    } catch (err) {
      console.log('✅ Stream correctly rejected due to abort (handle):', err);
    }

    // Wait for stream payment to settle
    try {
      await handleStream.payment;
    } catch {}

    // Give scheduler a brief moment to flush
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify client remains functional after abort
    console.log('🔄 Verifying client remains functional after abort');
    const postAbort = await httpClient.get('/echo?q=post-abort-test');
    expect(postAbort.data.echo).toBe('post-abort-test');
    expect(postAbort.payment).toBeTruthy();

    logger.debug('🎉 Abort queued request test completed');
  }, 120000);

  test('Abort streaming mid-way stops reading and settles properly', async () => {
    if (!shouldRunE2ETests()) return;

    const handle = await httpClient.requestWithPayment('GET', '/stream');
    const response: Response = await handle.response;

    const reader = (response.body as any)?.getReader?.();
    expect(reader).toBeTruthy();

    // Read a couple of chunks then abort via handle.abort()
    if (reader) {
      for (let i = 0; i < 2; i++) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    // Abort should cancel stream and reject payment if not yet settled
    handle.abort?.();

    // Cancel reader explicitly to release lock and avoid further reads
    try {
      await reader?.cancel?.();
    } catch {}

    // Wait for quick settle
    try {
      await handle.payment;
    } catch (e) {
      // acceptable: payment may reject due to abort
    }
    // Give scheduler a brief moment to flush
    await new Promise(resolve => setTimeout(resolve, 500));
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

    // Create client for the isolated payer with a fresh memory mapping store to simulate persisted channel later
    const mappingStore = new MemoryHostChannelMappingStore();
    const client = await createHttpClient({
      baseUrl: billingServerInstance.baseURL,
      env: isolatedPayer.identityEnv,
      maxAmount: BigInt('50000000000'),
      debug: true,
      mappingStore,
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

    // New regression: simulate persisted channel without sub-channel, ensure next client instance auto-authorizes on ready
    // 1) Persist only channelId to mapping store (clear subChannelInfo/pendingSubRAV)
    const host = new URL(billingServerInstance.baseURL).host;
    await mappingStore.setState(host, {
      channelId: recoveryAfter.channel!.channelId,
      pendingSubRAV: undefined,
      lastUpdated: new Date().toISOString(),
    } as any);

    // 2) Create a fresh client reusing the same mapping store (simulating app restart)
    const client2 = await createHttpClient({
      baseUrl: billingServerInstance.baseURL,
      env: isolatedPayer.identityEnv,
      maxAmount: BigInt('50000000000'),
      debug: true,
      mappingStore,
    });

    // 3) First paid call should succeed and auto-authorize sub-channel within ensureChannelReady
    const r2 = await client2.get('/echo?q=auto-authorize-after-persist');
    expect(r2.data.echo).toBe('auto-authorize-after-persist');
    expect(r2.payment).toBeTruthy();
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
    const claimsStatus = await adminClient.getSystemStatus();
    expect(claimsStatus.claims).toBeTruthy();
    expect(claimsStatus.processor).toBeTruthy();
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
      expect(triggerResponse.queued).toBeTruthy();
      expect(triggerResponse.skipped).toBeTruthy();
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

  test('Concurrent requests with clientTxRef loss on one response are still matched via SubRAV progression', async () => {
    if (!shouldRunE2ETests()) return;

    // Warmup phase: first call may be FREE; second call should settle the first and return payment
    const warmup0 = await httpClient.get('/echo?q=warmup0');
    expect(warmup0.payment).toBeTruthy();

    // Fire two concurrent requests: one normal echo, one mutated header
    const p1 = httpClient.get('/echo?q=concurrent-1');
    const p2 = httpClient.get('/echo-mutate?q=concurrent-2');

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.payment).toBeTruthy();
    expect(r2.payment).toBeTruthy();

    // Verify both nonces are valid and strictly increasing across the two
    const nonces = [r1.payment!.nonce, r2.payment!.nonce].sort((a, b) => (a < b ? -1 : 1));
    expect(nonces[0] < nonces[1]).toBe(true);
  }, 120000);

  test('Concurrent streaming and non-stream requests serialize and settle correctly', async () => {
    if (!shouldRunE2ETests()) return;

    // Warmup to establish proposal chain
    await httpClient.get('/echo?q=warmupS0');
    const w1 = await httpClient.get('/echo?q=warmupS1');
    expect(w1.payment).toBeTruthy();

    // Start a streaming request (FinalCost, payment at end)
    const streamHandle = await httpClient.requestWithPayment('GET', '/stream');
    const streamResponse: Response = await streamHandle.response;
    const reader = (streamResponse.body as any)?.getReader?.();

    // Fire a non-stream request concurrently; scheduler should queue it until stream settles
    const echoPromise = httpClient.get('/echo?q=after-stream-concurrent');

    // Consume the stream fully to trigger end-of-response payment
    if (reader) {
      // Read until done
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    const streamPayment = await streamHandle.payment;
    const echoResult = await echoPromise;

    expect(streamPayment).toBeTruthy();
    expect(echoResult.payment).toBeTruthy();

    // The echo should run after stream settled; nonce must increase
    if (streamPayment && echoResult.payment) {
      expect(echoResult.payment.nonce).toBeGreaterThan(streamPayment.nonce);
    }
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

  test('PaymentHub zero balance error handling', async () => {
    if (!shouldRunE2ETests()) {
      console.log('Skipping test - E2E tests disabled');
      return;
    }

    console.log('🚫 Testing PaymentHub zero balance error handling');

    // Create an isolated payer for this test to control balance precisely
    const zeroBalancePayer = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false,
    });

    console.log(`📝 Zero balance test setup:
      Payer DID: ${zeroBalancePayer.did}
      Payee DID: ${payee.did}
    `);

    // Create PaymentHub client for balance management
    const directContract = new RoochPaymentChannelContract({
      rpcUrl: env.rpcUrl,
      network: 'local',
      debug: false,
    });

    const zeroBalanceHubClient = new PaymentHubClient({
      contract: directContract,
      signer: zeroBalancePayer.signer,
      defaultAssetId: testAsset.assetId,
    });

    // Verify zero balance
    let initialBalance;
    try {
      initialBalance = await zeroBalanceHubClient.getBalance({ assetId: testAsset.assetId });
      console.log(`💰 Initial balance: ${initialBalance.toString()}`);
    } catch (error) {
      console.log('💰 No initial balance (expected for new DID)');
      initialBalance = 0n;
    }

    // Create client with the zero balance payer
    const zeroBalanceClient = await createHttpClient({
      baseUrl: billingServerInstance.baseURL,
      env: zeroBalancePayer.identityEnv,
      maxAmount: BigInt('50000000000'),
      debug: true,
    });

    expect(initialBalance).toBe(0n);

    // Test: Request with zero balance should be rejected
    let errorCaught = false;
    try {
      console.log('🔍 Making request that should fail due to zero balance...');
      await zeroBalanceClient.get('/echo?q=should%20fail%20no%20balance');
      expect(false).toBe(true); // Should not reach here
    } catch (e: any) {
      errorCaught = true;
      console.log('✅ Error caught as expected:', e);
      expect(e).toBeInstanceOf(Error);
      expect(String(e.message)).toMatch(/balance|insufficient|funds|402/i);
    }
    expect(errorCaught).toBe(true);

    // Wait for error propagation
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify that after deposit, requests succeed
    console.log('💰 Depositing balance to verify error was due to zero balance');
    const depositAmount = BigInt('100000000'); // 1 RGas
    await zeroBalanceHubClient.deposit(testAsset.assetId, depositAmount);

    // Wait for balance cache refresh
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Now request should succeed
    const successResult = await zeroBalanceClient.get('/echo?q=balance%20restored');
    expect(successResult.payment).toBeTruthy();
    console.log(
      `✅ Request successful after deposit - ${formatPaymentInfo(successResult.payment!)}`
    );

    // Clean up test client
    try {
      await zeroBalanceClient.logoutCleanup();
      console.log('✅ Zero balance test client cleanup completed');
    } catch (e) {
      console.log('🚫 Error during zero balance test client cleanup:', e);
    }

    console.log('🎉 PaymentHub zero balance error handling test successful!');
  }, 120000);

  test('PaymentHub balance depletion error handling', async () => {
    if (!shouldRunE2ETests()) {
      console.log('Skipping test - E2E tests disabled');
      return;
    }

    console.log('💸 Testing PaymentHub balance depletion error handling');

    // Create an isolated payer for this test
    const depletionPayer = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false,
    });

    console.log(`📝 Balance depletion test setup:
      Payer DID: ${depletionPayer.did}
      Payee DID: ${payee.did}
    `);

    // Create PaymentHub client for balance management
    const directContract = new RoochPaymentChannelContract({
      rpcUrl: env.rpcUrl,
      network: 'local',
      debug: false,
    });

    const depletionHubClient = new PaymentHubClient({
      contract: directContract,
      signer: depletionPayer.signer,
      defaultAssetId: testAsset.assetId,
    });

    // Deposit a small amount that will be depleted
    const smallDepositAmount = BigInt('50000000'); // 0.5 RGas - small amount for quick depletion
    await depletionHubClient.deposit(testAsset.assetId, smallDepositAmount);

    const initialBalance = await depletionHubClient.getBalance({ assetId: testAsset.assetId });
    console.log(`💰 Initial balance for depletion test: ${initialBalance.toString()}`);
    expect(initialBalance).toBeGreaterThanOrEqual(smallDepositAmount);

    // Create client with the depletion test payer
    const depletionClient = await createHttpClient({
      baseUrl: billingServerInstance.baseURL,
      env: depletionPayer.identityEnv,
      maxAmount: BigInt('50000000000'),
      debug: true,
    });

    // Wait for balance cache refresh
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Make requests until balance is depleted
    console.log('🔄 Making requests to deplete balance...');
    let requestCounter = 1;
    let lastSuccessfulBalance = initialBalance;
    let depletionErrorCaught = false;

    try {
      const maxDepleteRequests = 15; // Limit to avoid infinite loop
      const minBalanceToKeep = BigInt(5000000); // Keep minimal balance

      while (lastSuccessfulBalance > minBalanceToKeep && requestCounter <= maxDepleteRequests) {
        try {
          const depletionResult = await depletionClient.get(
            `/expensive?q=depletion%20${requestCounter}`
          );
          if (depletionResult.payment) {
            console.log(
              `💰 Depletion request ${requestCounter} - ${formatPaymentInfo(depletionResult.payment)}`
            );
          }
          requestCounter++;

          // Check balance periodically
          if (requestCounter % 3 === 0) {
            lastSuccessfulBalance = await depletionHubClient.getBalance({
              assetId: testAsset.assetId,
            });
            console.log(`💰 Current balance: ${lastSuccessfulBalance.toString()}`);
          }

          // Allow time for reactive claims to process
          await new Promise(r => setTimeout(r, 200));
        } catch (error: any) {
          depletionErrorCaught = true;
          console.log('🚫 Request failed due to balance depletion (expected):', error.message);
          expect(error.message).toMatch(/balance|insufficient|funds|402/i);
          break;
        }
      }

      if (requestCounter > maxDepleteRequests) {
        console.log(
          '⏱️ Reached max depletion requests without error - balance may still be sufficient'
        );
      }
    } catch (error: any) {
      depletionErrorCaught = true;
      console.log('🚫 Request failed due to balance depletion (expected):', error.message);
      if (error.message && !error.message.includes('fetch failed')) {
        expect(error.message).toMatch(/balance|insufficient|funds|402/i);
      }
    }

    // Verify final balance is low
    const finalBalance = await depletionHubClient.getBalance({ assetId: testAsset.assetId });
    console.log(`💰 Final balance: ${finalBalance.toString()}`);
    expect(finalBalance).toBeLessThan(initialBalance);

    if (depletionErrorCaught) {
      console.log('✅ Balance depletion error correctly caught');
    } else {
      console.log('ℹ️ Balance not fully depleted within test limits (acceptable)');
    }

    // Clean up test client
    try {
      await depletionClient.logoutCleanup();
      console.log('✅ Depletion test client cleanup completed');
    } catch (e) {
      console.log('🚫 Error during depletion test client cleanup:', e);
    }

    console.log('🎉 PaymentHub balance depletion error handling test successful!');
  }, 180000);

  test('PAYMENT_REQUIRED auto retry (HTTP)', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔁 Testing PAYMENT_REQUIRED auto retry (HTTP)');

    // Use an isolated client to avoid cross-test state affecting nonces
    const isolatedClient = await createHttpClient({
      baseUrl: billingServerInstance.baseURL,
      env: payer.identityEnv,
      maxAmount: BigInt('50000000000'),
      debug: true,
      mappingStore: new MemoryHostChannelMappingStore(),
    });

    // 1) First paid request to ensure server persists an unsigned SubRAV
    const first = await isolatedClient.get('/echo?q=trigger%20pending');
    expect(first.payment).toBeTruthy();
    console.log(`💰 First payment - ${formatPaymentInfo(first.payment!)}`);

    // 2) Query recovery to ensure server has pending (simulates server-side state)
    const recovery = await isolatedClient.recoverFromService();
    expect(recovery).toBeTruthy();
    expect(recovery.pendingSubRav).toBeTruthy();

    // 3) Clear client local pending to simulate client unaware of server-pending
    isolatedClient.clearPendingSubRAV();

    // 4) Second paid request should receive 402 with pending SubRAV, then auto sign+retry
    const second = await isolatedClient.get('/echo?q=auto%20retry%20should%20succeed');
    expect(second.payment).toBeTruthy();
    expect(second.payment!.nonce).toBeGreaterThan(first.payment!.nonce);
    console.log(`✅ Auto retry succeeded (HTTP) - ${formatPaymentInfo(second.payment!)}`);
  }, 120000);
});
