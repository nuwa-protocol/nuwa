// Example: Complete integration showing the popup-safe connection pattern
// This demonstrates the recommended usage pattern for the new methods

import React, { useState, useEffect, useCallback } from 'react';
import { useIdentityKit } from '@nuwa-ai/identity-kit-web';

/**
 * Example 1: Basic popup-safe connection button
 * This is the recommended pattern for most use cases
 */
export function PopupSafeConnectButton() {
  const { state, buildConnectUrl, openConnectUrl } = useIdentityKit();
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [isPreparingUrl, setIsPreparingUrl] = useState(false);

  // Pre-build the connect URL when component mounts
  useEffect(() => {
    if (!state.isConnected && !connectUrl && !isPreparingUrl) {
      setIsPreparingUrl(true);
      buildConnectUrl()
        .then(url => {
          setConnectUrl(url);
          setIsPreparingUrl(false);
        })
        .catch(error => {
          console.error('Failed to build connect URL:', error);
          setIsPreparingUrl(false);
        });
    }
  }, [state.isConnected, connectUrl, isPreparingUrl, buildConnectUrl]);

  // Handle click - no async operations, popup won't be blocked
  const handleConnect = useCallback(() => {
    if (connectUrl) {
      openConnectUrl(connectUrl);
      // Clear the URL so it gets rebuilt for next use
      setConnectUrl(null);
    }
  }, [connectUrl, openConnectUrl]);

  if (state.isConnected) {
    return (
      <div>
        <p>Connected as: {state.agentDid}</p>
        <button onClick={() => {/* handle logout */}}>Logout</button>
      </div>
    );
  }

  return (
    <button 
      onClick={handleConnect} 
      disabled={state.isConnecting || isPreparingUrl || !connectUrl}
    >
      {state.isConnecting ? 'Connecting…' : 
       isPreparingUrl ? 'Preparing…' : 
       !connectUrl ? 'Loading…' : 
       'Sign-in with DID'}
    </button>
  );
}

/**
 * Example 2: Advanced usage with retry and error handling
 * This shows how to handle errors and provide retry functionality
 */
export function AdvancedConnectButton() {
  const { state, buildConnectUrl, openConnectUrl } = useIdentityKit();
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isPreparingUrl, setIsPreparingUrl] = useState(false);

  // Function to prepare/rebuild the connect URL
  const prepareConnectUrl = useCallback(async () => {
    if (isPreparingUrl) return;
    
    setIsPreparingUrl(true);
    setUrlError(null);

    try {
      const url = await buildConnectUrl();
      setConnectUrl(url);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setUrlError(errorMessage);
      console.error('Failed to build connect URL:', error);
    } finally {
      setIsPreparingUrl(false);
    }
  }, [buildConnectUrl, isPreparingUrl]);

  // Prepare URL when component mounts or when needed
  useEffect(() => {
    if (!state.isConnected && !connectUrl && !urlError && !isPreparingUrl) {
      prepareConnectUrl();
    }
  }, [state.isConnected, connectUrl, urlError, isPreparingUrl, prepareConnectUrl]);

  // Handle connection
  const handleConnect = useCallback(() => {
    if (connectUrl) {
      openConnectUrl(connectUrl);
      setConnectUrl(null); // Clear for next use
    } else if (urlError) {
      // Retry building URL
      prepareConnectUrl();
    }
  }, [connectUrl, urlError, openConnectUrl, prepareConnectUrl]);

  if (state.isConnected) {
    return (
      <div>
        <p>✅ Connected as: {state.agentDid}</p>
        <button onClick={() => {/* handle logout */}}>Logout</button>
      </div>
    );
  }

  return (
    <div>
      <button 
        onClick={handleConnect}
        disabled={state.isConnecting || isPreparingUrl}
      >
        {state.isConnecting ? 'Connecting…' : 
         isPreparingUrl ? 'Preparing…' : 
         urlError ? 'Retry Connection' : 
         !connectUrl ? 'Loading…' : 
         'Sign-in with DID'}
      </button>
      
      {urlError && (
        <div style={{ color: 'red', fontSize: '12px', marginTop: '5px' }}>
          Error: {urlError}
        </div>
      )}
      
      {state.error && (
        <div style={{ color: 'red', fontSize: '12px', marginTop: '5px' }}>
          Connection Error: {state.error}
        </div>
      )}
    </div>
  );
}

/**
 * Example 3: Using the SDK directly (non-React)
 * This shows how to use the new methods with plain JavaScript
 */
export class DirectSDKUsage {
  private sdk: any = null;
  private connectUrl: string | null = null;

  async initialize() {
    // Initialize the SDK
    this.sdk = await IdentityKitWeb.init({
      appName: 'My App',
      cadopDomain: 'https://test-id.nuwa.dev'
    });

    // Pre-build the connect URL
    await this.prepareConnectUrl();
  }

  async prepareConnectUrl() {
    try {
      this.connectUrl = await this.sdk.buildConnectUrl();
      console.log('Connect URL prepared:', this.connectUrl);
    } catch (error) {
      console.error('Failed to prepare connect URL:', error);
    }
  }

  // Call this in a user action handler (e.g., button click)
  handleConnect() {
    if (this.connectUrl) {
      this.sdk.openConnectUrl(this.connectUrl);
      this.connectUrl = null; // Clear for next use
    } else {
      console.error('No connect URL available');
    }
  }

  // Example of setting up event listeners
  setupEventListeners() {
    const connectButton = document.getElementById('connect-button');
    if (connectButton) {
      connectButton.addEventListener('click', () => {
        this.handleConnect();
      });
    }
  }
}

/**
 * Example 4: Migration from legacy connect method
 * This shows how to migrate existing code to use the new approach
 */
export function MigrationExample() {
  const { state, connect, buildConnectUrl, openConnectUrl } = useIdentityKit();
  const [useNewMethod, setUseNewMethod] = useState(true);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);

  // Prepare URL for new method
  useEffect(() => {
    if (useNewMethod && !state.isConnected && !connectUrl) {
      buildConnectUrl().then(setConnectUrl).catch(console.error);
    }
  }, [useNewMethod, state.isConnected, connectUrl, buildConnectUrl]);

  // Legacy connect method
  const handleLegacyConnect = useCallback(async () => {
    try {
      await connect();
    } catch (error) {
      console.error('Legacy connect failed:', error);
    }
  }, [connect]);

  // New popup-safe connect method
  const handleNewConnect = useCallback(() => {
    if (connectUrl) {
      openConnectUrl(connectUrl);
      setConnectUrl(null);
    }
  }, [connectUrl, openConnectUrl]);

  if (state.isConnected) {
    return <div>Connected!</div>;
  }

  return (
    <div>
      <div>
        <label>
          <input 
            type="checkbox" 
            checked={useNewMethod}
            onChange={(e) => setUseNewMethod(e.target.checked)}
          />
          Use popup-safe method (recommended)
        </label>
      </div>
      
      <button 
        onClick={useNewMethod ? handleNewConnect : handleLegacyConnect}
        disabled={state.isConnecting || (useNewMethod && !connectUrl)}
      >
        {state.isConnecting ? 'Connecting…' : 
         useNewMethod ? 'Connect (Popup-Safe)' : 'Connect (Legacy)'}
      </button>
      
      <small style={{ display: 'block', marginTop: '10px', color: '#666' }}>
        {useNewMethod ? 
          'Using new popup-safe method - won\'t be blocked by browsers' : 
          'Using legacy method - may be blocked by popup blockers'}
      </small>
    </div>
  );
}

// Export types for use in other files
export interface ConnectUrlState {
  url: string | null;
  isLoading: boolean;
  error: string | null;
}

// Custom hook for managing connect URL state
export function useConnectUrl() {
  const { state, buildConnectUrl } = useIdentityKit();
  const [urlState, setUrlState] = useState<ConnectUrlState>({
    url: null,
    isLoading: false,
    error: null
  });

  const prepareUrl = useCallback(async () => {
    if (urlState.isLoading || state.isConnected) return;

    setUrlState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const url = await buildConnectUrl();
      setUrlState({ url, isLoading: false, error: null });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setUrlState({ url: null, isLoading: false, error: errorMessage });
    }
  }, [buildConnectUrl, urlState.isLoading, state.isConnected]);

  const clearUrl = useCallback(() => {
    setUrlState(prev => ({ ...prev, url: null }));
  }, []);

  return {
    ...urlState,
    prepareUrl,
    clearUrl
  };
}