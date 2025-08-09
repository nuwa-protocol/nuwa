/**
 * Integration tests for PaymentChannelPayerClient and PaymentChannelPayeeClient
 * 
 * This test suite covers the complete payment channel workflow:
 * 1. Payer opens a channel and authorizes sub-channel
 * 2. Payee generates SubRAV for a service charge
 * 3. Payer signs the SubRAV to authorize payment
 * 4. Payee processes the signed SubRAV and claims payment
 * 5. Both parties can query channel state and manage lifecycle
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PaymentChannelPayerClient } from '../PaymentChannelPayerClient';
import { PaymentChannelPayeeClient } from '../PaymentChannelPayeeClient';
import type { SubRAV, SignedSubRAV, AssetInfo } from '../../core/types';
import { MemoryChannelRepository } from '../../storage';
import { SubRAVManager } from '../../core/SubRav';
import { KeyStoreSigner } from '@nuwa-ai/identity-kit';
import { 
  MockContract, 
  MockDIDResolver, 
  TestSignerFactory, 
  TEST_ASSET,
  createTestEnvironment,
} from '../../test-helpers/mocks';

// Mock implementations for testing are now imported from test-helpers/mocks.ts

// Mock implementations for testing are now imported from test-helpers/mocks.ts

describe('PaymentChannelIntegration', () => {
  let mockContract: MockContract;
  let payerSigner: KeyStoreSigner;
  let payeeSigner: KeyStoreSigner;
  let didResolver: MockDIDResolver;
  let payerClient: PaymentChannelPayerClient;
  let payeeClient: PaymentChannelPayeeClient;
  let testAsset: AssetInfo;
  let payerKeyId: string;
  let payeeKeyId: string;

  let payerDid = 'did:test:payer123';
  let payeeDid = 'did:test:payee456';

  beforeEach(async () => {
    // Use the test environment factory to create consistent test setup with predefined DIDs
    const testEnv = await createTestEnvironment('integration-test');
    
    mockContract = testEnv.contract;
    payerSigner = testEnv.payerSigner;
    payeeSigner = testEnv.payeeSigner;
    didResolver = testEnv.didResolver;
    payerKeyId = testEnv.payerKeyId;
    payeeKeyId = testEnv.payeeKeyId;
    testAsset = testEnv.asset;
    
    // Update the hardcoded DIDs to match the ones created by the factory
    payerDid = testEnv.payerDid;
    payeeDid = testEnv.payeeDid;

    // Initialize clients with separate storage instances for each test
    payerClient = new PaymentChannelPayerClient({
      contract: mockContract,
      signer: payerSigner,
      keyId: payerKeyId,
      storageOptions: {
        customChannelRepo: new MemoryChannelRepository(),
      },
    });

    payeeClient = new PaymentChannelPayeeClient({
      contract: mockContract,
      signer: payeeSigner,
      didResolver,
      storageOptions: {
        customChannelRepo: new MemoryChannelRepository(),
      },
    });
  });

  afterEach(() => {
    // Cleanup if needed
  });

  test('Complete payment flow: channel creation to payment processing', async () => {
    // Step 1: Payer opens a channel with sub-channel
    console.log('🔧 Step 1: Payer opens channel with sub-channel');
    const openResult = await payerClient.openChannelWithSubChannel({
      payeeDid,
      assetId: testAsset.assetId,

      vmIdFragment: 'account-key',
    });

    expect(openResult.channelId).toBeTruthy();
    expect(openResult.txHash).toBeTruthy();
    console.log(`✅ Channel opened: ${openResult.channelId}`);

    // Step 2: Verify both clients can see the channel
    console.log('🔍 Step 2: Verify channel visibility');
    const channelInfo = await payerClient.getChannelInfo(openResult.channelId);
    expect(channelInfo.payerDid).toBe(payerDid);
    expect(channelInfo.payeeDid).toBe(payeeDid);
    expect(channelInfo.status).toBe('active');
    console.log('✅ Channel info verified by payer');

    const payeeChannelInfo = await payeeClient.getChannelInfo(openResult.channelId);
    expect(payeeChannelInfo.channelId).toBe(openResult.channelId);
    console.log('✅ Channel info verified by payee');

    // Step 3: Payee generates SubRAV for a service charge
    console.log('💰 Step 3: Payee generates SubRAV for service charge');
    const serviceCharge = BigInt(50000); // 0.0005 RGas
    
    const subRAV = await payeeClient.generateSubRAV({
      channelId: openResult.channelId,
      payerKeyId,
      amount: serviceCharge,
      description: 'API service call',
    });

    expect(subRAV.channelId).toBe(openResult.channelId);
    expect(subRAV.accumulatedAmount).toBe(serviceCharge);
    expect(subRAV.nonce).toBe(BigInt(1));
    expect(subRAV.vmIdFragment).toBe('account-key');
    console.log(`✅ SubRAV generated: amount=${subRAV.accumulatedAmount}, nonce=${subRAV.nonce}`);

    // Step 4: Payer signs the SubRAV to authorize payment
    console.log('✍️ Step 4: Payer signs SubRAV to authorize payment');
    const signedSubRAV = await payerClient.signSubRAV(subRAV);

    expect(signedSubRAV.subRav).toEqual(subRAV);
    expect(signedSubRAV.signature).toBeTruthy();
    expect(signedSubRAV.signature.length).toBe(64); // ECDSA signature length
    console.log('✅ SubRAV signed by payer');

    // Step 5: Payee verifies the signed SubRAV
    console.log('🔍 Step 5: Payee verifies signed SubRAV');
    const verificationResult = await payeeClient.verifySubRAV(signedSubRAV);
    
    expect(verificationResult.isValid).toBe(true);
    expect(verificationResult.details?.signatureValid).toBe(true);
    expect(verificationResult.details?.channelExists).toBe(true);
    expect(verificationResult.details?.epochMatches).toBe(true);
    expect(verificationResult.details?.nonceProgression).toBe(true);
    expect(verificationResult.details?.amountValid).toBe(true);
    console.log('✅ SubRAV verification passed');

    // Step 6: Payee processes the signed SubRAV
    console.log('⚙️ Step 6: Payee processes signed SubRAV');
    await payeeClient.processSignedSubRAV(signedSubRAV);
    console.log('✅ Signed SubRAV processed');

    // Step 7: Payee claims payment from the channel
    console.log('💸 Step 7: Payee claims payment');
    const claimResult = await payeeClient.claimFromChannel({
      signedSubRAV,
      validateBeforeClaim: true,
    });

    expect(claimResult.claimedAmount).toBe(serviceCharge);
    expect(claimResult.txHash).toBeTruthy();
    console.log(`✅ Payment claimed: ${claimResult.claimedAmount} (tx: ${claimResult.txHash})`);

    // Step 8: Test second payment with higher amount
    console.log('💰 Step 8: Test second payment');
    const secondCharge = BigInt(30000); // 0.0003 RGas
    const subRAV2 = await payeeClient.generateSubRAV({
      channelId: openResult.channelId,
      payerKeyId,
      amount: secondCharge,
      description: 'Second API call',
    });

    expect(subRAV2.nonce).toBe(BigInt(2)); // Nonce should increment
    expect(subRAV2.accumulatedAmount).toBe(serviceCharge + secondCharge); // Accumulated total
    console.log(`✅ Second SubRAV generated: nonce=${subRAV2.nonce}, total=${subRAV2.accumulatedAmount}`);

    const signedSubRAV2 = await payerClient.signSubRAV(subRAV2);
    const verificationResult2 = await payeeClient.verifySubRAV(signedSubRAV2);
    expect(verificationResult2.isValid).toBe(true);
    console.log('✅ Second SubRAV signed and verified');

    // Step 9: Test channel closure
    console.log('🔒 Step 9: Test channel closure');
    const closeResult = await payerClient.closeChannel(openResult.channelId, true);
    expect(closeResult.txHash).toBeTruthy();
    console.log(`✅ Channel closed: ${closeResult.txHash}`);

    // Verify channel status is updated
    const closedChannelInfo = await payerClient.getChannelInfo(openResult.channelId);
    expect(closedChannelInfo.status).toBe('closed');
    console.log('✅ Channel status updated to closed');
  });

  test('Multi-channel support and channel switching', async () => {
    console.log('🔄 Testing multi-channel support');

    // Open two channels
    const channel1 = await payerClient.openChannelWithSubChannel({
      payeeDid,
      assetId: testAsset.assetId,

      vmIdFragment: 'account-key',
    });

    const channel2 = await payerClient.openChannelWithSubChannel({
      payeeDid,
      assetId: testAsset.assetId,

      vmIdFragment: 'account-key',
    });

    console.log(`✅ Opened two channels: ${channel1.channelId}, ${channel2.channelId}`);

    // Test channel switching
    await payerClient.setActiveChannel(channel2.channelId);
    expect(payerClient.getActiveChannelId()).toBe(channel2.channelId);
    console.log(`✅ Switched to channel: ${channel2.channelId}`);

    // Generate payments on different channels
    
    const subRAV1 = await payeeClient.generateSubRAV({
      channelId: channel1.channelId,
      payerKeyId,
      amount: BigInt(10000),
    });

    const subRAV2 = await payeeClient.generateSubRAV({
      channelId: channel2.channelId,
      payerKeyId,
      amount: BigInt(20000),
    });

    // Sign both SubRAVs
    const signedSubRAV1 = await payerClient.signSubRAV(subRAV1);
    const signedSubRAV2 = await payerClient.signSubRAV(subRAV2);

    // Verify both are valid
    const verification1 = await payeeClient.verifySubRAV(signedSubRAV1);
    const verification2 = await payeeClient.verifySubRAV(signedSubRAV2);

    expect(verification1.isValid).toBe(true);
    expect(verification2.isValid).toBe(true);
    console.log('✅ Multi-channel payments verified');

    // Test batch claiming
    const batchResults = await payeeClient.batchClaimFromChannels([signedSubRAV1, signedSubRAV2]);
    expect(batchResults).toHaveLength(2);
    expect(batchResults[0].claimedAmount).toBe(BigInt(10000));
    expect(batchResults[1].claimedAmount).toBe(BigInt(20000));
    console.log('✅ Batch claiming successful');
  });

  test('Payment validation and basic error handling', async () => {
    console.log('🛡️ Testing basic payment validation');

    // Create unique test environment  
    const validationTestEnv = await createTestEnvironment('validation-test');

    const validationPayerClient = new PaymentChannelPayerClient({
      contract: validationTestEnv.contract,
      signer: validationTestEnv.payerSigner,
      keyId: validationTestEnv.payerKeyId,
      storageOptions: {
        customChannelRepo: new MemoryChannelRepository(),
      },
    });

    const validationPayeeClient = new PaymentChannelPayeeClient({
      contract: validationTestEnv.contract,
      signer: validationTestEnv.payeeSigner,
      didResolver: validationTestEnv.didResolver,
      storageOptions: {
        customChannelRepo: new MemoryChannelRepository(),
      },
    });

    // Open a dedicated channel for validation testing
    const validationChannel = await validationPayerClient.openChannelWithSubChannel({
      payeeDid: validationTestEnv.payeeDid,
      assetId: validationTestEnv.asset.assetId,

      vmIdFragment: 'account-key',
    });

    const validationPayerKeyId = validationTestEnv.payerKeyId;

    console.log(`🔧 Opened validation channel: ${validationChannel.channelId}`);

    // Test: Basic payment processing
    const basicSubRAV = await validationPayeeClient.generateSubRAV({
      channelId: validationChannel.channelId,
      payerKeyId: validationPayerKeyId,
      amount: BigInt(25000), // 0.00025 RGas
    });

    const signedBasicSubRAV = await validationPayerClient.signSubRAV(basicSubRAV);
    expect(signedBasicSubRAV.subRav.accumulatedAmount).toBe(BigInt(25000));
    expect(signedBasicSubRAV.subRav.nonce).toBe(BigInt(1));
    console.log('✅ Basic payment processing works');

    // Test: Payment verification
    const verification = await validationPayeeClient.verifySubRAV(signedBasicSubRAV);
    expect(verification.isValid).toBe(true);
    console.log('✅ Payment verification works');

    // Test: Process and claim payment
    await validationPayeeClient.processSignedSubRAV(signedBasicSubRAV);
    const claimResult = await validationPayeeClient.claimFromChannel({
      signedSubRAV: signedBasicSubRAV,
      validateBeforeClaim: false, // Skip validation since we already verified
    });
    expect(claimResult.claimedAmount).toBe(BigInt(25000));
    console.log('✅ Payment claiming works');
  });

  test('Channel state synchronization', async () => {
    console.log('🔄 Testing channel state synchronization');

    // Open a channel
    const openResult = await payerClient.openChannelWithSubChannel({
      payeeDid,
      assetId: testAsset.assetId,

      vmIdFragment: 'account-key',
    });

    // Test syncing channel state
    await payeeClient.syncChannelState(openResult.channelId);
    console.log('✅ Channel state synced successfully');

    // Test listing active channels
    const activeChannels = await payeeClient.listActiveChannels({
      status: 'active',
      limit: 10,
    });

    expect(activeChannels.length).toBeGreaterThan(0);
    expect(activeChannels.some(ch => ch.channelId === openResult.channelId)).toBe(true);
    console.log(`✅ Found ${activeChannels.length} active channels`);

    // Test getting channels by payer
    const payerChannels = await payerClient.getChannelsByPayer(payerDid);
    expect(payerChannels.length).toBeGreaterThan(0);
    console.log(`✅ Payer has ${payerChannels.length} channels`);
  });

  test('Asset information queries', async () => {
    console.log('💱 Testing asset information queries');

    // Test asset info retrieval
    const assetInfo = await payerClient.getAssetInfo(testAsset.assetId);
    expect(assetInfo.assetId).toBe(testAsset.assetId);
    expect(assetInfo.symbol).toBe('RGas');
    console.log(`✅ Asset info: ${assetInfo.symbol} (${assetInfo.assetId})`);

    // Test asset price retrieval
    const assetPrice = await payeeClient.getAssetPrice(testAsset.assetId);
    expect(assetPrice).toBeGreaterThan(BigInt(0));
    console.log(`✅ Asset price: ${assetPrice} pUSD`);
  });

  test('Error scenarios and edge cases', async () => {
    console.log('⚠️ Testing error scenarios');

    // Test: Generate SubRAV for non-existent channel
    await expect(
      payeeClient.generateSubRAV({
        channelId: 'non-existent-channel',
        payerKeyId,
        amount: BigInt(10000),
      })
    ).rejects.toThrow('not found');
    console.log('✅ Non-existent channel error handled');

    // Test: Set active channel to non-existent channel
    await expect(
      payerClient.setActiveChannel('non-existent-channel')
    ).rejects.toThrow('not found');
    console.log('✅ Invalid active channel error handled');

    // Test: Get info for non-existent channel
    await expect(
      payerClient.getChannelInfo('non-existent-channel')
    ).rejects.toThrow('not found');
    console.log('✅ Channel info error handled');
  });
}); 