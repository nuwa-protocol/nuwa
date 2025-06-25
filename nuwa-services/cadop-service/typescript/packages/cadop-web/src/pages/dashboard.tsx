import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '../lib/auth/AuthContext';
import { DIDDisplay } from '@/components/did/DIDDisplay';
import { custodianClient } from '../lib/api/client';
import { Spin, Alert, Tooltip, Button as AntButton } from 'antd';
import { InfoCircleOutlined, PlusCircleOutlined } from '@ant-design/icons';
import { AgentService } from '../lib/agent/AgentService';

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userDid, signOut } = useAuth();
  const agentService = new AgentService();
  const [agentDids, setAgentDids] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userDid) {
      setAgentDids(agentService.getCachedAgentDIDs(userDid));
    }
  }, [userDid]);

  return (
    <MainLayout hasSidebar={false}>
      <div className="max-w-7xl mx-auto">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">{t('dashboard.identity.title')}</h2>
              <Tooltip title={t('dashboard.identity.agentDidTooltip')}>
                <InfoCircleOutlined className="text-gray-400" />
              </Tooltip>
            </div>

            <div className="mt-4 border-t border-gray-200 pt-4">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                {userDid && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">
                      {t('dashboard.identity.userDid')}
                      <Tooltip title={t('dashboard.identity.userDidTooltip')}>
                        <InfoCircleOutlined className="ml-1 text-gray-400" />
                      </Tooltip>
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      <DIDDisplay did={userDid} />
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>

        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">{t('dashboard.agent.title')}</h2>
              <AntButton
                onClick={() => navigate('/create-agent-did')}
                icon={<PlusCircleOutlined />}
                type="primary"
              >
                {t('dashboard.agent.createNew')}
              </AntButton>
            </div>

            {error && (
              <Alert
                message={t('common.error')}
                description={error}
                type="error"
                closable
                className="mb-4"
              />
            )}

            {loading ? (
              <div className="flex justify-center py-8">
                <Spin size="large" />
              </div>
            ) : agentDids.length > 0 ? (
              <div className="grid gap-4">
                {agentDids.map((did, index) => (
                  <div key={did} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-500">
                          Agent DID {index + 1}
                        </div>
                        <DIDDisplay did={did} />
                      </div>
                      <AntButton onClick={() => navigate(`/agent/${did}`)} size="small">
                        {t('dashboard.agent.manage')}
                      </AntButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>{t('dashboard.agent.noAgents')}</p>
                <AntButton
                  onClick={() => navigate('/create-agent-did')}
                  type="primary"
                  className="mt-4"
                >
                  {t('dashboard.agent.createFirst')}
                </AntButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
