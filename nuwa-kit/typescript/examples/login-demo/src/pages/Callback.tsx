import { useEffect, useState } from 'react';
import { IdentityKitWeb } from '@nuwa-ai/identity-kit/web';

export function Callback() {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing authorization...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Initialize SDK and handle callback
        const sdk = await IdentityKitWeb.init({
          appName: 'Nuwa Login Demo',
        });
        await sdk.handleCallback(window.location.search);

        // Set success status
        setStatus('success');
        setMessage('Authorization successful! You can close this window.');

        // Notify the opener window if available
        if (window.opener) {
          window.opener.postMessage(
            {
              type: 'nuwa-auth-success',
            },
            window.location.origin
          );

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
    };

    handleCallback();
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
        {status === 'success' && <p>You can close this window and return to the application.</p>}
        {status === 'error' && <button onClick={() => window.close()}>Close Window</button>}
      </div>
    </div>
  );
}
