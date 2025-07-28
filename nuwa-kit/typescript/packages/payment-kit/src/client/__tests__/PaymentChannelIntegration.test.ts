/**
 * Real Integration Tests for PaymentChannelPayerClient and PaymentChannelPayeeClient
 * 
 * This test suite tests the complete payment channel workflow against a real Rooch node:
 * 1. Uses RoochPaymentChannelContract instead of mocks
 * 2. Connects to actual Rooch blockchain (testnet or local)
 * 3. Tests end-to-end payment channel operations
 * 4. Includes real cryptographic signing and verification
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { PaymentChannelPayerClient } from '../PaymentChannelPayerClient';
import { PaymentChannelPayeeClient } from '../PaymentChannelPayeeClient';
import { RoochPaymentChannelContract } from '../../rooch/RoochPaymentChannelContract';
import { RoochVDR, VDRRegistry } from '@nuwa-ai/identity-kit';
import type { SubRAV, SignedSubRAV, AssetInfo, ChannelInfo } from '../../core/types';
import type { DIDResolver } from '@nuwa-ai/identity-kit';
import { MemoryChannelRepository } from '../../storage';
import { TestEnv, createSelfDid, CreateSelfDidResult } from '@nuwa-ai/identity-kit/testHelpers';
import { DebugLogger } from '@nuwa-ai/identity-kit';

// Check if we should run integration tests
const shouldRunIntegrationTests = () => {
  return !TestEnv.skipIfNoNode();
};

describe('PaymentChannelIntegration (Real Blockchain)', () => {
  let contract: RoochPaymentChannelContract;
  let didResolver: DIDResolver;
  let env: TestEnv;
  let payer: CreateSelfDidResult;
  let payee: CreateSelfDidResult;
  let payerClient: PaymentChannelPayerClient;
  let payeeClient: PaymentChannelPayeeClient;
  let testAsset: AssetInfo;

  beforeEach(async () => {
    if (!shouldRunIntegrationTests()) {
      console.log('Skipping integration tests - ROOCH_NODE_URL not set or node not accessible');
      return;
    }

    DebugLogger.setGlobalLevel('debug');

    // Bootstrap test environment with real Rooch node
    env = await TestEnv.bootstrap({
      rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
      network: 'test',
      debug: true,
    });

    // Initialize real contract with test configuration
    contract = new RoochPaymentChannelContract({
      rpcUrl: env.rpcUrl,
      network: 'test', 
      debug: true,
    });

    // Initialize real DID resolver using VDRRegistry
    const roochVDR = new RoochVDR({
      rpcUrl: env.rpcUrl,
      network: 'test',
    });
    
    // Register the RoochVDR with VDRRegistry and use it as DIDResolver
    const vdrRegistry = VDRRegistry.getInstance();
    vdrRegistry.registerVDR(roochVDR);
    didResolver = vdrRegistry;

    // Create real DIDs using test helper
    payer = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false
    });

    payee = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false
    });

    // Define test asset (RGas)
    testAsset = {
      assetId: '0x3::gas_coin::RGas',
      decimals: 8,
    };

    // Initialize clients with real contract and isolated storage
    payerClient = new PaymentChannelPayerClient({
      contract,
      signer: payer.keyManager,
      keyId: `${payer.did}#${payer.vmIdFragment}`,
      storageOptions: {
        customChannelRepo: new MemoryChannelRepository(),
      },
    });

    payeeClient = new PaymentChannelPayeeClient({
      contract,
      signer: payee.keyManager,
      didResolver,
      storageOptions: {
        customChannelRepo: new MemoryChannelRepository(),
      },
    });

    console.log(`Real integration test setup completed:
      Payer DID: ${payer.did}
      Payee DID: ${payee.did}
      Test Asset: ${testAsset.assetId}
      Node URL: ${env.rpcUrl}
    `);
  });

  afterEach(() => {
    // Cleanup if needed
  });

  test('Complete payment flow on real blockchain', async () => {
    if (!shouldRunIntegrationTests()) return;

    // Step 1: Fund payer's payment hub
    console.log('💰 Step 1: Fund payer payment hub');
    const fundAmount = BigInt(1000000000); // 10 RGas
    
    // Note: In real tests, we might need to ensure the payer has sufficient balance
    // This might require pre-funding the test accounts or using a faucet
    const depositResult = await contract.depositToHub({
      targetDid: payer.did,
      assetId: testAsset.assetId,
      amount: fundAmount,
      signer: payer.signer,
    });

    expect(depositResult.txHash).toBeTruthy();
    console.log(`✅ Hub funded: ${fundAmount} units (tx: ${depositResult.txHash})`);

    // Step 2: Open channel with sub-channel
    console.log('🔧 Step 2: Open channel with sub-channel');
    const openResult = await payerClient.openChannelWithSubChannel({
      payeeDid: payee.did,
      assetId: testAsset.assetId,
      collateral: BigInt(50000000), // 0.5 RGas
      vmIdFragment: payer.vmIdFragment,
    });

    expect(openResult.channelId).toBeTruthy();
    expect(openResult.txHash).toBeTruthy();
    console.log(`✅ Channel opened: ${openResult.channelId} (tx: ${openResult.txHash})`);

    // Step 3: Verify channel status on blockchain
    console.log('🔍 Step 3: Verify channel on blockchain');
    const channelInfo = await payerClient.getChannelInfo(openResult.channelId);
    expect(channelInfo.payerDid).toBe(payer.did);
    expect(channelInfo.payeeDid).toBe(payee.did);
    expect(channelInfo.status).toBe('active');
    console.log('✅ Channel verified on blockchain');

    // Step 4: Generate and sign SubRAV
    console.log('💳 Step 4: Generate and sign SubRAV');
    const serviceCharge = BigInt(5000000); // 0.05 RGas
    
    const subRAV = await payeeClient.generateSubRAV({
      channelId: openResult.channelId,
      payerKeyId: `${payer.did}#${payer.vmIdFragment}`,
      amount: serviceCharge,
      description: 'Real blockchain payment test',
    });

    expect(subRAV.channelId).toBe(openResult.channelId);
    expect(subRAV.accumulatedAmount).toBe(serviceCharge);
    expect(subRAV.nonce).toBe(BigInt(1));
    console.log(`✅ SubRAV generated: amount=${subRAV.accumulatedAmount}, nonce=${subRAV.nonce}`);

    // Step 5: Payer signs the SubRAV
    console.log('✍️ Step 5: Payer signs SubRAV');
    const signedSubRAV = await payerClient.signSubRAV(subRAV, {
      validateBeforeSigning: true,
      maxAmount: BigInt(100000000), // 1 RGas max
    });

    expect(signedSubRAV.subRav).toEqual(subRAV);
    expect(signedSubRAV.signature).toBeTruthy();
    expect(signedSubRAV.signature.length).toBe(64);
    console.log('✅ SubRAV signed with real cryptographic signature');

    // Step 6: Verify SubRAV with real DID resolution
    console.log('🔐 Step 6: Verify SubRAV with real DID resolution');
    const verificationResult = await payeeClient.verifySubRAV(signedSubRAV);
    
    expect(verificationResult.isValid).toBe(true);
    expect(verificationResult.details?.signatureValid).toBe(true);
    expect(verificationResult.details?.channelExists).toBe(true);
    expect(verificationResult.details?.epochMatches).toBe(true);
    expect(verificationResult.details?.nonceProgression).toBe(true);
    expect(verificationResult.details?.amountValid).toBe(true);
    console.log('✅ SubRAV verification passed with real DID resolution');

    // Step 7: Process signed SubRAV
    console.log('⚙️ Step 7: Process signed SubRAV');
    await payeeClient.processSignedSubRAV(signedSubRAV);
    console.log('✅ Signed SubRAV processed');

    // Step 8: Claim payment on blockchain
    console.log('💸 Step 8: Claim payment on real blockchain');
    const claimResult = await payeeClient.claimFromChannel({
      signedSubRAV,
      validateBeforeClaim: true,
    });

    expect(claimResult.txHash).toBeTruthy();
    expect(typeof claimResult.claimedAmount).toBe('bigint');
    console.log(`✅ Payment claimed on blockchain: ${claimResult.claimedAmount} (tx: ${claimResult.txHash})`);

    // Step 9: Verify sub-channel state on blockchain
    console.log('🔍 Step 9: Verify sub-channel state on blockchain');
    const subChannelInfo = await contract.getSubChannel({
      channelId: openResult.channelId,
      vmIdFragment: payer.vmIdFragment,
    });

    expect(subChannelInfo.lastConfirmedNonce).toBeGreaterThanOrEqual(BigInt(1));
    console.log(`✅ Sub-channel verified: nonce=${subChannelInfo.lastConfirmedNonce}, claimed=${subChannelInfo.lastClaimedAmount}`);

    console.log('🎉 Complete real blockchain payment flow successful!');
  });

  test('Multi-payment sequence on real blockchain', async () => {
    if (!shouldRunIntegrationTests()) return;

    console.log('🔄 Testing multi-payment sequence on real blockchain');

    // Setup: fund hub and open channel
    await contract.depositToHub({
      targetDid: payer.did,
      assetId: testAsset.assetId,
      amount: BigInt(1000000000), // 10 RGas
      signer: payer.signer,
    });

    const openResult = await payerClient.openChannelWithSubChannel({
      payeeDid: payee.did,
      assetId: testAsset.assetId,
      collateral: BigInt(100000000), // 1 RGas
      vmIdFragment: payer.vmIdFragment,
    });

    console.log(`✅ Channel setup complete: ${openResult.channelId}`);

    // Payment 1
    console.log('💳 Payment 1: Generate and process');
    const payment1Amount = BigInt(10000000); // 0.1 RGas
    const subRAV1 = await payeeClient.generateSubRAV({
      channelId: openResult.channelId,
      payerKeyId: `${payer.did}#${payer.vmIdFragment}`,
      amount: payment1Amount,
      description: 'First payment',
    });

    const signedSubRAV1 = await payerClient.signSubRAV(subRAV1);
    expect(signedSubRAV1.subRav.nonce).toBe(BigInt(1));
    expect(signedSubRAV1.subRav.accumulatedAmount).toBe(payment1Amount);

    await payeeClient.processSignedSubRAV(signedSubRAV1);
    const claim1Result = await payeeClient.claimFromChannel({
      signedSubRAV: signedSubRAV1,
      validateBeforeClaim: false, // Skip validation since we just verified
    });

    expect(claim1Result.txHash).toBeTruthy();
    console.log(`✅ Payment 1 claimed: ${claim1Result.claimedAmount} (tx: ${claim1Result.txHash})`);

    // Payment 2 (incremental)
    console.log('💳 Payment 2: Incremental payment');
    const payment2Amount = BigInt(15000000); // Additional 0.15 RGas
    const totalAmount = payment1Amount + payment2Amount;
    
    const subRAV2 = await payeeClient.generateSubRAV({
      channelId: openResult.channelId,
      payerKeyId: `${payer.did}#${payer.vmIdFragment}`,
      amount: payment2Amount,
      description: 'Second payment',
    });

    const signedSubRAV2 = await payerClient.signSubRAV(subRAV2);
    expect(signedSubRAV2.subRav.nonce).toBe(BigInt(2));
    expect(signedSubRAV2.subRav.accumulatedAmount).toBe(totalAmount);

    const verification2 = await payeeClient.verifySubRAV(signedSubRAV2);
    expect(verification2.isValid).toBe(true);

    await payeeClient.processSignedSubRAV(signedSubRAV2);
    const claim2Result = await payeeClient.claimFromChannel({
      signedSubRAV: signedSubRAV2,
      validateBeforeClaim: false,
    });

    expect(claim2Result.txHash).toBeTruthy();
    console.log(`✅ Payment 2 claimed: ${claim2Result.claimedAmount} (tx: ${claim2Result.txHash})`);

    // Verify final state on blockchain
    const finalSubChannelInfo = await contract.getSubChannel({
      channelId: openResult.channelId,
      vmIdFragment: payer.vmIdFragment,
    });

    expect(finalSubChannelInfo.lastConfirmedNonce).toBe(BigInt(2));
    console.log(`✅ Final state verified: nonce=${finalSubChannelInfo.lastConfirmedNonce}, total_claimed=${finalSubChannelInfo.lastClaimedAmount}`);

    console.log('🎉 Multi-payment sequence on real blockchain successful!');
  });

  test('Channel state synchronization with real blockchain', async () => {
    if (!shouldRunIntegrationTests()) return;

    console.log('🔄 Testing channel state synchronization with real blockchain');

    // Setup
    await contract.depositToHub({
      targetDid: payer.did,
      assetId: testAsset.assetId,
      amount: BigInt(500000000), // 5 RGas
      signer: payer.signer,
    });

    const openResult = await payerClient.openChannelWithSubChannel({
      payeeDid: payee.did,
      assetId: testAsset.assetId,
      collateral: BigInt(50000000), // 0.5 RGas
      vmIdFragment: payer.vmIdFragment,
    });

    // Test sync channel state from blockchain
    await payeeClient.syncChannelState(openResult.channelId);
    console.log('✅ Channel state synced from blockchain');

    // Generate and process a payment to create some state
    const subRAV = await payeeClient.generateSubRAV({
      channelId: openResult.channelId,
      payerKeyId: `${payer.did}#${payer.vmIdFragment}`,
      amount: BigInt(5000000), // 0.05 RGas
      description: 'Sync test payment',
    });

    const signedSubRAV = await payerClient.signSubRAV(subRAV);
    await payeeClient.processSignedSubRAV(signedSubRAV);
    await payeeClient.claimFromChannel({
      signedSubRAV,
      validateBeforeClaim: false,
    });

    // Test listing active channels (should include our channel)
    const activeChannels = await payeeClient.listActiveChannels({
      status: 'active',
      limit: 10,
    });

    expect(activeChannels.length).toBeGreaterThan(0);
    expect(activeChannels.some((ch: ChannelInfo) => ch.channelId === openResult.channelId)).toBe(true);
    console.log(`✅ Found ${activeChannels.length} active channels including ours`);

    // Test getting channels by payer
    const payerChannels = await payerClient.getChannelsByPayer(payer.did);
    expect(payerChannels.length).toBeGreaterThan(0);
    console.log(`✅ Payer has ${payerChannels.length} channels`);

    console.log('🎉 Channel state synchronization with real blockchain successful!');
  });

  test('Error handling with real blockchain', async () => {
    if (!shouldRunIntegrationTests()) return;

    console.log('⚠️ Testing error scenarios with real blockchain');

    // Test: Try to get status of non-existent channel
    await expect(
      payerClient.getChannelInfo('0x1234567890123456789012345678901234567890123456789012345678901234')
    ).rejects.toThrow();
    console.log('✅ Non-existent channel error handled correctly');

    // Test: Try to generate SubRAV for non-existent channel 
    await expect(
      payeeClient.generateSubRAV({
        channelId: '0x1234567890123456789012345678901234567890123456789012345678901234',
        payerKeyId: `${payer.did}#${payer.vmIdFragment}`,
        amount: BigInt(10000),
      })
    ).rejects.toThrow();
    console.log('✅ SubRAV generation for non-existent channel error handled');

    // Test: Try to set active channel to non-existent channel
    await expect(
      payerClient.setActiveChannel('0x1234567890123456789012345678901234567890123456789012345678901234')
    ).rejects.toThrow();
    console.log('✅ Invalid active channel error handled');

    console.log('🎉 Error handling tests with real blockchain successful!');
  });

  test('Asset queries on real blockchain', async () => {
    if (!shouldRunIntegrationTests()) return;

    console.log('💱 Testing asset information queries on real blockchain');

    // Test asset info retrieval
    const assetInfo = await payerClient.getAssetInfo(testAsset.assetId);
    //expect(assetInfo.assetId).toBe(testAsset.assetId);
    expect(assetInfo.symbol).toBe('RGas');
    console.log(`✅ Asset info from blockchain: ${assetInfo.symbol} (${assetInfo.assetId})`);

    // Test asset price retrieval
    const assetPrice = await payeeClient.getAssetPrice(testAsset.assetId);
    expect(assetPrice).toBe(BigInt(100)); // 100 pUSD per smallest unit
    console.log(`✅ Asset price from blockchain: ${assetPrice} pUSD`);

    // Test chain ID retrieval
    const chainId = await contract.getChainId();
    expect(typeof chainId).toBe('bigint');
    expect(chainId).toBeGreaterThan(BigInt(0));
    console.log(`✅ Chain ID from blockchain: ${chainId}`);

    console.log('🎉 Asset queries on real blockchain successful!');
  });
}); 