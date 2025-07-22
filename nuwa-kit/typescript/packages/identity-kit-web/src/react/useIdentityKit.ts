import { useState, useEffect, useCallback } from 'react';
import { IdentityKitWeb } from '..';
import { NIP1SignedObject } from '@nuwa-ai/identity-kit';

export interface IdentityKitState {
  isConnected: boolean;
  isConnecting: boolean;
  agentDid: string | null;
  keyId: string | null;
  error: string | null;
}

export interface ConnectResult {
  action: 'popup' | 'redirect' | 'copy' | 'manual';
  url?: string;
  success: boolean;
  error?: string;
}

export interface IdentityKitHook {
  state: IdentityKitState;
  connect: (options?: { 
    scopes?: string[];
    fallbackMethod?: 'redirect' | 'copy' | 'manual';
  }) => Promise<void>;
  /** Enhanced connect method that returns detailed result for popup blocker handling */
  connectWithResult: (options?: { 
    scopes?: string[];
    fallbackMethod?: 'redirect' | 'copy' | 'manual';
  }) => Promise<ConnectResult>;
  sign: (payload: any) => Promise<NIP1SignedObject>;
  verify: (sig: NIP1SignedObject) => Promise<boolean>;
  logout: () => Promise<void>;
  sdk: IdentityKitWeb | null;
}

/**
 * Enhanced hook that provides user-friendly popup blocker handling
 */
export interface IdentityKitHookWithFallbacks extends IdentityKitHook {
  /** 
   * Connect with automatic fallback handling and user notifications 
   * Returns a promise that resolves with instructions for the user
   */
  connectWithFallbacks: (options?: { 
    scopes?: string[];
    /** Callback to show user notifications */
    onPopupBlocked?: (result: ConnectResult) => void;
    /** Callback to show clipboard success notification */
    onUrlCopied?: (url: string) => void;
    /** Callback to show manual URL handling */
    onManualUrl?: (url: string) => void;
  }) => Promise<ConnectResult>;
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
      setState(prev => ({
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
        setState(prev => ({
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

  // Connect action (backward compatible)
  const connect = useCallback(async (options?: { 
    scopes?: string[];
    fallbackMethod?: 'redirect' | 'copy' | 'manual';
  }) => {
    if (!sdk) {
      setState(prev => ({ ...prev, error: 'SDK not initialized' }));
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      await sdk.connect(options); // Note: no returnResult flag, so returns void
      // Actual connection result will be handled via postMessage in callback
      setState(prev => ({ ...prev, isConnecting: false }));
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

  // Enhanced connect action with result
  const connectWithResult = useCallback(async (options?: { 
    scopes?: string[];
    fallbackMethod?: 'redirect' | 'copy' | 'manual';
  }): Promise<ConnectResult> => {
    if (!sdk) {
      setState(prev => ({ ...prev, error: 'SDK not initialized' }));
      return {
        action: 'manual',
        success: false,
        error: 'SDK not initialized'
      };
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const result = await sdk.connect({
        ...options,
        returnResult: true // Request detailed result
      }) as ConnectResult; // Type assertion since we know returnResult=true
      
      // Only set connecting to false if action is not redirect
      // (redirect will navigate away from current page)
      if (result.action !== 'redirect') {
        setState(prev => ({ ...prev, isConnecting: false }));
      }
      
      return result;
    } catch (error) {
      setState({
        isConnected: false,
        isConnecting: false,
        agentDid: null,
        keyId: null,
        error: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      
      return {
        action: 'manual',
        success: false,
        error: `Connection failed: ${error instanceof Error ? error.message : String(error)}`
      };
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

  return { state, connect, connectWithResult, sign, verify, logout, sdk };
}

/**
 * Enhanced version of useIdentityKit with automatic popup blocker fallbacks
 */
export function useIdentityKitWithFallbacks(options: UseIdentityKitOptions = {}): IdentityKitHookWithFallbacks {
  const baseHook = useIdentityKit(options);
  
  const connectWithFallbacks = useCallback(async (connectOptions?: { 
    scopes?: string[];
    onPopupBlocked?: (result: ConnectResult) => void;
    onUrlCopied?: (url: string) => void;
    onManualUrl?: (url: string) => void;
  }): Promise<ConnectResult> => {
    // Try popup with detailed result
    const result = await baseHook.connectWithResult({
      scopes: connectOptions?.scopes,
      fallbackMethod: 'copy' // Default to copy fallback
    });
    
    // Handle different scenarios
    switch (result.action) {
      case 'popup':
        // Success, no additional handling needed
        break;
        
      case 'redirect':
        // Page will redirect, no notification needed
        break;
        
      case 'copy':
        if (result.success && result.url) {
          connectOptions?.onUrlCopied?.(result.url);
        } else {
          // Copy failed, show manual URL
          connectOptions?.onManualUrl?.(result.url || '');
        }
        break;
        
      case 'manual':
        connectOptions?.onPopupBlocked?.(result);
        if (result.url) {
          connectOptions?.onManualUrl?.(result.url);
        }
        break;
    }
    
    return result;
  }, [baseHook.connectWithResult]);
  
  return {
    ...baseHook,
    connectWithFallbacks
  };
} 