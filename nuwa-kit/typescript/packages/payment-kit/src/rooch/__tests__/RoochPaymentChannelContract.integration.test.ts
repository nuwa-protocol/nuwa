import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { RoochPaymentChannelContract } from '../RoochPaymentChannelContract';
import { 
  ChannelInfo, 
  SubChannelInfo,
  OpenChannelParams,
  AuthorizeSubChannelParams,
  ClaimParams,
  CloseParams,
  ChannelStatusParams,
  SubChannelParams,
  DepositToHubParams,
} from '../../contracts/IPaymentChannelContract';
import { AssetInfo, SignedSubRAV, SubRAV } from '../../core/types';
import { TestEnv, createSelfDid, CreateSelfDidResult } from '@nuwa-ai/identity-kit/testHelpers';
import { DebugLogger, MultibaseCodec, parseDid } from '@nuwa-ai/identity-kit';
import { SubRAVSigner, SUBRAV_VERSION_1 } from '../../core/subrav';

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
      expect(assetInfo.assetId).toBe(testAsset.assetId);
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

  describe('Payment Channel Operations', () => {
    
    it('should deposit to payment hub', async () => {
      if (!shouldRunIntegrationTests()) return;

      const depositAmount = BigInt(100000000); // 1 RGas (100M smallest units)

      const depositParams: DepositToHubParams = {
        targetDid: payer.did,
        asset: testAsset,
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
      expect(channelInfo.asset.assetId).toBe(contract.normalizeAssetId(testAsset.assetId));
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
  });

  // Helper functions
  async function fundPayerHub(): Promise<void> {
    const depositAmount = BigInt(1000000000); // 10 RGas (1B smallest units) for testing

    const depositParams: DepositToHubParams = {
      targetDid: payer.did,
      asset: testAsset,
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
      asset: testAsset,
      collateral: BigInt(1000000),
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