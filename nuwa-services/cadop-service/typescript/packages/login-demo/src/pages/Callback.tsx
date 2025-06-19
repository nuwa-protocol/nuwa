import { useEffect, useState } from 'react';
import { KeyStore } from '../services/KeyStore';
import { BaseMultibaseCodec } from '@nuwa-ai/identity-kit';

export function Callback() {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing authorization...');

  useEffect(() => {
    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success') === '1';
    const keyId = params.get('key_id');
    const agentDid = params.get('agent');
    const error = params.get('error');
    const state = params.get('state');

    if (!success || !keyId || !agentDid) {
      setStatus('error');
      setMessage(error ? decodeURIComponent(error) : 'Authorization failed. Missing required parameters.');
      return;
    }

    // If a key is already stored (likely the second mount in React.StrictMode), treat as success immediately.
    if (KeyStore.hasKey()) {
      setStatus('success');
      setMessage('Authorization successful! You can close this window.');

      if (window.opener) {
        window.opener.postMessage(
          {
            type: 'nuwa-auth-success',
            keyId,
            agentDid,
            state,
          },
          window.location.origin,
        );
      }
      return;
    }

    try {
      // Retrieve the temporary keys from sessionStorage
      const publicKeyBase58 = sessionStorage.getItem('nuwa-login-demo:temp-public-key');
      const privateKeyBase58 = sessionStorage.getItem('nuwa-login-demo:temp-private-key');
      if (!publicKeyBase58 || !privateKeyBase58) {
        throw new Error('Key material not found. The authorization flow may have been interrupted.');
      }

      // Convert from Base58btc (string) to Uint8Array
      const publicKey = BaseMultibaseCodec.decodeBase58btc(publicKeyBase58);
      const privateKey = BaseMultibaseCodec.decodeBase58btc(privateKeyBase58);
      
      // Store the key in KeyStore
      KeyStore.storeKeyPair(keyId, agentDid, publicKey, privateKey);

      // Clean up temporary storage after a short delay so that the
      // second mount in React.StrictMode (development only) can still
      // access the data without throwing.
      setTimeout(() => {
        sessionStorage.removeItem('nuwa-login-demo:temp-public-key');
        sessionStorage.removeItem('nuwa-login-demo:temp-private-key');
      }, 2000);

      // Set success status
      setStatus('success');
      setMessage('Authorization successful! You can close this window.');

      // Notify the opener window if available
      if (window.opener) {
        window.opener.postMessage({ 
          type: 'nuwa-auth-success',
          keyId,
          agentDid,
          state
        }, window.location.origin);
        
        // Close the window after a short delay
        setTimeout(() => {
          window.close();
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to process callback:', err);
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to process authorization.');
    }
  }, []);

  return (
    <div className="callback-container">
      <div className={`callback-card ${status}`}>
        <h2>
          {status === 'processing' && 'Processing...'}
          {status === 'success' && 'Success!'}
          {status === 'error' && 'Error'}
        </h2>
        <p>{message}</p>
        {status === 'success' && (
          <p>You can close this window and return to the application.</p>
        )}
        {status === 'error' && (
          <button onClick={() => window.close()}>Close Window</button>
        )}
      </div>
    </div>
  );
} 