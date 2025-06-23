// Authentication and signature related types

/**
 * As per NIP-1 Signature Structure Specification
 */
export interface SignedData {
  operation: string;
  params: Record<string, any>;
  nonce: string;
  timestamp: number; // Unix timestamp
}

export interface NIP1Signature {
  signer_did: string;
  key_id: string; // The id of the verificationMethod used for signing
  value: Uint8Array; // The signature value
}

export interface NIP1SignedObject {
  signed_data: SignedData;
  signature: NIP1Signature;
}
