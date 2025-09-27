import { IdpService, IdpServiceConfig } from '../IdpService.js';
import { BitcoinVerifyRequest, AuthProvider } from '@cadop/shared';
import { Secp256k1Keypair, BitcoinSignMessage } from '@roochnetwork/rooch-sdk';
import { jest } from '@jest/globals';

describe('IdpService Bitcoin Tests', () => {
  let idpService: IdpService;
  const mockConfig: IdpServiceConfig = {
    cadopDid: 'did:rooch:test123',
    signingKey: 'test-signing-key',
  };

  beforeEach(() => {
    idpService = new IdpService(mockConfig);
    jest.clearAllMocks();
  });

  describe('generateChallenge', () => {
    it('should generate Bitcoin challenge with messageToSign', () => {
      const response = idpService.generateChallenge('bitcoin');

      expect(response).toHaveProperty('challenge');
      expect(response).toHaveProperty('nonce');
      expect(response).toHaveProperty('messageToSign');

      expect(typeof response.challenge).toBe('string');
      expect(typeof response.nonce).toBe('string');
      expect(typeof (response as any).messageToSign).toBe('string');
      expect((response as any).messageToSign).toContain('CADOP Authentication:');
    });

    it('should generate WebAuthn challenge without messageToSign', () => {
      const response = idpService.generateChallenge('webauthn');

      expect(response).toHaveProperty('challenge');
      expect(response).toHaveProperty('nonce');
      expect(response).not.toHaveProperty('messageToSign');
    });
  });

  describe('verifyBitcoinSignature', () => {
    it('should verify valid Bitcoin signature in simple mode', async () => {
      // Generate a Bitcoin keypair for testing
      const bitcoinKeypair = Secp256k1Keypair.generate();
      const bitcoinAddress = bitcoinKeypair.getBitcoinAddress();
      // Use compressed public key (33 bytes) for ECDSA signature verification
      // This matches the Rooch framework's ecdsa_k1::verify expectation
      const publicKeyBytes = bitcoinKeypair.getPublicKey().toBytes();
      const publicKeyHex = Buffer.from(publicKeyBytes).toString('hex');

      // Generate challenge
      const challengeResponse = idpService.generateChallenge('bitcoin');
      const { challenge, nonce, messageToSign } = challengeResponse as any;

      // Sign the message using standard Bitcoin message signing
      // Create BitcoinSignMessage with the same format as the server
      const dummyTxHash = Buffer.from(challenge, 'utf8');
      const bitcoinMessage = new BitcoinSignMessage(dummyTxHash, messageToSign);

      // Sign the message using ECDSA signature to match Rooch framework's ecdsa_k1::verify
      const messageToSignBytes = bitcoinMessage.encode(); // Get the raw message bytes
      const signature = await bitcoinKeypair.sign(messageToSignBytes);
      const signatureHex = Buffer.from(signature).toString('hex');

      // Remove debug logs

      const request: BitcoinVerifyRequest = {
        address: bitcoinAddress.toStr(),
        publicKeyHex,
        signature: signatureHex,
        challenge,
        nonce,
        origin: 'http://localhost:3000',
      };

      const response = await idpService.verifyBitcoinSignature(request);

      expect(response).toHaveProperty('idToken');
      expect(typeof response.idToken).toBe('string');

      // Verify the token contains expected claims
      const jwt = await import('jsonwebtoken');
      const decoded = jwt.decode(response.idToken) as any;
      expect(decoded.provider).toBe('bitcoin');
      expect(decoded.sub).toBe(`did:bitcoin:${bitcoinAddress.toStr()}`);
      expect(decoded.controllerPublicKeyMultibase).toBeDefined();
      expect(decoded.controllerVMType).toBe('EcdsaSecp256k1VerificationKey2019');
    });

    it('should reject invalid Bitcoin signature', async () => {
      // Generate a Bitcoin keypair for testing
      const bitcoinKeypair = Secp256k1Keypair.generate();
      const bitcoinAddress = bitcoinKeypair.getBitcoinAddress();
      // Use Schnorr public key (32 bytes) for Bitcoin address generation
      const publicKeyBytes = bitcoinKeypair.getSchnorrPublicKey().toBytes();
      const publicKeyHex = Buffer.from(publicKeyBytes).toString('hex');

      // Generate challenge
      const challengeResponse = idpService.generateChallenge('bitcoin');
      const { challenge, nonce } = challengeResponse as any;

      const request: BitcoinVerifyRequest = {
        address: bitcoinAddress.toStr(),
        publicKeyHex,
        signature: 'invalid-signature-hex',
        challenge,
        nonce,
      };

      await expect(idpService.verifyBitcoinSignature(request)).rejects.toThrow();
    });

    it('should reject mismatched public key and address', async () => {
      // Generate two different keypairs
      const bitcoinKeypair1 = Secp256k1Keypair.generate();
      const bitcoinKeypair2 = Secp256k1Keypair.generate();

      const bitcoinAddress1 = bitcoinKeypair1.getBitcoinAddress();
      // Use compressed public key (33 bytes) for ECDSA signature verification
      const publicKeyBytes2 = bitcoinKeypair2.getPublicKey().toBytes();
      const publicKeyHex2 = Buffer.from(publicKeyBytes2).toString('hex');

      // Generate challenge
      const challengeResponse = idpService.generateChallenge('bitcoin');
      const { challenge, nonce, messageToSign } = challengeResponse as any;

      // Sign with keypair2 but use address from keypair1
      const dummyTxHash = Buffer.from(challenge, 'utf8');
      const bitcoinMessage = new BitcoinSignMessage(dummyTxHash, messageToSign);
      const messageToSignBytes = bitcoinMessage.encode();
      const signature = await bitcoinKeypair2.sign(messageToSignBytes);
      const signatureHex = Buffer.from(signature).toString('hex');

      const request: BitcoinVerifyRequest = {
        address: bitcoinAddress1.toStr(), // Address from keypair1
        publicKeyHex: publicKeyHex2, // Public key from keypair2
        signature: signatureHex,
        challenge,
        nonce,
      };

      await expect(idpService.verifyBitcoinSignature(request)).rejects.toThrow(
        'Public key does not match Bitcoin address'
      );
    });

    it('should reject expired challenge', async () => {
      const bitcoinKeypair = Secp256k1Keypair.generate();
      const bitcoinAddress = bitcoinKeypair.getBitcoinAddress();
      // Use compressed public key (33 bytes) for ECDSA signature verification
      const publicKeyBytes = bitcoinKeypair.getPublicKey().toBytes();
      const publicKeyHex = Buffer.from(publicKeyBytes).toString('hex');

      const request: BitcoinVerifyRequest = {
        address: bitcoinAddress.toStr(),
        publicKeyHex,
        signature: 'any-signature',
        challenge: 'invalid-challenge',
        nonce: 'invalid-nonce',
      };

      await expect(idpService.verifyBitcoinSignature(request)).rejects.toThrow(
        'Invalid or expired challenge'
      );
    });
  });
});
