import { VDRInterface } from '../types';
import { KeyVDR } from './keyVDR';
import { RoochVDR } from './roochVDR';

/**
 * Factory function to create a VDR instance based on the DID method
 * 
 * @param method DID method to create a VDR for
 * @param options Optional configuration for the VDR
 * @returns A VDR instance for the specified method
 */
export function createVDR(method: string, options?: any): VDRInterface {
  switch (method.toLowerCase()) {
    case 'key':
      return new KeyVDR();
    case 'rooch':
      return new RoochVDR(options);
    // Add additional DID methods as needed
    default:
      throw new Error(`No built-in VDR implementation available for method '${method}'`);
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
export * from './keyVDR';
export * from './abstractVDR';
export * from './roochVDR';
