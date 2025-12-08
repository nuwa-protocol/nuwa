import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { WebAuthnLogin } from './WebAuthnLogin';
import { WalletLogin } from './WalletLogin';
import { WalletErrorBoundary } from './WalletErrorBoundary';
import { useAuth } from '../../lib/auth/AuthContext';
import { AuthMethod } from '../../lib/storage/types';

interface AuthMethodSelectorProps {
  onSuccess?: (userDid: string, isNew: boolean) => void;
  onError?: (error: string) => void;
}

export function AuthMethodSelector({ onSuccess, onError }: AuthMethodSelectorProps) {
  const [supportedMethods, setSupportedMethods] = useState<AuthMethod[]>([]);
  const [activeTab, setActiveTab] = useState<AuthMethod>(AuthMethod.PASSKEY);
  const { getSupportedAuthMethods } = useAuth();

  useEffect(() => {
    let isMounted = true;
    async function loadSupportedMethods() {
      try {
        const methods = await getSupportedAuthMethods();

        if (!isMounted) return; // Component was unmounted

        setSupportedMethods(methods);

        // Set default tab to first supported method
        if (methods.length > 0) {
          setActiveTab(methods[0]);
        } else {
          console.warn(
            '[AuthMethodSelector] No supported auth methods found, falling back to Passkey'
          );
          setSupportedMethods([AuthMethod.PASSKEY]);
          setActiveTab(AuthMethod.PASSKEY);
        }
      } catch (error) {
        console.error('[AuthMethodSelector] Failed to load supported auth methods:', error);

        if (!isMounted) return; // Component was unmounted

        // Fallback to Passkey only
        setSupportedMethods([AuthMethod.PASSKEY]);
        setActiveTab(AuthMethod.PASSKEY);
      }
    }

    loadSupportedMethods();

    return () => {
      isMounted = false;
    };
  }, [getSupportedAuthMethods]);

  const getMethodLabel = (method: AuthMethod): string => {
    switch (method) {
      case AuthMethod.PASSKEY:
        return 'Passkey';
      case AuthMethod.WALLET:
        return 'Wallet';
      default:
        return method;
    }
  };

  const getMethodIcon = (method: AuthMethod) => {
    switch (method) {
      case AuthMethod.PASSKEY:
        return (
          <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z"
              clipRule="evenodd"
            />
          </svg>
        );
      case AuthMethod.WALLET:
        return (
          <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 6a2 2 0 114 0 2 2 0 01-4 0zm6 0a2 2 0 114 0 2 2 0 01-4 0z"
              clipRule="evenodd"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  if (supportedMethods.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-gray-500">Loading authentication methods...</p>
      </div>
    );
  }

  // If only one method is supported, show it directly without tabs
  if (supportedMethods.length === 1) {
    const method = supportedMethods[0];
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 flex items-center justify-center">
            {getMethodIcon(method)}
            Sign in with {getMethodLabel(method)}
          </h3>
        </div>

        {method === AuthMethod.PASSKEY && <WebAuthnLogin onSuccess={onSuccess} onError={onError} />}
        {method === AuthMethod.WALLET && (
          <WalletErrorBoundary onError={onError}>
            <WalletLogin onSuccess={onSuccess} onError={onError} />
          </WalletErrorBoundary>
        )}
      </div>
    );
  }

  // Multiple methods available, show tabs
  return (
    <Tabs
      value={activeTab}
      onValueChange={value => setActiveTab(value as AuthMethod)}
      className="w-full"
    >
      <TabsList className="grid w-full grid-cols-2">
        {supportedMethods.map(method => (
          <TabsTrigger key={method} value={method} className="flex items-center">
            {getMethodIcon(method)}
            {getMethodLabel(method)}
          </TabsTrigger>
        ))}
      </TabsList>

      {supportedMethods.includes(AuthMethod.PASSKEY) && (
        <TabsContent value={AuthMethod.PASSKEY} className="mt-6">
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900">Sign in with Passkey</h3>
              <p className="text-sm text-gray-600 mt-1">
                Use your device&apos;s built-in authentication
              </p>
            </div>
            <WebAuthnLogin onSuccess={onSuccess} onError={onError} />
          </div>
        </TabsContent>
      )}

      {supportedMethods.includes(AuthMethod.WALLET) && (
        <TabsContent value={AuthMethod.WALLET} className="mt-6">
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900">Sign in with Wallet</h3>
              <p className="text-sm text-gray-600 mt-1">Connect your Bitcoin wallet to sign in</p>
            </div>
            <WalletErrorBoundary onError={onError}>
              <WalletLogin onSuccess={onSuccess} onError={onError} />
            </WalletErrorBoundary>
          </div>
        </TabsContent>
      )}
    </Tabs>
  );
}
