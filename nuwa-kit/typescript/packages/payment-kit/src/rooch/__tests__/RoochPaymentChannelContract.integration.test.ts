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
} from '../../contracts/IPaymentChannelContract';
import { AssetInfo, SignedSubRAV, SubRAV } from '../../core/types';
import { TestEnv, createSelfDid, CreateSelfDidResult } from '@nuwa-ai/identity-kit/testHelpers';
import { DebugLogger, MultibaseCodec } from '@nuwa-ai/identity-kit';

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
  let channelId: string;

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

  });

  describe('Payment Channel Operations', () => {
    
    it('should get channel status', async () => {
      if (!shouldRunIntegrationTests()) return;

      // First open a channel
      await openTestChannel();

      const statusParams: ChannelStatusParams = {
        channelId,
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

  //   it('should authorize a sub-channel', async () => {
  //     if (!shouldRunIntegrationTests()) return;

  //     // First open a channel
  //     await openTestChannel();

  //     const authParams: AuthorizeSubChannelParams = {
  //       channelId,
  //       vmIdFragment,
  //       signer: payer.signer,
  //     };

  //     const result = await contract.authorizeSubChannel(authParams);
      
  //     expect(result).toBeDefined();
  //     expect(result.txHash).toBeDefined();
  //     expect(typeof result.txHash).toBe('string');

  //     console.log(`Sub-channel authorized:
  //       VM ID Fragment: ${vmIdFragment}
  //       TX Hash: ${result.txHash}`);
  //   });

  //   it('should get sub-channel info', async () => {
  //     if (!shouldRunIntegrationTests()) return;

  //     // First open a channel and authorize sub-channel
  //     await openTestChannel();
  //     await authorizeTestSubChannel();

  //     const subChannelParams: SubChannelParams = {
  //       channelId,
  //       vmIdFragment: payer.vmIdFragment,
  //     };

  //     const subChannelInfo = await contract.getSubChannel(subChannelParams);
      
  //     expect(subChannelInfo).toBeDefined();
  //     expect(subChannelInfo.vmIdFragment).toBe(payer.vmIdFragment);
  //     expect(subChannelInfo.publicKey).toBeDefined();
  //     expect(subChannelInfo.methodType).toBe('EcdsaSecp256k1VerificationKey2019');
  //     expect(typeof subChannelInfo.lastClaimedAmount).toBe('bigint');
  //     expect(typeof subChannelInfo.lastConfirmedNonce).toBe('bigint');

  //     console.log(`Sub-channel info retrieved:`, subChannelInfo);
  //   });
  });

  // Helper functions
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
      channelId,
      vmIdFragment: payer.vmIdFragment,
      signer: payer.signer,
    };

    await contract.authorizeSubChannel(authParams);
  }
}); 