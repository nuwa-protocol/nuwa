# Rooch Payment Channel Implementation

This directory contains the implementation of payment channels for the Rooch blockchain, including BCS type definitions and contract interaction methods.

## PaymentChannel Structure

The `PaymentChannel` struct in Move corresponds to the following TypeScript interface:

```typescript
interface PaymentChannelData {
  sender: string; // Payer DID address (without 'did:rooch:' prefix)
  receiver: string; // Payee DID address (without 'did:rooch:' prefix)
  coin_type: string; // Asset type (e.g., '0x3::gas_coin::RGas')
  sub_channels: string; // ObjectID of Table<String, SubChannel>
  status: number; // 0: Active, 1: Cancelling, 2: Closed
  channel_epoch: bigint; // Incremented each time channel is closed/reopened
  cancellation_info: CancellationInfo | null; // Present during cancellation process
}
```

## SubChannel Structure

Each authorized device/VM has a corresponding `SubChannel` entry:

```typescript
interface SubChannel {
  pk_multibase: string; // Public key in multibase format
  method_type: string; // Verification method type
  last_claimed_amount: bigint; // Last amount claimed from this sub-channel
  last_confirmed_nonce: bigint; // Last confirmed nonce for replay protection
}
```

## BCS Parsing

The implementation uses BCS (Binary Canonical Serialization) to parse on-chain data directly:

```typescript
// Parse PaymentChannel from ObjectState
const channelData = this.parseChannelData(objectState.value);

// Access channel information
console.log(`Channel epoch: ${channelData.channel_epoch}`);
console.log(`Status: ${channelData.status}`); // 0=Active, 1=Cancelling, 2=Closed
console.log(`Sub-channels table: ${channelData.sub_channels}`);
```

## Key Benefits

1. **Direct Data Access**: No need for view functions - parse data directly from object state
2. **Type Safety**: Full TypeScript type definitions matching Move contracts
3. **Performance**: Single RPC call to get complete channel information
4. **Consistency**: Data parsed using the same BCS format as the Move contract

## Implementation Status

### ✅ Completed

- BCS schema definitions for all PaymentChannel structs
- Direct parsing of PaymentChannel data from object state
- Channel status and epoch extraction from parsed data
- Type-safe interfaces matching Move contract definitions
- **Asset price implementation for RGas with fixed pricing**

### 🚧 TODO

- Sub-channel data querying from Table (requires field access API)
- Total collateral calculation from PaymentHub
- Claimed amount aggregation across sub-channels
- Authorized sub-channels enumeration

## Asset Pricing

The implementation includes static pricing for RGas:

```typescript
// RGas pricing: 1 RGas = 0.01 USD
// RGas has 8 decimals, price returned in pico-USD (pUSD)
const price = await contract.getAssetPrice('0x3::gas_coin::RGas');
console.log(price); // 100n (100 pUSD per smallest RGas unit)

// Supports both short and full addresses
const priceShort = await contract.getAssetPrice('0x3::gas_coin::RGas');
const priceFull = await contract.getAssetPrice(
  '0x0000000000000000000000000000000000000000000000000000000000000003::gas_coin::RGas'
);
// Both return the same value

// Calculate RGas value in USD
const rgasAmount = BigInt(100_00000000); // 100 RGas (with 8 decimals)
const totalValuePUSD = rgasAmount * price; // Total value in pUSD
const totalValueUSD = Number(totalValuePUSD) / 1_000_000_000_000; // Convert to USD
console.log(`100 RGas = $${totalValueUSD}`); // "100 RGas = $1"
```

### Supported Assets

- **RGas** (`0x3::gas_coin::RGas`): Fixed price of 0.01 USD per RGas

## Chain Information

The contract provides access to chain-specific information:

```typescript
// Get current chain ID from the blockchain
const chainId = await contract.getChainId();
console.log(`Connected to chain: ${chainId}`);

// Chain ID mapping:
// 1 = Rooch Mainnet
// 2 = Rooch Testnet
// 3 = Rooch Devnet
// 4 = Rooch Local
```

## Usage Example

```typescript
const contract = new RoochPaymentChannelContract({
  network: 'test',
  debug: true,
});

// Get chain ID dynamically
const chainId = await contract.getChainId();

// Get channel status - no view functions needed!
const status = await contract.getChannelStatus({
  channelId: '0x...',
});

console.log({
  epoch: status.epoch, // From parsed channelData.channel_epoch
  status: status.status, // Converted from channelData.status
  payer: status.payerDid, // From channelData.sender
  payee: status.payeeDid, // From channelData.receiver
  asset: status.asset.assetId, // From channelData.coin_type
});

// Get asset pricing
const rgasPrice = await contract.getAssetPrice('0x3::gas_coin::RGas');
console.log(`RGas price: ${rgasPrice} pUSD per smallest unit`);
```

## Move Contract Reference

The implementation matches the Move contract structures in:

- `rooch_framework::payment_channel::PaymentChannel`
- `rooch_framework::payment_channel::SubChannel`
- `rooch_framework::payment_channel::CancellationInfo`

All BCS schemas are kept in sync with the Move contract definitions to ensure compatibility.
