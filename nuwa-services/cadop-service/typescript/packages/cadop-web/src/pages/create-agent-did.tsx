import React, { useState, useEffect } from 'react';
import { Steps, Card, Button, Alert, Typography, Row, Col, Space, Spin } from 'antd';
import { CheckCircleOutlined, LoadingOutlined, ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';
import { useCustodianService } from '../hooks/useCustodianService.js';
import { AgentDIDInstructions } from '../components/AgentDIDInstructions.js';
import { AuthMethodSelector, AuthMethod } from '../components/AuthMethodSelector.js';
import { DIDCreationStatus } from '../components/DIDCreationStatus.js';
import { DIDDisplayCard } from '../components/DIDDisplayCard.js';
import type { CreateAgentDIDRequest, AgentDIDCreationStatus as DIDStatus } from '@cadop/shared/types';

const { Title, Text } = Typography;

export const CreateAgentDIDPage: React.FC = () => {
  const { session, isAuthenticated, isLoading: authLoading } = useAuth();
  const user = session?.user;
  const { createAgentDID, getCreationStatus } = useCustodianService();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedAuthMethods, setSelectedAuthMethods] = useState<AuthMethod[]>([]);
  const [didCreationStatus, setDidCreationStatus] = useState<DIDStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Helper function to get ID token (session token)
  const getIdToken = async (): Promise<string | null> => {
    return session?.session_token || null;
  };

  // Auto-check status if recordId is in URL
  useEffect(() => {
    const recordId = searchParams.get('recordId');
    if (recordId) {
      getCreationStatus(recordId).then((status: DIDStatus | null) => {
        if (status) {
          setDidCreationStatus(status);
          setCurrentStep(2);
        }
      });
    }
  }, [searchParams, getCreationStatus]);

  const handleStartCreation = async () => {
    if (!user) {
      setError('Please sign in first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const idToken = await getIdToken();
      if (!idToken) {
        throw new Error('Unable to get authentication token');
      }

      const request: CreateAgentDIDRequest = {
        idToken,
        ...(user.primaryAgentDid && { userDidKey: user.primaryAgentDid }),
        custodianServicePublicKeyMultibase: 'z' + (process.env['REACT_APP_CUSTODIAN_PUBLIC_KEY'] || 'default-key'),
        custodianServiceVMType: 'Ed25519VerificationKey2020',
        ...(selectedAuthMethods && selectedAuthMethods.length > 0 && { additionalAuthMethods: selectedAuthMethods }),
      };

      const result = await createAgentDID(request);
      setDidCreationStatus(result);
      setCurrentStep(2);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    {
      title: 'Introduction',
      description: 'Learn about Agent DIDs',
      icon: <ExclamationCircleOutlined />
    },
    {
      title: 'Authentication',
      description: 'Select authentication methods',
      icon: loading ? <LoadingOutlined /> : <CheckCircleOutlined />
    },
    {
      title: 'Creation',
      description: 'Creating your Agent DID',
      icon: didCreationStatus?.status === 'processing' ? <LoadingOutlined /> : <ClockCircleOutlined />
    },
    {
      title: 'Complete',
      description: 'Agent DID created successfully',
      icon: <CheckCircleOutlined />
    }
  ];

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <AgentDIDInstructions
            onContinue={() => setCurrentStep(1)}
            userSybilLevel={user?.sybilLevel || 0}
          />
        );

      case 1:
        return (
          <AuthMethodSelector
            selectedMethods={selectedAuthMethods}
            onMethodsChange={setSelectedAuthMethods}
            onContinue={handleStartCreation}
            user={user}
          />
        );

      case 2:
        return (
          <DIDCreationStatus
            status={didCreationStatus}
            onRetry={() => setCurrentStep(1)}
          />
        );

      case 3:
        return (
          <div style={{ textAlign: 'center' }}>
            <DIDDisplayCard
              {...(didCreationStatus?.agentDid && { agentDid: didCreationStatus.agentDid })}
              {...(didCreationStatus?.transactionHash && { transactionHash: didCreationStatus.transactionHash })}
              {...(didCreationStatus?.createdAt && { createdAt: didCreationStatus.createdAt })}
            />
            <Space style={{ marginTop: 24 }}>
              <Button type="default" onClick={() => navigate('/dashboard')}>
                Go to Dashboard
              </Button>
              <Button type="primary" onClick={() => {
                setCurrentStep(0);
                setSelectedAuthMethods([]);
                setDidCreationStatus(null);
                setError(null);
              }}>
                Create Another DID
              </Button>
            </Space>
          </div>
        );

      default:
        return null;
    }
  };

  if (!isAuthenticated || authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <Row justify="center" style={{ marginBottom: 32 }}>
        <Col span={24}>
          <Title level={2} style={{ textAlign: 'center' }}>
            Create Agent DID
          </Title>
          <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
            Create a decentralized identity for your AI agent using CADOP protocol
          </Text>
        </Col>
      </Row>

      <Card style={{ marginBottom: 24 }}>
        <Steps
          current={currentStep}
          items={steps}
          style={{ marginBottom: 32 }}
        />

        {error && (
          <Alert
            message="Error"
            description={error}
            type="error"
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: 24 }}
          />
        )}

        {renderStepContent()}
      </Card>
    </div>
  );
}; 