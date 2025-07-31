import { DIDAuth, SignerInterface } from '@nuwa-ai/identity-kit';

/**
 * Helper for generating DIDAuthV1 authorization headers
 */
export class DidAuthHelper {
  /**
   * Generate DIDAuthV1 authorization header for HTTP request
   * @param payerDid - The payer's DID
   * @param keyManager - Signer for creating the signature
   * @param requestUrl - The target URL for the request
   * @param method - HTTP method (optional, defaults to 'POST')
   * @param keyId - Optional specific key ID to use (if not provided, uses first available)
   * @returns Authorization header value or undefined if generation fails
   */
  static async generateAuthHeader(
    payerDid: string,
    keyManager: SignerInterface,
    requestUrl: string,
    method: string = 'POST',
    keyId?: string
  ): Promise<string | undefined> {
    try {
      let selectedKeyId = keyId;
      
      if (!selectedKeyId) {
        // Get available key IDs
        const keyIds = await keyManager.listKeyIds();
        if (keyIds.length === 0) {
          throw new Error('No key IDs available for signing');
        }
        selectedKeyId = keyIds[0]; // Use first available key
      }

      // Create a signed object with proper payload structure
      const signedObject = await DIDAuth.v1.createSignature(
        { 
          operation: 'http_request',
          params: { 
            uri: requestUrl,
            method: method.toUpperCase()
          }
        },
        keyManager,
        selectedKeyId
      );

      // Convert to authorization header
      const authHeader = DIDAuth.v1.toAuthorizationHeader(signedObject);
      return authHeader;
    } catch (error) {
      console.error('Failed to generate DID auth header:', error);
      return undefined;
    }
  }

  /**
   * Generate DIDAuthV1 authorization header with specific key ID
   * @param keyManager - Signer for creating the signature
   * @param keyId - Specific key ID to use
   * @param requestUrl - The target URL for the request
   * @param method - HTTP method (optional, defaults to 'POST')
   * @returns Authorization header value
   */
  static async generateAuthHeaderWithKeyId(
    keyManager: SignerInterface,
    keyId: string,
    requestUrl: string,
    method: string = 'POST'
  ): Promise<string> {
    // Create a signed object with proper payload structure
    const signedObject = await DIDAuth.v1.createSignature(
      { 
        operation: 'http_request',
        params: { 
          uri: requestUrl,
          method: method.toUpperCase()
        }
      },
      keyManager,
      keyId
    );

    // Convert to authorization header
    return DIDAuth.v1.toAuthorizationHeader(signedObject);
  }
}