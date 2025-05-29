import React from 'react';
import { Card, Button, Typography, Space, List, Tag } from 'antd';
import { 
  GoogleOutlined, 
  GithubOutlined, 
  TwitterOutlined,
  SafetyOutlined,
  PlusOutlined,
  CheckCircleOutlined 
} from '@ant-design/icons';
import type { CreateAgentDIDRequest } from '@cadop/shared/types';
import type { User } from '../hooks/useAuth.js';

const { Title, Text, Paragraph } = Typography;

export interface AuthMethod {
  provider: string;
  providerId: string;
  verifiedAt: Date;
  metadata: Record<string, any>;
}

export interface AuthMethodSelectorProps {
  selectedMethods: AuthMethod[];
  onMethodsChange: (methods: AuthMethod[]) => void;
  onContinue: () => void;
  user: User | null;
}

export const AuthMethodSelector: React.FC<AuthMethodSelectorProps> = ({
  selectedMethods,
  onMethodsChange,
  onContinue,
  user
}) => {
  const availableMethods = [
    {
      key: 'google',
      name: 'Google OAuth',
      icon: <GoogleOutlined />,
      points: 15,
      description: 'Connect your Google account'
    },
    {
      key: 'github',
      name: 'GitHub OAuth',
      icon: <GithubOutlined />,
      points: 20,
      description: 'Connect your GitHub account'
    },
    {
      key: 'twitter',
      name: 'Twitter OAuth',
      icon: <TwitterOutlined />,
      points: 10,
      description: 'Connect your Twitter account'
    },
    {
      key: 'webauthn',
      name: 'WebAuthn/Passkey',
      icon: <SafetyOutlined />,
      points: 25,
      description: 'Hardware security key or biometric'
    }
  ];

  const isMethodSelected = (methodKey: string) => {
    return selectedMethods.some(method => method.provider === methodKey);
  };

  const toggleMethod = (methodKey: string) => {
    if (isMethodSelected(methodKey)) {
      // Remove method
      onMethodsChange(
        selectedMethods.filter(method => method.provider !== methodKey)
      );
    } else {
      // Add method
      const newMethod: AuthMethod = {
        provider: methodKey,
        providerId: `${methodKey}_${Date.now()}`, // Mock ID
        verifiedAt: new Date(),
        metadata: {}
      };
      onMethodsChange([...selectedMethods, newMethod]);
    }
  };

  const totalPoints = selectedMethods.reduce((total, method) => {
    const methodInfo = availableMethods.find(m => m.key === method.provider);
    return total + (methodInfo?.points || 0);
  }, 0);

  return (
    <div>
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <PlusOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
            <Title level={3}>Additional Authentication Methods</Title>
            <Paragraph>
              Add more authentication methods to increase your Sybil protection level
              and unlock additional features.
            </Paragraph>
          </div>

          <Card size="small" title="Current Status">
            <Space>
              <Text>Selected Methods:</Text>
              <Tag color="blue">{selectedMethods.length}</Tag>
              <Text>Additional Points:</Text>
              <Tag color="green">+{totalPoints}</Tag>
            </Space>
          </Card>

          <Card size="small" title="Available Methods">
            <List
              dataSource={availableMethods}
              renderItem={(method) => (
                <List.Item
                  actions={[
                    <Button
                      key={method.key}
                      type={isMethodSelected(method.key) ? 'primary' : 'default'}
                      icon={isMethodSelected(method.key) ? <CheckCircleOutlined /> : method.icon}
                      onClick={() => toggleMethod(method.key)}
                    >
                      {isMethodSelected(method.key) ? 'Connected' : 'Connect'}
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={method.icon}
                    title={
                      <Space>
                        {method.name}
                        <Tag color="orange">+{method.points} points</Tag>
                      </Space>
                    }
                    description={method.description}
                  />
                </List.Item>
              )}
            />
          </Card>

          <Card size="small" title="Benefits">
            <List size="small">
              <List.Item>
                <Text>🛡️ Higher Sybil protection level</Text>
              </List.Item>
              <List.Item>
                <Text>🎯 Access to advanced features</Text>
              </List.Item>
              <List.Item>
                <Text>🤝 Increased trust in the network</Text>
              </List.Item>
              <List.Item>
                <Text>💎 Better reputation score</Text>
              </List.Item>
            </List>
          </Card>

          <div style={{ textAlign: 'center' }}>
            <Space>
              <Button size="large" onClick={onContinue}>
                Skip for Now
              </Button>
              <Button 
                type="primary" 
                size="large" 
                onClick={onContinue}
                disabled={!user}
              >
                Continue to Create DID
              </Button>
            </Space>
          </div>
        </Space>
      </Card>
    </div>
  );
}; 