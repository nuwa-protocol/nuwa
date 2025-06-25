import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { DIDDisplay } from '@/components/did/DIDDisplay';
import { useAuth } from '../lib/auth/AuthContext';
import { useDIDService } from '../hooks/useDIDService';
import { Alert, Tabs, Space, Typography, message } from 'antd';
import {
  ArrowLeft,
  Settings,
  Key,
  History,
  Users,
  FileText,
  RotateCcw,
  Gift,
  Trash2
} from 'lucide-react';
import type { DIDDocument, VerificationMethod } from '@nuwa-ai/identity-kit';
import { useAgentBalances } from '../hooks/useAgentBalances';
import { claimTestnetGas } from '@/lib/rooch/faucet';
import { Modal, Spinner, SpinnerContainer, Tag } from '@/components/ui';
import { buildRoochScanAccountUrl } from '@/config/env';

const { TabPane } = Tabs;
const { Title, Text, Paragraph } = Typography;

export function AgentDetailPage() {
  const { t } = useTranslation();
  const { did } = useParams<{ did: string }>();
  const navigate = useNavigate();
  const { userDid, isAuthenticated } = useAuth();
  const {
    didService,
    isLoading: serviceLoading,
    error: serviceError,
  } = useDIDService(did);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didDocument, setDidDocument] = useState<DIDDocument | null>(null);
  const [showDidDocument, setShowDidDocument] = useState(false);
  const [isController, setIsController] = useState(false);
  // state for delete confirmation modal
  const [pendingDeletion, setPendingDeletion] = useState<VerificationMethod | null>(null);

  const {
    balances,
    isLoading: balanceLoading,
    isError: balanceError,
    refetch: refetchBalances,
  } = useAgentBalances(did);

  // ---------------- RGAS Faucet Claim ----------------
  const [isClaiming, setIsClaiming] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);

  // Extract Rooch address from DID (format: did:rooch:<address>)
  const agentAddress = did ? did.split(':')[2] : undefined;
  const FAUCET_URL = undefined; // use default

  const handleClaimRgas = async () => {
    if (isClaiming || hasClaimed || !agentAddress) return;

    setIsClaiming(true);

    try {
      const claimed = await claimTestnetGas(agentAddress, FAUCET_URL || undefined);
      const data = { gas: claimed };
      await refetchBalances();
      setHasClaimed(true);
      message.success(
        `Successfully claimed ${Math.floor((data.gas || 5000000000) / 100000000)} RGAS!`
      );
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
    if (didService) {
      loadAgentInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [didService, userDid]);

  const loadAgentInfo = async () => {
    if (!didService) return;

    setLoading(true);
    setError(null);

    try {
      const doc = await didService.getDIDDocument();

      if (doc) {
        setDidDocument(doc);

        if (isAuthenticated && userDid) {
          const hasControllerAccess = doc.verificationMethod?.some(
            (method: VerificationMethod) => method.controller === userDid
          );
          setIsController(!!hasControllerAccess);
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

  const handleRemoveKey = async (keyId: string) => {
    if (!didService) return;
    try {
      setLoading(true);
      await didService.removeVerificationMethod(keyId);
      const updatedDoc = await didService.getDIDDocument();
      setDidDocument(updatedDoc);
      message.success(t('agent.removed', { defaultValue: 'Removed' }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(msg);
    } finally {
      setLoading(false);
      setPendingDeletion(null);
    }
  };

  const confirmRemoveKey = (method: VerificationMethod) => {
    setPendingDeletion(method);
  };

  const handleCancelDelete = () => {
    setPendingDeletion(null);
  };

  if (loading || serviceLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spinner size="large" />
      </div>
    );
  }

  if (error || serviceError) {
    const errMsg = error || serviceError;
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Alert message={t('common.error')} description={errMsg} type="error" showIcon />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Button>

          <div className="flex justify-between items-center">
            <Title level={2}>{t('agent.details')}</Title>
            <Button variant="outline" onClick={() => setShowDidDocument(true)}>
              <FileText className="mr-2 h-4 w-4" />
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
                <DIDDisplay did={did || ''} showCopy={true} status="active" />
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
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {balanceLoading ? (
                  <SpinnerContainer loading={true} size="small" />
                ) : balances.length > 0 ? (
                  <div className="space-y-2">
                    {balances.map((bal, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0"
                      >
                        <div className="flex items-center">
                          <Text strong>{bal.symbol}</Text>
                          <Text type="secondary" className="ml-2 text-xs">
                            {bal.name}
                          </Text>
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
                    const isCapabilityInvocation = didDocument.capabilityInvocation?.includes(
                      method.id
                    );
                    const isCapabilityDelegation = didDocument.capabilityDelegation?.includes(
                      method.id
                    );

                    return (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <Key className="mr-2 h-4 w-4" />
                          <Text strong className="font-mono">
                            {fragment}
                          </Text>
                          <Text className="ml-2">{method.type}</Text>
                          {method.controller === userDid && (
                            <Tag color="blue" className="ml-2">
                              {t('agent.controller')}
                            </Tag>
                          )}
                          {isController && method.controller !== userDid && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="ml-2 text-destructive hover:bg-destructive/10"
                              onClick={() => confirmRemoveKey(method)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mb-2">
                          {t('agent.controllerLabel')}: {method.controller}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center">
                            <Users className="mr-2 h-4 w-4" />
                            <Text type="secondary">{t('agent.capabilities')}:</Text>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {isAuthentication && (
                              <Tag color="green">{t('agent.authentication')}</Tag>
                            )}
                            {isAssertionMethod && <Tag color="blue">{t('agent.assertion')}</Tag>}
                            {isKeyAgreement && <Tag color="purple">{t('agent.keyAgreement')}</Tag>}
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
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => handleClaimRgas()}
                      disabled={isClaiming || hasClaimed || !agentAddress}
                    >
                      <Gift className="mr-2 h-4 w-4" />
                      {!agentAddress
                        ? 'Invalid Address'
                        : isClaiming
                          ? t('agent.claiming', { defaultValue: 'Claiming...' })
                          : hasClaimed
                            ? t('agent.claimed', { defaultValue: 'Claimed' })
                            : t('agent.claimRgas', { defaultValue: 'Claim RGAS' })}
                    </Button>
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => navigate(`/agent/${did}/add-auth-method`)}
                    >
                      <Key className="mr-2 h-4 w-4" />
                      {t('agent.addAuthMethod')}
                    </Button>
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={!agentAddress}
                      onClick={() => {
                        if (!agentAddress) return;
                        window.open(buildRoochScanAccountUrl(agentAddress), '_blank');
                      }}
                    >
                      <History className="mr-2 h-4 w-4" />
                      {t('agent.viewHistory')}
                    </Button>
                  </Space>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

      </div>

      <Modal
        title={t('agent.didDocument')}
        open={showDidDocument}
        onClose={() => setShowDidDocument(false)}
        width={800}
      >
        {/* Container set with max height and scroll to ensure long documents are viewable */}
        <div className="bg-gray-50 p-4 rounded-lg max-h-[70vh] overflow-y-auto">
          <pre className="whitespace-pre-wrap text-sm overflow-x-auto">
            {JSON.stringify(didDocument, null, 2)}
          </pre>
        </div>
      </Modal>

      <Modal
        title={t('agent.confirmDelete', { defaultValue: 'Confirm delete key' })}
        open={!!pendingDeletion}
        onClose={handleCancelDelete}
        width="sm"
      >
        <div className="space-y-4">
          <p>{t('agent.deleteKeyPrompt', {
            defaultValue: 'Are you sure you want to delete this authentication method?',
          })}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancelDelete}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDeletion) handleRemoveKey(pendingDeletion.id);
              }}
            >
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
