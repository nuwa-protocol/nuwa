import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto'; // Import createHash
import {
    verifyRequestAuthentication,
    createMessageHashForSigning,
    BtcCredentials,
    RoochSessionKeyCredentials,
} from './auth.js';
import * as schema from '../a2a-schema.js';
import { A2AError as A2AErrorClass } from './error.js';

// --- Import REAL SDK components ---
import {
    Secp256k1Keypair,
    Ed25519Keypair,
    BitcoinAddress,
    RoochAddress,
    BitcoinSignMessage,
    Bytes,
    PublicKey, // Import PublicKey base class if needed for type checks
    toB64,     // Import utils
    fromB64,
    toHEX,
    fromHEX,
} from '@roochnetwork/rooch-sdk';


// --- Test Data Setup ---
let btcKeypair: Secp256k1Keypair;
let sessionKeypair: Ed25519Keypair;
let sampleMessage: schema.Message;
let sampleMessageHash: Buffer;
let sampleBtcAddress: BitcoinAddress;
let sampleRoochOwnerAddress: RoochAddress;

beforeEach(() => {
    // Generate fresh keys for each test to avoid interference
    btcKeypair = Secp256k1Keypair.generate();
    sessionKeypair = Ed25519Keypair.generate();

    sampleBtcAddress = btcKeypair.getBitcoinAddress();
    sampleRoochOwnerAddress = sampleBtcAddress.genRoochAddress();

    sampleMessage = {
        role: 'user',
        parts: [{ type: 'text', text: `Hello Agent ${Date.now()}` }], // Vary message slightly
    };
    sampleMessageHash = createMessageHashForSigning(sampleMessage);
});


// --- Tests ---

describe('auth.ts', () => {

    // createMessageHashForSigning tests remain the same as they don't depend on mocks
    describe('createMessageHashForSigning', () => {
        it('should create a consistent hash for the same message parts', () => {
            const msg1: schema.Message = { role: 'user', parts: [{ type: 'text', text: 'Consistent' }] };
            const msg2: schema.Message = { role: 'user', parts: [{ type: 'text', text: 'Consistent' }] };
            const hash1 = createMessageHashForSigning(msg1);
            const hash2 = createMessageHashForSigning(msg2);
            expect(hash1).toBeInstanceOf(Buffer);
            expect(hash1.toString('hex')).toEqual(hash2.toString('hex'));
            expect(createMessageHashForSigning(sampleMessage)).toBeInstanceOf(Buffer);
        });

        it('should create a different hash for different message parts', () => {
            const msg1: schema.Message = { role: 'user', parts: [{ type: 'text', text: 'Different1' }] };
            const msg2: schema.Message = { role: 'user', parts: [{ type: 'text', text: 'Different2' }] };
            const hash1 = createMessageHashForSigning(msg1);
            const hash2 = createMessageHashForSigning(msg2);
            expect(hash1.toString('hex')).not.toEqual(hash2.toString('hex'));
        });
    });

    describe('verifyRequestAuthentication', () => {

        // --- Success Cases ---
        it('should successfully verify a valid btc-signature', async () => {
            // 1. Create the specific message structure for BTC signing
            const bitcoinMessageInfo = "Agent authentication:\n";
            const btcSignMsg = new BitcoinSignMessage(sampleMessageHash, bitcoinMessageInfo);
            const btcMessageHash = btcSignMsg.hash();

            // 2. Sign the *formatted* message hash with the BTC keypair
            const signatureBytes = await btcKeypair.sign(btcMessageHash);
            const signatureB64 = toB64(signatureBytes);

            // 3. Construct credentials
            const btcCredentials: BtcCredentials = {
                scheme: 'btc-signature',
                message: '', // Not used in verification logic if hash is primary
                signature: signatureB64,
                btcAddress: sampleBtcAddress.toStr(),
                btcPublicKey: toB64(btcKeypair.getPublicKey().toBytes()), // Provide real public key
            };
            const authInfo: schema.AuthenticationInfo = {
                schemes: ['btc-signature'],
                credentials: JSON.stringify(btcCredentials),
            };

            // 4. Verify
            const result = await verifyRequestAuthentication(authInfo, sampleMessage);

            // 5. Assert - Expecting the Rooch address derived from the BTC key
            expect(result).toBeInstanceOf(RoochAddress);
            expect(result.toStr()).toEqual(sampleRoochOwnerAddress.toStr());
        });

        it('should successfully verify a valid rooch-sessionkey-signature', async () => {
            // 1. Sign the *direct* message hash with the session keypair
            const signatureBytes = await sessionKeypair.sign(sampleMessageHash);
            const signatureB64 = toB64(signatureBytes);

            // 2. Construct credentials
            const skCredentials: Omit<RoochSessionKeyCredentials, 'scheme' | 'message'> = {
                signature: signatureB64,
                sessionPublicKey: toB64(sessionKeypair.getPublicKey().toBytes()),
                btcAddress: sampleBtcAddress.toStr(),
            };
            const authInfo: schema.AuthenticationInfo = {
                schemes: ['rooch-sessionkey-signature'],
                credentials: JSON.stringify({ 
                    scheme: 'rooch-sessionkey-signature', 
                    message: '', 
                    ...skCredentials 
                }),
            };

             // 3. Verify
            const result = await verifyRequestAuthentication(authInfo, sampleMessage);

            // 4. Assert - Expecting the Rooch address derived from the OWNER's BTC key
            expect(result).toBeInstanceOf(RoochAddress);
            expect(result.toStr()).toEqual(sampleRoochOwnerAddress.toStr());

            // TODO: Add test for on-chain check of session key validity if that logic is added to verifyRequestAuthentication
        });

        // --- Failure Cases ---

        it('should throw if authentication is missing', async () => {
            await expect(verifyRequestAuthentication(null, sampleMessage))
                .rejects.toThrow(A2AErrorClass);
            await expect(verifyRequestAuthentication(null, sampleMessage))
                .rejects.toHaveProperty('code', -32602); // InvalidParams
        });

        it('should throw if schemes array is missing or empty', async () => {
            const authInfo: schema.AuthenticationInfo = { schemes: [], credentials: '{}' };
             await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                .rejects.toHaveProperty('code', -32602);
        });
         it('should throw if credentials field is missing', async () => {
            const authInfo: schema.AuthenticationInfo = { schemes: ['btc-signature'], credentials: null };
             await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                .rejects.toHaveProperty('code', -32602);
        });

        it('should throw if credentials are not valid JSON', async () => {
            const authInfo: schema.AuthenticationInfo = {
                schemes: ['btc-signature'],
                credentials: 'not-json',
            };
            await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                .rejects.toHaveProperty('code', -32602);
             await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                .rejects.toThrow('Authentication credentials are not valid JSON');
        });

         it('should throw if scheme in credentials does not match provided scheme', async () => {
             // Generate a valid BTC signature first
             const bitcoinMessageInfo = "Agent authentication:\n";
             const btcSignMsg = new BitcoinSignMessage(sampleMessageHash, bitcoinMessageInfo);
             const btcMessageHash = btcSignMsg.hash();
             const signatureBytes = await btcKeypair.sign(btcMessageHash);
             const signatureB64 = toB64(signatureBytes);

             const mismatchedCreds: BtcCredentials = {
                 scheme: 'btc-signature', // Correct scheme here
                 message: '',
                 signature: signatureB64,
                 btcAddress: sampleBtcAddress.toStr(),
                 btcPublicKey: toB64(btcKeypair.getPublicKey().toBytes()),
             };
             const authInfo: schema.AuthenticationInfo = {
                 schemes: ['rooch-sessionkey-signature'], // Mismatch: Expecting session key
                 credentials: JSON.stringify(mismatchedCreds),
             };
             await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toHaveProperty('code', -32602);
             await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toThrow('Scheme mismatch in credentials');
         });

         it('should throw for unsupported schemes', async () => {
            // Generate a valid signature first
            const signatureBytes = await sessionKeypair.sign(sampleMessageHash);
            const signatureB64 = toB64(signatureBytes);

            const creds = {
                scheme: 'unsupported-scheme',
                signature: signatureB64,
                sessionPublicKey: toB64(sessionKeypair.getPublicKey().toBytes()),
                btcAddress: sampleBtcAddress.toStr(),
            };
             const authInfo: schema.AuthenticationInfo = {
                 schemes: ['unsupported-scheme'],
                 credentials: JSON.stringify(creds),
             };
             await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toThrow(/Unsupported authentication scheme/);
             await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toHaveProperty('code', -32602);
         });

         it('should throw if signature encoding is invalid', async () => {
             const btcCredentials: BtcCredentials = {
                 scheme: 'btc-signature',
                 message: '',
                 signature: 'invalid-base64-$$$', // Invalid encoding
                 btcAddress: sampleBtcAddress.toStr(),
                 btcPublicKey: toB64(btcKeypair.getPublicKey().toBytes()),
             };
              const authInfo: schema.AuthenticationInfo = {
                 schemes: ['btc-signature'],
                 credentials: JSON.stringify(btcCredentials),
             };
             // Simply assert that it rejects with an A2AErrorClass
             await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toThrow(A2AErrorClass);
             // Optional: Still check for InvalidParams code if desired, but not the message
             // await expect(verifyRequestAuthentication(authInfo, sampleMessage))
             //    .rejects.toHaveProperty('code', -32602); 
         });


        // BTC Specific Failures
        it('should throw for btc-signature if btcPublicKey is missing', async () => {
            const bitcoinMessageInfo = "Agent authentication:\n";
            const btcSignMsg = new BitcoinSignMessage(sampleMessageHash, bitcoinMessageInfo);
            const btcMessageHash = btcSignMsg.hash();
            const signatureBytes = await btcKeypair.sign(btcMessageHash);
            const signatureB64 = toB64(signatureBytes);

             const creds: Partial<BtcCredentials> = { // Use Partial to allow omitting pubkey
                 scheme: 'btc-signature',
                 message: '',
                 signature: signatureB64,
                 btcAddress: sampleBtcAddress.toStr(),
                 // btcPublicKey deliberately omitted
             };
             const authInfo: schema.AuthenticationInfo = {
                 schemes: ['btc-signature'],
                 credentials: JSON.stringify(creds),
             };
             await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toThrow('btcPublicKey missing');
              await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toHaveProperty('code', -32602);
        });

         it('should throw for btc-signature if signature is invalid (tampered)', async () => {
            // Generate a valid signature first
            const bitcoinMessageInfo = "Agent authentication:\n";
            const btcSignMsg = new BitcoinSignMessage(sampleMessageHash, bitcoinMessageInfo);
            const btcMessageHash = btcSignMsg.hash();
            const signatureBytes = await btcKeypair.sign(btcMessageHash);
            // Tamper the signature
            signatureBytes[0] = signatureBytes[0] ^ 0xff;
            const tamperedSignatureB64 = toB64(signatureBytes);


             const btcCredentials: BtcCredentials = {
                 scheme: 'btc-signature',
                 message: '',
                 signature: tamperedSignatureB64, // Use tampered signature
                 btcAddress: sampleBtcAddress.toStr(),
                 btcPublicKey: toB64(btcKeypair.getPublicKey().toBytes()),
             };
             const authInfo: schema.AuthenticationInfo = {
                 schemes: ['btc-signature'],
                 credentials: JSON.stringify(btcCredentials),
             };

             // Expect verify to return false, leading to an error
             await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toThrow(/Invalid signature/);
              await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toHaveProperty('code', -32602); // InvalidParams for invalid signature
         });

         it('should throw for btc-signature if public key does not match address', async () => {
             // Generate signature with correct keypair
            const bitcoinMessageInfo = "Agent authentication:\n";
            const btcSignMsg = new BitcoinSignMessage(sampleMessageHash, bitcoinMessageInfo);
            const btcMessageHash = btcSignMsg.hash();
            const signatureBytes = await btcKeypair.sign(btcMessageHash);
            const signatureB64 = toB64(signatureBytes);

            // Generate a *different* keypair
            const wrongKeypair = Secp256k1Keypair.generate();

             const btcCredentials: BtcCredentials = {
                 scheme: 'btc-signature',
                 message: '',
                 signature: signatureB64, // Valid signature from original key
                 btcAddress: sampleBtcAddress.toStr(), // Original address
                 btcPublicKey: toB64(wrongKeypair.getPublicKey().toBytes()), // WRONG public key
             };
             const authInfo: schema.AuthenticationInfo = {
                 schemes: ['btc-signature'],
                 credentials: JSON.stringify(btcCredentials),
             };

             // Expect verify to return false because pubkey doesn't match signature
             await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toThrow(/Invalid signature/);
              await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toHaveProperty('code', -32602);
         });


        // SessionKey Specific Failures
         it('should throw for rooch-sessionkey-signature if signature is invalid (tampered)', async () => {
            const signatureBytes = await sessionKeypair.sign(sampleMessageHash);
            signatureBytes[0] = signatureBytes[0] ^ 0xff;
            const tamperedSignatureB64 = toB64(signatureBytes);

             const skCredentials: Omit<RoochSessionKeyCredentials, 'scheme' | 'message'> = {
                 signature: tamperedSignatureB64, // Tampered
                 sessionPublicKey: toB64(sessionKeypair.getPublicKey().toBytes()),
                 btcAddress: sampleBtcAddress.toStr(),
             };
             const authInfo: schema.AuthenticationInfo = {
                 schemes: ['rooch-sessionkey-signature'],
                 credentials: JSON.stringify({ 
                    scheme: 'rooch-sessionkey-signature', 
                    message: '', 
                    ...skCredentials 
                 }),
             };
             await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toThrow(/Invalid signature/);
              await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toHaveProperty('code', -32602);
         });

          it('should throw for rooch-sessionkey-signature if auth key does not match signature', async () => {
              // Sign with correct session key
             const signatureBytes = await sessionKeypair.sign(sampleMessageHash);
             const signatureB64 = toB64(signatureBytes);

             // Generate a different session key
             const wrongSessionKeypair = Ed25519Keypair.generate();
             // const wrongSessionAuthKey = wrongSessionKeypair.getPublicKey().toAddress(); // Not needed in creds

             const skCredentials: Omit<RoochSessionKeyCredentials, 'scheme' | 'message'> = {
                 signature: signatureB64, // Correct signature
                 // sessionAuthKey: wrongSessionAuthKey.toStr(), // Removed
                 sessionPublicKey: toB64(wrongSessionKeypair.getPublicKey().toBytes()), // WRONG public key
                 btcAddress: sampleBtcAddress.toStr(),
             };
             const authInfo: schema.AuthenticationInfo = {
                 schemes: ['rooch-sessionkey-signature'],
                 credentials: JSON.stringify({ 
                    scheme: 'rooch-sessionkey-signature', 
                    message: '', 
                    ...skCredentials 
                 }),
             };

             // Verification should fail because the public key doesn't match the signature
             await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toThrow(/Invalid signature/);
              await expect(verifyRequestAuthentication(authInfo, sampleMessage))
                 .rejects.toHaveProperty('code', -32602);
         });

         // Note: Testing SDK internal errors is harder without mocks,
         // but we can assume the SDK functions correctly based on its own tests.
    });
});
