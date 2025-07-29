/**
 * HTTP Payment Kit End-to-End Tests
 * 
 * This test suite tests the complete HTTP payment workflow against a real Rooch node:
 * 1. Uses real blockchain connection and payment channels
 * 2. Tests the deferred payment model with HTTP middleware
 * 3. Covers the complete API billing scenario
 * 4. Tests multi-request payment sequences
 */

import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { PaymentChannelPayerClient } from '../../src/client/PaymentChannelPayerClient';
import { PaymentChannelPayeeClient } from '../../src/client/PaymentChannelPayeeClient';
import { RoochPaymentChannelContract } from '../../src/rooch/RoochPaymentChannelContract';
import { RoochVDR, VDRRegistry } from '@nuwa-ai/identity-kit';
import type { AssetInfo } from '../../src/core/types';
import { MemoryChannelRepository } from '../../src/storage';
import { TestEnv, createSelfDid, CreateSelfDidResult } from '@nuwa-ai/identity-kit/testHelpers';
import { DebugLogger } from '@nuwa-ai/identity-kit';
import { createBillingServer, createTestClient } from './server';

// Check if we should run E2E tests
const shouldRunE2ETests = () => {
  return process.env.PAYMENT_E2E === '1' && !TestEnv.skipIfNoNode();
};

describe('HTTP Payment Kit E2E (Real Blockchain + HTTP Server)', () => {
  let contract: RoochPaymentChannelContract;
  let env: TestEnv;
  let payer: CreateSelfDidResult;
  let payee: CreateSelfDidResult;
  let payerClient: PaymentChannelPayerClient;
  let payeeClient: PaymentChannelPayeeClient;
  let testAsset: AssetInfo;
  let billingServerInstance: any;
  let testClient: any;
  let channelId: string;

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

    // Initialize real contract
    contract = new RoochPaymentChannelContract({
      rpcUrl: env.rpcUrl,
      network: 'local', 
      debug: false,
    });

    // Initialize DID resolver
    const roochVDR = new RoochVDR({
      rpcUrl: env.rpcUrl,
      network: 'local',
    });
    
    const vdrRegistry = VDRRegistry.getInstance();
    vdrRegistry.registerVDR(roochVDR);

    // Create test identities
    payer = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false
    });

    payee = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false
    });

    // Define test asset
    testAsset = {
      assetId: '0x3::gas_coin::RGas',
      decimals: 8, // RGas has 8 decimal places
    };

    // Initialize payment clients
    payerClient = new PaymentChannelPayerClient({
      contract,
      signer: payer.keyManager,
      keyId: `${payer.did}#${payer.vmIdFragment}`,
      storageOptions: {
        customChannelRepo: new MemoryChannelRepository(),
      },
    });

    console.log(`✅ Test setup completed:
      Payer DID: ${payer.did}
      Payee DID: ${payee.did}
      Test Asset: ${testAsset.assetId}
      Node URL: ${env.rpcUrl}
    `);

    // Fund and setup payment channel
    await setupPaymentChannel();

    // Start billing server using new ExpressPaymentKitOptions API
    billingServerInstance = await createBillingServer({
      signer: payee.keyManager,
      did: payee.did,
      rpcUrl: env.rpcUrl,
      network: 'local',
      port: 3001, // Use different port to avoid conflicts
      serviceId: 'e2e-test-service',
      defaultAssetId: testAsset.assetId,
      debug: false
    });

    // Get the created payeeClient from billing server for other operations
    payeeClient = billingServerInstance.billing.getPayeeClient();

    // Create test client
    testClient = createTestClient(payerClient, billingServerInstance.baseURL, channelId);

    console.log(`✅ Billing server started on ${billingServerInstance.baseURL}`);
  }, 180000); // 3 minutes timeout for setup

  afterAll(async () => {
    if (!shouldRunE2ETests()) return;

    // Cleanup
    if (billingServerInstance) {
      await billingServerInstance.shutdown();
      console.log('✅ Billing server shutdown');
    }

    // Close payment channel if it exists
    if (channelId && payerClient) {
      try {
        await payerClient.closeChannel(channelId, true);
        console.log('✅ Payment channel closed');
      } catch (error) {
        console.warn('Warning: Failed to close channel:', error);
      }
    }

    console.log('🏁 HTTP Payment Kit E2E Tests completed');
  }, 60000); // 1 minute timeout for cleanup

  async function setupPaymentChannel() {
    console.log('💰 Setting up payment channel...');
    
    // Fund payer's payment hub
    const fundAmount = BigInt('1000000000'); // 10 RGas
    
    const depositResult = await contract.depositToHub({
      targetDid: payer.did,
      assetId: testAsset.assetId,
      amount: fundAmount,
      signer: payer.signer,
    });

    console.log(`✅ Hub funded: ${fundAmount} units (tx: ${depositResult.txHash})`);

    // Open channel with sub-channel
    const openResult = await payerClient.openChannelWithSubChannel({
      payeeDid: payee.did,
      assetId: testAsset.assetId,
      collateral: BigInt('100000000'), // 1 RGas
      vmIdFragment: payer.vmIdFragment,
    });

    channelId = openResult.channelId;
    console.log(`✅ Channel opened: ${channelId} (tx: ${openResult.txHash})`);

    // Verify channel is active
    const channelInfo = await payerClient.getChannelInfo(channelId);
    expect(channelInfo.status).toBe('active');
    console.log('✅ Channel verified as active');
  }

  test('Complete HTTP deferred payment flow', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing complete HTTP deferred payment flow');

    // Test 1: First request (no payment required, receives SubRAV proposal)
    console.log('📞 Request 1: First call (no payment required)');
    const response1 = await testClient.callEcho('hello world');
    
    expect(response1.echo).toBe('hello world');
    expect(response1.cost).toBe('10000000'); // 0.001 USD = 10,000,000 RGAS units (0.1 RGAS)
    expect(response1.timestamp).toBeTruthy();
    
    // Should have received a SubRAV proposal for next request
    const pendingSubRAV1 = testClient.getPendingSubRAV();
    expect(pendingSubRAV1).toBeTruthy();
    expect(pendingSubRAV1.channelId).toBe(channelId);
    expect(pendingSubRAV1.nonce).toBe(BigInt(1));
    
    console.log(`✅ First request successful, received SubRAV proposal (nonce: ${pendingSubRAV1.nonce})`);

    // Test 2: Second request (pays for first request, receives new proposal)
    console.log('📞 Request 2: Second call (pays for first request)');
    const response2 = await testClient.callEcho('second call');
    
    expect(response2.echo).toBe('second call');
    expect(response2.cost).toBe('10000000');
    
    const pendingSubRAV2 = testClient.getPendingSubRAV();
    expect(pendingSubRAV2).toBeTruthy();
    expect(pendingSubRAV2.nonce).toBe(BigInt(2));
    
    console.log(`✅ Second request successful, payment processed (nonce: ${pendingSubRAV2.nonce})`);

    // Test 3: Multiple requests to verify consistent payment processing
    console.log('📞 Requests 3-6: Multiple calls to verify payment consistency');
    
    for (let i = 3; i <= 6; i++) {
      const response = await testClient.callEcho(`call ${i}`);
      expect(response.echo).toBe(`call ${i}`);
      expect(response.cost).toBe('10000000');
      console.log(`✅ Request ${i} successful (nonce: ${response.nonce || 'unknown'})`);
    }

    // Check admin stats for payment tracking
    const adminStats = await testClient.getAdminClaims();
    console.log('📊 Admin stats after multiple requests:', JSON.stringify(adminStats, null, 2));

    console.log('🎉 Complete HTTP deferred payment flow successful!');
  }, 120000); // 2 minutes timeout

  test('Mixed request types with different pricing', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing mixed request types with different pricing');

    // Reset client state
    testClient.clearPendingSubRAV();

    // Test echo requests (cheaper)
    console.log('📞 Echo requests (0.001 USD each)');
    await testClient.callEcho('test echo 1');
    await testClient.callEcho('test echo 2');

    // Test process requests (more expensive)
    console.log('📞 Process requests (0.01 USD each)');
    const processResponse1 = await testClient.callProcess({ data: 'test data 1' });
    expect(processResponse1.processed.data).toBe('test data 1');
    expect(processResponse1.cost).toBe('100000000'); // 0.01 USD = 100,000,000 RGAS units (1.0 RGAS)

    const processResponse2 = await testClient.callProcess({ operation: 'complex task' });
    expect(processResponse2.processed.operation).toBe('complex task');
    expect(processResponse2.cost).toBe('100000000');

    console.log('✅ Mixed request types processed successfully');

    // Check accumulated costs
    const adminStats = await testClient.getAdminClaims();
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
    const adminStats = await testClient.getAdminClaims();
    expect(adminStats).toBeTruthy();

    console.log('✅ Admin endpoints accessible');

    console.log('🎉 Error handling test successful!');
  }, 60000);

  test('Channel state consistency', async () => {
    if (!shouldRunE2ETests()) return;

    console.log('🔄 Testing channel state consistency between client and blockchain');

    // Get channel info from blockchain
    const blockchainChannelInfo = await contract.getChannelStatus({
      channelId: channelId,
    });
    const blockchainSubChannelInfo = await contract.getSubChannel({
      channelId,
      vmIdFragment: payer.vmIdFragment,
    });

    // Get channel info from client
    const clientChannelInfo = await payerClient.getChannelInfo(channelId);

    // Verify consistency
    expect(clientChannelInfo.channelId).toBe(blockchainChannelInfo.channelId);
    expect(clientChannelInfo.payerDid).toBe(blockchainChannelInfo.payerDid);
    expect(clientChannelInfo.payeeDid).toBe(blockchainChannelInfo.payeeDid);
    expect(clientChannelInfo.status).toBe(blockchainChannelInfo.status);

    console.log(`✅ Channel state consistent:
      Channel ID: ${clientChannelInfo.channelId}
      Status: ${clientChannelInfo.status}
      Last Confirmed Nonce: ${blockchainSubChannelInfo.lastConfirmedNonce}
      Last Claimed Amount: ${blockchainSubChannelInfo.lastClaimedAmount}
    `);

    // Test sync functionality
    await payeeClient.syncChannelState(channelId);
    console.log('✅ Channel state sync completed');

    console.log('🎉 Channel state consistency test successful!');
  }, 60000);
}); 