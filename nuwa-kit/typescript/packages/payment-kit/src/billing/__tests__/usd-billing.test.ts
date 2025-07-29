import { describe, test, expect, beforeEach } from '@jest/globals';
import { UsdBillingEngine } from '../usd-engine';
import { ContractRateProvider } from '../rate/contract';
import type { IPaymentChannelContract } from '../../contracts/IPaymentChannelContract';
import type { AssetInfo } from '../../core/types';
import type { BillingContext } from '../types';

// Mock contract implementation
class MockContract implements Partial<IPaymentChannelContract> {
  async getAssetPrice(assetId: string): Promise<bigint> {
    // Simulate RGAS price: 1 smallest unit = 100 picoUSD
    if (assetId === '0x3::gas_coin::RGas') {
      return BigInt(100); // 100 picoUSD per smallest RGAS unit
    }
    throw new Error(`Unsupported asset: ${assetId}`);
  }

  async getAssetInfo(assetId: string): Promise<AssetInfo> {
    if (assetId === '0x3::gas_coin::RGas') {
      return {
        assetId,
        decimals: 8,
        symbol: 'RGAS',
        name: 'Rooch Gas Token'
      };
    }
    throw new Error(`Unsupported asset: ${assetId}`);
  }

  async getChainId(): Promise<bigint> {
    return BigInt(4); // Test chain ID
  }
}

// Mock config loader
class MockConfigLoader {
  async load(serviceId: string) {
    return {
      version: 1,
      serviceId,
      rules: [
                {
           id: 'echo-pricing',
           when: { 
             operation: 'get:/v1/echo'
           },
           strategy: {
             type: 'PerRequest',
             price: '1000000000' // 0.001 USD in picoUSD
           }
         },
         {
           id: 'process-pricing', 
           when: { 
             operation: 'post:/v1/process'
           },
           strategy: {
             type: 'PerRequest',
             price: '10000000000' // 0.01 USD in picoUSD
           }
         },
        {
          id: 'default-pricing',
          default: true,
          strategy: {
            type: 'PerRequest',
            price: '500000000' // 0.0005 USD in picoUSD
          }
        }
      ]
    };
  }
}

describe('USD Billing with Token Settlement', () => {
  let engine: UsdBillingEngine;
  let mockContract: MockContract;
  let rateProvider: ContractRateProvider;

  beforeEach(() => {
    mockContract = new MockContract();
    rateProvider = new ContractRateProvider(
      mockContract as IPaymentChannelContract,
      1000 // Short cache for testing
    );
    
    engine = new UsdBillingEngine(
      new MockConfigLoader(),
      rateProvider
    );
  });

  test('calculates USD cost and converts to RGAS tokens', async () => {
    const context: BillingContext = {
      serviceId: 'test-service',
      operation: 'get:/v1/echo',
      assetId: '0x3::gas_coin::RGas',
      meta: {
        operation: 'get:/v1/echo'
      }
    };

    // Calculate cost with full conversion details
    const result = await engine.calcCostWithDetails(context);

    // Verify conversion
    expect(result.usdCost).toBe(BigInt('1000000000')); // 0.001 USD in picoUSD
    expect(result.assetCost).toBe(BigInt('10000000')); // 10,000,000 RGAS units (0.1 RGAS)
    expect(result.priceUsed).toBe(BigInt(100)); // 100 picoUSD per smallest unit
    expect(result.assetId).toBe('0x3::gas_coin::RGas');
    expect(result.rateProvider).toBe('rate-provider');
  });

  test('calculates higher cost for process operation', async () => {
    const context: BillingContext = {
      serviceId: 'test-service', 
      operation: 'post:/v1/process',
      assetId: '0x3::gas_coin::RGas',
      meta: {
        operation: 'post:/v1/process'
      }
    };

    const result = await engine.calcCostWithDetails(context);

    // Verify conversion
    expect(result.usdCost).toBe(BigInt('10000000000')); // 0.01 USD in picoUSD
    expect(result.assetCost).toBe(BigInt('100000000')); // 100,000,000 RGAS units (1.0 RGAS)
    expect(result.priceUsed).toBe(BigInt(100));
  });

  test('handles free operations correctly', async () => {
    const context: BillingContext = {
      serviceId: 'test-service',
      operation: 'get:/health',
      assetId: '0x3::gas_coin::RGas', 
      meta: {
        operation: 'get:/health'
      }
    };

    // Mock health endpoint as free
    const mockConfigLoaderFree = {
      async load() {
        return {
          version: 1,
          serviceId: 'test-service',
          rules: [
            {
              id: 'health-free',
              when: { operation: 'get:/health' },
              strategy: { type: 'PerRequest', price: '0' }
            }
          ]
        };
      }
    };

    const freeEngine = new UsdBillingEngine(
      mockConfigLoaderFree,
      rateProvider
    );

    const result = await freeEngine.calcCostWithDetails(context);

    expect(result.usdCost).toBe(BigInt(0));
    expect(result.assetCost).toBe(BigInt(0));
  });

  test('rate provider caches prices correctly', async () => {
    const assetId = '0x3::gas_coin::RGas';
    
    // First call should hit the contract
    const price1 = await rateProvider.getPricePicoUSD(assetId);
    expect(price1).toBe(BigInt(100));

    // Second call should use cache
    const price2 = await rateProvider.getPricePicoUSD(assetId);
    expect(price2).toBe(BigInt(100));

    // Verify asset info is also cached
    const assetInfo = await rateProvider.getAssetInfo(assetId);
    expect(assetInfo?.symbol).toBe('RGAS');
    expect(assetInfo?.decimals).toBe(8);
  });

  test('simple calcCost returns only asset cost', async () => {
    const context: BillingContext = {
      serviceId: 'test-service',
      operation: 'get:/v1/echo', 
      assetId: '0x3::gas_coin::RGas',
      meta: {
        operation: 'get:/v1/echo'
      }
    };

    const cost = await engine.calcCost(context);
    expect(cost).toBe(BigInt('10000000')); // Only the asset cost
  });

  test('rounds up partial units correctly', async () => {
    // Create a context that results in fractional units
    const mockConfigLoaderFractional = {
      async load() {
        return {
          version: 1,
          serviceId: 'test-service',
          rules: [{
            id: 'fractional-pricing',
            default: true,
            strategy: { type: 'PerRequest', price: '150' } // 150 picoUSD
          }]
        };
      }
    };

    const fractionalEngine = new UsdBillingEngine(
      mockConfigLoaderFractional,
      rateProvider
    );

    const context: BillingContext = {
      serviceId: 'test-service',
      operation: 'test',
      assetId: '0x3::gas_coin::RGas',
      meta: {
        operation: 'test'
      }
    };

    const result = await fractionalEngine.calcCostWithDetails(context);
    
    // 150 picoUSD / 100 picoUSD per unit = 1.5 units, should round up to 2
    expect(result.assetCost).toBe(BigInt(2));
  });
}); 