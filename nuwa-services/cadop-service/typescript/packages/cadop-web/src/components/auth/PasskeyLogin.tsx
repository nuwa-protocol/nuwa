import { useState, useCallback, useEffect } from 'react';
import { PasskeyService } from '../../lib/passkey/passkey-service';
import { useAuth } from '../../lib/auth/AuthContext';

interface PasskeyLoginProps {
  onSuccess: (userId: string) => void;
  onError: (error: string) => void;
  email?: string;
}

export function PasskeyLogin({ onSuccess, onError, email: initialEmail }: PasskeyLoginProps) {
  const [email, setEmail] = useState(initialEmail || '');
  const [isLoading, setIsLoading] = useState(false);
  const [onePasswordWarning, setOnePasswordWarning] = useState<string | null>(null);

  const { signIn } = useAuth();
  const passkeyService = new PasskeyService();

  // 检查 1Password 干扰
  useEffect(() => {
    const check1Password = async () => {
      const result = await passkeyService.check1PasswordInterference();
      if (result.detected) {
        setOnePasswordWarning(result.recommendation || '检测到 1Password 可能影响认证');
      }
    };
    
    check1Password();
  }, []);

  const handlePasskeyAuth = useCallback(async () => {
    try {
      setIsLoading(true);

      const isSupported = await passkeyService.isSupported();
      if (!isSupported) {
        onError('Your browser does not support Passkey authentication');
        return;
      }

      // 尝试认证，服务端会自动处理注册流程
      const authResult = await passkeyService.authenticate(email || undefined);
      if (authResult.success && authResult.session) {
        // Convert the session data to match AuthContext expectations
        const session = {
          ...authResult.session,
          user: {
            ...authResult.session.user,
            display_name: authResult.session.user.display_name ?? undefined
          }
        };
        signIn(session);
        onSuccess(authResult.session.user.id);
      } else {
        onError(authResult.error || 'Authentication failed');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  }, [email, onError, signIn, onSuccess]);

  return (
    <div className="flex flex-col space-y-4">
      <h2 className="text-xl font-semibold">Sign in with Passkey</h2>
      
      {onePasswordWarning && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 text-sm">
          <strong>⚠️ 提示：</strong> {onePasswordWarning}
        </div>
      )}
      
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
        onClick={handlePasskeyAuth}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        disabled={isLoading}
      >
        {isLoading ? 'Processing...' : 'Continue with Passkey'}
      </button>
    </div>
  );
} 