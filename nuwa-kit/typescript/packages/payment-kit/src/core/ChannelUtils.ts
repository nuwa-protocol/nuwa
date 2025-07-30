/**
 * Channel utilities for payment channel operations
 * 
 * Provides pure functions for channel ID derivation and other channel-related operations
 * that don't require blockchain interaction.
 */

import { parseDid } from '@nuwa-ai/identity-kit';
import { bcs, sha3_256, toHEX, Serializer } from '@roochnetwork/rooch-sdk';

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
export function calcChannelObjectId(senderAddress: string, receiverAddress: string, coinType: string): string {
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
  const typeBytes = new TextEncoder().encode(Serializer.structTagToCanonicalString(paymentChannelStructTag));
  
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
export function parseChannelIdInfo(channelId: string): { isValid: boolean; objectId: string } | null {
  if (!isValidChannelId(channelId)) {
    return null;
  }
  
  return {
    isValid: true,
    objectId: channelId,
  };
}