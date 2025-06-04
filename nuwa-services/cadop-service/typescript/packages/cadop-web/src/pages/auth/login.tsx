import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PasskeyLogin } from '../../components/auth/PasskeyLogin';
import { useAuth } from '../../lib/auth/AuthContext';
import type { UserSession } from '../../lib/auth/types';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  // Get the page user was trying to access
  const from = (location.state as { from?: Location })?.from?.pathname || '/dashboard';

  const handleLoginSuccess = (userId: string) => {
    // Create user session
    const session: UserSession = {
      id: userId,
      created_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
    };

    // Store session and redirect
    signIn(session);
    navigate(from, { replace: true });
  };

  const handleLoginError = (error: string) => {
    setError(error);
    // Clear error after 5 seconds
    setTimeout(() => setError(null), 5000);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="text-center text-3xl font-extrabold text-gray-900">
          Welcome to CADOP
        </h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          Sign in or create an account to continue
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* Error message */}
          {error && (
            <div className="mb-4 p-4 rounded-md bg-red-50">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Passkey login */}
          <div className="space-y-6">
              <div className="space-y-4">
                <PasskeyLogin
                  onSuccess={handleLoginSuccess}
                  onError={handleLoginError}
                />
              </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">or continue with</span>
              </div>
            </div>

            {/* Wallet login (placeholder) */}
            <div>
              <button
                type="button"
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                disabled
              >
                Connect Wallet (Coming Soon)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 