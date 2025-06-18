import { useState } from 'react';
import { generateKeyAndBuildUrl } from '../services/DeepLink';

interface ConnectButtonProps {
  onConnecting?: () => void;
  onError?: (error: Error) => void;
}

export function ConnectButton({ onConnecting, onError }: ConnectButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = async () => {
    try {
      setIsLoading(true);
      onConnecting?.();

      // Generate key pair and build deep-link URL
      const { publicKey, privateKey, url } = await generateKeyAndBuildUrl();

      // Store the keys temporarily in sessionStorage for the callback to retrieve
      // Convert Uint8Array to base64 string using browser APIs
      const publicKeyBase64 = btoa(String.fromCharCode.apply(null, Array.from(publicKey)));
      const privateKeyBase64 = btoa(String.fromCharCode.apply(null, Array.from(privateKey)));
      
      sessionStorage.setItem('nuwa-login-demo:temp-public-key', publicKeyBase64);
      sessionStorage.setItem('nuwa-login-demo:temp-private-key', privateKeyBase64);

      // Open the deep-link URL in a new window
      window.open(url, '_blank', 'width=600,height=800');
    } catch (err) {
      console.error('Failed to connect:', err);
      onError?.(err instanceof Error ? err : new Error('Failed to connect'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button 
      onClick={handleConnect} 
      disabled={isLoading}
      className="connect-button"
    >
      {isLoading ? 'Connecting...' : 'Connect with Nuwa Agent'}
    </button>
  );
} 