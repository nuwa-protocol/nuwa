import { useState, useCallback } from 'react';
import { PasskeyService } from '../../lib/passkey/passkey-service';
import { SupabaseAuthService } from '../../lib/supabase/auth-service';
import { useAuth } from '../../lib/auth/AuthContext';

interface PasskeyLoginProps {
  onSuccess: (userId: string) => void;
  onError: (error: string) => void;
  email?: string;
}

export function PasskeyLogin({ onSuccess, onError, email: initialEmail }: PasskeyLoginProps) {
  const [email, setEmail] = useState(initialEmail || '');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { signIn } = useAuth();
  const passkeyService = new PasskeyService();
  const supabaseAuthService = new SupabaseAuthService();

  const handlePasskeyAuth = useCallback(async () => {
    try {
      setIsLoading(true);

      const isSupported = await passkeyService.isSupported();
      if (!isSupported) {
        onError('Your browser does not support Passkey authentication');
        return;
      }

      const authResult = await passkeyService.authenticate(email || undefined);
      if (authResult.success && authResult.user_id) {
        const session = await supabaseAuthService.handlePasskeyResponse(authResult.user_id);
        signIn(session);
        onSuccess(authResult.user_id);
      } else {
        setIsRegistering(true);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  }, [onError, signIn, onSuccess, email]);

  const handlePasskeyRegistration = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      onError('Please enter your email');
      return;
    }

    try {
      setIsLoading(true);

      const registrationResult = await passkeyService.register(
        email,
        email,
        'Default Device'
      );

      if (registrationResult.success && registrationResult.user_id) {
        // After successful registration, try to authenticate immediately
        const authResult = await passkeyService.authenticate(email);
        if (authResult.success && authResult.user_id) {
          const session = await supabaseAuthService.handlePasskeyResponse(
            authResult.user_id,
            email
          );
          signIn(session);
          onSuccess(authResult.user_id);
        } else {
          onError('Registration successful but authentication failed');
        }
      } else {
        onError(registrationResult.error || 'Registration failed');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  }, [email, onError, signIn, onSuccess]);

  if (isRegistering) {
    return (
      <div className="flex flex-col space-y-4">
        <h2 className="text-xl font-semibold">Register with Passkey</h2>
        <form onSubmit={handlePasskeyRegistration} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              placeholder="Enter your email"
              required
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            disabled={isLoading}
          >
            {isLoading ? 'Registering...' : 'Register with Passkey'}
          </button>
        </form>
        <button
          onClick={() => setIsRegistering(false)}
          className="text-sm text-indigo-600 hover:text-indigo-500"
          disabled={isLoading}
        >
          ← Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4">
      <h2 className="text-xl font-semibold">Sign in with Passkey</h2>
      <button
        onClick={handlePasskeyAuth}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        disabled={isLoading}
      >
        {isLoading ? 'Authenticating...' : 'Continue with Passkey'}
      </button>
      <p className="text-sm text-gray-500 text-center">
        Don't have a Passkey?{' '}
        <button
          onClick={() => setIsRegistering(true)}
          className="text-indigo-600 hover:text-indigo-500"
          disabled={isLoading}
        >
          Register now
        </button>
      </p>
    </div>
  );
} 