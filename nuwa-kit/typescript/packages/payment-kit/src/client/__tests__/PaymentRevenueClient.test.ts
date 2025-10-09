/**
 * PaymentRevenueClient Unit Tests
 *
 * These tests verify the PaymentRevenueClient business logic using mocks,
 * focusing on client-side behavior without blockchain interactions.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { PaymentRevenueClient } from '../PaymentRevenueClient';
import { MockRevenueContract } from '../../test-helpers/mocks';
import type { IPaymentRevenueContract } from '../../contracts/IPaymentRevenueContract';
import type { SignerInterface } from '@nuwa-ai/identity-kit';
import type { RateProvider } from '../../billing/rate/types';

describe('PaymentRevenueClient', () => {
  let revenueClient: PaymentRevenueClient;
  let mockContract: MockRevenueContract;
  let mockSigner: SignerInterface;
  let mockRateProvider: RateProvider;
  const testDid = 'did:rooch:test123';
  const testAssetId = '0x3::gas_coin::RGas';

  beforeEach(() => {
    mockContract = new MockRevenueContract();

    // Create simple mock signer
    mockSigner = {
      getDid: jest.fn<() => Promise<string>>().mockResolvedValue(testDid),
      sign: jest.fn<() => Promise<Uint8Array>>().mockResolvedValue(new Uint8Array([1, 2, 3])),
      getPublicKey: jest
        .fn<() => Promise<Uint8Array>>()
        .mockResolvedValue(new Uint8Array([4, 5, 6])),
    } as any;

    // Create simple mock rate provider
    mockRateProvider = {
      getPricePicoUSD: jest.fn<() => Promise<bigint>>().mockResolvedValue(BigInt(1000000)), // 1 USD in pico-USD
      getAssetInfo: jest.fn<() => Promise<any>>().mockResolvedValue({
        assetId: testAssetId,
        symbol: 'RGas',
        decimals: 8,
      }),
      getLastUpdated: jest.fn<() => number | null>().mockReturnValue(Date.now()),
      clearCache: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as any;

    revenueClient = new PaymentRevenueClient({
      contract: mockContract,
      signer: mockSigner,
      defaultAssetId: testAssetId,
      rateProvider: mockRateProvider,
    });

    // Reset mock state
    mockContract.reset();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with required parameters', () => {
      expect(revenueClient).toBeInstanceOf(PaymentRevenueClient);
    });

    it('should initialize with optional rate provider', () => {
      const clientWithoutRates = new PaymentRevenueClient({
        contract: mockContract,
        signer: mockSigner,
        defaultAssetId: testAssetId,
      });

      expect(clientWithoutRates).toBeInstanceOf(PaymentRevenueClient);
    });

    it('should throw error for invalid constructor parameters', () => {
      expect(() => {
        new PaymentRevenueClient({
          contract: null as any,
          signer: mockSigner,
          defaultAssetId: testAssetId,
        });
      }).toThrow('Contract is required');

      expect(() => {
        new PaymentRevenueClient({
          contract: mockContract,
          signer: null as any,
          defaultAssetId: testAssetId,
        });
      }).toThrow('Signer is required');

      expect(() => {
        new PaymentRevenueClient({
          contract: mockContract,
          signer: mockSigner,
          defaultAssetId: '',
        });
      }).toThrow('Default asset ID is required');
    });
  });

  describe('Revenue Hub Management', () => {
    it('should check revenue hub existence', async () => {
      const exists = await revenueClient.revenueHubExists();
      expect(typeof exists).toBe('boolean');
      expect(exists).toBe(false); // Initially false in mock
    });

    it('should create revenue hub', async () => {
      const result = await revenueClient.createRevenueHub();

      expect(result).toBeDefined();
      expect(result.txHash).toBeDefined();
      expect(typeof result.txHash).toBe('string');

      // Verify hub now exists in mock
      const exists = await revenueClient.revenueHubExists();
      expect(exists).toBe(true);
    });

    it('should ensure revenue hub (lazy creation)', async () => {
      // Initially doesn't exist
      expect(await revenueClient.revenueHubExists()).toBe(false);

      // First call should create it
      await revenueClient.ensureRevenueHub();
      expect(await revenueClient.revenueHubExists()).toBe(true);

      // Second call should not create again (no error)
      await expect(revenueClient.ensureRevenueHub()).resolves.not.toThrow();
    });
  });

  describe('Revenue Balance Queries', () => {
    beforeEach(async () => {
      // Ensure revenue hub exists for balance tests
      await revenueClient.ensureRevenueHub();
    });

    it('should get revenue balance with default asset', async () => {
      const balance = await revenueClient.getRevenueBalance();

      expect(typeof balance).toBe('bigint');
      expect(balance).toBe(BigInt(0)); // Initially zero in mock
    });

    it('should get revenue balance with specific asset', async () => {
      const balance = await revenueClient.getRevenueBalance({
        assetId: '0x1::test_coin::TestCoin',
      });

      expect(typeof balance).toBe('bigint');
      expect(balance).toBe(BigInt(0));
    });

    it('should get revenue balance with USD value', async () => {
      const balanceWithUsd = await revenueClient.getRevenueBalanceWithUsd();

      expect(balanceWithUsd).toBeDefined();
      expect(balanceWithUsd.assetId).toBe(testAssetId);
      expect(typeof balanceWithUsd.balance).toBe('bigint');
      expect(typeof balanceWithUsd.pricePicoUSD).toBe('bigint');
      expect(typeof balanceWithUsd.balancePicoUSD).toBe('bigint');
    });

    it('should get revenue balance with USD for specific asset', async () => {
      const customAssetId = '0x1::test_coin::TestCoin';
      const balanceWithUsd = await revenueClient.getRevenueBalanceWithUsd({
        assetId: customAssetId,
      });

      expect(balanceWithUsd.assetId).toBe(customAssetId);
    });

    it('should get revenue by source type', async () => {
      const revenue = await revenueClient.getRevenueBySource({
        sourceType: 'payment_channel',
      });

      expect(typeof revenue).toBe('bigint');
      expect(revenue).toBe(BigInt(0));
    });

    it('should get revenue by source with custom asset', async () => {
      const customAssetId = '0x1::test_coin::TestCoin';
      const revenue = await revenueClient.getRevenueBySource({
        sourceType: 'staking',
        assetId: customAssetId,
      });

      expect(typeof revenue).toBe('bigint');
      expect(revenue).toBe(BigInt(0));
    });

    it('should check if has sufficient revenue', async () => {
      // Zero requirement should always pass
      const hasZero = await revenueClient.hasRevenue({
        requiredAmount: BigInt(0),
      });
      expect(hasZero).toBe(true);

      // Non-zero requirement should fail with zero balance
      const hasMore = await revenueClient.hasRevenue({
        requiredAmount: BigInt(100),
      });
      expect(hasMore).toBe(false);
    });

    it('should check revenue with custom asset', async () => {
      const hasRevenue = await revenueClient.hasRevenue({
        requiredAmount: BigInt(0),
        assetId: '0x1::test_coin::TestCoin',
      });
      expect(typeof hasRevenue).toBe('boolean');
    });
  });

  describe('Revenue Operations', () => {
    beforeEach(async () => {
      await revenueClient.ensureRevenueHub();
      // Add some mock revenue for withdrawal tests
      mockContract.addRevenueBalance(testDid, testAssetId, BigInt(1000));
    });

    it('should preview withdrawal fees', async () => {
      const amount = BigInt(500);
      const preview = await revenueClient.previewWithdrawal(testAssetId, amount);

      expect(preview).toBeDefined();
      expect(preview.grossAmount).toBe(amount);
      expect(preview.feeAmount).toBe(BigInt(0)); // Mock has no fees
      expect(preview.netAmount).toBe(amount);
      expect(preview.feeRateBps).toBe(0);
    });

    it('should preview withdrawal with default asset', async () => {
      const amount = BigInt(300);
      const preview = await revenueClient.previewWithdrawal(testAssetId, amount);

      expect(preview.grossAmount).toBe(amount);
    });

    it('should withdraw specific amount', async () => {
      const amount = BigInt(200);
      const result = await revenueClient.withdraw(testAssetId, amount);

      expect(result).toBeDefined();
      expect(result.txHash).toBeDefined();
      expect(typeof result.txHash).toBe('string');

      // Verify balance decreased in mock
      const newBalance = await revenueClient.getRevenueBalance();
      expect(newBalance).toBe(BigInt(800)); // 1000 - 200
    });

    it('should withdraw with default asset', async () => {
      const amount = BigInt(100);
      const result = await revenueClient.withdraw(testAssetId, amount);

      expect(result).toBeDefined();
      expect(result.txHash).toBeDefined();
    });

    it('should withdraw all available balance (amount = 0)', async () => {
      const result = await revenueClient.withdraw(testAssetId, BigInt(0));

      expect(result).toBeDefined();
      expect(result.txHash).toBeDefined();

      // Verify all balance was withdrawn
      const newBalance = await revenueClient.getRevenueBalance();
      expect(newBalance).toBe(BigInt(0));
    });

    it('should handle withdrawal of more than available balance', async () => {
      const excessiveAmount = BigInt(2000); // More than available 1000

      await expect(revenueClient.withdraw(testAssetId, excessiveAmount)).rejects.toThrow(
        'Insufficient revenue balance'
      );
    });
  });

  describe('Utility Methods', () => {
    it('should create revenue source with all parameters', () => {
      const source = revenueClient.createRevenueSource(
        'payment_channel',
        'channel_123',
        'Test payment channel revenue'
      );

      expect(source.sourceType).toBe('payment_channel');
      expect(source.sourceId).toBe('channel_123');
      expect(source.description).toBe('Test payment channel revenue');
    });

    it('should create revenue source with default description', () => {
      const source = revenueClient.createRevenueSource('staking');

      expect(source.sourceType).toBe('staking');
      expect(source.sourceId).toBeUndefined();
      expect(source.description).toBe('Revenue from staking');
    });

    it('should create revenue source with custom description', () => {
      const source = revenueClient.createRevenueSource(
        'liquidity_mining',
        undefined,
        'Custom liquidity mining rewards'
      );

      expect(source.sourceType).toBe('liquidity_mining');
      expect(source.sourceId).toBeUndefined();
      expect(source.description).toBe('Custom liquidity mining rewards');
    });
  });

  describe('Error Handling', () => {
    it('should handle contract errors gracefully', async () => {
      // Create a mock contract that throws errors
      const errorContract = {
        ...mockContract,
        revenueHubExists: jest
          .fn<() => Promise<boolean>>()
          .mockRejectedValue(new Error('Network error')),
        createRevenueHub: jest.fn(),
        withdrawRevenue: jest.fn(),
        previewWithdrawalFee: jest.fn(),
        getRevenueBalance: jest.fn(),
        getRevenueBySource: jest.fn(),
      } as unknown as IPaymentRevenueContract;

      const errorClient = new PaymentRevenueClient({
        contract: errorContract,
        signer: mockSigner,
        defaultAssetId: testAssetId,
      });

      await expect(errorClient.revenueHubExists()).rejects.toThrow('Network error');
    });

    it('should handle signer errors', async () => {
      const errorSigner = {
        ...mockSigner,
        getDid: jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Signer error')),
      } as SignerInterface;

      const errorClient = new PaymentRevenueClient({
        contract: mockContract,
        signer: errorSigner,
        defaultAssetId: testAssetId,
      });

      await expect(errorClient.revenueHubExists()).rejects.toThrow('Signer error');
    });

    it('should handle rate provider errors gracefully', async () => {
      const errorRateProvider = {
        ...mockRateProvider,
        getPricePicoUSD: jest
          .fn<() => Promise<bigint>>()
          .mockRejectedValue(new Error('Rate error')),
      } as RateProvider;

      const errorClient = new PaymentRevenueClient({
        contract: mockContract,
        signer: mockSigner,
        defaultAssetId: testAssetId,
        rateProvider: errorRateProvider,
      });

      await errorClient.ensureRevenueHub();

      // Should still work but without USD conversion
      await expect(errorClient.getRevenueBalanceWithUsd()).rejects.toThrow('Rate error');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle typical revenue lifecycle', async () => {
      // 1. Create revenue hub
      await revenueClient.createRevenueHub();
      expect(await revenueClient.revenueHubExists()).toBe(true);

      // 2. Initially no revenue
      expect(await revenueClient.getRevenueBalance()).toBe(BigInt(0));
      expect(await revenueClient.hasRevenue({ requiredAmount: BigInt(1) })).toBe(false);

      // 3. Add some revenue (simulating earning)
      mockContract.addRevenueBalance(testDid, testAssetId, BigInt(500), 'payment_channel');

      // 4. Check updated balance
      expect(await revenueClient.getRevenueBalance()).toBe(BigInt(500));
      expect(await revenueClient.hasRevenue({ requiredAmount: BigInt(100) })).toBe(true);

      // 5. Check revenue by source
      const channelRevenue = await revenueClient.getRevenueBySource({
        sourceType: 'payment_channel',
      });
      expect(channelRevenue).toBe(BigInt(500));

      // 6. Preview withdrawal
      const preview = await revenueClient.previewWithdrawal(testAssetId, BigInt(200));
      expect(preview.netAmount).toBe(BigInt(200));

      // 7. Withdraw partial amount
      await revenueClient.withdraw(testAssetId, BigInt(200));
      expect(await revenueClient.getRevenueBalance()).toBe(BigInt(300));

      // 8. Withdraw remaining
      await revenueClient.withdraw(testAssetId, BigInt(0)); // Withdraw all
      expect(await revenueClient.getRevenueBalance()).toBe(BigInt(0));
    });

    it('should handle multiple asset types', async () => {
      await revenueClient.ensureRevenueHub();

      const asset1 = '0x1::coin1::Coin1';
      const asset2 = '0x2::coin2::Coin2';

      // Add revenue for different assets
      mockContract.addRevenueBalance(testDid, asset1, BigInt(100));
      mockContract.addRevenueBalance(testDid, asset2, BigInt(200));

      // Check balances
      expect(await revenueClient.getRevenueBalance({ assetId: asset1 })).toBe(BigInt(100));
      expect(await revenueClient.getRevenueBalance({ assetId: asset2 })).toBe(BigInt(200));

      // Withdraw from specific assets
      await revenueClient.withdraw(asset1, BigInt(50));
      expect(await revenueClient.getRevenueBalance({ assetId: asset1 })).toBe(BigInt(50));
      expect(await revenueClient.getRevenueBalance({ assetId: asset2 })).toBe(BigInt(200)); // Unchanged
    });

    it('should handle multiple revenue sources', async () => {
      await revenueClient.ensureRevenueHub();

      // Add revenue from different sources
      mockContract.addRevenueBalance(testDid, testAssetId, BigInt(100), 'payment_channel');
      mockContract.addRevenueBalance(testDid, testAssetId, BigInt(50), 'staking');
      mockContract.addRevenueBalance(testDid, testAssetId, BigInt(25), 'liquidity_mining');

      // Check total balance
      expect(await revenueClient.getRevenueBalance()).toBe(BigInt(175));

      // Check revenue by source
      expect(await revenueClient.getRevenueBySource({ sourceType: 'payment_channel' })).toBe(
        BigInt(100)
      );
      expect(await revenueClient.getRevenueBySource({ sourceType: 'staking' })).toBe(BigInt(50));
      expect(await revenueClient.getRevenueBySource({ sourceType: 'liquidity_mining' })).toBe(
        BigInt(25)
      );
    });
  });
});
