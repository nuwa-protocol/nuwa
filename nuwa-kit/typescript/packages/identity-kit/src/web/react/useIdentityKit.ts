import { IdentityKitWeb } from '..';
import { NIP1SignedObject } from '../../index';

// React types - will be available when React is installed
type ReactHook<T> = [T, (value: T | ((prev: T) => T)) => void];
type UseStateHook = <T>(initialValue: T) => ReactHook<T>;
type UseEffectHook = (effect: () => void | (() => void), deps?: any[]) => void;
type UseCallbackHook = <T extends (...args: any[]) => any>(callback: T, deps: any[]) => T;

// Runtime React hooks - will be loaded dynamically
let useState: UseStateHook;
let useEffect: UseEffectHook;
let useCallback: UseCallbackHook;

// Load React hooks at runtime
function loadReactHooks() {
  try {
    if (typeof window !== 'undefined') {
      // Use dynamic import with proper error handling
      const reactPromise = import('react');
      reactPromise.then((React) => {
        useState = React.useState;
        useEffect = React.useEffect;
        useCallback = React.useCallback;
      }).catch(() => {
        // React not available - hooks will remain undefined
      });
    }
  } catch {
    // React not available
  }
}

// Initialize React hooks
loadReactHooks();

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
  // Runtime checks for React and browser environment
  if (typeof window === 'undefined') {
    throw new Error('useIdentityKit is only available in browser environments');
  }
  
  if (typeof useState === 'undefined' || typeof useEffect === 'undefined') {
    throw new Error('useIdentityKit requires React to be available');
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
  const connect = useCallback(async (options?: { scopes?: string[] }) => {
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
  }, [sdk]);

  // Auto connect
  useEffect(() => {
    if (options.autoConnect && sdk && !state.isConnected && !state.isConnecting) {
      connect();
    }
  }, [sdk, options.autoConnect, state.isConnected, state.isConnecting, connect]);

  // Sign operation
  const sign = useCallback(async (payload: any): Promise<NIP1SignedObject> => {
    if (!sdk) throw new Error('SDK not initialized');
    if (!state.isConnected) throw new Error('Not connected');
    return sdk.sign(payload);
  }, [sdk, state.isConnected]);

  // Verify signature
  const verify = useCallback(async (sig: NIP1SignedObject): Promise<boolean> => {
    if (!sdk) throw new Error('SDK not initialized');
    return sdk.verify(sig);
  }, [sdk]);

  // Logout
  const logout = useCallback(async (): Promise<void> => {
    if (!sdk) throw new Error('SDK not initialized');
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