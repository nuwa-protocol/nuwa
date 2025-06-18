import { useEffect, useState } from 'react';
import { KeyStore } from '../services/KeyStore';

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

    try {
      // Retrieve the temporary keys from sessionStorage
      const publicKeyBase64 = sessionStorage.getItem('nuwa-login-demo:temp-public-key');
      const privateKeyBase64 = sessionStorage.getItem('nuwa-login-demo:temp-private-key');

      if (!publicKeyBase64 || !privateKeyBase64) {
        throw new Error('Key material not found. The authorization flow may have been interrupted.');
      }

      // Convert from Base64 to Uint8Array using browser APIs
      const publicKeyBinary = atob(publicKeyBase64);
      const privateKeyBinary = atob(privateKeyBase64);
      
      const publicKey = new Uint8Array(publicKeyBinary.length);
      const privateKey = new Uint8Array(privateKeyBinary.length);
      
      for (let i = 0; i < publicKeyBinary.length; i++) {
        publicKey[i] = publicKeyBinary.charCodeAt(i);
      }
      
      for (let i = 0; i < privateKeyBinary.length; i++) {
        privateKey[i] = privateKeyBinary.charCodeAt(i);
      }

      // Store the key in KeyStore
      KeyStore.storeKeyPair(keyId, agentDid, publicKey, privateKey);

      // Clean up temporary storage
      sessionStorage.removeItem('nuwa-login-demo:temp-public-key');
      sessionStorage.removeItem('nuwa-login-demo:temp-private-key');

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