import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthMethodSelector } from '../../components/auth/AuthMethodSelector';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  // Get the page user was trying to access
  const from = (location.state as { from?: Location })?.from?.pathname || '/dashboard';

  const handleLoginSuccess = (_userDid: string, isNew: boolean) => {
    if (isNew) {
      // go to onboarding
      navigate('/setup?target=/dashboard', { replace: true });
    } else {
      navigate(from, { replace: true });
    }
  };

  const handleLoginError = (error: string) => {
    setError(error);
    // Clear error after 5 seconds
    setTimeout(() => setError(null), 5000);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="text-center text-3xl font-extrabold text-gray-900">Welcome to CADOP</h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          Choose your preferred sign-in method
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 rounded-md bg-red-50">
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

          {/* Authentication method selector */}
          <AuthMethodSelector onSuccess={handleLoginSuccess} onError={handleLoginError} />
        </div>
      </div>
    </div>
  );
}
