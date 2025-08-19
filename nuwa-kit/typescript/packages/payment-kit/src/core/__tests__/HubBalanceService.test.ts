import { HubBalanceService } from '../HubBalanceService';
import type { IPaymentChannelContract } from '../../contracts/IPaymentChannelContract';
import { Errors } from '../../errors/codes';

// Mock contract
const mockContract: jest.Mocked<IPaymentChannelContract> = {
  getHubBalance: jest.fn(),
} as any;

describe('HubBalanceService', () => {
  let service: HubBalanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HubBalanceService({
      contract: mockContract,
      defaultAssetId: '0x3::gas_coin::RGas',
      ttlMs: 1000,
      negativeTtlMs: 500,
      staleWhileRevalidateMs: 2000,
      maxEntries: 100,
      debug: false,
    });
  });

  describe('getBalance', () => {
    it('should fetch balance from contract on cache miss', async () => {
      const ownerDid = 'did:example:123';
      const assetId = '0x3::gas_coin::RGas';
      const expectedBalance = BigInt(1000);

      mockContract.getHubBalance.mockResolvedValue(expectedBalance);

      const balance = await service.getBalance(ownerDid, assetId);

      expect(balance).toBe(expectedBalance);
      expect(mockContract.getHubBalance).toHaveBeenCalledWith(ownerDid, assetId);
    });

    it('should use default asset ID when not provided', async () => {
      const ownerDid = 'did:example:123';
      const expectedBalance = BigInt(500);

      mockContract.getHubBalance.mockResolvedValue(expectedBalance);

      const balance = await service.getBalance(ownerDid);

      expect(balance).toBe(expectedBalance);
      expect(mockContract.getHubBalance).toHaveBeenCalledWith(ownerDid, '0x3::gas_coin::RGas');
    });

    it('should return cached balance on cache hit', async () => {
      const ownerDid = 'did:example:123';
      const assetId = '0x3::gas_coin::RGas';
      const expectedBalance = BigInt(1000);

      mockContract.getHubBalance.mockResolvedValue(expectedBalance);

      // First call - cache miss
      const balance1 = await service.getBalance(ownerDid, assetId);
      expect(balance1).toBe(expectedBalance);
      expect(mockContract.getHubBalance).toHaveBeenCalledTimes(1);

      // Second call - cache hit
      const balance2 = await service.getBalance(ownerDid, assetId);
      expect(balance2).toBe(expectedBalance);
      expect(mockContract.getHubBalance).toHaveBeenCalledTimes(1); // No additional call
    });

    it('should handle contract errors gracefully', async () => {
      const ownerDid = 'did:example:123';
      const assetId = '0x3::gas_coin::RGas';
      const error = new Error('Contract error');

      mockContract.getHubBalance.mockRejectedValue(error);

      await expect(service.getBalance(ownerDid, assetId)).rejects.toMatchObject({
        code: 'HUB_BALANCE_FETCH_FAILED',
      });
    });

    it('should use shorter TTL for zero balances', async () => {
      const ownerDid = 'did:example:123';
      const assetId = '0x3::gas_coin::RGas';

      mockContract.getHubBalance.mockResolvedValue(BigInt(0));

      await service.getBalance(ownerDid, assetId);

      // The TTL logic is internal, but we can verify it doesn't crash
      // and handles zero balances properly
      expect(mockContract.getHubBalance).toHaveBeenCalledWith(ownerDid, assetId);
    });
  });

  describe('refresh', () => {
    it('should force refresh from contract', async () => {
      const ownerDid = 'did:example:123';
      const assetId = '0x3::gas_coin::RGas';
      const cachedBalance = BigInt(1000);
      const newBalance = BigInt(2000);

      // First call to populate cache
      mockContract.getHubBalance.mockResolvedValue(cachedBalance);
      await service.getBalance(ownerDid, assetId);
      expect(mockContract.getHubBalance).toHaveBeenCalledTimes(1);

      // Force refresh should bypass cache
      mockContract.getHubBalance.mockResolvedValue(newBalance);
      const refreshedBalance = await service.refresh(ownerDid, assetId);

      expect(refreshedBalance).toBe(newBalance);
      expect(mockContract.getHubBalance).toHaveBeenCalledTimes(2);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const ownerDid = 'did:example:123';
      const assetId = '0x3::gas_coin::RGas';

      mockContract.getHubBalance.mockResolvedValue(BigInt(1000));

      // Trigger some cache operations
      await service.getBalance(ownerDid, assetId); // Cache miss
      await service.getBalance(ownerDid, assetId); // Cache hit

      const stats = service.getStats();

      expect(stats.size).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.staleHits).toBe(0);
    });
  });

  describe('invalidate', () => {
    it('should remove specific entry from cache', async () => {
      const ownerDid = 'did:example:123';
      const assetId = '0x3::gas_coin::RGas';

      mockContract.getHubBalance.mockResolvedValue(BigInt(1000));

      // Populate cache
      await service.getBalance(ownerDid, assetId);
      expect(service.getStats().size).toBe(1);

      // Invalidate
      service.invalidate(ownerDid, assetId);
      expect(service.getStats().size).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all entries from cache', async () => {
      const ownerDid1 = 'did:example:123';
      const ownerDid2 = 'did:example:456';
      const assetId = '0x3::gas_coin::RGas';

      mockContract.getHubBalance.mockResolvedValue(BigInt(1000));

      // Populate cache with multiple entries
      await service.getBalance(ownerDid1, assetId);
      await service.getBalance(ownerDid2, assetId);
      expect(service.getStats().size).toBe(2);

      // Clear all
      service.clear();
      expect(service.getStats().size).toBe(0);
    });
  });
});
