import * as schema from '../a2a-schema.js';
import { A2AError as A2AErrorClass } from './error.js';
import { createHash } from 'crypto';

// --- SDK Imports ---
// Import values using default import
import roochSdk from '@roochnetwork/rooch-sdk';
const {
    Secp256k1PublicKey,
    Ed25519PublicKey,
    BitcoinSignMessage,
    // Bytes, // Type alias might not be on the default export
    fromB64,
    fromHEX,
    toHEX,
    RoochAddress,
    BitcoinAddress
} = roochSdk;

// Import types separately using 'import type'
import type {
    Bytes, // Import Bytes type
    RoochAddress as RoochAddressType, // Use alias if needed to avoid conflict, though unlikely here
    Secp256k1PublicKey as Secp256k1PublicKeyType,
    Ed25519PublicKey as Ed25519PublicKeyType
} from '@roochnetwork/rooch-sdk';

// --- Credential Interfaces ---
export interface BtcCredentials {
    scheme: "btc-signature";
    message: string; // Note: This might be redundant if we sign a known structure like the message hash
    signature: string;
    btcAddress: string;
    btcPublicKey?: string;
}

export interface RoochSessionKeyCredentials {
    scheme: "rooch-sessionkey-signature";
    message: string; 
    signature: string; 
    sessionPublicKey: string; // MANDATORY: Base64 encoded Ed25519 public key bytes (32 bytes raw)
    btcAddress: string;
}

export type RoochCredentials = BtcCredentials | RoochSessionKeyCredentials;

// --- Placeholder Rooch SDK object is removed, direct calls used below ---

// --- Helper function to create message hash for signing ---
export function createMessageHashForSigning(message: schema.Message): Buffer {
    // Simple approach: hash the JSON stringification of the message parts
    // A more robust approach might involve canonical JSON or hashing specific fields
    const messageString = JSON.stringify(message.parts);
    return createHash('sha256').update(messageString).digest();
}

// --- Helper to decode signature --- 
function decodeSignature(signature: string): Bytes {
    try {
        // Try Base64 first
        const decodedBase64 = fromB64(signature);
        if (decodedBase64 && decodedBase64.length > 0) {
            console.debug(`[Auth] Decoded signature from Base64, length: ${decodedBase64.length}`);
            return decodedBase64;
        }
    } catch (e1) {
        // Base64 failed, proceed to try Hex
        console.debug("[Auth] Base64 decoding failed, trying Hex...");
    }

    try {
        // Try Hex
        const decodedHex = fromHEX(signature);
        if (decodedHex && decodedHex.length > 0) {
            console.debug(`[Auth] Decoded signature from Hex, length: ${decodedHex.length}`);
            return decodedHex;
        }
    } catch (e2) {
        // Hex also failed
         console.debug("[Auth] Hex decoding failed.");
    }

    // If we reach here, both failed or resulted in empty buffers
    console.error("Failed to decode signature as non-empty Base64 or Hex:", signature);
    throw A2AErrorClass.invalidParams("Invalid signature encoding. Expected non-empty Base64 or Hex.");
}

/**
 * Verifies the authentication information provided in an A2A request using Rooch SDK.
 * Throws an A2AErrorClass on failure, returns the verified identity string on success.
 *
 * @param authentication The authentication object from TaskSendParams.
 * @param messageToSignAgainst The message used to derive the signed content.
 * @returns The verified identity string (e.g., "btc:0x123...", "rooch-sk:authkey...")
 * @throws {A2AErrorClass} If authentication is invalid or fails.
 */
export async function verifyRequestAuthentication(
    authentication: schema.AuthenticationInfo | null | undefined,
    messageToSignAgainst: schema.Message
): Promise<RoochAddressType> {
    // --- Basic Validation (Throws InvalidParams -32602 on failure) ---
    if (!authentication) {
        throw A2AErrorClass.invalidParams("Authentication required but not provided.");
    }
    const scheme = authentication.schemes?.[0];
    const credentialsString = authentication.credentials;
    if (!scheme || !credentialsString) {
        throw A2AErrorClass.invalidParams("Authentication scheme or credentials missing.");
    }
     let credentials: RoochCredentials;
    try {
        credentials = JSON.parse(credentialsString);
    } catch (e) {
        throw A2AErrorClass.invalidParams("Authentication credentials are not valid JSON.");
    }
     if (credentials.scheme !== scheme) {
        throw A2AErrorClass.invalidParams(`Scheme mismatch in credentials: expected ${scheme}, got ${credentials.scheme}`);
    }
    // Decode signature early - this will throw InvalidParams (-32602) if encoding is bad
    const signatureBytes = decodeSignature(credentials.signature); 

    // --- Scheme Specific Validation & SDK Interaction --- 
    let isValid = false;
    let identity: RoochAddressType | undefined;
    let publicKey: Secp256k1PublicKeyType | Ed25519PublicKeyType | undefined;

    try { // Try block focuses on SDK object construction and verification call
        switch (scheme) {
            case "btc-signature":
                const btcCreds = credentials as BtcCredentials;
                // Validate required fields *before* construction/verification
                if (!btcCreds.btcPublicKey) {
                    throw A2AErrorClass.invalidParams("btcPublicKey missing in credentials for btc-signature."); // -32602
                }
                // Construct SDK object (might throw format errors)
                try {
                    publicKey = new Secp256k1PublicKey(btcCreds.btcPublicKey);
                } catch (e) {
                    console.error("[Auth] Failed to create Secp256k1PublicKey:", e);
                     // Wrap construction error as InvalidParams, as it's due to bad input format
                    throw A2AErrorClass.invalidParams(`Invalid btcPublicKey format: ${e instanceof Error ? e.message : String(e)}`); // -32602
                }

                // Prepare message for verification
                const a2aMessageHash = createMessageHashForSigning(messageToSignAgainst);
                const bitcoinMessageInfo = "Agent authentication:\n";
                const btcMessage = new BitcoinSignMessage(a2aMessageHash, bitcoinMessageInfo);
                const btcMessageHash = btcMessage.hash();

                // Verify using SDK (might throw internal SDK errors)
                console.log(`[Auth] Verifying BTC signature against formatted message hash: ${toHEX(btcMessageHash)}`);
                isValid = await publicKey.verify(btcMessageHash, signatureBytes);
                if (isValid) {
                    identity = new BitcoinAddress(btcCreds.btcAddress).genRoochAddress();
                }
                break;

            case "rooch-sessionkey-signature":
                const skCreds = credentials as RoochSessionKeyCredentials;
                 // Validate required fields *before* construction/verification
                if (!skCreds.sessionPublicKey) {
                     throw A2AErrorClass.invalidParams("sessionPublicKey missing in credentials for rooch-sessionkey-signature."); // -32602
                }
                // Construct SDK object (might throw format errors)
                let derivedAuthKey: RoochAddressType;
                try {
                    const pkBytes = fromB64(skCreds.sessionPublicKey);
                    // Add explicit length check for Ed25519 public key
                    if (pkBytes.length !== 32) {
                        throw new Error(`Expected 32 bytes for Ed25519 public key, got ${pkBytes.length}`);
                    }
                    publicKey = new Ed25519PublicKey(pkBytes);
                    derivedAuthKey = publicKey.toAddress(); // Derive address *after* successful construction
                } catch (e) {
                    console.error("[Auth] Failed to create Ed25519PublicKey from sessionPublicKey:", e);
                     // Wrap construction error as InvalidParams
                    throw A2AErrorClass.invalidParams(`Invalid sessionPublicKey format or length: ${e instanceof Error ? e.message : String(e)}`); // -32602
                }
                
                // TODO: On-chain check using derivedAuthKey.toStr()
                console.warn(`[Auth TODO] On-chain verification for session key ${derivedAuthKey.toStr()} is not implemented.`);

                // Prepare message for verification
                const sessionMessageHash = createMessageHashForSigning(messageToSignAgainst);
                
                // Verify using SDK (might throw internal SDK errors)
                console.log(`[Auth] Verifying SessionKey signature against direct message hash: ${toHEX(sessionMessageHash)}`);
                isValid = await publicKey.verify(sessionMessageHash, signatureBytes); 
                if (isValid) {
                    identity = new BitcoinAddress(skCreds.btcAddress).genRoochAddress();
                }
                break;

            default:
                 // This case should now be unreachable due to checks before the try block,
                 // but included for safety. It will be caught and re-thrown below.
                 throw A2AErrorClass.invalidParams(`Unsupported authentication scheme: ${scheme}`); // -32602
        }
    } catch (error) { // Catch errors from SDK construction or verify call
         // If it's an InvalidParams error we explicitly threw (e.g., bad pubkey format), re-throw it.
         if (error instanceof A2AErrorClass && error.code === -32602) {
             throw error; 
         }
         // Otherwise, wrap unexpected SDK/runtime errors as InternalError
         console.error(`[Auth] Internal error during SDK operation for scheme ${scheme}:`, error);
         throw A2AErrorClass.internalError(`Verification failed for scheme ${scheme}: ${error instanceof Error ? error.message : String(error)}`, error); // Keep code -32603 for internal SDK errors
    }

    // --- Final Check for Verification Result (Outside Try/Catch) ---
    if (!isValid) {
        // This now specifically means publicKey.verify() returned false
        console.error(`[Auth] Authentication failed for scheme ${scheme}. Signature invalid.`);
        throw A2AErrorClass.invalidParams(`Authentication failed for scheme ${scheme}. Invalid signature.`); // Keep -32602 for invalid signature result
    }

    if (!identity) {
         console.error(`[Auth] Authentication succeeded but no identity generated for scheme ${scheme}.`);
         throw A2AErrorClass.internalError(`Internal error during authentication for scheme ${scheme}.`); // Keep -32603
    }

    console.log(`[Auth] Authentication successful. Identity: ${identity.toStr()}`);
    return identity;
} 