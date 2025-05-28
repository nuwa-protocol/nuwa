import { DIDDocument, VDRInterface } from '../types';
import { KeyVDR } from './keyVDR';
import { AbstractVDR } from './abstractVDR';
import { RoochVDR } from './implementations/roochVDR';

/**
 * Factory function to create a VDR instance based on the DID method
 * 
 * @param method DID method to create a VDR for
 * @param options Optional configuration for the VDR
 * @returns A VDR instance for the specified method or undefined if not supported
 */
export function createVDR(method: string, options?: any): VDRInterface | undefined {
  switch (method.toLowerCase()) {
    case 'key':
      return new KeyVDR();
    case 'rooch':
      return new RoochVDR(options);
    // Add additional DID methods as needed
    default:
      console.warn(`No built-in VDR implementation available for method '${method}'`);
      return undefined;
  }
}

/**
 * Helper function to create a standard set of VDRs for common methods
 * 
 * @param options Configuration options for various VDRs
 * @returns An array of VDR instances
 */
export function createDefaultVDRs(options?: { 
  rooch?: any 
}): VDRInterface[] {
  return [
    new KeyVDR(),
    new RoochVDR(options?.rooch || {})
  ];
}

// Export VDR implementations
export { KeyVDR } from './keyVDR';
export { AbstractVDR } from './abstractVDR';
export { RoochVDR } from './implementations/roochVDR';
