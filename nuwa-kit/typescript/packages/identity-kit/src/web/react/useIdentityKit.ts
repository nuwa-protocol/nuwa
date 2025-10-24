import { IdentityKitWeb } from '..';
import { NIP1SignedObject } from '../../index';
import { IdentityKitErrorCode, createWebError } from '../../errors';

// Import React hooks directly - the bundler will handle this as an external dependency
// Since React is a peerDependency, the consuming application will provide it
import { useState, useEffect, useCallback } from 'react';

export interface IdentityKitState {
  isConnected: boolean;
  isConnecting: boolean;
  agentDid: string | null;
  keyId: string | null;
  error: string | null;
}

export interface IdentityKitHook {
  state: IdentityKitState;
  connect: (options?: { scopes?: string[] }) => Promise<void>;
  sign: (payload: any) => Promise<NIP1SignedObject>;
  verify: (sig: NIP1SignedObject) => Promise<boolean>;
  logout: () => Promise<void>;
  sdk: IdentityKitWeb | null;
}

export interface UseIdentityKitOptions {
  appName?: string;
  cadopDomain?: string;
  storage?: 'local' | 'indexeddb';
  autoConnect?: boolean;
  roochRpcUrl?: string;
}

/**
 * React hook for Nuwa Identity Kit (Web)
 */
export function useIdentityKit(options: UseIdentityKitOptions = {}): IdentityKitHook {
  // Runtime checks for browser environment
  if (typeof window === 'undefined') {
    throw createWebError(
      IdentityKitErrorCode.WEB_BROWSER_NOT_SUPPORTED,
      'useIdentityKit is only available in browser environments'
    );
  }

  const [sdk, setSdk] = useState<IdentityKitWeb | null>(null);
  const [state, setState] = useState<IdentityKitState>({
    isConnected: false,
    isConnecting: false,
    agentDid: null,
    keyId: null,
    error: null,
  });

  /**
   * Helper – refresh connection state from SDK instance
   */
  async function refreshConnection(kit: IdentityKitWeb | null = sdk) {
    if (!kit) return;
    const isConnected = await kit.isConnected();
    if (isConnected) {
      const did = await kit.getDid();
      const keyIds = await kit.listKeyIds();
      setState({
        isConnected: true,
        isConnecting: false,
        agentDid: did,
        keyId: keyIds.length > 0 ? keyIds[0] : null,
        error: null,
      });
    } else {
      setState((prev: IdentityKitState) => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
      }));
    }
  }

  // Initialize SDK
  useEffect(() => {
    async function initSdk() {
      try {
        const newSdk = await IdentityKitWeb.init({
          appName: options.appName,
          cadopDomain: options.cadopDomain,
          storage: options.storage,
          roochRpcUrl: options.roochRpcUrl,
        });
        setSdk(newSdk);

        // Check connection status
        await refreshConnection(newSdk);
      } catch (error) {
        setState((prev: IdentityKitState) => ({
          ...prev,
          error: `Failed to initialize SDK: ${error instanceof Error ? error.message : String(error)}`,
        }));
      }
    }

    initSdk();
  }, [options.appName, options.cadopDomain, options.storage]);

  // Listen for postMessage from callback window
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data && event.data.type === 'nuwa-auth-success') {
        // Re-check connection status when callback signals success
        refreshConnection();
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sdk]);

  // Connect action
  const connect = useCallback(
    async (options?: { scopes?: string[] }) => {
      if (!sdk) {
        setState((prev: IdentityKitState) => ({ ...prev, error: 'SDK not initialized' }));
        return;
      }

      setState((prev: IdentityKitState) => ({ ...prev, isConnecting: true, error: null }));

      try {
        await sdk.connect(options);
        // Actual connection result will be handled via postMessage in callback
        setState((prev: IdentityKitState) => ({ ...prev, isConnecting: false }));
      } catch (error) {
        setState({
          isConnected: false,
          isConnecting: false,
          agentDid: null,
          keyId: null,
          error: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    [sdk]
  );

  // Auto connect
  useEffect(() => {
    if (options.autoConnect && sdk && !state.isConnected && !state.isConnecting) {
      connect();
    }
  }, [sdk, options.autoConnect, state.isConnected, state.isConnecting, connect]);

  // Sign operation
  const sign = useCallback(
    async (payload: any): Promise<NIP1SignedObject> => {
      if (!sdk)
        throw createWebError(IdentityKitErrorCode.INITIALIZATION_FAILED, 'SDK not initialized', {
          operation: 'sign',
        });
      if (!state.isConnected)
        throw createWebError(IdentityKitErrorCode.WEB_NOT_CONNECTED, 'Not connected', {
          operation: 'sign',
          state,
        });
      return sdk.sign(payload);
    },
    [sdk, state.isConnected]
  );

  // Verify signature
  const verify = useCallback(
    async (sig: NIP1SignedObject): Promise<boolean> => {
      if (!sdk)
        throw createWebError(IdentityKitErrorCode.INITIALIZATION_FAILED, 'SDK not initialized', {
          operation: 'verify',
        });
      return sdk.verify(sig);
    },
    [sdk]
  );

  // Logout
  const logout = useCallback(async (): Promise<void> => {
    if (!sdk)
      throw createWebError(IdentityKitErrorCode.INITIALIZATION_FAILED, 'SDK not initialized', {
        operation: 'logout',
      });
    await sdk.logout();
    setState({
      isConnected: false,
      isConnecting: false,
      agentDid: null,
      keyId: null,
      error: null,
    });
  }, [sdk]);

  return { state, connect, sign, verify, logout, sdk };
}
