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
import { PaymentChannelHttpClient, createHttpClient } from '../../src/integrations/http';
import { PaymentChannelFactory } from '../../src/factory/chainFactory';
import { RoochPaymentChannelContract } from '../../src/rooch/RoochPaymentChannelContract';
import type { AssetInfo } from '../../src/core/types';
import { TestEnv, createSelfDid, CreateSelfDidResult, DebugLogger, DIDAuth } from '@nuwa-ai/identity-kit';
import { createBillingServer } from './server';

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
      skipFunding: false
    });

    payee = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false
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
      debug: false
    });

    // Create HTTP client using the new simplified API with automatic service discovery
    httpClient = await createHttpClient({
      baseUrl: billingServerInstance.baseURL,
      env: payer.identityEnv, // Use the payer's dedicated IdentityEnv
      maxAmount: BigInt('500000000'), // 5 RGas
      debug: true
    });

    console.log(`✅ Billing server started on ${billingServerInstance.baseURL}`);
    console.log(`✅ HTTP client created using simplified createHttpClient API with automatic service discovery`);
  }, 180000); // 3 minutes timeout for setup

  afterAll(async () => {
    if (!shouldRunE2ETests()) return;

    // Cleanup
    if (billingServerInstance) {
      await billingServerInstance.shutdown();
      console.log('✅ Billing server shutdown');
    }

    // Note: PaymentChannelHttpClient should handle channel cleanup automatically
    // or provide explicit cleanup methods in the future
    console.log('🏁 HTTP Payment Kit E2E Tests completed');
  }, 60000); // 1 minute timeout for cleanup

  // Helper function to generate admin authentication header
  async function generateAdminAuthHeader(): Promise<string> {
    const keyIds = await payer.keyManager.listKeyIds();
    const keyId = keyIds[0];

    const signedObject = await DIDAuth.v1.createSignature(
      { 
        operation: 'admin_request',
        params: { uri: billingServerInstance.baseURL }
      },
      payer.keyManager,
      keyId
    );

    return DIDAuth.v1.toAuthorizationHeader(signedObject);
  }

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
      network: serviceInfo.network
    });

    // Test asset price discovery
    const priceInfo = await httpClient.getAssetPrice(testAsset.assetId);
    expect(priceInfo.assetId).toBe(testAsset.assetId);
    expect(priceInfo.pricePicoUSD).toBeTruthy();
    expect(priceInfo.priceUSD).toBeTruthy();

    console.log('✅ Asset price discovery successful:', {
      asset: priceInfo.assetId,
      priceUSD: priceInfo.priceUSD,
      source: priceInfo.source
    });

    console.log('🎉 Service discovery test successful!');
  }, 60000);

  test('Complete HTTP deferred payment flow', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing complete HTTP deferred payment flow');

    // Test 1: First request (handshake)
    console.log('📞 Request 1: First call (handshake)');
    const response1 = await httpClient.get('/v1/echo?q=hello%20world');
    
    expect(response1.echo).toBe('hello world');
    expect(response1.cost).toBe('10000000'); // 0.001 USD = 10,000,000 RGAS units (0.1 RGAS)
    expect(response1.timestamp).toBeTruthy();
    
    // Should have received a SubRAV proposal for next request
    const pendingSubRAV1 = httpClient.getPendingSubRAV();
    expect(pendingSubRAV1).toBeTruthy();
    expect(pendingSubRAV1!.channelId).toBe(httpClient.getChannelId());
    expect(pendingSubRAV1!.nonce).toBe(BigInt(1));
    
    console.log(`✅ First request successful, received SubRAV proposal (nonce: ${pendingSubRAV1!.nonce})`);

    // Test 2: Second request (pays for first request, receives new proposal)
    console.log('📞 Request 2: Second call (pays for first request)');
    const response2 = await httpClient.get('/v1/echo?q=second%20call');
    
    expect(response2.echo).toBe('second call');
    expect(response2.cost).toBe('10000000');
    
    const pendingSubRAV2 = httpClient.getPendingSubRAV();
    expect(pendingSubRAV2).toBeTruthy();
    expect(pendingSubRAV2!.nonce).toBe(BigInt(2));
    
    console.log(`✅ Second request successful, payment processed (nonce: ${pendingSubRAV2!.nonce})`);

    // Test 3: Multiple requests to verify consistent payment processing
    console.log('📞 Requests 3-6: Multiple calls to verify payment consistency');
    
    for (let i = 3; i <= 6; i++) {
      const response = await httpClient.get(`/v1/echo?q=call%20${i}`);
      expect(response.echo).toBe(`call ${i}`);
      expect(response.cost).toBe('10000000');
      console.log(`✅ Request ${i} successful`);
    }

    // Check admin stats for payment tracking
    // Create a basic HTTP client for admin endpoints (no payment required)
    const adminResponse = await fetch(`${billingServerInstance.baseURL}/admin/claims`, {
      headers: {
        'Authorization': await generateAdminAuthHeader()
      }
    });
    const adminStats = await adminResponse.json();
    console.log('📊 Admin stats after multiple requests:', JSON.stringify(adminStats, null, 2));

    console.log('🎉 Complete HTTP deferred payment flow successful!');
  }, 120000); // 2 minutes timeout

  test('Mixed request types with different pricing', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing mixed request types with different pricing');

    // Reset client state
    httpClient.clearPendingSubRAV();

    // Test echo requests (cheaper)
    console.log('📞 Echo requests (0.001 USD each)');
    await httpClient.get('/v1/echo?q=test%20echo%201');
    await httpClient.get('/v1/echo?q=test%20echo%202');

    // Test process requests (more expensive)
    console.log('📞 Process requests (0.01 USD each)');
    const processResponse1 = await httpClient.post('/v1/process', { data: 'test data 1' });
    expect(processResponse1.processed.data).toBe('test data 1');
    expect(processResponse1.cost).toBe('100000000'); // 0.01 USD = 100,000,000 RGAS units (1.0 RGAS)

    const processResponse2 = await httpClient.post('/v1/process', { operation: 'complex task' });
    expect(processResponse2.processed.operation).toBe('complex task');
    expect(processResponse2.cost).toBe('100000000');

    console.log('✅ Mixed request types processed successfully');

    // Check accumulated costs
    const adminResponse = await fetch(`${billingServerInstance.baseURL}/admin/claims`, {
      headers: {
        'Authorization': await generateAdminAuthHeader()
      }
    });
    const adminStats = await adminResponse.json();
    console.log('📊 Final admin stats:', JSON.stringify(adminStats, null, 2));

    console.log('🎉 Mixed request types test successful!');
  }, 120000);



  test('Error handling in deferred payment', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('⚠️ Testing error handling in deferred payment');

    // Test health check (should work without payment)
    const healthResponse = await fetch(`${billingServerInstance.baseURL}/health`);
    expect(healthResponse.ok).toBe(true);
    const healthData = await healthResponse.json();
    expect(healthData.status).toBe('ok');

    console.log('✅ Health check works without payment');

    // Test admin endpoints
    const adminResponse = await fetch(`${billingServerInstance.baseURL}/admin/claims`, {
      headers: {
        'Authorization': await generateAdminAuthHeader()
      }
    });
    expect(adminResponse.ok).toBe(true);
    const adminStats = await adminResponse.json();
    expect(adminStats).toBeTruthy();

    console.log('✅ Admin endpoints accessible');

    console.log('🎉 Error handling test successful!');
  }, 60000);

  test('Channel state consistency', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing channel state consistency between client and blockchain');

    // Get the channel ID from the HTTP client
    const channelId = httpClient.getChannelId();
    expect(channelId).toBeTruthy();

    // Create a direct contract instance to access blockchain
    const contract = new RoochPaymentChannelContract({
      rpcUrl: env.rpcUrl,
      network: 'local',
      debug: false,
    });

    // Create a temporary client for channel info
    const tempPayerClient = PaymentChannelFactory.createClient({
      chainConfig: {
        chain: 'rooch',
        rpcUrl: env.rpcUrl,
        network: 'local'
      },
      signer: payer.keyManager,
      keyId: `${payer.did}#${payer.vmIdFragment}`
    });

    // Get channel info from blockchain
    const blockchainChannelInfo = await contract.getChannelStatus({
      channelId: channelId!,
    });

    // Get channel info from client
    const clientChannelInfo = await tempPayerClient.getChannelInfo(channelId!);

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
    await httpClient.get('/v1/echo?q=recovery%20test%201');
    await httpClient.get('/v1/echo?q=recovery%20test%202');

    // Test recovery functionality
    const recoveryData = await httpClient.recoverFromService();
    
    expect(recoveryData.channel).toBeTruthy();
    expect(recoveryData.channel.channelId).toBe(httpClient.getChannelId());
    expect(recoveryData.timestamp).toBeTruthy();

    console.log('✅ Recovery data retrieved:', {
      channelId: recoveryData.channel?.channelId,
      pendingSubRav: recoveryData.pendingSubRav ? {
        nonce: recoveryData.pendingSubRav.nonce.toString(),
        amount: recoveryData.pendingSubRav.accumulatedAmount.toString()
      } : null,
      timestamp: recoveryData.timestamp
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
}); 