import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PasskeyService } from '../../lib/passkey/PasskeyService';
import { getPasskeyErrorInfo } from '../../lib/passkey/PasskeyErrorHandler';
import { useAuth } from '../../lib/auth/AuthContext';
import { UserStore } from '../../lib/storage';

interface WebAuthnLoginProps {
  onSuccess?: (userDid: string, isNew: boolean) => void;
  onError?: (error: string) => void;
}

export function WebAuthnLogin({ onSuccess, onError }: WebAuthnLoginProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { signInWithDid } = useAuth();
  const passkeyService = new PasskeyService();
  const { t } = useTranslation();

  // Determine available action
  const hasCredential = UserStore.hasAnyCredential();

  const handleSignInWithPasskey = async () => {
    setIsLoading(true);
    try {
      // We have credentials, proceed with login
      const userDid = await passkeyService.login({ mediation: 'required' });

      // Update auth context
      signInWithDid(userDid);
      onSuccess?.(userDid, false);
    } catch (error) {
      console.error('Passkey login failed:', error);
      const errorInfo = getPasskeyErrorInfo(error, t);
      onError?.(errorInfo.description);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNewDid = async () => {
    setIsLoading(true);
    try {
      const userDid = await passkeyService.ensureUser();
      // ensureUser already updates AuthStore inside PasskeyService

      // Update auth context
      signInWithDid(userDid);
      onSuccess?.(userDid, true);
    } catch (error) {
      console.error('Passkey registration failed:', error);
      const errorInfo = getPasskeyErrorInfo(error, t);
      onError?.(errorInfo.description);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {hasCredential ? (
        <button
          type="button"
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          onClick={handleSignInWithPasskey}
          disabled={isLoading}
        >
          {isLoading ? t('passkey.loading') : t('passkey.signInWithPasskey')}
        </button>
      ) : (
        <button
          type="button"
          className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          onClick={handleCreateNewDid}
          disabled={isLoading}
        >
          {isLoading ? t('passkey.loading') : t('passkey.createNewDid')}
        </button>
      )}
    </div>
  );
}
