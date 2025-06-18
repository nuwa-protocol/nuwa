import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '../lib/auth/AuthContext';
import { DIDService } from '../lib/did/DIDService';
import { Spin, Alert, Typography, Descriptions, Tag, Space } from 'antd';
import { ArrowLeftOutlined, KeyOutlined, SafetyOutlined, WarningOutlined } from '@ant-design/icons';
import {
  BaseMultibaseCodec,
  type OperationalKeyInfo,
  type VerificationRelationship,
} from '@nuwa-ai/identity-kit';
import { AgentSelector } from '../components/AgentSelector';
import { PasskeyService } from '../lib/passkey/PasskeyService';

const { Title, Text, Paragraph } = Typography;

// Payload interface definition
interface AddKeyPayload {
  version: number;
  agentDid?: string;
  verificationMethod: {
    type: string;
    publicKeyMultibase?: string;
    publicKeyJwk?: Record<string, any>;
    idFragment?: string;
  };
  verificationRelationships: VerificationRelationship[];
  redirectUri: string;
  state: string;
}

export function AddKeyPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { userDid, isAuthenticated, signInWithDid } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AddKeyPayload | null>(null);
  const [selectedAgentDid, setSelectedAgentDid] = useState<string | null>(null);
  const [didService, setDidService] = useState<DIDService | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);

  // Parse payload parameter
  useEffect(() => {
    const payloadParam = searchParams.get('payload');
    if (!payloadParam) {
      setError('Missing payload parameter');
      return;
    }

    try {
      // Base64URL decode
      const decodedPayload = atob(payloadParam.replace(/-/g, '+').replace(/_/g, '/'));
      const parsedPayload = JSON.parse(decodedPayload) as AddKeyPayload;
      
      // Validate required fields
      if (!parsedPayload.version || !parsedPayload.verificationMethod || !parsedPayload.redirectUri || !parsedPayload.state) {
        throw new Error('Invalid payload: missing required fields');
      }
      
      setPayload(parsedPayload);
      
      // If agentDid is specified, set it directly
      if (parsedPayload.agentDid) {
        setSelectedAgentDid(parsedPayload.agentDid);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse payload';
      setError(`Invalid payload format: ${message}`);
    }
  }, [searchParams]);

  // Initialize DIDService when user is authenticated and agentDid is selected
  useEffect(() => {
    if (isAuthenticated && selectedAgentDid) {
      initializeDIDService();
    }
  }, [isAuthenticated, selectedAgentDid]);

  // Authenticate user if not already authenticated
  useEffect(() => {
    const authenticateUser = async () => {
      if (payload && !isAuthenticated) {
        try {
          setLoading(true);
          const passkeyService = new PasskeyService();
          const userDidResult = await passkeyService.login();
          if (userDidResult) {
            signInWithDid(userDidResult);
          } else {
            throw new Error('Authentication failed');
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Authentication failed';
          setError(`Login error: ${message}`);
        } finally {
          setLoading(false);
        }
      }
    };

    authenticateUser();
  }, [payload, isAuthenticated, signInWithDid]);

  const initializeDIDService = async () => {
    if (!selectedAgentDid) return;

    setLoading(true);
    try {
      const service = await DIDService.initialize(selectedAgentDid);
      setDidService(service);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(`Failed to initialize DID service: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAgentSelect = (did: string) => {
    setSelectedAgentDid(did);
  };

  const handleConfirm = async () => {
    if (!payload || !didService || !selectedAgentDid) return;

    setProcessing(true);
    setError(null);

    try {
      // Prepare verificationMethod data
      const keyInfo: OperationalKeyInfo = {
        type: payload.verificationMethod.type,
        controller: selectedAgentDid,
        idFragment: payload.verificationMethod.idFragment || `key-${Date.now()}`,
        publicKeyMaterial: new Uint8Array(), // Initialize with empty array, will be updated below
      };

      // Handle different public key formats
      if (payload.verificationMethod.publicKeyMultibase) {
        keyInfo.publicKeyMaterial = BaseMultibaseCodec.decodeBase58btc(payload.verificationMethod.publicKeyMultibase);
      } else if (payload.verificationMethod.publicKeyJwk) {
        // Assuming there's a function to convert JWK to raw public key
        // keyInfo.publicKeyMaterial = convertJwkToRaw(payload.verificationMethod.publicKeyJwk);
        throw new Error('JWK format not yet supported');
      } else {
        throw new Error('No valid public key format provided');
      }

      // Add verification method
      const keyId = await didService.addVerificationMethod(
        keyInfo,
        payload.verificationRelationships
      );

      console.log('Added verification method:', keyId);
      
      // Construct redirect URL
      const redirectUrl = new URL(payload.redirectUri);
      redirectUrl.searchParams.append('success', '1');
      redirectUrl.searchParams.append('key_id', keyId);
      redirectUrl.searchParams.append('agent', selectedAgentDid);
      redirectUrl.searchParams.append('state', payload.state);
      
      // Handle special case: if same origin page, can use postMessage
      if (payload.redirectUri.startsWith(window.location.origin)) {
        if (window.opener) {
          window.opener.postMessage({
            success: 1,
            key_id: keyId,
            agent: selectedAgentDid,
            state: payload.state
          }, new URL(payload.redirectUri).origin);
          window.close();
          return;
        }
      }
      
      // Standard redirect
      window.location.href = redirectUrl.toString();
      
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      setError(message);
      
      // Need to redirect with error info on failure too
      try {
        const redirectUrl = new URL(payload.redirectUri);
        redirectUrl.searchParams.append('success', '0');
        redirectUrl.searchParams.append('error', encodeURIComponent(message));
        redirectUrl.searchParams.append('state', payload.state);
        window.location.href = redirectUrl.toString();
      } catch (redirectErr) {
        // If redirect fails, at least show error on page
        console.error('Failed to redirect with error:', redirectErr);
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = () => {
    if (payload) {
      try {
        const redirectUrl = new URL(payload.redirectUri);
        redirectUrl.searchParams.append('success', '0');
        redirectUrl.searchParams.append('error', 'User canceled');
        redirectUrl.searchParams.append('state', payload.state);
        window.location.href = redirectUrl.toString();
      } catch (err) {
        // If redirect fails, go back to home
        navigate('/');
      }
    } else {
      navigate('/');
    }
  };

  // Check if high risk permissions are requested
  const hasHighRiskPermission = payload?.verificationRelationships.includes('capabilityDelegation');

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={handleCancel} className="mb-4">
            <ArrowLeftOutlined className="mr-2" />
            {t('common.cancel')}
          </Button>

          <Title level={2}>
            <KeyOutlined className="mr-2" />
            {t('Add Authentication Key')}
          </Title>
        </div>

        {error && (
          <Alert
            message={t('common.error')}
            description={error}
            type="error"
            showIcon
            className="mb-4"
          />
        )}

        {payload && (
          <Card>
            <CardHeader>
              <CardTitle>
                {t('Authorization Request')}
                {hasHighRiskPermission && (
                  <Tag color="error" className="ml-2">
                    <WarningOutlined /> High Risk
                  </Tag>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!isAuthenticated ? (
                <div className="text-center py-8">
                  <Spin size="large" />
                  <Paragraph className="mt-4">{t('Waiting for authentication...')}</Paragraph>
                </div>
              ) : (
                <>
                  <Descriptions title="Key Details" bordered column={1}>
                    <Descriptions.Item label="Key Type">
                      {payload.verificationMethod.type}
                    </Descriptions.Item>
                    <Descriptions.Item label="Key ID">
                      {payload.verificationMethod.idFragment || 'Auto-generated'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Permissions">
                      <Space direction="vertical">
                        {payload.verificationRelationships.map((rel) => (
                          <Tag 
                            key={rel} 
                            color={rel === 'capabilityDelegation' ? 'error' : 'blue'}
                          >
                            {rel === 'capabilityDelegation' && <WarningOutlined />} {rel}
                          </Tag>
                        ))}
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Redirect URI">
                      {payload.redirectUri}
                    </Descriptions.Item>
                  </Descriptions>

                  {hasHighRiskPermission && (
                    <Alert
                      message="High Risk Permission"
                      description="This key is requesting capability delegation permission, which allows it to manage other keys and modify your DID document. Only grant this to highly trusted devices/environments."
                      type="warning"
                      showIcon
                      className="my-4"
                    />
                  )}

                  {!selectedAgentDid ? (
                    <div className="mt-6">
                      <Title level={4}>Select Agent DID</Title>
                      <AgentSelector onSelect={handleAgentSelect} />
                    </div>
                  ) : (
                    <div className="mt-6">
                      <Descriptions title="Selected Agent" bordered>
                        <Descriptions.Item label="Agent DID">
                          {selectedAgentDid}
                        </Descriptions.Item>
                      </Descriptions>
                    </div>
                  )}

                  <div className="flex justify-end space-x-4 mt-6">
                    <Button variant="outline" onClick={handleCancel} disabled={processing}>
                      {t('common.cancel')}
                    </Button>
                    <Button 
                      type="submit" 
                      onClick={handleConfirm}
                      disabled={!selectedAgentDid || loading || processing}
                    >
                      {processing ? <Spin size="small" /> : (
                        <>
                          <SafetyOutlined className="mr-2" />
                          {t('Authorize')}
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
} 