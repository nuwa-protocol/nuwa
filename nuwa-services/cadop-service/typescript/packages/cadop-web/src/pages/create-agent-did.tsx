import React, { useState, useEffect } from 'react';
import { Steps, Card, Button, Alert, Typography, Row, Col, Space, Spin } from 'antd';
import { CheckCircleOutlined, LoadingOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';
import { DIDCreationStatus } from '../components/DIDCreationStatus.js';
import { DIDDisplayCard } from '../components/DIDDisplayCard.js';
import { webAuthnClient, custodianClient } from '../lib/api/client';
import type { AgentDIDCreationStatus as DIDStatus } from '@cadop/shared';

const { Title, Text } = Typography;

export const CreateAgentDIDPage: React.FC = () => {
  const { session, isAuthenticated, isLoading: authLoading } = useAuth();
  const user = session?.user;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [currentStep, setCurrentStep] = useState(0);
  const [didCreationStatus, setDidCreationStatus] = useState<DIDStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-check status if recordId is in URL
  useEffect(() => {
    const recordId = searchParams.get('recordId');
    if (recordId) {
      checkCreationStatus(recordId);
    }
  }, [searchParams]);

  const checkCreationStatus = async (recordId: string) => {
    try {
      const response = await custodianClient.getStatus(recordId);
      if (response.data) {
        setDidCreationStatus(response.data);
        setCurrentStep(1);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check DID creation status';
      setError(message);
    }
  };

  const handleStartCreation = async () => {
    if (!user) {
      setError('Please sign in first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const idTokenResponse = await webAuthnClient.getIdToken();
      if (!idTokenResponse.data) {
        throw new Error('Unable to get authentication token');
      }

      const response = await custodianClient.mint({
        idToken: idTokenResponse.data.id_token,
        userDid: user.userDid
      });

      if (response.data) {
        setDidCreationStatus(response.data);
        setCurrentStep(1);
      } else {
        throw new Error('Failed to create Agent DID');
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    {
      title: 'Creation',
      description: 'Creating your Agent DID',
      icon: loading ? <LoadingOutlined /> : <CheckCircleOutlined />
    },
    {
      title: 'Complete',
      description: 'Agent DID created successfully',
      icon: didCreationStatus?.status === 'processing' ? <LoadingOutlined /> : <ClockCircleOutlined />
    }
  ];

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Card>
            <Title level={4}>Create Agent DID</Title>
            <Text>Click the button below to create your Agent DID.</Text>
            <Button
              type="primary"
              onClick={handleStartCreation}
              loading={loading}
              style={{ marginTop: 16 }}
            >
              Create Agent DID
            </Button>
          </Card>
        );

      case 1:
        return (
          <div>
            <DIDCreationStatus
              status={didCreationStatus}
              onRetry={handleStartCreation}
            />
            {didCreationStatus?.status === 'completed' && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
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
                    setDidCreationStatus(null);
                    setError(null);
                  }}>
                    Create Another DID
                  </Button>
                </Space>
              </div>
            )}
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