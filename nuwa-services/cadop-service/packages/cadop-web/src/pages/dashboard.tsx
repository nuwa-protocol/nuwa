import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Alert,
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
  Spinner,
} from '@/components/ui';
import { useAuth } from '../lib/auth/AuthContext';
import { DIDDisplay } from '@/components/did/DIDDisplay';
import { custodianClient } from '../lib/api/client';
import { Info, PlusCircle } from 'lucide-react';
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-gray-400" />
                  </TooltipTrigger>
                  <TooltipContent>{t('dashboard.identity.agentDidTooltip')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="mt-4 border-t border-gray-200 pt-4">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                {userDid && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">
                      {t('dashboard.identity.userDid')}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="ml-1 h-4 w-4 text-gray-400" />
                          </TooltipTrigger>
                          <TooltipContent>{t('dashboard.identity.userDidTooltip')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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
              <Button onClick={() => navigate('/create-agent-did')} className="flex items-center">
                <PlusCircle className="h-4 w-4 mr-2" />
                {t('dashboard.agent.createNew')}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <h4 className="font-medium">{t('common.error')}</h4>
                <p>{error}</p>
              </Alert>
            )}

            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner size="large" />
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
                      <Button onClick={() => navigate(`/agent/${did}`)} variant="outline" size="sm">
                        {t('dashboard.agent.manage')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>{t('dashboard.agent.noAgents')}</p>
                <Button onClick={() => navigate('/create-agent-did')} className="mt-4">
                  {t('dashboard.agent.createFirst')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
