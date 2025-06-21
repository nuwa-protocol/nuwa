import { VDRInterface } from '../types';
import { KeyVDR } from './keyVDR';
import { RoochVDR } from './roochVDR';
import { VDRRegistry } from '../VDRRegistry';

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
export function createDefaultVDRs(options?: { rooch?: any }): VDRInterface[] {
  return [new KeyVDR(), new RoochVDR(options?.rooch || {})];
}

/**
 * Quickly create a default RoochVDR instance and register it into a VDRRegistry.
 *
 * 1. If the registry (default: global singleton) already contains a `rooch` VDR,
 *    the existing instance is returned directly – calling this function is
 *    therefore idempotent.
 * 2. The `network` parameter is forwarded to `RoochVDR.createDefault`, defaulting
 *    to `'test'` for most development scenarios.
 *
 * @param network  Rooch network: 'dev' | 'test' | 'main'. Defaults to 'test'.
 * @param registry Optional registry to register into. Defaults to the global singleton.
 * @returns The (new or existing) RoochVDR instance.
 */
export function initRoochVDR(
  network: 'local' | 'dev' | 'test' | 'main' = 'test',
  rpcUrl: string | undefined = undefined,
  registry: VDRRegistry = VDRRegistry.getInstance()
): RoochVDR {
  const existing = registry.getVDR('rooch');
  if (existing) {
    return existing as RoochVDR;
  }

  const vdr = RoochVDR.createDefault(network, rpcUrl);
  registry.registerVDR(vdr);
  return vdr;
}

// Export VDR implementations
export * from './keyVDR';
export * from './abstractVDR';
export * from './roochVDR';
