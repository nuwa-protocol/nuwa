import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DIDDisplay } from '@/components/did/DIDDisplay';
import { useAuth } from '../lib/auth/AuthContext';
import { custodianClient } from '../lib/api/client';
import { Spin, Alert, Tabs, Space, Typography, Tag, Modal } from 'antd';
import { 
  ArrowLeftOutlined, 
  SettingOutlined, 
  KeyOutlined,
  HistoryOutlined,
  TeamOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import type { DIDDocument } from '@cadop/shared';

const { TabPane } = Tabs;
const { Title, Text, Paragraph } = Typography;

export function AgentDetailPage() {
  const { t } = useTranslation();
  const { did } = useParams<{ did: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didDocument, setDidDocument] = useState<DIDDocument | null>(null);
  const [showDidDocument, setShowDidDocument] = useState(false);

  useEffect(() => {
    if (did) {
      loadAgentInfo();
    }
  }, [did]);

  const loadAgentInfo = async () => {
    if (!did) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await custodianClient.resolveAgentDID(did);
      if (response.data) {
        setDidDocument(response.data);
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
            <Title level={2}>Agent Details</Title>
            <Button
              variant="outline"
              onClick={() => setShowDidDocument(true)}
            >
              <FileTextOutlined className="mr-2" />
              View DID Document
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column - Agent Info */}
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Agent Identity</CardTitle>
              </CardHeader>
              <CardContent>
                <DIDDisplay 
                  did={did || ''} 
                  showCopy={true}
                  showQR={true}
                  status="active"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Authentication Methods</CardTitle>
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
                          {method.controller === did && (
                            <Tag color="blue" className="ml-2">Controller</Tag>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mb-2">
                          {method.id}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center">
                            <TeamOutlined className="mr-2" />
                            <Text type="secondary">Capabilities:</Text>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {isAuthentication && (
                              <Tag color="green">Authentication</Tag>
                            )}
                            {isAssertionMethod && (
                              <Tag color="blue">Assertion</Tag>
                            )}
                            {isKeyAgreement && (
                              <Tag color="purple">Key Agreement</Tag>
                            )}
                            {isCapabilityInvocation && (
                              <Tag color="orange">Capability Invocation</Tag>
                            )}
                            {isCapabilityDelegation && (
                              <Tag color="cyan">Capability Delegation</Tag>
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
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Button className="w-full" variant="outline" onClick={() => navigate(`/agent/${did}/add-auth-method`)}>
                    <KeyOutlined className="mr-2" />
                    Add Authentication Method
                  </Button>
                  <Button className="w-full" variant="outline">
                    <SettingOutlined className="mr-2" />
                    Manage Settings
                  </Button>
                  <Button className="w-full" variant="outline">
                    <HistoryOutlined className="mr-2" />
                    View History
                  </Button>
                </Space>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bottom Section - Activity and History */}
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Activity History</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultActiveKey="1">
                <TabPane tab="Recent Activity" key="1">
                  <div className="text-center py-8 text-gray-500">
                    No recent activity
                  </div>
                </TabPane>
                <TabPane tab="Transactions" key="2">
                  <div className="text-center py-8 text-gray-500">
                    No transactions found
                  </div>
                </TabPane>
                <TabPane tab="Credentials" key="3">
                  <div className="text-center py-8 text-gray-500">
                    No credentials issued
                  </div>
                </TabPane>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal
        title="DID Document"
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