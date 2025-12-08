import { RoochWalletSigner } from './signers/RoochWalletSigner';
import {
  bytes,
  concatBytes,
  Secp256k1PublicKey,
  toHEX,
  varintByteNum,
  sha256,
} from '@roochnetwork/rooch-sdk';
import {
  BitcoinChallengeResponse,
  BitcoinVerifyResponse,
  BitcoinVerifyRequest,
} from '@cadop/shared';
import { apiClient } from '../api/client';

/**
 * Service for generating Bitcoin wallet ID tokens via cadop-api
 */
export class BitcoinIdTokenService {
  constructor() {
    // Using apiClient, no need for baseUrl
  }

  /** Create message bytes for Bitcoin wallet signing (wallet will add prefix automatically) */
  private createBitcoinAuthMessage(message: string): Uint8Array {
    // Wallet will automatically add Bitcoin message prefix, we just need the raw message
    return new TextEncoder().encode(message);
  }

  /**
   * Get challenge for Bitcoin wallet authentication
   */
  async getChallenge(): Promise<BitcoinChallengeResponse> {
    const response = await apiClient.get<BitcoinChallengeResponse>(
      '/api/idp/challenge?provider=bitcoin'
    );

    if (!response.data) {
      throw new Error(String(response.error || 'Failed to get challenge'));
    }

    return response.data;
  }

  /**
   * Generate ID token using Bitcoin wallet signature
   */
  async generateIdToken(signer: RoochWalletSigner): Promise<string> {
    try {
      // 1. Get challenge from cadop-api
      const challengeResponse = await this.getChallenge();
      const { challenge, nonce, messageToSign } = challengeResponse;

      // Validate required fields
      if (!challenge) {
        throw new Error('Invalid challenge response: missing challenge');
      }
      if (!nonce) {
        throw new Error('Invalid challenge response: missing nonce');
      }
      if (!messageToSign) {
        throw new Error('Invalid challenge response: missing messageToSign for Bitcoin provider');
      }

      // 2. Get wallet address and public key
      const bitcoinAddress = signer.getBitcoinAddress();
      const walletAddress = bitcoinAddress.toStr();
      const roochAddress = bitcoinAddress.genRoochAddress();
      console.debug('walletAddress', walletAddress);
      console.debug('roochAddress', roochAddress.toStr());

      const publicKey = await signer.getPublicKey();
      if (!publicKey) {
        throw new Error('Failed to get key info from wallet signer');
      }
      // const derivedAddress = publicKey.toAddress().toStr();
      // console.debug('derivedAddress', derivedAddress);

      const publicKeyHex = toHEX(publicKey.toBytes());
      console.debug('publicKeyHex', publicKeyHex);
      const publicKey2 = new Secp256k1PublicKey(publicKey.toBytes().slice(1));
      const derivedAddress2 = publicKey2.toAddress();
      console.debug('derivedAddress2', derivedAddress2.bitcoinAddress.toStr());
      console.debug('derivedAddress2 rooch address', derivedAddress2.roochAddress.toStr());
      // 3. Sign the message using Bitcoin message format
      // Create Bitcoin message format directly (not using BitcoinSignMessage which is for transactions)
      // Standard Bitcoin message format: "\x18Bitcoin Signed Message:\n" + varint(message.length) + message
      const messageToSignBytes = this.createBitcoinAuthMessage(messageToSign);

      // Sign using wallet signer
      const signatureBytes = await signer.sign(messageToSignBytes);

      // Verify signature locally (wallet uses SHA256 hash of full Bitcoin message format)
      const fullMessageToSignBytes = this.createBitcoinFullAuthMessage(messageToSign);
      const secp256k1PublicKey = new Secp256k1PublicKey(publicKey.toBytes());
      const hashedMessage = sha256(fullMessageToSignBytes);
      const isValidSignature = await secp256k1PublicKey.verify(hashedMessage, signatureBytes);

      if (!isValidSignature) {
        throw new Error('Local signature verification failed');
      }

      console.debug('✅ Local signature verification passed');
      const signature = toHEX(signatureBytes);

      // 4. Verify signature with cadop-api and get ID token
      const verifyRequest: BitcoinVerifyRequest = {
        address: walletAddress,
        publicKeyHex,
        signature,
        challenge,
        nonce,
        origin: window.location.origin,
      };

      const verifyResponse = await apiClient.post<BitcoinVerifyResponse>(
        '/api/idp/verify-bitcoin',
        verifyRequest,
        { skipAuth: true }
      );

      if (!verifyResponse.data) {
        throw new Error(String(verifyResponse.error || 'Bitcoin verification failed'));
      }

      return verifyResponse.data.idToken;
    } catch (error) {
      console.error('[BitcoinIdTokenService] Failed to generate ID token:', error);
      throw error;
    }
  }

  private createBitcoinFullAuthMessage(message: string): Uint8Array {
    // Wallet automatically adds Bitcoin message prefix when signing
    // For verification, we need to reconstruct the complete format that wallet used
    // Standard Bitcoin message format: "\x18Bitcoin Signed Message:\n" + varint(message.length) + message
    const prefix = '\x18Bitcoin Signed Message:\n';
    const messageBytes = bytes('utf8', message);

    // Create varint for message length
    const messageLength = messageBytes.length;
    let varint_bytes = varintByteNum(messageLength);

    // Combine prefix + varint + message (same format wallet used for signing)
    return concatBytes(bytes('utf8', prefix), varint_bytes, messageBytes);
  }
}
