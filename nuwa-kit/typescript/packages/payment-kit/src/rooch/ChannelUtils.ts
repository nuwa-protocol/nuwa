/**
 * Channel utilities for payment channel operations
 *
 * Provides pure functions for channel ID derivation and other channel-related operations
 * that don't require blockchain interaction.
 */

import { parseDid } from '@nuwa-ai/identity-kit';
import { bcs, sha3_256, toHEX, Serializer, RoochAddress } from '@roochnetwork/rooch-sdk';

/**
 * Channel key structure matching Move contract ChannelKey
 */
export interface ChannelKey {
  sender: string;
  receiver: string;
  coin_type: string;
}

/**
 * BCS Schema for ChannelKey - matches Move contract exactly
 */
export const ChannelKeySchema: any = bcs.struct('ChannelKey', {
  sender: bcs.Address,
  receiver: bcs.Address,
  coin_type: bcs.string(),
});

// ==================== BCS Schema Definitions ====================

// CancellationInfo struct
export interface CancellationInfo {
  initiated_time: bigint;
  pending_amount: bigint;
}

export const CancellationInfoSchema: any = bcs.struct('CancellationInfo', {
  initiated_time: bcs.u64(),
  pending_amount: bcs.u256(),
});

// SubChannel struct
export interface SubChannel {
  pk_multibase: string;
  method_type: string;
  last_claimed_amount: bigint;
  last_confirmed_nonce: bigint;
}

export const SubChannelSchema: any = bcs.struct('SubChannel', {
  pk_multibase: bcs.string(),
  method_type: bcs.string(),
  last_claimed_amount: bcs.u256(),
  last_confirmed_nonce: bcs.u64(),
});

// PaymentChannel struct - matches Move contract exactly
export interface PaymentChannelData {
  sender: string;
  receiver: string;
  coin_type: string;
  sub_channels: string; // ObjectID as hex string (Table handle)
  status: number;
  channel_epoch: bigint;
  cancellation_info: CancellationInfo | null;
}

export const PaymentChannelSchema: any = bcs.struct('PaymentChannel', {
  sender: bcs.Address,
  receiver: bcs.Address,
  coin_type: bcs.string(),
  sub_channels: bcs.ObjectId, // Table<String, SubChannel> stored as ObjectID
  status: bcs.u8(),
  channel_epoch: bcs.u64(),
  cancellation_info: bcs.option(CancellationInfoSchema),
});

// PaymentHub structure definition matching the Move contract
export interface PaymentHub {
  multi_coin_store: string; // ObjectID as hex string
  active_channels: string; // ObjectID as hex string
}

export const PaymentHubSchema: any = bcs.struct('PaymentHub', {
  multi_coin_store: bcs.ObjectId,
  active_channels: bcs.ObjectId, // Table<String, u64>
});

// Balance struct - matches multi_coin_store.move
export interface BalanceData {
  value: bigint;
}

export const BalanceSchema: any = bcs.struct('Balance', {
  value: bcs.u256(),
});

// CoinStoreField struct - matches multi_coin_store.move
export interface CoinStoreFieldData {
  coin_type: string;
  balance: BalanceData;
  frozen: boolean;
}

export const CoinStoreFieldSchema: any = bcs.struct('CoinStoreField', {
  coin_type: bcs.string(),
  balance: BalanceSchema,
  frozen: bcs.bool(),
});

// DynamicField struct for parsing Table fields
export interface DynamicField<K, V> {
  name: K;
  value: V;
}

export const DynamicFieldSubChannelSchema: any = bcs.struct('DynamicField', {
  name: bcs.string(),
  value: SubChannelSchema,
});

export const DynamicFieldCoinStoreSchema: any = bcs.struct('DynamicField', {
  name: bcs.string(),
  value: CoinStoreFieldSchema,
});

export const DynamicFieldU64Schema: any = bcs.struct('DynamicField', {
  name: bcs.string(),
  value: bcs.u64(),
});

/**
 * Derive channel ID from payer DID, payee DID, and asset ID
 *
 * This function replicates the exact same logic as the Move contract's
 * object::custom_object_id<ChannelKey, PaymentChannel>(key) calculation.
 *
 * @param payerDid - Payer DID (e.g., "did:rooch:...")
 * @param payeeDid - Payee DID (e.g., "did:rooch:...")
 * @param assetId - Asset ID (e.g., "0x3::gas_coin::RGas")
 * @returns Channel object ID as hex string
 */
export function deriveChannelId(payerDid: string, payeeDid: string, assetId: string): string {
  // Parse and validate DIDs
  const payerParsed = parseDid(payerDid);
  const payeeParsed = parseDid(payeeDid);

  if (payerParsed.method !== 'rooch') {
    throw new Error(`Invalid payer DID method: expected 'rooch', got '${payerParsed.method}'`);
  }
  if (payeeParsed.method !== 'rooch') {
    throw new Error(`Invalid payee DID method: expected 'rooch', got '${payeeParsed.method}'`);
  }

  return calcChannelObjectId(payerParsed.identifier, payeeParsed.identifier, assetId);
}

/**
 * Calculate channel object ID using the same logic as Move contract
 *
 * This replicates object::custom_object_id<ChannelKey, PaymentChannel>(key)
 * from payment_channel.move using proper BCS serialization.
 *
 * @param senderAddress - Sender address
 * @param receiverAddress - Receiver address
 * @param coinType - Coin type string
 * @returns Channel object ID as hex string
 */
export function calcChannelObjectId(
  senderAddress: string,
  receiverAddress: string,
  coinType: string
): string {
  const normalizedCoinType = normalizeAssetId(coinType);

  // Create ChannelKey struct - this must match the Move struct exactly
  const channelKey: ChannelKey = {
    sender: senderAddress,
    receiver: receiverAddress,
    coin_type: normalizedCoinType,
  };

  // Create PaymentChannel struct tag
  const paymentChannelStructTag = {
    address: '0x3',
    module: 'payment_channel',
    name: 'PaymentChannel',
    type_params: [],
  };

  // Implement custom_object_id logic:
  // 1. BCS serialize the ChannelKey struct (not JSON!)
  // 2. Append the PaymentChannel struct tag canonical string as bytes
  // 3. SHA3-256 hash the combined bytes
  // 4. Return as ObjectID

  // BCS serialize the ChannelKey
  const idBytes = ChannelKeySchema.serialize(channelKey).toBytes();

  // Get PaymentChannel struct tag canonical string as bytes
  const typeBytes = new TextEncoder().encode(
    Serializer.structTagToCanonicalString(paymentChannelStructTag)
  );

  // Concatenate: bcs(ChannelKey) + canonical_string(PaymentChannel)
  const bytes = new Uint8Array(idBytes.length + typeBytes.length);
  bytes.set(idBytes);
  bytes.set(typeBytes, idBytes.length);

  // SHA3-256 hash
  const hash = sha3_256(bytes);
  return `0x${toHEX(hash)}`;
}

/**
 * Normalize asset ID to canonical string representation
 * @param assetId Asset ID string
 * @returns Canonical asset ID string
 */
export function normalizeAssetId(assetId: string): string {
  try {
    // Use Rooch SDK's built-in parser with address normalization
    const typeTag = Serializer.typeTagParseFromStr(assetId, true);

    // Ensure it's a struct type (not a primitive type)
    if (!('struct' in typeTag)) {
      throw new Error(`Asset ID must be a struct type, got: ${assetId}`);
    }

    return Serializer.structTagToCanonicalString(typeTag.struct as any);
  } catch (error) {
    throw new Error(`Failed to parse asset ID: ${assetId} - ${error}`);
  }
}

/**
 * Validate channel ID format
 * @param channelId Channel ID to validate
 * @returns True if valid format
 */
export function isValidChannelId(channelId: string): boolean {
  // Channel ID should be a hex string starting with 0x
  return /^0x[a-fA-F0-9]{64}$/.test(channelId);
}

/**
 * Extract channel information from channel ID (if possible)
 * Note: This is a one-way function, channel ID cannot be reversed to get original inputs
 * @param channelId Channel ID
 * @returns Basic channel info or null if invalid
 */
export function parseChannelIdInfo(
  channelId: string
): { isValid: boolean; objectId: string } | null {
  if (!isValidChannelId(channelId)) {
    return null;
  }

  return {
    isValid: true,
    objectId: channelId,
  };
}

// ==================== PaymentHub Utilities ====================

/**
 * Calculate PaymentHub ID using the same algorithm as in Move
 *
 * Replicates the logic from moveos_types::moveos_std::object::account_named_object_id
 * and payment_channel.move::get_payment_hub_id function
 *
 * @param ownerAddress - Owner address (DID identifier or hex address)
 * @returns PaymentHub object ID as hex string
 */
export function calculatePaymentHubId(ownerAddress: string): string {
  // Create PaymentHub struct tag using the same approach as ChannelUtils
  const paymentHubStructTag = {
    address: '0x3',
    module: 'payment_channel',
    name: 'PaymentHub',
    type_params: [],
  };

  // Get canonical string representation using Serializer
  const canonicalStructTag = Serializer.structTagToCanonicalString(paymentHubStructTag);

  const roochAddress = new RoochAddress(ownerAddress);

  // Convert owner address to bytes - Rooch SDK handles the address format conversion
  const ownerBytes = roochAddress.toBytes();

  // Append struct tag bytes (canonical string format)
  const structTagBytes = new TextEncoder().encode(canonicalStructTag);

  // Combine owner address bytes + struct tag bytes (browser-friendly)
  const combined = new Uint8Array(ownerBytes.length + structTagBytes.length);
  combined.set(ownerBytes, 0);
  combined.set(structTagBytes, ownerBytes.length);

  // Calculate SHA3-256 hash
  const hash = sha3_256(combined);

  // Return as hex string with 0x prefix (ObjectID format)
  return '0x' + toHEX(hash);
}

/**
 * Derive a FieldKey from a string value.
 * This follows Rooch's FieldKey::derive_from_string logic:
 * hash(bcs(MoveString) || canonical_type_tag_string)
 *
 * @param value - The string value to derive field key from
 * @returns FieldKey as hex string
 */
export function deriveFieldKeyFromString(value: string): string {
  try {
    // BCS serialize the value as MoveString using Rooch's bcs library
    const keyBytes = bcs.string().serialize(value).toBytes();

    // Get the canonical type tag string for String type
    // Must use full canonical address format (32-byte) as specified in Rust implementation
    const stringTypeTag =
      '0x0000000000000000000000000000000000000000000000000000000000000001::string::String';
    const typeTagBytes = new TextEncoder().encode(stringTypeTag);

    // Concatenate: bcs(key) + canonical_type_tag_string
    const combinedBytes = new Uint8Array(keyBytes.length + typeTagBytes.length);
    combinedBytes.set(keyBytes);
    combinedBytes.set(typeTagBytes, keyBytes.length);

    // SHA3-256 hash
    const hash = sha3_256(combinedBytes);
    return `0x${toHEX(hash)}`;
  } catch (error) {
    throw new Error(`Failed to derive field key: ${error}`);
  }
}

/**
 * Derive field key for coin type asset ID
 * @param coinType - Asset ID (e.g., "0x3::gas_coin::RGas")
 * @returns FieldKey as hex string
 */
export function deriveCoinTypeFieldKey(coinType: string): string {
  const assetIdCanonical = normalizeAssetId(coinType);
  return deriveFieldKeyFromString(assetIdCanonical);
}

// ==================== BCS Parsing Utilities ====================

/**
 * Parse PaymentChannel data from BCS hex string
 * @param value BCS encoded hex string from object state
 * @returns Parsed PaymentChannelData
 */
export function parsePaymentChannelData(value: string): PaymentChannelData {
  try {
    // Remove '0x' prefix if present
    const bcsHex = value.startsWith('0x') ? value.slice(2) : value;
    const bcsBytes = new Uint8Array(
      bcsHex.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
    );

    // Parse using BCS schema
    const parsed = PaymentChannelSchema.parse(bcsBytes);

    return {
      sender: parsed.sender,
      receiver: parsed.receiver,
      coin_type: parsed.coin_type,
      sub_channels: parsed.sub_channels,
      status: parsed.status,
      channel_epoch: BigInt(parsed.channel_epoch),
      cancellation_info: parsed.cancellation_info
        ? {
            initiated_time: BigInt(parsed.cancellation_info.initiated_time),
            pending_amount: BigInt(parsed.cancellation_info.pending_amount),
          }
        : null,
    };
  } catch (error) {
    throw new Error(`Failed to parse PaymentChannel data: ${error}`);
  }
}

/**
 * Parse PaymentHub data from BCS hex string
 * @param value BCS encoded hex string from object state
 * @returns Parsed PaymentHub
 */
export function parsePaymentHubData(value: string): PaymentHub {
  try {
    if (typeof value === 'string' && value.startsWith('0x')) {
      // Parse BCS bytes using PaymentHubSchema (browser-friendly hex decode)
      const hex = value.slice(2);
      const bcsBytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bcsBytes.length; i++) {
        bcsBytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
      }
      const parsed = PaymentHubSchema.parse(bcsBytes);

      return {
        multi_coin_store: parsed.multi_coin_store,
        active_channels: parsed.active_channels,
      };
    } else {
      throw new Error('Unexpected PaymentHub value format');
    }
  } catch (error) {
    throw new Error(`Failed to parse PaymentHub data: ${error}`);
  }
}

/**
 * Parse a DynamicField<String, SubChannel> from BCS hex string
 * @param value BCS encoded hex string from a DynamicField
 * @returns Parsed DynamicField<String, SubChannel> object
 */
export function parseDynamicFieldSubChannel(value: string): DynamicField<string, SubChannel> {
  try {
    // Remove '0x' prefix if present
    const bcsHex = value.startsWith('0x') ? value.slice(2) : value;
    const bcsBytes = new Uint8Array(
      bcsHex.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
    );

    // Parse using DynamicField BCS schema
    const parsed = DynamicFieldSubChannelSchema.parse(bcsBytes);

    return {
      name: parsed.name,
      value: {
        pk_multibase: parsed.value.pk_multibase,
        method_type: parsed.value.method_type,
        last_claimed_amount: BigInt(parsed.value.last_claimed_amount),
        last_confirmed_nonce: BigInt(parsed.value.last_confirmed_nonce),
      },
    };
  } catch (error) {
    throw new Error(`Failed to parse DynamicField<String, SubChannel>: ${error}`);
  }
}

/**
 * Parse a DynamicField<String, CoinStoreField> from BCS hex string
 * @param value BCS encoded hex string from a DynamicField
 * @returns Parsed DynamicField<String, CoinStoreField> object
 */
export function parseDynamicFieldCoinStore(
  value: string
): DynamicField<string, CoinStoreFieldData> {
  try {
    const hex = value.startsWith('0x') ? value.slice(2) : value;
    const bcsBytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bcsBytes.length; i++) {
      bcsBytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    const parsed = DynamicFieldCoinStoreSchema.parse(bcsBytes);

    return {
      name: parsed.name as string,
      value: parsed.value as CoinStoreFieldData,
    };
  } catch (error) {
    throw new Error(`Failed to parse DynamicField<String, CoinStoreField>: ${error}`);
  }
}

/**
 * Parse a DynamicField<String, u64> from BCS hex string
 * @param value BCS encoded hex string from a DynamicField
 * @returns Parsed DynamicField<String, u64> object
 */
export function parseDynamicFieldU64(value: string): DynamicField<string, number> {
  try {
    const hex = value.startsWith('0x') ? value.slice(2) : value;
    const bcsBytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bcsBytes.length; i++) {
      bcsBytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    const parsed = DynamicFieldU64Schema.parse(bcsBytes);

    return {
      name: parsed.name as string,
      value: Number(parsed.value), // Convert bigint to number for count
    };
  } catch (error) {
    throw new Error(`Failed to parse DynamicField<String, u64>: ${error}`);
  }
}

/**
 * Safely convert balance value to bigint
 * @param balanceValue - The balance value from BCS parsing (could be string or bigint)
 * @returns Balance as bigint
 */
export function safeBalanceToBigint(balanceValue: any): bigint {
  if (typeof balanceValue === 'string') {
    return BigInt(balanceValue);
  } else if (typeof balanceValue === 'bigint') {
    return balanceValue;
  } else {
    return BigInt(0);
  }
}
