import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '../lib/auth/AuthContext';
import { DIDDisplay } from '@/components/did/DIDDisplay';
import { custodianClient } from '../lib/api/client';
import { Spin, Alert, Tooltip, Button as AntButton } from 'antd';
import { InfoCircleOutlined, PlusCircleOutlined } from '@ant-design/icons';

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, signOut } = useAuth();
  const [agentDids, setAgentDids] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.id) {
      loadAgentDids();
    }
  }, [session?.user?.id]);

  const loadAgentDids = async () => {
    if (!session?.user?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await custodianClient.getUserAgentDIDs(session.user.userDid);
      console.log('Agent DIDs response:', response);
      if (response.data) {
        setAgentDids(response.data.dids);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载 Agent DID 失败';
      setError(message);
    } finally {
      console.log('Agent DIDs:', agentDids);
      setLoading(false);
    }
  };

  const quickActions = [
    {
      title: t('dashboard.createDID'),
      icon: <PlusCircleOutlined />,
      onClick: () => navigate('/create-agent-did'),
      description: '创建新的 AI Agent DID'
    },
    {
      title: t('dashboard.verifyIdentity'),
      icon: '✅',
      onClick: () => navigate('/verification'),
      description: '验证身份信息'
    },
    {
      title: t('dashboard.manageDID'),
      icon: '⚙️',
      onClick: () => navigate('/did-management'),
      description: '管理 DID 和身份'
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
        {/* 用户身份信息卡片 */}
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">身份信息</h2>
              <Tooltip title="用户 DID 是您的主要身份标识，Agent DID 是您创建的 AI 代理身份">
                <InfoCircleOutlined className="text-gray-400" />
              </Tooltip>
            </div>
            
            <div className="mt-4 border-t border-gray-200 pt-4">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">用户 ID</dt>
                  <dd className="mt-1 text-sm text-gray-900">{session?.user?.id}</dd>
                </div>
                
                {session?.user?.userDid && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">
                      用户 DID
                      <Tooltip title="这是您的主要身份标识">
                        <InfoCircleOutlined className="ml-1 text-gray-400" />
                      </Tooltip>
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      <DIDDisplay did={session.user.userDid} />
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>

        {/* Agent DID 列表卡片 */}
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">AI Agent DIDs</h2>
              <AntButton
                onClick={() => navigate('/create-agent-did')}
                icon={<PlusCircleOutlined />}
                type="primary"
              >
                创建新 Agent
              </AntButton>
            </div>

            {error && (
              <Alert
                message="错误"
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
                  <div
                    key={did}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-500">Agent DID {index + 1}</div>
                        <DIDDisplay did={did} />
                      </div>
                      <AntButton
                        onClick={() => navigate(`/agent/${did}`)}
                        size="small"
                      >
                        管理
                      </AntButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>您还没有创建任何 Agent DID</p>
                <AntButton
                  onClick={() => navigate('/create-agent-did')}
                  type="primary"
                  className="mt-4"
                >
                  创建第一个 Agent
                </AntButton>
              </div>
            )}
          </div>
        </div>

        {/* 快速操作卡片 */}
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">快速操作</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {quickActions.map((action) => (
                <button
                  key={action.title}
                  onClick={action.onClick}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center">
                    <span className="text-2xl mr-3">{action.icon}</span>
                    <div>
                      <div className="font-medium">{action.title}</div>
                      <div className="text-sm text-gray-500">{action.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 