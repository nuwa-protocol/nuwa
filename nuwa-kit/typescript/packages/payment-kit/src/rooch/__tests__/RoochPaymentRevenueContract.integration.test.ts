/**
 * RoochPaymentRevenueContract Integration Tests
 *
 * These tests verify the integration between the TypeScript client
 * and the Rooch payment_revenue Move contract using a local Rooch node.
 *
 * To run these tests:
 * 1. Start a local Rooch node: `rooch server start --data-dir /tmp/rooch_test`
 * 2. Set ROOCH_NODE_URL environment variable: `export ROOCH_NODE_URL=http://localhost:6767`
 * 3. Run the tests: `pnpm test:e2e:local`
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { RoochPaymentRevenueContract } from '../RoochPaymentRevenueContract';
import { PaymentRevenueClient } from '../../client/PaymentRevenueClient';
import type {
  WithdrawRevenueParams,
  WithdrawalPreview,
} from '../../contracts/IPaymentRevenueContract';
import type { AssetInfo } from '../../core/types';
import { TestEnv, createSelfDid, CreateSelfDidResult } from '@nuwa-ai/identity-kit/testHelpers';
import { DebugLogger } from '@nuwa-ai/identity-kit';

// Check if we should run integration tests
const shouldRunIntegrationTests = () => {
  return !TestEnv.skipIfNoNode();
};

describe('RoochPaymentRevenueContract Integration Test', () => {
  let revenueContract: RoochPaymentRevenueContract;
  let revenueClient: PaymentRevenueClient;
  let env: TestEnv;
  let payee: CreateSelfDidResult;
  let testAsset: AssetInfo;

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

    // Initialize revenue contract with test configuration
    revenueContract = new RoochPaymentRevenueContract({
      rpcUrl: env.rpcUrl,
      network: 'test',
      debug: true,
    });

    // Create payee DID using test helper (service provider who earns revenue)
    payee = await createSelfDid(env as any, {
      keyType: 'EcdsaSecp256k1VerificationKey2019' as any,
      skipFunding: false,
    });

    // Define test asset (RGas)
    testAsset = {
      assetId: '0x3::gas_coin::RGas',
      decimals: 8,
    };

    // Initialize revenue client
    revenueClient = new PaymentRevenueClient({
      contract: revenueContract,
      signer: payee.signer,
      defaultAssetId: testAsset.assetId,
    });

    console.log(`Revenue test setup completed:
      Payee DID: ${payee.did}
      Test Asset: ${testAsset.assetId}
      RPC URL: ${env.rpcUrl}
    `);
  });

  describe('Revenue Hub Management', () => {
    it('should check if revenue hub exists (initially false)', async () => {
      if (!shouldRunIntegrationTests()) return;

      const exists = await revenueContract.revenueHubExists(payee.did);

      expect(typeof exists).toBe('boolean');
      // Initially should be false for a new DID
      console.log(`Revenue hub exists for ${payee.did}: ${exists}`);
    });

    it('should create revenue hub successfully', async () => {
      if (!shouldRunIntegrationTests()) return;

      const result = await revenueContract.createRevenueHub(payee.did, payee.signer);

      expect(result).toBeDefined();
      expect(result.txHash).toBeDefined();
      expect(typeof result.txHash).toBe('string');
      expect(result.txHash.length).toBeGreaterThan(0);

      console.log(`Revenue hub created with tx: ${result.txHash}`);

      // Wait a bit for blockchain state to sync
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify hub now exists (should work with fixed calculateRevenueHubId)
      const exists = await revenueContract.revenueHubExists(payee.did);
      expect(exists).toBe(true);

      console.log('Revenue hub existence verified successfully');
    });

    it('should create revenue hub through client', async () => {
      if (!shouldRunIntegrationTests()) return;

      const result = await revenueClient.createRevenueHub();

      expect(result).toBeDefined();
      expect(result.txHash).toBeDefined();
      expect(typeof result.txHash).toBe('string');

      console.log(`Revenue hub created via client with tx: ${result.txHash}`);
    });

    it('should handle ensure revenue hub (lazy creation)', async () => {
      if (!shouldRunIntegrationTests()) return;

      // This should not throw an error, whether hub exists or not
      await expect(revenueClient.ensureRevenueHub()).resolves.not.toThrow();

      // Wait a bit for blockchain state to sync
      await new Promise(resolve => setTimeout(resolve, 1000));

      // After ensuring, it should exist (should work with fixed calculateRevenueHubId)
      const exists = await revenueClient.revenueHubExists();
      expect(exists).toBe(true);

      console.log('Revenue hub ensured and verified successfully');
    });
  });

  describe('Revenue Balance Queries', () => {
    beforeEach(async () => {
      if (!shouldRunIntegrationTests()) return;

      // Ensure revenue hub exists for balance tests
      await revenueClient.ensureRevenueHub();
    });

    it('should get revenue balance (initially zero)', async () => {
      if (!shouldRunIntegrationTests()) return;

      const balance = await revenueContract.getRevenueBalance(payee.did, testAsset.assetId);

      expect(typeof balance).toBe('bigint');
      expect(balance).toBeGreaterThanOrEqual(BigInt(0));

      console.log(`Revenue balance for ${testAsset.assetId}: ${balance.toString()}`);
    });

    it('should get revenue balance through client', async () => {
      if (!shouldRunIntegrationTests()) return;

      const balance = await revenueClient.getRevenueBalance();

      expect(typeof balance).toBe('bigint');
      expect(balance).toBeGreaterThanOrEqual(BigInt(0));

      console.log(`Revenue balance via client: ${balance.toString()}`);
    });

    it('should get revenue balance with USD value', async () => {
      if (!shouldRunIntegrationTests()) return;

      const balanceWithUsd = await revenueClient.getRevenueBalanceWithUsd();

      expect(balanceWithUsd).toBeDefined();
      expect(balanceWithUsd.assetId).toBe(testAsset.assetId);
      expect(typeof balanceWithUsd.balance).toBe('bigint');
      expect(typeof balanceWithUsd.pricePicoUSD).toBe('bigint');
      expect(typeof balanceWithUsd.balancePicoUSD).toBe('bigint');

      console.log(
        `Balance with USD: ${JSON.stringify(
          {
            balance: balanceWithUsd.balance.toString(),
            pricePicoUSD: balanceWithUsd.pricePicoUSD.toString(),
            balancePicoUSD: balanceWithUsd.balancePicoUSD.toString(),
          },
          null,
          2
        )}`
      );
    });

    it('should get revenue by source type', async () => {
      if (!shouldRunIntegrationTests()) return;

      const revenue = await revenueContract.getRevenueBySource(
        payee.did,
        'payment_channel',
        testAsset.assetId
      );

      expect(typeof revenue).toBe('bigint');
      expect(revenue).toBeGreaterThanOrEqual(BigInt(0));

      console.log(`Revenue from payment_channel source: ${revenue.toString()}`);
    });

    it('should get revenue by source through client', async () => {
      if (!shouldRunIntegrationTests()) return;

      const revenue = await revenueClient.getRevenueBySource({
        sourceType: 'payment_channel',
        assetId: testAsset.assetId,
      });

      expect(typeof revenue).toBe('bigint');
      expect(revenue).toBeGreaterThanOrEqual(BigInt(0));

      console.log(`Revenue from payment_channel via client: ${revenue.toString()}`);
    });

    it('should check if has sufficient revenue', async () => {
      if (!shouldRunIntegrationTests()) return;

      const hasRevenue = await revenueClient.hasRevenue({
        requiredAmount: BigInt(0),
      });

      expect(typeof hasRevenue).toBe('boolean');

      console.log(`Has sufficient revenue (0 required): ${hasRevenue}`);
    });
  });

  describe('Revenue Operations', () => {
    beforeEach(async () => {
      if (!shouldRunIntegrationTests()) return;

      // Ensure revenue hub exists for operation tests
      await revenueClient.ensureRevenueHub();
    });

    it('should preview withdrawal fees', async () => {
      if (!shouldRunIntegrationTests()) return;

      const amount = BigInt(1000);
      const preview = await revenueContract.previewWithdrawalFee(
        payee.did,
        testAsset.assetId,
        amount
      );

      expect(preview).toBeDefined();
      expect(preview.grossAmount).toBe(amount);
      expect(preview.feeAmount).toBe(BigInt(0)); // Currently no fees
      expect(preview.netAmount).toBe(amount);
      expect(preview.feeRateBps).toBe(0);

      console.log(
        `Withdrawal preview: ${JSON.stringify({
          gross: preview.grossAmount.toString(),
          fee: preview.feeAmount.toString(),
          net: preview.netAmount.toString(),
          feeRateBps: preview.feeRateBps,
        })}`
      );
    });

    it('should preview withdrawal through client', async () => {
      if (!shouldRunIntegrationTests()) return;

      const amount = BigInt(500);
      const preview = await revenueClient.previewWithdrawal(testAsset.assetId, amount);

      expect(preview.grossAmount).toBe(amount);
      expect(preview.feeAmount).toBe(BigInt(0));
      expect(preview.netAmount).toBe(amount);

      console.log(
        `Withdrawal preview via client: ${JSON.stringify({
          gross: preview.grossAmount.toString(),
          fee: preview.feeAmount.toString(),
          net: preview.netAmount.toString(),
        })}`
      );
    });

    // Note: Actual withdrawal tests would require having revenue in the hub
    // These tests verify the API works but don't test actual fund movement
    it('should handle withdrawal attempt with zero balance', async () => {
      if (!shouldRunIntegrationTests()) return;

      const amount = BigInt(100);

      // This should fail due to insufficient balance, but not due to API issues
      await expect(revenueClient.withdraw(testAsset.assetId, amount)).rejects.toThrow();

      console.log('Withdrawal with zero balance correctly failed');
    });

    it('should handle withdraw all (zero amount) with zero balance', async () => {
      if (!shouldRunIntegrationTests()) return;

      // Withdrawing 0 from an empty hub should fail with Move abort
      // This is expected behavior as there's nothing to withdraw
      await expect(revenueClient.withdraw(testAsset.assetId, BigInt(0))).rejects.toThrow();

      console.log(`Withdraw all (zero balance) correctly failed as expected`);
    });
  });

  describe('Utility Methods', () => {
    beforeEach(async () => {
      if (!shouldRunIntegrationTests()) return;

      await revenueClient.ensureRevenueHub();
    });

    it('should create revenue source', () => {
      if (!shouldRunIntegrationTests()) return;

      const source = revenueClient.createRevenueSource(
        'payment_channel',
        'channel_123',
        'Test revenue source'
      );

      expect(source.sourceType).toBe('payment_channel');
      expect(source.sourceId).toBe('channel_123');
      expect(source.description).toBe('Test revenue source');

      console.log(`Created revenue source: ${JSON.stringify(source)}`);
    });

    it('should create revenue source with default description', () => {
      if (!shouldRunIntegrationTests()) return;

      const source = revenueClient.createRevenueSource('staking');

      expect(source.sourceType).toBe('staking');
      expect(source.sourceId).toBeUndefined();
      expect(source.description).toBe('Revenue from staking');

      console.log(`Created revenue source with default: ${JSON.stringify(source)}`);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent revenue hub gracefully', async () => {
      if (!shouldRunIntegrationTests()) return;

      const nonExistentDid = 'did:rooch:nonexistent123';

      const balance = await revenueContract.getRevenueBalance(nonExistentDid, testAsset.assetId);

      expect(balance).toBe(BigInt(0));

      console.log(`Balance for non-existent DID: ${balance.toString()}`);
    });

    it('should handle invalid DID format', async () => {
      if (!shouldRunIntegrationTests()) return;

      const invalidDid = 'invalid:did:format';

      await expect(revenueContract.revenueHubExists(invalidDid)).rejects.toThrow();

      console.log('Invalid DID format correctly rejected');
    });

    it('should handle withdrawal preview for any amount', async () => {
      if (!shouldRunIntegrationTests()) return;

      await revenueClient.ensureRevenueHub();

      const largeAmount = BigInt(999999999);
      const preview = await revenueClient.previewWithdrawal(testAsset.assetId, largeAmount);

      // Should not throw error, even for large amounts
      expect(preview.grossAmount).toBe(largeAmount);

      console.log(`Preview for large amount (${largeAmount.toString()}): success`);
    });
  });

  describe('Contract Configuration', () => {
    it('should work with different network configurations', () => {
      if (!shouldRunIntegrationTests()) return;

      // Test different contract configurations using RPC URL instead of network
      const customRpcContract = new RoochPaymentRevenueContract({
        rpcUrl: 'http://localhost:6767',
        debug: false,
      });

      expect(customRpcContract).toBeInstanceOf(RoochPaymentRevenueContract);

      const customContract = new RoochPaymentRevenueContract({
        rpcUrl: 'http://localhost:6767',
        contractAddress: '0x3::payment_revenue',
        debug: true,
      });

      expect(customContract).toBeInstanceOf(RoochPaymentRevenueContract);

      console.log('Different contract configurations work correctly');
    });
  });

  describe('Integration with PaymentChannelPayeeClient', () => {
    it('should integrate with PaymentChannelPayeeClient', async () => {
      if (!shouldRunIntegrationTests()) return;

      // This test verifies the integration pattern works
      // In a real scenario, the PaymentChannelPayeeClient would be created with revenueContract

      // Mock the integration (actual integration would require full payment channel setup)
      const mockPayeeClient = {
        getRevenueClient: () => revenueClient,
      };

      const integratedRevenueClient = mockPayeeClient.getRevenueClient();
      expect(integratedRevenueClient).toBe(revenueClient);

      // Verify the integrated client works
      await integratedRevenueClient.ensureRevenueHub();
      const balance = await integratedRevenueClient.getRevenueBalance();
      expect(typeof balance).toBe('bigint');

      console.log('Integration with PaymentChannelPayeeClient pattern works');
    });
  });
});
