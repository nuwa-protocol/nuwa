# Payment Kit Chain-Agnostic API Examples

This document demonstrates how to use the new chain-agnostic payment channel API.

## Quick Start with Factory

```typescript
import { createRoochPaymentChannelClient, PaymentChannelClient } from '@nuwa-ai/payment-kit';
import type { SignerInterface } from '@nuwa-ai/identity-kit';

// Create a Rooch payment channel client using factory
const client: PaymentChannelClient = createRoochPaymentChannelClient({
  signer: yourSigner,
  keyId: 'key-1',
  rpcUrl: 'https://test-seed.rooch.network',
  debug: true,
});

// Open a payment channel
const channelMeta = await client.openChannel({
  payeeDid: 'did:rooch:0xdef456...',
  asset: { assetId: '0x3::gas_coin::RGas', symbol: 'RGAS' },
  collateral: BigInt('1000000000000000000'), // 1 RGAS
});

// Generate payment
const subRAV = await client.nextSubRAV(BigInt('5000000000000000')); // 0.005 RGAS

// Get asset price in pUSD (micro-USD)
const priceInPUSD = await client.getAssetPrice('0x3::gas_coin::RGas');
console.log(`RGAS price: ${priceInPUSD} pUSD`); // e.g., "100 pUSD" = 0.0001 USD
```

## Advanced Factory Usage

```typescript
import { 
  PaymentChannelFactory, 
  type ChainConfig,
  type PaymentChannelFactoryOptions 
} from '@nuwa-ai/payment-kit';

// Create client using factory pattern
const chainConfig: ChainConfig = {
  chain: 'rooch',
  network: 'test',
  contractAddress: '0x3::payment_channel',
  debug: true,
};

const client = PaymentChannelFactory.createClient({
  chainConfig,
  signer: yourSigner,
  keyId: 'key-1',
  cacheOptions: {
    type: 'memory', // or 'indexeddb' for browser persistence
  },
});
```

## Chain-Agnostic Interface

```typescript
import type { IPaymentChannelContract } from '@nuwa-ai/payment-kit';

// Your service can accept any chain implementation
class PaymentService {
  constructor(private contract: IPaymentChannelContract) {}

  async processPayment(signedSubRAV: SignedSubRAV) {
    // Works with any blockchain implementation
    const result = await this.contract.claimFromChannel({
      signedSubRAV,
      signer: this.signer,
    });
    
    return result.claimedAmount;
  }

  async getAssetValue(assetId: string, amount: bigint): Promise<bigint> {
    // Get current price in pUSD
    const pricePerUnit = await this.contract.getAssetPrice(assetId);
    return amount * pricePerUnit;
  }
}
```

## Asset Information & Pricing

```typescript
// Get asset metadata
const assetInfo = await client.getAssetInfo('0x3::gas_coin::RGas');
console.log(assetInfo); 
// { assetId: '0x3::gas_coin::RGas', symbol: 'RGAS' }

// Get price in different currencies
const usdPrice = await client.getAssetPrice('0x3::gas_coin::RGas', 'USD');
const cnyPrice = await client.getAssetPrice('0x3::gas_coin::RGas', 'CNY');

// Calculate payment value in USD
const paymentAmount = BigInt('1000000000000000000'); // 1 RGAS
const valueInPUSD = paymentAmount * usdPrice; // Result in pUSD (micro-USD)
const valueInUSD = Number(valueInPUSD) / 1000000; // Convert to USD
```

## Future Chain Support

When other blockchains are supported, the same API will work:

```typescript
// Future EVM support (example)
const evmConfig: ChainConfig = {
  chain: 'ethereum', // Will be supported in future
  rpcUrl: 'https://mainnet.infura.io/...',
  contractAddress: '0x1234...',
};

const evmClient = PaymentChannelFactory.createClient({
  chainConfig: evmConfig,
  signer: yourEvmSigner,
});

// Same API, different blockchain
const evmChannel = await evmClient.openChannel({
  payeeDid: 'did:ethr:0x456...',
  asset: { assetId: '0xA0b86a33E6441e6e80ec8548E5085C5D0532A0Ea', symbol: 'USDC' },
  collateral: BigInt('1000000'), // 1 USDC
});
```

## Migration from Legacy API

```typescript
// OLD (deprecated)
import { RoochPaymentChannelClient } from '@nuwa-ai/payment-kit';
const oldClient = new RoochPaymentChannelClient({ rpcUrl, signer });

// NEW (recommended)
import { createRoochPaymentChannelClient } from '@nuwa-ai/payment-kit';
const newClient = createRoochPaymentChannelClient({ signer, rpcUrl });

// Same operations, same results
const channelMeta = await newClient.openChannel({ ... });
```

## Key Benefits

1. **Chain Abstraction**: Same API works across different blockchains
2. **Future-Proof**: Adding new chains doesn't break existing code
3. **Unified Pricing**: All prices returned in pUSD for consistency
4. **Factory Pattern**: Easy client creation with minimal configuration
5. **Type Safety**: Full TypeScript support with proper interfaces 