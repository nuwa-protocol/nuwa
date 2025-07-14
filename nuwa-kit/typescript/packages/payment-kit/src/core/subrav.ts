/**
 * SubRAV encoding, decoding, signing and verification utilities
 */

import type { SignerInterface, DIDResolver } from '@nuwa-ai/identity-kit';
import { CryptoUtils, MultibaseCodec } from '@nuwa-ai/identity-kit';
import type { SubRAV, SignedSubRAV } from './types';

/**
 * BCS-compatible structure for SubRAV serialization
 * Note: We'll implement a simple serialization for now, 
 * proper BCS integration can be added later
 */
interface SubRAVStruct {
  chain_id: string;
  channel_id: string;
  channel_epoch: string;
  vm_id_fragment: string;
  accumulated_amount: string;
  nonce: string;
}

/**
 * SubRAV codec for encoding and decoding
 */
export class SubRAVCodec {
  /**
   * Encode a SubRAV to bytes using canonical serialization
   * TODO: Replace with proper BCS serialization when available
   */
  static encode(subRav: SubRAV): Uint8Array {
    // Convert bigints to strings for serialization
    const struct: SubRAVStruct = {
      chain_id: subRav.chainId.toString(),
      channel_id: subRav.channelId,
      channel_epoch: subRav.channelEpoch.toString(),
      vm_id_fragment: subRav.vmIdFragment,
      accumulated_amount: subRav.accumulatedAmount.toString(),
      nonce: subRav.nonce.toString(),
    };

    // Use deterministic JSON serialization for now
    const jsonStr = JSON.stringify(struct, Object.keys(struct).sort());
    return new TextEncoder().encode(jsonStr);
  }

  /**
   * Decode bytes to SubRAV
   * TODO: Replace with proper BCS deserialization when available
   */
  static decode(bytes: Uint8Array): SubRAV {
    const jsonStr = new TextDecoder().decode(bytes);
    const struct: SubRAVStruct = JSON.parse(jsonStr);

    return {
      chainId: BigInt(struct.chain_id),
      channelId: struct.channel_id,
      channelEpoch: BigInt(struct.channel_epoch),
      vmIdFragment: struct.vm_id_fragment,
      accumulatedAmount: BigInt(struct.accumulated_amount),
      nonce: BigInt(struct.nonce),
    };
  }
}

/**
 * SubRAV signing and verification utilities
 */
export class SubRAVSigner {
  /**
   * Sign a SubRAV using the provided signer and key
   */
  static async sign(
    subRav: SubRAV,
    signer: SignerInterface,
    keyId: string
  ): Promise<SignedSubRAV> {
    const bytes = SubRAVCodec.encode(subRav);
    const signature = await signer.signWithKeyId(bytes, keyId);
    return { subRav, signature };
  }

  /**
   * Verify a signed SubRAV
   */
  static async verify(
    signedSubRAV: SignedSubRAV,
    resolver: DIDResolver
  ): Promise<boolean> {
    try {
      const bytes = SubRAVCodec.encode(signedSubRAV.subRav);
      
      // Extract DID from channel ID or vmIdFragment
      // For now, we'll assume the DID can be derived from the context
      // TODO: Implement proper DID extraction logic
      const did = await this.extractDidFromSubRAV(signedSubRAV.subRav);
      const keyId = `${did}#${signedSubRAV.subRav.vmIdFragment}`;
      
      // Resolve DID document to get public key
      const didDoc = await resolver.resolveDID(did);
      if (!didDoc) return false;
      
      const vm = didDoc.verificationMethod?.find(vm => vm.id === keyId);
      if (!vm) return false;
      
      // Get public key material
      let publicKey: Uint8Array;
      if (vm.publicKeyMultibase) {
        publicKey = MultibaseCodec.decodeBase58btc(vm.publicKeyMultibase);
      } else {
        return false; // No supported key format
      }
      
      // Verify signature
      return CryptoUtils.verify(bytes, signedSubRAV.signature, publicKey, vm.type);
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract DID from SubRAV context
   * TODO: Implement proper logic based on channel metadata or other context
   */
  private static async extractDidFromSubRAV(subRav: SubRAV): Promise<string> {
    // For now, this is a placeholder
    // In real implementation, we might need to:
    // 1. Look up channel metadata to get payer DID
    // 2. Parse channel ID to extract DID information
    // 3. Use additional context provided by the application
    throw new Error('extractDidFromSubRAV not implemented - requires channel context');
  }
}

/**
 * SubRAV validation utilities
 */
export class SubRAVValidator {
  /**
   * Validate SubRAV structure and constraints
   */
  static validate(subRav: SubRAV): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    if (!subRav.channelId || subRav.channelId.length !== 66) {
      errors.push('Invalid channel ID format (must be 32-byte hex string with 0x prefix)');
    }

    if (!subRav.vmIdFragment || subRav.vmIdFragment.length === 0) {
      errors.push('VM ID fragment is required');
    }

    if (subRav.chainId < 0) {
      errors.push('Chain ID must be non-negative');
    }

    if (subRav.channelEpoch < 0) {
      errors.push('Channel epoch must be non-negative');
    }

    if (subRav.accumulatedAmount < 0) {
      errors.push('Accumulated amount must be non-negative');
    }

    if (subRav.nonce < 0) {
      errors.push('Nonce must be non-negative');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate SubRAV sequence (for checking monotonicity)
   */
  static validateSequence(prev: SubRAV | null, current: SubRAV): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (prev) {
      // Check same channel and sub-channel
      if (prev.channelId !== current.channelId) {
        errors.push('Channel ID mismatch');
      }

      if (prev.vmIdFragment !== current.vmIdFragment) {
        errors.push('VM ID fragment mismatch');
      }

      if (prev.channelEpoch !== current.channelEpoch) {
        errors.push('Channel epoch mismatch');
      }

      // Check monotonicity
      if (current.nonce <= prev.nonce) {
        errors.push('Nonce must be strictly increasing');
      }

      if (current.accumulatedAmount < prev.accumulatedAmount) {
        errors.push('Accumulated amount cannot decrease');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
} 