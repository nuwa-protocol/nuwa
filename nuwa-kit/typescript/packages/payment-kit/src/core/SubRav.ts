/**
 * SubRAV encoding, decoding, signing and verification utilities
 */

import type {
  SignerInterface,
  DIDResolver,
  DIDDocument,
  KeyType,
  VerificationMethod,
} from '@nuwa-ai/identity-kit';
import { CryptoUtils, MultibaseCodec } from '@nuwa-ai/identity-kit';
import { bcs, type BcsType } from '@roochnetwork/rooch-sdk';
import type { SubRAV, SignedSubRAV } from './types';

/**
 * Constants for SubRAV protocol versions
 */
export const SUBRAV_VERSION_1 = 1;
export const CURRENT_SUBRAV_VERSION = SUBRAV_VERSION_1;

/**
 * BCS Schema for SubRAV serialization
 * Must match the Move contract SubRAV struct definition
 */
export const SubRAVSchema: BcsType<any> = bcs.struct('SubRAV', {
  version: bcs.u8(),
  chain_id: bcs.u64(),
  channel_id: bcs.ObjectId,
  channel_epoch: bcs.u64(),
  vm_id_fragment: bcs.string(),
  accumulated_amount: bcs.u256(),
  nonce: bcs.u64(),
});

/**
 * SubRAV codec for encoding and decoding using BCS
 */
export class SubRAVCodec {
  /**
   * Encode a SubRAV to bytes using BCS serialization
   * This ensures cross-platform consistency with Move contracts
   */
  static encode(subRav: SubRAV): Uint8Array {
    try {
      // Convert to BCS-compatible format
      // Note: BCS expects string representations for large numbers
      const bcsSubRAV = {
        version: subRav.version,
        chain_id: subRav.chainId.toString(),
        channel_id: subRav.channelId,
        channel_epoch: subRav.channelEpoch.toString(),
        vm_id_fragment: subRav.vmIdFragment,
        accumulated_amount: subRav.accumulatedAmount.toString(),
        nonce: subRav.nonce.toString(),
      };

      return SubRAVSchema.serialize(bcsSubRAV).toBytes();
    } catch (error) {
      throw new Error(
        `Failed to encode SubRAV: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Decode bytes to SubRAV using BCS deserialization
   */
  static decode(bytes: Uint8Array): SubRAV {
    try {
      const bcsSubRAV = SubRAVSchema.parse(bytes);

      return {
        version: bcsSubRAV.version,
        chainId: BigInt(bcsSubRAV.chain_id),
        channelId: bcsSubRAV.channel_id,
        channelEpoch: BigInt(bcsSubRAV.channel_epoch),
        vmIdFragment: bcsSubRAV.vm_id_fragment,
        accumulatedAmount: BigInt(bcsSubRAV.accumulated_amount),
        nonce: BigInt(bcsSubRAV.nonce),
      };
    } catch (error) {
      throw new Error(
        `Failed to decode SubRAV: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get the BCS hex string representation of a SubRAV (useful for debugging)
   */
  static toHex(subRav: SubRAV): string {
    const bytes = this.encode(subRav);
    return (
      '0x' +
      Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')
    );
  }

  /**
   * Create SubRAV from BCS hex string
   */
  static fromHex(hex: string): SubRAV {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
    return this.decode(bytes);
  }
}

/**
 * SubRAV signing and verification utilities
 */
export class SubRAVSigner {
  /**
   * Sign a SubRAV using the provided signer and key
   */
  static async sign(subRav: SubRAV, signer: SignerInterface, keyId: string): Promise<SignedSubRAV> {
    const bytes = SubRAVCodec.encode(subRav);
    const signature = await signer.signWithKeyId(bytes, keyId);
    return { subRav, signature };
  }

  /**
   * Verify a signed SubRAV using public key or DID document
   */
  static async verify(
    signedSubRAV: SignedSubRAV,
    verificationMethod:
      | {
          publicKey: Uint8Array;
          keyType: KeyType;
        }
      | {
          didDocument: DIDDocument;
        }
  ): Promise<boolean> {
    try {
      const bytes = SubRAVCodec.encode(signedSubRAV.subRav);

      let publicKey: Uint8Array;
      let keyType: KeyType;

      if ('publicKey' in verificationMethod) {
        // Direct public key verification
        publicKey = verificationMethod.publicKey;
        keyType = verificationMethod.keyType;
      } else {
        // DID document verification
        const { didDocument } = verificationMethod;

        // Construct keyId from didDocument.id and vmIdFragment from SubRAV
        const keyId = `${didDocument.id}#${signedSubRAV.subRav.vmIdFragment}`;

        const vm = didDocument.verificationMethod?.find(
          (vm: VerificationMethod) => vm.id === keyId
        );
        if (!vm) return false;

        keyType = vm.type as KeyType;

        // Get public key material
        if (vm.publicKeyMultibase) {
          publicKey = MultibaseCodec.decodeBase58btc(vm.publicKeyMultibase);
        } else if (vm.publicKeyJwk) {
          // Handle JWK format - this would need proper JWK to raw key conversion
          // For now, we don't support JWK format in this context
          return false;
        } else {
          return false; // No supported key format
        }
      }

      // Verify signature
      return CryptoUtils.verify(bytes, signedSubRAV.signature, publicKey, keyType);
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify a signed SubRAV using DID resolver (convenience method)
   */
  static async verifyWithResolver(
    signedSubRAV: SignedSubRAV,
    payerDid: string,
    resolver: DIDResolver
  ): Promise<boolean> {
    try {
      // Resolve DID document
      const didDocument = await resolver.resolveDID(payerDid);
      if (!didDocument) return false;

      // Use the flexible verify method
      return this.verify(signedSubRAV, { didDocument });
    } catch (error) {
      return false;
    }
  }
}

/**
 * Helper functions for creating SubRAV instances
 */
export class SubRAVUtils {
  /**
   * Create a new SubRAV with default version
   */
  static create(params: Omit<SubRAV, 'version'> & { version?: number }): SubRAV {
    return {
      version: params.version ?? CURRENT_SUBRAV_VERSION,
      chainId: params.chainId,
      channelId: params.channelId,
      channelEpoch: params.channelEpoch,
      vmIdFragment: params.vmIdFragment,
      accumulatedAmount: params.accumulatedAmount,
      nonce: params.nonce,
    };
  }

  /**
   * Check if a SubRAV version is supported
   */
  static isSupportedVersion(version: number): boolean {
    return version === SUBRAV_VERSION_1;
  }
}
