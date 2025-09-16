import { BitcoinAddress, RoochAddress } from '@roochnetwork/rooch-sdk';

/**
 * DID Compatibility Utilities
 *
 * Handles compatibility between different DID formats, particularly for
 * Bitcoin and Rooch address conversions in controller fields.
 */

/**
 * Check if two DIDs are equivalent, considering Bitcoin <-> Rooch address conversion
 *
 * @param did1 First DID to compare
 * @param did2 Second DID to compare
 * @returns true if the DIDs are equivalent
 */
export function areDidsEquivalent(did1: string, did2: string): boolean {
  // Direct match
  if (did1 === did2) {
    return true;
  }

  // Extract DID components
  const parts1 = did1.split(':');
  const parts2 = did2.split(':');

  if (parts1.length < 3 || parts2.length < 3) {
    return false;
  }

  const [scheme1, method1, identifier1] = parts1;
  const [scheme2, method2, identifier2] = parts2;

  // Both must be DID schemes
  if (scheme1 !== 'did' || scheme2 !== 'did') {
    return false;
  }

  // Handle Bitcoin <-> Rooch conversion compatibility
  if (
    (method1 === 'bitcoin' && method2 === 'rooch') ||
    (method1 === 'rooch' && method2 === 'bitcoin')
  ) {
    try {
      // Convert Bitcoin address to Rooch address for comparison
      let bitcoinAddress: string;
      let roochAddress: string;

      if (method1 === 'bitcoin') {
        bitcoinAddress = identifier1;
        roochAddress = identifier2;
      } else {
        bitcoinAddress = identifier2;
        roochAddress = identifier1;
      }

      // Convert Bitcoin address to Rooch address and compare
      const btcAddr = new BitcoinAddress(bitcoinAddress);
      const convertedRoochAddr = btcAddr.genRoochAddress();

      return convertedRoochAddr.toStr() === roochAddress;
    } catch (error) {
      console.warn('[didCompatibility] Failed to convert addresses for comparison:', error);
      return false;
    }
  }

  // For other cases, require exact match
  return false;
}

/**
 * Check if a user DID is the controller of a verification method
 *
 * @param userDid User's DID (e.g., did:bitcoin:address or did:rooch:address)
 * @param controllerDid Controller DID from verification method
 * @returns true if the user is the controller
 */
export function isUserController(userDid: string, controllerDid: string): boolean {
  return areDidsEquivalent(userDid, controllerDid);
}

/**
 * Check if a user has controller access to any verification method in a DID document
 *
 * @param userDid User's DID
 * @param verificationMethods Array of verification methods from DID document
 * @returns true if the user has controller access
 */
export function hasControllerAccess(
  userDid: string,
  verificationMethods?: Array<{ controller: string }>
): boolean {
  if (!verificationMethods || verificationMethods.length === 0) {
    return false;
  }

  return verificationMethods.some(method => isUserController(userDid, method.controller));
}

/**
 * Convert Bitcoin DID to Rooch DID format
 *
 * @param bitcoinDid Bitcoin DID (did:bitcoin:address)
 * @returns Rooch DID (did:rooch:address) or null if conversion fails
 */
export function convertBitcoinDidToRooch(bitcoinDid: string): string | null {
  try {
    const parts = bitcoinDid.split(':');
    if (parts.length !== 3 || parts[0] !== 'did' || parts[1] !== 'bitcoin') {
      return null;
    }

    const bitcoinAddress = parts[2];
    const btcAddr = new BitcoinAddress(bitcoinAddress);
    const roochAddr = btcAddr.genRoochAddress();

    return `did:rooch:${roochAddr.toStr()}`;
  } catch (error) {
    console.warn('[didCompatibility] Failed to convert Bitcoin DID to Rooch:', error);
    return null;
  }
}

/**
 * Convert Rooch DID to Bitcoin DID format (if possible)
 * Note: This is not always possible as Rooch addresses can be derived from other sources
 *
 * @param roochDid Rooch DID (did:rooch:address)
 * @returns Bitcoin DID (did:bitcoin:address) or null if conversion is not possible
 */
export function convertRoochDidToBitcoin(roochDid: string): string | null {
  // This conversion is not straightforward as Rooch addresses can be derived from
  // multiple sources (Bitcoin, Ethereum, etc.). We would need additional context
  // or metadata to perform this conversion accurately.
  // For now, return null to indicate this conversion is not supported.
  return null;
}
