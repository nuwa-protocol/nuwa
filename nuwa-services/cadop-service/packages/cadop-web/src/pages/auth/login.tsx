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
    <div className="relative min-h-screen overflow-hidden bg-slate-50">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-200/60 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-80 w-80 rounded-full bg-cyan-200/55 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-sky-200/55 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
            <img src="/favicon.svg" alt="Nuwa ID" className="h-full w-full object-contain" />
          </div>
          <p className="text-center text-xs uppercase tracking-[0.24em] text-sky-700/80">Nuwa ID</p>
          <h1 className="mt-3 text-center text-3xl font-bold text-slate-900">Secure DID Sign-In</h1>
          <p className="mt-2 text-center text-sm text-slate-600">
            Continue with passkey or wallet to access your DID workspace.
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-8 shadow-2xl shadow-slate-300/40 backdrop-blur sm:px-10">
            {error && (
              <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4">
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

            <AuthMethodSelector onSuccess={handleLoginSuccess} onError={handleLoginError} />
          </div>
        </div>
      </div>
    </div>
  );
}
