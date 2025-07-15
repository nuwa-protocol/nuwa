/**
 * Example usage of USD billing with chain integration
 * 
 * This example demonstrates:
 * 1. Setting up USD-based billing with chain integration
 * 2. Converting USD costs to different asset types
 * 3. Getting asset decimals from chain vs static config
 * 4. Auditing conversion results
 */

import { UsdBillingEngine } from '../src/billing/usd-engine';
import { CoingeckoRateProvider } from '../src/billing/rate/coingecko';
import { FileConfigLoader } from '../src/billing/config/fileLoader';
import { BillingContext } from '../src/billing/types';
import { RateProvider, AssetInfo } from '../src/billing/rate/types';
import { RoochClient, getRoochNodeUrl } from '@roochnetwork/rooch-sdk';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock rate provider for testing
class MockRateProvider implements RateProvider {
  private rates = new Map<string, { price: bigint; timestamp: number }>();
  private assetInfos = new Map<string, AssetInfo>();

  setRate(assetId: string, priceUSD: number): void {
    // Calculate price per minimum unit based on decimals
    const assetInfo = this.assetInfos.get(assetId);
    const decimals = assetInfo?.decimals || 18;
    
    const pricePerMinUnit = (priceUSD * 1e12) / Math.pow(10, decimals);
    
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
      throw new Error(`No rate found for ${assetId}`);
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

/**
 * Enhanced rate provider with chain integration
 */
class EnhancedCoingeckoProvider extends CoingeckoRateProvider {
  constructor(roochClient?: RoochClient) {
    super(
      60000, // 1 minute cache
      5000,  // 5 second timeout
      3,     // 3 retry attempts
      roochClient
    );
  }

  protected getAssetInfoFromConfig(assetId: string): AssetInfo | null {
    // Enhanced configuration with more assets
    const configs: Record<string, AssetInfo> = {
      'ethereum': { 
        assetId, 
        decimals: 18, 
        symbol: 'ETH',
        priceId: 'ethereum'
      },
      'usd-coin': { 
        assetId, 
        decimals: 6, 
        symbol: 'USDC',
        priceId: 'usd-coin'
      },
      'bitcoin': { 
        assetId, 
        decimals: 8, 
        symbol: 'BTC',
        priceId: 'bitcoin'
      },
      '0x3::gas_coin::RGas': { 
        assetId, 
        decimals: 8, 
        symbol: 'RGAS',
        // RGas might not have direct CoinGecko price
        // This would get decimals from chain but use custom pricing logic
      },
    };

    return configs[assetId] || null;
  }
}

async function demonstrateChainIntegration() {
  console.log('=== Chain Integration Demonstration ===\n');

  try {
    // Initialize Rooch client (optional)
    const roochClient = new RoochClient({
      url: getRoochNodeUrl('mainnet'), // or 'testnet', 'devnet'
    });

    // Create rate provider with chain integration
    const rateProvider = new EnhancedCoingeckoProvider(roochClient);

    // Test getting asset info from chain for Rooch assets
    const roochAssetId = '0x3::gas_coin::RGas';
    console.log(`Getting asset info for ${roochAssetId}...`);
    
    const assetInfo = await rateProvider.getAssetInfo(roochAssetId);
    if (assetInfo) {
      console.log(`✓ Asset Info (from chain/config):`, {
        symbol: assetInfo.symbol,
        decimals: assetInfo.decimals,
        name: assetInfo.name,
      });
    } else {
      console.log(`⚠ No asset info found for ${roochAssetId}`);
    }

    // Test with external assets (from static config)
    const ethAssetId = 'ethereum';
    const ethInfo = await rateProvider.getAssetInfo(ethAssetId);
    console.log(`✓ ETH Asset Info (from config):`, {
      symbol: ethInfo?.symbol,
      decimals: ethInfo?.decimals,
      priceId: ethInfo?.priceId,
    });

  } catch (error) {
    console.log(`⚠ Chain integration demo failed: ${error}`);
    console.log('This is expected if not connected to Rooch network\n');
  }
}

async function demonstrateMultiAssetBilling() {
  console.log('=== Multi-Asset Billing with Chain Integration ===\n');

  // Create rate provider (without chain client for this demo)
  const rateProvider = new MockRateProvider();
  
  // Setup custom asset info first (important for price calculation)
  rateProvider.setAssetInfo('ethereum', {
    assetId: 'ethereum',
    decimals: 18,
    symbol: 'ETH',
    name: 'Ethereum'
  });
  
  rateProvider.setAssetInfo('usd-coin', {
    assetId: 'usd-coin',
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin'
  });
  
  rateProvider.setAssetInfo('0x3::gas_coin::RGas', {
    assetId: '0x3::gas_coin::RGas',
    decimals: 8,
    symbol: 'RGAS',
    name: 'Rooch Gas'
  });

  // Setup mock rates (after asset info)
  rateProvider.setRate('ethereum', 2000); // $2000 per ETH
  rateProvider.setRate('usd-coin', 1.00);  // $1.00 per USDC
  rateProvider.setRate('0x3::gas_coin::RGas', 0.10); // $0.10 per RGAS

  // Create temporary config file
  await createTempConfig();

  // Create billing engine
  const configLoader = new FileConfigLoader('./temp-billing-config.yaml');
  const engine = new UsdBillingEngine(configLoader, rateProvider);

  // Test billing with different assets
  const contexts: BillingContext[] = [
    {
      serviceId: 'ai-service',
      operation: 'text:generation',
      assetId: 'ethereum',
      meta: { model: 'gpt-4', tokens: 1000 }
    },
    {
      serviceId: 'ai-service', 
      operation: 'text:generation',
      assetId: 'usd-coin',
      meta: { model: 'gpt-4', tokens: 1000 }
    },
    {
      serviceId: 'ai-service',
      operation: 'text:generation', 
      assetId: '0x3::gas_coin::RGas',
      meta: { model: 'gpt-4', tokens: 1000 }
    }
  ];

  for (const context of contexts) {
    try {
      const result = await engine.calcCostWithDetails(context);
      const assetInfo = context.assetId ? await rateProvider.getAssetInfo(context.assetId) : null;
      
      console.log(`💰 ${context.assetId || 'unknown'} billing:`);
      console.log(`   USD Cost: ${formatPicoUSD(result.usdCost)} USD`);
      console.log(`   Asset Cost: ${result.assetCost} ${assetInfo?.symbol || 'units'}`);
      console.log(`   Decimals: ${assetInfo?.decimals || 'unknown'}`);
      console.log(`   Exchange Rate: ${result.priceUsed} pUSD per min unit`);
      console.log('');
    } catch (error) {
      console.log(`❌ Failed to calculate cost for ${context.assetId || 'unknown'}: ${error}\n`);
    }
  }

  // Cleanup
  await cleanupTempConfig();
}

async function demonstrateBasicUsage() {
  console.log('=== Basic USD Billing Usage ===\n');

  // Create mock provider for basic demo
  const rateProvider = new MockRateProvider();
  
  // Setup asset info and rates
  rateProvider.setAssetInfo('ethereum', {
    assetId: 'ethereum',
    decimals: 18,
    symbol: 'ETH'
  });
  rateProvider.setRate('ethereum', 2000);

  await createTempConfig();
  const configLoader = new FileConfigLoader('./temp-billing-config.yaml');
  const engine = new UsdBillingEngine(configLoader, rateProvider);

  const context: BillingContext = {
    serviceId: 'ai-service',
    operation: 'text:generation',
    assetId: 'ethereum',
    meta: { model: 'gpt-4', tokens: 1000 }
  };

  const result = await engine.calcCostWithDetails(context);
  
  console.log('Basic billing result:');
  console.log(`  USD Cost: ${formatPicoUSD(result.usdCost)} USD`);
  console.log(`  ETH Cost: ${result.assetCost} wei`);
  console.log(`  Exchange Rate: ${result.priceUsed} pUSD per wei\n`);

  await cleanupTempConfig();
}

async function demonstrateAuditTrail(engine: UsdBillingEngine) {
  console.log('=== Audit Trail Demonstration ===\n');

  const context: BillingContext = {
    serviceId: 'ai-service',
    operation: 'image:generation',
    assetId: 'ethereum',
    meta: { 
      model: 'dall-e-3',
      resolution: '1024x1024'
    }
  };

  const result = await engine.calcCostWithDetails(context);

  // Simulate storing audit information
  const auditRecord = {
    timestamp: new Date().toISOString(),
    transactionId: `tx-${Date.now()}`,
    service: context.serviceId,
    operation: context.operation,
    billing: {
      usdCostPico: result.usdCost.toString(),
      usdCostFormatted: formatPicoUSD(result.usdCost),
      assetId: result.assetId,
      assetCost: result.assetCost.toString(),
      exchangeRate: result.priceUsed.toString(),
      rateTimestamp: result.priceTimestamp,
      rateProvider: result.rateProvider
    },
    metadata: context.meta
  };

  console.log('Audit Record:');
  console.log(JSON.stringify(auditRecord, null, 2));
  console.log('');

  // Demonstrate cost verification
  console.log('Cost Verification:');
  console.log(`✓ Original USD amount: ${formatPicoUSD(result.usdCost)} USD`);
  console.log(`✓ Exchange rate used: ${result.priceUsed} pUSD per smallest unit`);
  console.log(`✓ Final asset cost: ${result.assetCost} smallest units`);
  
  // Reverse calculation for verification
  const reverseUsdCost = (result.assetCost * result.priceUsed) / BigInt(10 ** 18);
  console.log(`✓ Reverse calculation: ${reverseUsdCost} pUSD (should be ≤ ${result.usdCost})`);
}

// Helper functions
function formatPicoUSD(picoUSD: bigint): string {
  const usd = Number(picoUSD) / 1e12;
  return usd.toFixed(6);
}

async function createTempConfig() {
  const configContent = `# USD-based pricing configuration
version: 1
serviceId: ai-service
currency: USD

rules:
  - id: ai-text-generation
    when:
      operation: "text:generation"
    strategy:
      type: PerRequest
      price: "100000000000"  # 0.1 USD in picoUSD
      
  - id: ai-image-generation
    when:
      operation: "image:generation"
    strategy:
      type: PerRequest
      price: "500000000000"  # 0.5 USD in picoUSD
`;
  
  await fs.writeFile('./temp-billing-config.yaml', configContent);
}

async function cleanupTempConfig() {
  try {
    await fs.unlink('./temp-billing-config.yaml');
  } catch (error) {
    // Ignore cleanup errors
  }
}

async function main() {
  console.log('🚀 Nuwa Payment Kit - USD Billing with Chain Integration\n');

  await demonstrateChainIntegration();
  await demonstrateMultiAssetBilling();
  await demonstrateBasicUsage();
  
  console.log('✅ All demonstrations completed!');
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { MockRateProvider, EnhancedCoingeckoProvider, formatPicoUSD }; 