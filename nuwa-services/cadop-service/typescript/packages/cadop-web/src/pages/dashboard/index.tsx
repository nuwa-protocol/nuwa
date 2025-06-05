import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '../../lib/auth/AuthContext';
import { DIDDisplay } from '@/components/did/DIDDisplay';

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, signOut } = useAuth();

  const quickActions = [
    {
      title: t('dashboard.createDID'),
      icon: '🆕',
      onClick: () => navigate('/create-did'),
    },
    {
      title: t('dashboard.verifyIdentity'),
      icon: '✅',
      onClick: () => navigate('/verification'),
    },
    {
      title: t('dashboard.manageDID'),
      icon: '⚙️',
      onClick: () => navigate('/did-management'),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">CADOP</h1>
              </div>
            </div>
            <div className="flex items-center">
              <button
                onClick={signOut}
                className="ml-4 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900">账户信息</h2>
            <div className="mt-4 border-t border-gray-200 pt-4">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">用户 ID</dt>
                  <dd className="mt-1 text-sm text-gray-900">{session?.user?.id}</dd>
                </div>
                
                {session?.user?.userDid && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">DID</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      <DIDDisplay did={session.user.userDid} />
                    </dd>
                  </div>
                )}
                
              </dl>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 