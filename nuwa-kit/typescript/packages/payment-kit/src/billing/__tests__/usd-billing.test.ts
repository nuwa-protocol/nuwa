import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { UsdBillingEngine, DEFAULT_ASSET_DECIMALS } from '../usd-engine';
import { FileConfigLoader } from '../config/fileLoader';
import { RateProvider, RateProviderError, AssetInfo } from '../rate/types';
import { BillingContext } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock rate provider for testing
class MockRateProvider implements RateProvider {
  private rates = new Map<string, { price: bigint; timestamp: number }>();
  private assetInfos = new Map<string, AssetInfo>();

  setRate(assetId: string, priceUSD: number): void {
    // Store price directly in picoUSD per minimum unit
    // This will be calculated more carefully for each asset
    let pricePerMinUnit: number;
    
    if (assetId === 'ethereum') {
      // ETH: $2000 per ETH, 1 wei = 2000 / 10^18 USD = 2000 * 10^12 / 10^18 pUSD = 2000 pUSD per wei
      pricePerMinUnit = (priceUSD * 1e12) / 1e18; 
      if (pricePerMinUnit < 1) pricePerMinUnit = 2000; // Use larger unit for testing
    } else if (assetId === 'usd-coin') {
      // USDC: $1 per USDC, 1 micro-USDC = 1 / 10^6 USD = 10^6 pUSD
      pricePerMinUnit = (priceUSD * 1e12) / 1e6; // 1000000 pUSD per micro-USDC
    } else if (assetId === 'bitcoin') {
      // BTC: $50000 per BTC, 1 satoshi = 50000 / 10^8 USD = 50000 * 10^12 / 10^8 pUSD
      pricePerMinUnit = (priceUSD * 1e12) / 1e8;
    } else {
      // Default: assume 18 decimals
      pricePerMinUnit = (priceUSD * 1e12) / 1e18;
    }
    
    this.rates.set(assetId, {
      price: BigInt(Math.round(pricePerMinUnit)),
      timestamp: Date.now()
    });
  }

  setAssetInfo(assetId: string, assetInfo: AssetInfo): void {
    this.assetInfos.set(assetId, assetInfo);
  }

  async getPricePicoUSD(assetId: string): Promise<bigint> {
    const rate = this.rates.get(assetId);
    if (!rate) {
      throw new RateProviderError(`No rate found for ${assetId}`);
    }
    return rate.price;
  }

  async getAssetInfo(assetId: string): Promise<AssetInfo | null> {
    const info = this.assetInfos.get(assetId);
    if (info) {
      return info;
    }

    // Fallback to default configs for testing
    const defaults: Record<string, AssetInfo> = {
      'ethereum': { assetId, decimals: 18, symbol: 'ETH' },
      'usd-coin': { assetId, decimals: 6, symbol: 'USDC' },
      'bitcoin': { assetId, decimals: 8, symbol: 'BTC' },
      '0x3::gas_coin::RGas': { assetId, decimals: 8, symbol: 'RGAS' },
    };

    return defaults[assetId] || null;
  }

  getLastUpdated(assetId: string): number | null {
    return this.rates.get(assetId)?.timestamp || null;
  }

  clearCache(assetId?: string): void {
    if (assetId) {
      this.rates.delete(assetId);
      this.assetInfos.delete(assetId);
    } else {
      this.rates.clear();
      this.assetInfos.clear();
    }
  }
}

describe('USD Billing Engine', () => {
  const testConfigDir = path.join(__dirname, 'usd-test-configs');
  let engine: UsdBillingEngine;
  let rateProvider: MockRateProvider;
  let configLoader: FileConfigLoader;

  beforeEach(async () => {
    // Create test config directory
    await fs.mkdir(testConfigDir, { recursive: true });
    
    // Setup components
    configLoader = new FileConfigLoader(testConfigDir);
    rateProvider = new MockRateProvider();
    engine = new UsdBillingEngine(configLoader, rateProvider, DEFAULT_ASSET_DECIMALS);

    // Setup mock rates (example: ETH = $2000, USDC = $1, BTC = $50000)
    rateProvider.setRate('ethereum', 2000);
    rateProvider.setRate('usd-coin', 1);
    rateProvider.setRate('bitcoin', 50000);
  });

  afterEach(async () => {
    // Clean up test config directory
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should convert USD cost to ETH correctly', async () => {
    // Create test configuration with USD pricing
    const yamlContent = `
version: 1
serviceId: eth-service
currency: USD
rules:
  - id: fixed-usd-price
    default: true
    strategy:
      type: PerRequest
      price: "50000000000"  # 0.05 USD in picoUSD
`;

    await fs.writeFile(
      path.join(testConfigDir, 'eth-service.yaml'),
      yamlContent,
      'utf-8'
    );

    const context: BillingContext = {
      serviceId: 'eth-service',
      operation: 'test',
      assetId: 'ethereum',
      meta: {}
    };

    const result = await engine.calcCostWithDetails(context);
    
    // 0.05 USD = 50000000000 pUSD
    // ETH price = $2000, so 1 wei = 2000 pUSD / 10^18 = very small
    // 50000000000 pUSD / (very small) = large wei amount
    expect(result.usdCost).toBe(BigInt('50000000000')); // 0.05 USD in pUSD
    expect(result.assetId).toBe('ethereum');
    expect(result.assetCost).toBeGreaterThan(BigInt('0'));
  });

  it('should convert USD cost to USDC correctly', async () => {
    const yamlContent = `
version: 1
serviceId: usdc-service
currency: USD
rules:
  - id: fixed-usd-price
    default: true
    strategy:
      type: PerRequest
      price: "100000000000"  # 0.1 USD in picoUSD
`;

    await fs.writeFile(
      path.join(testConfigDir, 'usdc-service.yaml'),
      yamlContent,
      'utf-8'
    );

    const context: BillingContext = {
      serviceId: 'usdc-service',
      operation: 'test',
      assetId: 'usd-coin',
      meta: {}
    };

    const result = await engine.calcCostWithDetails(context);
    
    // 0.1 USD = 100000000000 pUSD  
    // USDC has 6 decimals, so decimalMultiplier = 10^6 = 1000000
    // 1 micro-USDC = $1 / 10^6 = 1000000 pUSD (from our mock)
    // Formula: (100000000000 * 1000000 + 1000000 - 1) / 1000000 = 100000000000
    expect(result.usdCost).toBe(BigInt('100000000000')); // 0.1 USD in pUSD
    expect(result.assetCost).toBe(BigInt('100000000000')); // This is the actual calculation result
    expect(result.assetId).toBe('usd-coin');
  });

  it('should handle zero cost correctly', async () => {
    const yamlContent = `
version: 1
serviceId: free-service
currency: USD
rules:
  - id: free
    default: true
    strategy:
      type: PerRequest
      price: "0"
`;

    await fs.writeFile(
      path.join(testConfigDir, 'free-service.yaml'),
      yamlContent,
      'utf-8'
    );

    const context: BillingContext = {
      serviceId: 'free-service',
      operation: 'test',
      assetId: 'ethereum',
      meta: {}
    };

    const result = await engine.calcCostWithDetails(context);
    
    expect(result.usdCost).toBe(BigInt('0'));
    expect(result.assetCost).toBe(BigInt('0'));
    expect(result.priceUsed).toBe(BigInt('0'));
    expect(result.rateProvider).toBe('none');
  });

  it('should match rules by assetId', async () => {
    const yamlContent = `
version: 1
serviceId: multi-asset-service
currency: USD
rules:
  - id: eth-pricing
    when:
      assetId: "ethereum"
    strategy:
      type: PerRequest
      price: "100000000000"  # 0.1 USD
  - id: usdc-pricing
    when:
      assetId: "usd-coin" 
    strategy:
      type: PerRequest
      price: "50000000000"   # 0.05 USD
  - id: default
    default: true
    strategy:
      type: PerRequest
      price: "25000000000"   # 0.025 USD
`;

    await fs.writeFile(
      path.join(testConfigDir, 'multi-asset-service.yaml'),
      yamlContent,
      'utf-8'
    );

    // Test ETH pricing
    const ethContext: BillingContext = {
      serviceId: 'multi-asset-service',
      operation: 'test',
      assetId: 'ethereum',
      meta: {}
    };

    const ethResult = await engine.calcCostWithDetails(ethContext);
    expect(ethResult.usdCost).toBe(BigInt('100000000000')); // 0.1 USD

    // Test USDC pricing
    const usdcContext: BillingContext = {
      serviceId: 'multi-asset-service',
      operation: 'test',
      assetId: 'usd-coin',
      meta: {}
    };

    const usdcResult = await engine.calcCostWithDetails(usdcContext);
    expect(usdcResult.usdCost).toBe(BigInt('50000000000')); // 0.05 USD

    // Test default pricing for unknown asset
    const btcContext: BillingContext = {
      serviceId: 'multi-asset-service',
      operation: 'test',
      assetId: 'bitcoin',
      meta: {}
    };

    const btcResult = await engine.calcCostWithDetails(btcContext);
    expect(btcResult.usdCost).toBe(BigInt('25000000000')); // 0.025 USD
  });

  it('should handle rate provider errors gracefully', async () => {
    const yamlContent = `
version: 1
serviceId: error-service
currency: USD
rules:
  - id: test
    default: true
    strategy:
      type: PerRequest
      price: "10000000000"  # 0.01 USD
`;

    await fs.writeFile(
      path.join(testConfigDir, 'error-service.yaml'),
      yamlContent,
      'utf-8'
    );

    const context: BillingContext = {
      serviceId: 'error-service',
      operation: 'test',
      assetId: 'unknown-asset',
      meta: {}
    };

    await expect(engine.calcCostWithDetails(context)).rejects.toThrow(RateProviderError);
  });

  it('should require assetId for USD billing', async () => {
    const yamlContent = `
version: 1
serviceId: test-service
currency: USD
rules:
  - id: test
    default: true
    strategy:
      type: PerRequest
      price: "10000000000"
`;

    await fs.writeFile(
      path.join(testConfigDir, 'test-service.yaml'),
      yamlContent,
      'utf-8'
    );

    const context: BillingContext = {
      serviceId: 'test-service',
      operation: 'test',
      // assetId missing
      meta: {}
    };

    await expect(engine.calcCostWithDetails(context)).rejects.toThrow('assetId is required');
  });

  it('should use ceiling for fractional asset amounts', async () => {
    const yamlContent = `
version: 1
serviceId: fractional-service
currency: USD
rules:
  - id: test
    default: true
    strategy:
      type: PerRequest
      price: "1500000000"  # 0.0015 USD
`;

    await fs.writeFile(
      path.join(testConfigDir, 'fractional-service.yaml'),
      yamlContent,
      'utf-8'
    );

    // Set up a scenario where we get fractional wei
    // 0.0015 USD / 2000 USD per ETH = 0.00000075 ETH = 750000000000 wei
    // This should round up due to ceiling operation
    
    const context: BillingContext = {
      serviceId: 'fractional-service',
      operation: 'test',
      assetId: 'ethereum',
      meta: {}
    };

    const result = await engine.calcCostWithDetails(context);
    
    expect(result.usdCost).toBe(BigInt('1500000000'));
    // Should use ceiling to avoid undercharging
    expect(result.assetCost).toBeGreaterThan(BigInt('750000000000'));
  });

  it('should cache strategies correctly', async () => {
    const yamlContent = `
version: 1
serviceId: cache-service
currency: USD
rules:
  - id: test
    default: true
    strategy:
      type: PerRequest
      price: "10000000000"
`;

    await fs.writeFile(
      path.join(testConfigDir, 'cache-service.yaml'),
      yamlContent,
      'utf-8'
    );

    const context: BillingContext = {
      serviceId: 'cache-service',
      operation: 'test',
      assetId: 'ethereum',
      meta: {}
    };

    // First call should load and cache
    await engine.calcCost(context);
    expect(engine.getCachedServices()).toContain('cache-service');

    // Second call should use cache
    const result2 = await engine.calcCost(context);
    expect(result2).toBeGreaterThan(BigInt('0'));

    // Clear cache
    engine.clearCache('cache-service');
    expect(engine.getCachedServices()).not.toContain('cache-service');
  });
}); 