import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { RoochPaymentChannelContract } from '../RoochPaymentChannelContract';
import type {
  OpenChannelParams,
  OpenChannelResult,
  OpenChannelWithSubChannelParams,
  AuthorizeSubChannelParams,
  ClaimParams,
  ChannelStatusParams,
  SubChannelParams,
  SubChannelInfo,
  DepositParams,
} from '../../contracts/IPaymentChannelContract';
import { PaymentHubClient } from '../../client/PaymentHubClient';
import { PaymentChannelPayerClient } from '../../client/PaymentChannelPayerClient';
import type { ChannelInfo, AssetInfo, SignedSubRAV, SubRAV } from '../../core/types';
import { TestEnv, createSelfDid, CreateSelfDidResult } from '@nuwa-ai/identity-kit/testHelpers';
import { DebugLogger, MultibaseCodec, parseDid } from '@nuwa-ai/identity-kit';
import { SubRAVSigner, SUBRAV_VERSION_1 } from '../../core/SubRav';
import { normalizeAssetId } from '../ChannelUtils';

// Check if we should run integration tests
const shouldRunIntegrationTests = () => {
  return !TestEnv.skipIfNoNode();
};

describe('RoochPaymentChannelContract Integration Test', () => {
  let contract: RoochPaymentChannelContract;
  let env: TestEnv;
  let payer: CreateSelfDidResult;
  let payee: CreateSelfDidResult;
  let testAsset: AssetInfo;
  let channelId: string|undefined;

  beforeEach(async () => {
    if (!shouldRunIntegrationTests()) {
      console.log('Skipping integration tests - ROOCH_NODE_URL not set or node not accessible');
      return;
    }

    DebugLogger.setGlobalLevel('debug');

    // Bootstrap test environment
    env = await TestEnv.bootstrap({
      rpcUrl: process.env.ROOCH_NODE_URL || 'http://localhost:6767',
      network: 'test',
      debug: true,
    });

    // Initialize contract with test configuration
    contract = new RoochPaymentChannelContract({
      rpcUrl: env.rpcUrl,
      network: 'test',
      debug: true,
    });

    // Create payer DID using test helper
    payer = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false
    });

    // Create payee DID using test helper
    payee = await createSelfDid(env, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false
    });

    channelId = undefined;

    // Define test asset (RGas)
    testAsset = {
      assetId: '0x3::gas_coin::RGas',
      decimals: 8,
    };


    console.log(`Test setup completed:
      Payer DID: ${payer.did}
      Payee DID: ${payee.did}
      Test Asset: ${testAsset.assetId}
      `);
  });

  describe('Asset Information', () => {
    it('should get asset info for RGas', async () => {
      if (!shouldRunIntegrationTests()) return;

      const assetInfo = await contract.getAssetInfo(testAsset.assetId);
      
      expect(assetInfo).toBeDefined();
      expect(assetInfo.assetId).toBe(normalizeAssetId(testAsset.assetId));
      expect(assetInfo.symbol).toBe('RGas');
    });

    it('should get asset price for RGas', async () => {
      if (!shouldRunIntegrationTests()) return;

      const price = await contract.getAssetPrice(testAsset.assetId);
      
      expect(price).toBeDefined();
      expect(typeof price).toBe('bigint');
      expect(price).toBeGreaterThan(BigInt(0));
      // RGas price should be 100 pUSD per smallest unit
      expect(price).toBe(BigInt(100));
    });

    it('should get chain ID', async () => {
      if (!shouldRunIntegrationTests()) return;

      const chainId = await contract.getChainId();
      
      expect(chainId).toBeDefined();
      expect(typeof chainId).toBe('bigint');
      expect(chainId).toBeGreaterThan(BigInt(0));
      
      // Rooch network chain IDs:
      // Local: 4, Dev: 3, Test: 2, Main: 1
      // The test should work with any of these
      expect([BigInt(1), BigInt(2), BigInt(3), BigInt(4)]).toContain(chainId);
      
      console.log(`Chain ID retrieved: ${chainId}`);
    });

  });

  describe('Payment Hub Operations', () => {
    
    it('should get hub balance after deposit', async () => {
      if (!shouldRunIntegrationTests()) return;

      const depositAmount = BigInt(100000000); // 1 RGas (100M smallest units)

      // Deposit to hub
      const depositParams: DepositParams = {
        ownerDid: payer.did,
        assetId: testAsset.assetId,
        amount: depositAmount,
        signer: payer.signer,
      };

      await contract.depositToHub(depositParams);

      // Check hub balance
      const balance = await contract.getHubBalance(payer.did, testAsset.assetId);
      
      expect(balance).toBeGreaterThanOrEqual(depositAmount);
      expect(typeof balance).toBe('bigint');

      console.log(`Hub balance retrieved:
        Owner DID: ${payer.did}
        Asset: ${testAsset.assetId}
        Balance: ${balance} (${Number(balance) / 100000000} RGas)`);
    });

    it('should get all hub balances', async () => {
      if (!shouldRunIntegrationTests()) return;

      // Make sure we have some balance first
      await fundPayerHub();

      // Get all balances
      const allBalances = await contract.getAllHubBalances(payer.did);
      
      expect(allBalances).toBeDefined();
      expect(typeof allBalances).toBe('object');
      
      // Should have at least one balance (RGas)
      const normalizedAssetId = normalizeAssetId(testAsset.assetId);
      expect(allBalances[normalizedAssetId]).toBeDefined();
      expect(allBalances[normalizedAssetId]).toBeGreaterThan(BigInt(0));

      console.log(`All hub balances retrieved:
        Owner DID: ${payer.did}
        Balances:`, allBalances);
    });

    it('should get active channels counts', async () => {
      if (!shouldRunIntegrationTests()) return;

      // First fund the hub and open some channels
      await fundPayerHub();
      await openTestChannel();

      // Get active channels counts
      const channelCounts = await contract.getActiveChannelsCounts(payer.did);
      
      expect(channelCounts).toBeDefined();
      expect(typeof channelCounts).toBe('object');
      
      // Should have at least one active channel for RGas
      const normalizedAssetId = normalizeAssetId(testAsset.assetId);
      if (channelCounts[normalizedAssetId]) {
        expect(channelCounts[normalizedAssetId]).toBeGreaterThan(0);
        expect(typeof channelCounts[normalizedAssetId]).toBe('number');
      }

      console.log(`Active channels counts retrieved:
        Owner DID: ${payer.did}
        Channel Counts:`, channelCounts);
    });

    it('should verify PaymentHub BCS parsing with real data', async () => {
      if (!shouldRunIntegrationTests()) return;

      // Ensure we have a PaymentHub with data
      await fundPayerHub();
      await openTestChannel();

      // Test getHubBalance - this will exercise PaymentHub parsing
      const balance = await contract.getHubBalance(payer.did, testAsset.assetId);
      expect(balance).toBeGreaterThan(BigInt(0));

      // Test getAllHubBalances - this will exercise DynamicField<String, CoinStoreField> parsing
      const allBalances = await contract.getAllHubBalances(payer.did);
      expect(Object.keys(allBalances).length).toBeGreaterThan(0);

      // Test getActiveChannelsCounts - this will exercise DynamicField<String, u64> parsing
      const channelCounts = await contract.getActiveChannelsCounts(payer.did);
      
      // Log detailed parsing results for verification
      console.log(`PaymentHub BCS parsing verification:
        Single balance query: ${balance}
        All balances: ${JSON.stringify(allBalances, (key, value) => 
          typeof value === 'bigint' ? value.toString() : value, 2)}
        Channel counts: ${JSON.stringify(channelCounts, null, 2)}`);

      // Verify consistency between single and batch balance queries
      const normalizedAssetId = normalizeAssetId(testAsset.assetId);
      if (allBalances[normalizedAssetId]) {
        expect(balance).toBe(allBalances[normalizedAssetId]);
      }
    });

    it('should handle empty hub gracefully', async () => {
      if (!shouldRunIntegrationTests()) return;

      // Create a new DID that has no PaymentHub yet
      const emptyPayer = await createSelfDid(env, {
        keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
        skipFunding: false
      });

      // Test balance queries on empty hub
      const balance = await contract.getHubBalance(emptyPayer.did, testAsset.assetId);
      expect(balance).toBe(BigInt(0));

      const allBalances = await contract.getAllHubBalances(emptyPayer.did);
      expect(allBalances).toEqual({});

      const channelCounts = await contract.getActiveChannelsCounts(emptyPayer.did);
      expect(channelCounts).toEqual({});

      console.log(`Empty hub handling verified:
        Balance: ${balance}
        All balances: ${JSON.stringify(allBalances)}
        Channel counts: ${JSON.stringify(channelCounts)}`);
    });

    it('should test PaymentHubClient integration', async () => {
      if (!shouldRunIntegrationTests()) return;

      // Create PaymentHubClient instance
      const hubClient = new PaymentHubClient({
        contract,
        signer: payer.signer,
        defaultAssetId: testAsset.assetId,
      });

      // Test deposit using HubClient
      const depositAmount = BigInt(200000000); // 2 RGas
      await hubClient.deposit(testAsset.assetId, depositAmount);

      // Test getBalance using HubClient
      const balance = await hubClient.getBalance();
      expect(balance).toBeGreaterThanOrEqual(depositAmount);

      // Test getAllBalances using HubClient
      const allBalances = await hubClient.getAllBalances();
      expect(Object.keys(allBalances).length).toBeGreaterThan(0);

      // Test hasBalance using HubClient
      const hasEnoughBalance = await hubClient.hasBalance({ requiredAmount: BigInt(100000000) }); // 1 RGas
      expect(hasEnoughBalance).toBe(true);

      const hasInsufficientBalance = await hubClient.hasBalance({ requiredAmount: BigInt(10000000000) }); // 100 RGas
      expect(hasInsufficientBalance).toBe(false);

      // Open a channel to test getActiveChannelsCounts
      await openTestChannel();
      const channelCounts = await hubClient.getActiveChannelsCounts();

      console.log(`PaymentHubClient integration test results:
        Deposit Amount: ${depositAmount}
        Current Balance: ${balance}
        All Balances: ${JSON.stringify(allBalances, (key, value) => 
          typeof value === 'bigint' ? value.toString() : value, 2)}
        Has Enough Balance (1 RGas): ${hasEnoughBalance}
        Has Insufficient Balance (100 RGas): ${hasInsufficientBalance}
        Active Channels Counts: ${JSON.stringify(channelCounts, null, 2)}`);
    });

  });

  describe('Payment Channel Operations', () => {
    
    it('should deposit to payment hub', async () => {
      if (!shouldRunIntegrationTests()) return;

      const depositAmount = BigInt(100000000); // 1 RGas (100M smallest units)

      const depositParams: DepositParams = {
        ownerDid: payer.did,
        assetId: testAsset.assetId,
        amount: depositAmount,
        signer: payer.signer,
      };

      const depositResult = await contract.depositToHub(depositParams);
      
      expect(depositResult).toBeDefined();
      expect(depositResult.txHash).toBeDefined();
      expect(depositResult.txHash.length).toBeGreaterThan(0);
      expect(depositResult.blockHeight).toBeDefined();

      console.log(`Deposit successful:
        Transaction Hash: ${depositResult.txHash}
        Amount: ${depositAmount} (${Number(depositAmount) / 100000000} RGas)
        Block Height: ${depositResult.blockHeight}`);
    });

    it('should open channel with sub-channel in one step', async () => {
      if (!shouldRunIntegrationTests()) return;

      // First fund the payer's hub
      await fundPayerHub();

      const openWithSubChannelParams: OpenChannelWithSubChannelParams = {
        payerDid: payer.did,
        payeeDid: payee.did,
        assetId: testAsset.assetId,
        vmIdFragment: payer.vmIdFragment,
        signer: payer.signer,
      };

      const result = await contract.openChannelWithSubChannel(openWithSubChannelParams);
      
      expect(result).toBeDefined();
      expect(result.channelId).toBeDefined();
      expect(result.txHash).toBeDefined();
      expect(result.txHash.length).toBeGreaterThan(0);
      
      // Store the channel ID for potential use in other tests
      const oneStepChannelId = result.channelId;

      console.log(`Channel opened with sub-channel in one step:
        Channel ID: ${oneStepChannelId}
        Transaction Hash: ${result.txHash}`);

      // Verify the channel was created correctly
      const channelInfo = await contract.getChannelStatus({ channelId: oneStepChannelId });
      expect(channelInfo.payerDid).toBe(payer.did);
      expect(channelInfo.payeeDid).toBe(payee.did);
      expect(channelInfo.status).toBe('active');
      expect(channelInfo.assetId).toBe(normalizeAssetId(testAsset.assetId));

      // Verify the sub-channel was authorized
      const subChannelInfo = await contract.getSubChannel({
        channelId: oneStepChannelId,
        vmIdFragment: payer.vmIdFragment,
      });
      expect(subChannelInfo.vmIdFragment).toBe(payer.vmIdFragment);
      expect(subChannelInfo.publicKey).toBeDefined();
      expect(subChannelInfo.methodType).toBe('EcdsaSecp256k1VerificationKey2019');
      expect(subChannelInfo.lastClaimedAmount).toBe(BigInt(0));
      expect(subChannelInfo.lastConfirmedNonce).toBe(BigInt(0));

      console.log(`Sub-channel automatically authorized:
        VM ID Fragment: ${subChannelInfo.vmIdFragment}
        Public Key: ${subChannelInfo.publicKey}
        Method Type: ${subChannelInfo.methodType}`);
    });

    it('should compare openChannelWithSubChannel vs separate operations', async () => {
      if (!shouldRunIntegrationTests()) return;

      // First fund the payer's hub
      await fundPayerHub();

      // Test 1: Use openChannelWithSubChannel (one transaction)
      const oneStepParams: OpenChannelWithSubChannelParams = {
        payerDid: payer.did,
        payeeDid: payee.did,
        assetId: testAsset.assetId,
        vmIdFragment: payer.vmIdFragment,
        signer: payer.signer,
      };

      const oneStepResult = await contract.openChannelWithSubChannel(oneStepParams);
      const oneStepChannelId = oneStepResult.channelId;

      // Test 2: Use separate openChannel + authorizeSubChannel (two transactions)
      // Create a different payee to avoid channel collision
      const payee2 = await createSelfDid(env, {
        keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
        skipFunding: false
      });

      const separateOpenParams: OpenChannelParams = {
        payerDid: payer.did,
        payeeDid: payee2.did,
        assetId: testAsset.assetId,
        signer: payer.signer,
      };

      const separateOpenResult = await contract.openChannel(separateOpenParams);
      const separateChannelId = separateOpenResult.channelId;

      const authorizeParams: AuthorizeSubChannelParams = {
        channelId: separateChannelId,
        vmIdFragment: payer.vmIdFragment,
        signer: payer.signer,
      };

      const authorizeResult = await contract.authorizeSubChannel(authorizeParams);

      // Compare results: both should have created working channels with authorized sub-channels
      const oneStepChannelInfo = await contract.getChannelStatus({ channelId: oneStepChannelId });
      const separateChannelInfo = await contract.getChannelStatus({ channelId: separateChannelId });

      // Both channels should be active
      expect(oneStepChannelInfo.status).toBe('active');
      expect(separateChannelInfo.status).toBe('active');

      // Both should have authorized sub-channels
      const oneStepSubChannel = await contract.getSubChannel({
        channelId: oneStepChannelId,
        vmIdFragment: payer.vmIdFragment,
      });
      const separateSubChannel = await contract.getSubChannel({
        channelId: separateChannelId,
        vmIdFragment: payer.vmIdFragment,
      });

      expect(oneStepSubChannel.methodType).toBe('EcdsaSecp256k1VerificationKey2019');
      expect(separateSubChannel.methodType).toBe('EcdsaSecp256k1VerificationKey2019');

      console.log(`Comparison results:
        One-step method: 1 transaction (${oneStepResult.txHash})
        Separate method: 2 transactions (${separateOpenResult.txHash}, ${authorizeResult.txHash})
        Both achieve the same end result: active channel with authorized sub-channel`);
    });

    it('should get channel status', async () => {
      if (!shouldRunIntegrationTests()) return;

      // First deposit funds and open a channel
      await fundPayerHub();
      await openTestChannel();

      const statusParams: ChannelStatusParams = {
        channelId: channelId!,
      };

      const channelInfo = await contract.getChannelStatus(statusParams);
      
      expect(channelInfo).toBeDefined();
      expect(channelInfo.channelId).toBe(channelId);
      expect(channelInfo.payerDid).toBe(payer.did);
      expect(channelInfo.payeeDid).toBe(payee.did);
      expect(channelInfo.assetId).toBe(normalizeAssetId(testAsset.assetId));
      expect(channelInfo.status).toBe('active');
      expect(typeof channelInfo.epoch).toBe('bigint');

      console.log(`Channel status retrieved:`, channelInfo);
    });

    it('should get sub-channel info', async () => {
      if (!shouldRunIntegrationTests()) return;

      // First deposit funds, open a channel and authorize sub-channel
      await fundPayerHub();
      await openTestChannel();
      await authorizeTestSubChannel();

      const subChannelParams: SubChannelParams = {
        channelId: channelId!,
        vmIdFragment: payer.vmIdFragment,
      };

      const subChannelInfo = await contract.getSubChannel(subChannelParams);
      
      expect(subChannelInfo).toBeDefined();
      expect(subChannelInfo.vmIdFragment).toBe(payer.vmIdFragment);
      expect(subChannelInfo.publicKey).toBeDefined();
      expect(subChannelInfo.methodType).toBe('EcdsaSecp256k1VerificationKey2019');
      expect(typeof subChannelInfo.lastClaimedAmount).toBe('bigint');
      expect(typeof subChannelInfo.lastConfirmedNonce).toBe('bigint');

      console.log(`Sub-channel info retrieved:`, subChannelInfo);
    });

    it('should claim from channel', async () => {
      if (!shouldRunIntegrationTests()) return;

      // Setup: deposit funds, open channel and authorize sub-channel
      await fundPayerHub();
      await openTestChannel();
      await authorizeTestSubChannel();

      // Get channel info for creating SubRAV
      const channelInfo = await contract.getChannelStatus({ channelId: channelId! });
      
      // Get chain ID from the contract instead of hardcoding
      const chainId = await contract.getChainId();
      
      // Create a SubRAV for claiming
      const claimAmount = BigInt(5000000); // 0.05 RGas (5M smallest units)
      const subRav: SubRAV = {
        version: SUBRAV_VERSION_1,
        chainId: chainId, // Use dynamic chain ID from contract
        channelId: channelId!,
        channelEpoch: channelInfo.epoch,
        vmIdFragment: payer.vmIdFragment,
        accumulatedAmount: claimAmount,
        nonce: BigInt(1),
      };

      // Get the payer's key ID for signing
      const payerKeyIds = await payer.keyManager.listKeyIds();
      const payerKeyId = payerKeyIds[0];
      
      // Sign the SubRAV
      const signedSubRAV = await SubRAVSigner.sign(subRav, payer.keyManager, payerKeyId);

      // Claim from channel (payee should sign the claim transaction)
      const claimParams: ClaimParams = {
        signedSubRAV,
        signer: payee.signer, // Payee signs the claim transaction
      };

      const claimResult = await contract.claimFromChannel(claimParams);
      
      expect(claimResult).toBeDefined();
      expect(claimResult.txHash).toBeDefined();
      expect(claimResult.txHash.length).toBeGreaterThan(0);
      expect(typeof claimResult.claimedAmount).toBe('bigint');
      expect(claimResult.blockHeight).toBeDefined();

      console.log(`Claim successful:
        Transaction Hash: ${claimResult.txHash}
        Claimed Amount: ${claimResult.claimedAmount}
        Block Height: ${claimResult.blockHeight}`);

      // Verify the sub-channel state has been updated
      const updatedSubChannelInfo = await contract.getSubChannel({
        channelId: channelId!,
        vmIdFragment: payer.vmIdFragment,
      });

      // After claiming, the last claimed amount should be updated
      expect(updatedSubChannelInfo.lastClaimedAmount).toBeGreaterThanOrEqual(claimAmount);
      expect(updatedSubChannelInfo.lastConfirmedNonce).toBeGreaterThanOrEqual(BigInt(1));

      console.log(`Updated sub-channel state:
        Last Claimed Amount: ${updatedSubChannelInfo.lastClaimedAmount}
        Last Confirmed Nonce: ${updatedSubChannelInfo.lastConfirmedNonce}`);
    });

    it('should test getHubClient from PaymentChannelClient', async () => {
      if (!shouldRunIntegrationTests()) return;

      // Create PaymentChannelPayerClient
      const payerClient = new PaymentChannelPayerClient({
        contract,
        signer: payer.signer,
      });

      // Get HubClient from PayerClient
      const hubClient = payerClient.getHubClient();
      expect(hubClient).toBeInstanceOf(PaymentHubClient);

      // Test hub operations through the client
      const depositAmount = BigInt(50000000); // 0.5 RGas
      await hubClient.deposit(testAsset.assetId, depositAmount);

      const balance = await hubClient.getBalance();
      expect(balance).toBeGreaterThanOrEqual(depositAmount);

      // Test withdrawal
      const withdrawAmount = BigInt(10000000); // 0.1 RGas
      await hubClient.withdraw(testAsset.assetId, withdrawAmount);

      const balanceAfterWithdraw = await hubClient.getBalance();
      expect(balanceAfterWithdraw).toBeLessThan(balance);

      console.log(`PaymentChannelClient.getHubClient() integration test:
        Deposited: ${depositAmount}
        Balance after deposit: ${balance}
        Withdrew: ${withdrawAmount}
        Balance after withdraw: ${balanceAfterWithdraw}`);
    });
  });

  // Helper functions
  async function fundPayerHub(): Promise<void> {
    const depositAmount = BigInt(1000000000); // 10 RGas (1B smallest units) for testing

    const depositParams: DepositParams = {
      ownerDid: payer.did,
      assetId: testAsset.assetId,
      amount: depositAmount,
      signer: payer.signer,
    };

    const depositResult = await contract.depositToHub(depositParams);
    console.log(`Payment hub funded:
      Amount: ${depositAmount} (${Number(depositAmount) / 100000000} RGas)
      Transaction Hash: ${depositResult.txHash}`);
  }

  async function openTestChannel(): Promise<void> {
    if (channelId) return; // Already opened

    const openParams: OpenChannelParams = {
      payerDid: payer.did,
      payeeDid: payee.did,
      assetId: testAsset.assetId,
      signer: payer.signer,
    };

    const result = await contract.openChannel(openParams);
    channelId = result.channelId;
    console.log(`Channel opened successfully:
      Channel ID: ${channelId}`);
  }

  async function authorizeTestSubChannel(): Promise<void> {
    // Get the payer's public key for authorization
    const payerKeyInfo = await payer.keyManager.getKeyInfo(
      (await payer.keyManager.listKeyIds())[0]
    );
    
    if (!payerKeyInfo) {
      throw new Error('Could not get payer key info');
    }

    const authParams: AuthorizeSubChannelParams = {
      channelId: channelId!,
      vmIdFragment: payer.vmIdFragment,
      signer: payer.signer,
    };

    await contract.authorizeSubChannel(authParams);
  }
}); 