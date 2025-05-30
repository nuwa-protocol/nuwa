import { useState } from 'react';
import { PasskeyLogin } from '../components/auth/PasskeyLogin';
import { useNavigate } from 'react-router-dom';

export function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Welcome to CADOP
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Secure and decentralized identity management
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        <PasskeyLogin onError={setError} />
      </div>
    </div>
  );
} 