import { useState } from 'react';
import { useAuth } from '../App';

interface ConnectButtonProps {
  onConnecting?: () => void;
  onError?: (error: Error) => void;
}

export function ConnectButton({ onConnecting, onError }: ConnectButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { connect } = useAuth();

  const handleConnect = async () => {
    try {
      setIsLoading(true);
      onConnecting?.();

      // Use the connect method from the hook
      await connect();
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