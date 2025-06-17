import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DIDDisplay } from '@/components/did/DIDDisplay';
import { useAuth } from '../lib/auth/AuthContext';
import { custodianClient } from '../lib/api/client';
import { Spin, Alert, Tabs, Space, Typography, Tag, Modal, message } from 'antd';
import { 
  ArrowLeftOutlined, 
  SettingOutlined, 
  KeyOutlined,
  HistoryOutlined,
  TeamOutlined,
  FileTextOutlined,
  ReloadOutlined,
  GiftOutlined
} from '@ant-design/icons';
import type { DIDDocument, VerificationMethod } from 'nuwa-identity-kit';
import { useAgentBalances } from '../hooks/useAgentBalances';

const { TabPane } = Tabs;
const { Title, Text, Paragraph } = Typography;

export function AgentDetailPage() {
  const { t } = useTranslation();
  const { did } = useParams<{ did: string }>();
  const navigate = useNavigate();
  const { userDid, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didDocument, setDidDocument] = useState<DIDDocument | null>(null);
  const [showDidDocument, setShowDidDocument] = useState(false);
  const [isController, setIsController] = useState(false);

  const { balances, isLoading: balanceLoading, isError: balanceError, refetch: refetchBalances } = useAgentBalances(did);

  // ---------------- RGAS Faucet Claim ----------------
  const [isClaiming, setIsClaiming] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);

  // Extract Rooch address from DID (format: did:rooch:<address>)
  const agentAddress = did ? did.split(':')[2] : undefined;
  const FAUCET_URL = 'https://test-faucet.rooch.network';

  const handleClaimRgas = async () => {
    if (isClaiming || hasClaimed || !agentAddress) return;

    setIsClaiming(true);

    try {
      const response = await fetch(`${FAUCET_URL}/faucet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ claimer: agentAddress }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Claim failed with status ${response.status}`);
      }

      const data = await response.json();
      await refetchBalances();
      setHasClaimed(true);
      message.success(`Successfully claimed ${Math.floor((data.gas || 5000000000) / 100000000)} RGAS!`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to claim RGAS';
      message.error(errMsg);
      console.error('RGAS claim failed:', err);
    } finally {
      setIsClaiming(false);
    }
  };
  // ---------------------------------------------------

  useEffect(() => {
    if (did) {
      loadAgentInfo();
    }
  }, [did, userDid]);

  const loadAgentInfo = async () => {
    if (!did) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await custodianClient.resolveAgentDID(did);
      if (response.data) {
        setDidDocument(response.data);
        
        if (isAuthenticated && userDid) {
          const hasControllerAccess = response.data.verificationMethod?.some(
            (method: VerificationMethod) => method.controller === userDid
          );
          setIsController(hasControllerAccess);
        } else {
          setIsController(false);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Alert
          message={t('common.error')}
          description={error}
          type="error"
          showIcon
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-4"
          >
            <ArrowLeftOutlined className="mr-2" />
            {t('common.back')}
          </Button>
          
          <div className="flex justify-between items-center">
            <Title level={2}>{t('agent.details')}</Title>
            <Button
              variant="outline"
              onClick={() => setShowDidDocument(true)}
            >
              <FileTextOutlined className="mr-2" />
              {t('agent.viewDidDocument')}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column - Agent Info */}
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('agent.identity')}</CardTitle>
              </CardHeader>
              <CardContent>
                <DIDDisplay 
                  did={did || ''} 
                  showCopy={true}
                  showQR={true}
                  status="active"
                />
                {isController && (
                  <div className="mt-2">
                    <Tag color="green">{t('agent.youAreController')}</Tag>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t('agent.balance')}</CardTitle>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => refetchBalances()} 
                  className="h-8 w-8 p-0"
                >
                  <ReloadOutlined />
                </Button>
              </CardHeader>
              <CardContent>
                {balanceLoading ? (
                  <div className="flex justify-center py-4">
                    <Spin size="small" />
                  </div>
                ) : balances.length > 0 ? (
                  <div className="space-y-2">
                    {balances.map((bal, idx) => (
                      <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                        <div className="flex items-center">
                          <Text strong>{bal.symbol}</Text>
                          <Text type="secondary" className="ml-2 text-xs">{bal.name}</Text>
                        </div>
                        <Text>{bal.fixedBalance}</Text>
                      </div>
                    ))}
                  </div>
                ) : balanceError ? (
                  <div className="text-center py-2">
                    <Text type="danger">{t('agent.balanceLoadFailed')}</Text>
                  </div>
                ) : (
                  <Text type="secondary">{t('agent.noBalance')}</Text>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('agent.authMethods')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  {didDocument?.verificationMethod?.map((method, index) => {
                    const fragment = method.id.split('#')[1];
                    const isAuthentication = didDocument.authentication?.includes(method.id);
                    const isAssertionMethod = didDocument.assertionMethod?.includes(method.id);
                    const isKeyAgreement = didDocument.keyAgreement?.includes(method.id);
                    const isCapabilityInvocation = didDocument.capabilityInvocation?.includes(method.id);
                    const isCapabilityDelegation = didDocument.capabilityDelegation?.includes(method.id);

                    return (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <KeyOutlined className="mr-2" />
                          <Text strong className="font-mono">{fragment}</Text>
                          <Text className="ml-2">{method.type}</Text>
                          {method.controller === userDid && (
                            <Tag color="blue" className="ml-2">{t('agent.controller')}</Tag>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mb-2">
                          {t('agent.controllerLabel')}: {method.controller}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center">
                            <TeamOutlined className="mr-2" />
                            <Text type="secondary">{t('agent.capabilities')}:</Text>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {isAuthentication && (
                              <Tag color="green">{t('agent.authentication')}</Tag>
                            )}
                            {isAssertionMethod && (
                              <Tag color="blue">{t('agent.assertion')}</Tag>
                            )}
                            {isKeyAgreement && (
                              <Tag color="purple">{t('agent.keyAgreement')}</Tag>
                            )}
                            {isCapabilityInvocation && (
                              <Tag color="orange">{t('agent.capabilityInvocation')}</Tag>
                            )}
                            {isCapabilityDelegation && (
                              <Tag color="cyan">{t('agent.capabilityDelegation')}</Tag>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </Space>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Actions */}
          {isController && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('agent.actions')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button className="w-full" variant="outline" onClick={() => handleClaimRgas()} disabled={isClaiming || hasClaimed || !agentAddress}>
                      <GiftOutlined className="mr-2" />
                      {!agentAddress
                        ? 'Invalid Address'
                        : isClaiming
                          ? t('agent.claiming', { defaultValue: 'Claiming...' })
                          : hasClaimed
                            ? t('agent.claimed', { defaultValue: 'Claimed' })
                            : t('agent.claimRgas', { defaultValue: 'Claim RGAS' })}
                    </Button>
                    <Button className="w-full" variant="outline" onClick={() => navigate(`/agent/${did}/add-auth-method`)}>
                      <KeyOutlined className="mr-2" />
                      {t('agent.addAuthMethod')}
                    </Button>
                    <Button className="w-full" variant="outline">
                      <SettingOutlined className="mr-2" />
                      {t('agent.manageSettings')}
                    </Button>
                    <Button className="w-full" variant="outline">
                      <HistoryOutlined className="mr-2" />
                      {t('agent.viewHistory')}
                    </Button>
                  </Space>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Bottom Section - Activity and History */}
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('agent.activityHistory')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultActiveKey="1">
                <TabPane tab={t('agent.recentActivity')} key="1">
                  <div className="text-center py-8 text-gray-500">
                    {t('agent.noRecentActivity')}
                  </div>
                </TabPane>
                <TabPane tab={t('agent.transactions')} key="2">
                  <div className="text-center py-8 text-gray-500">
                    {t('agent.noTransactions')}
                  </div>
                </TabPane>
                <TabPane tab={t('agent.credentials')} key="3">
                  <div className="text-center py-8 text-gray-500">
                    {t('agent.noCredentials')}
                  </div>
                </TabPane>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal
        title={t('agent.didDocument')}
        open={showDidDocument}
        onCancel={() => setShowDidDocument(false)}
        footer={null}
        width={800}
      >
        <div className="bg-gray-50 p-4 rounded-lg">
          <pre className="whitespace-pre-wrap text-sm">
            {JSON.stringify(didDocument, null, 2)}
          </pre>
        </div>
      </Modal>
    </div>
  );
} 