import { useState } from 'react';
import { PasskeyService } from '../../lib/passkey/PasskeyService';
import { useAuth } from '../../lib/auth/AuthContext';
import { AuthStore, UserStore } from '../../lib/storage';

interface WebAuthnLoginProps {
  onSuccess?: (userDid: string) => void;
  onError?: (error: string) => void;
}

export function WebAuthnLogin({ onSuccess, onError }: WebAuthnLoginProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { signInWithDid } = useAuth();
  const passkeyService = new PasskeyService();

  const handleSignInWithPasskey = async () => {
    setIsLoading(true);
    try {
      // First check if there are any credentials stored locally
      if (!UserStore.hasAnyCredential()) {
        // If no credentials exist, show a helpful message
        onError?.('No Passkey found on this device. Please create a new DID first.');
        return;
      }

      // We have credentials, proceed with login
      const userDid = await passkeyService.login({ mediation: 'required' });

      // Update auth context
      signInWithDid(userDid);
      onSuccess?.(userDid);
    } catch (error) {
      console.error('Passkey login failed:', error);
      onError?.(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNewDid = async () => {
    setIsLoading(true);
    try {
      const userDid = await passkeyService.ensureUser();
      // Note: ensureUser already sets the current user in AuthStore

      // Update auth context
      signInWithDid(userDid);
      onSuccess?.(userDid);
    } catch (error) {
      console.error('Passkey registration failed:', error);
      onError?.(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        onClick={handleSignInWithPasskey}
        disabled={isLoading}
      >
        {isLoading ? 'Loading...' : 'Sign in with Passkey'}
      </button>

      <button
        type="button"
        className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        onClick={handleCreateNewDid}
        disabled={isLoading}
      >
        {isLoading ? 'Loading...' : 'Create new DID'}
      </button>
    </div>
  );
}
