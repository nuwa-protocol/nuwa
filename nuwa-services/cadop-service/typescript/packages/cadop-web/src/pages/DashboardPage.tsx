import { useAuth } from '../lib/auth/AuthContext';
import { DIDDisplay } from '../components/did/DIDDisplay';

export function DashboardPage() {
  const { session, signOut } = useAuth();

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">
            Please sign in to access the dashboard
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <button
              onClick={signOut}
              className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Sign Out
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium text-gray-900">User Information</h2>
              <dl className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="bg-gray-50 px-4 py-5 shadow rounded-lg overflow-hidden sm:p-6">
                  <dt className="text-sm font-medium text-gray-500">Email</dt>
                  <dd className="mt-1 text-sm text-gray-900">{session.email || 'Not provided'}</dd>
                </div>
                <div className="bg-gray-50 px-4 py-5 shadow rounded-lg overflow-hidden sm:p-6">
                  <dt className="text-sm font-medium text-gray-500">Sybil Level</dt>
                  <dd className="mt-1 text-sm text-gray-900">{session.sybil_level}</dd>
                </div>
              </dl>
            </div>

            <div>
              <h2 className="text-lg font-medium text-gray-900">DID Information</h2>
              <div className="mt-2 space-y-4">
                {session.did && (
                  <div className="bg-gray-50 px-4 py-5 shadow rounded-lg overflow-hidden sm:p-6">
                    <dt className="text-sm font-medium text-gray-500">User DID</dt>
                    <dd className="mt-1">
                      <DIDDisplay did={session.did} />
                    </dd>
                  </div>
                )}
                {session.agent_did && (
                  <div className="bg-gray-50 px-4 py-5 shadow rounded-lg overflow-hidden sm:p-6">
                    <dt className="text-sm font-medium text-gray-500">Agent DID</dt>
                    <dd className="mt-1">
                      <DIDDisplay did={session.agent_did} />
                    </dd>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 