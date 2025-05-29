import React from 'react';
import { Card, Button, Typography, List, Tag, Space } from 'antd';
import { InfoCircleOutlined, SecurityScanOutlined, LinkOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

export interface AgentDIDInstructionsProps {
  onContinue: () => void;
  userSybilLevel: number;
}

export const AgentDIDInstructions: React.FC<AgentDIDInstructionsProps> = ({
  onContinue,
  userSybilLevel
}) => {
  const getSybilLevelInfo = (level: number) => {
    switch (level) {
      case 0:
        return { color: 'red', text: 'No verification', risk: 'High Risk' };
      case 1:
        return { color: 'orange', text: 'Basic (Email/OAuth)', risk: 'Medium Risk' };
      case 2:
        return { color: 'blue', text: 'Phone Verified', risk: 'Low Risk' };
      case 3:
        return { color: 'green', text: 'Government ID', risk: 'Very Low Risk' };
      default:
        return { color: 'gray', text: 'Unknown', risk: 'Unknown' };
    }
  };

  const sybilInfo = getSybilLevelInfo(userSybilLevel);

  return (
    <div>
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <InfoCircleOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
            <Title level={3}>Create Your Agent DID</Title>
            <Paragraph>
              An Agent DID is your unique decentralized identity on the Rooch network. 
              It will be created using the CADOP (Custodian-Assisted DID Onboarding Protocol).
            </Paragraph>
          </div>

          <Card size="small" title="What is Agent DID?">
            <List size="small">
              <List.Item>
                <Text>🔑 Your unique identity on Rooch blockchain</Text>
              </List.Item>
              <List.Item>
                <Text>🌐 Interoperable with other Web3 services</Text>
              </List.Item>
              <List.Item>
                <Text>🔒 Cryptographically secure and verifiable</Text>
              </List.Item>
              <List.Item>
                <Text>🚀 Enable Agent-to-Agent interactions</Text>
              </List.Item>
            </List>
          </Card>

          <Card size="small" title="Your Sybil Protection Level">
            <Space>
              <SecurityScanOutlined />
              <Text>Current Level:</Text>
              <Tag color={sybilInfo.color}>{sybilInfo.text}</Tag>
              <Text type="secondary">({sybilInfo.risk})</Text>
            </Space>
            <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
              {userSybilLevel >= 1 ? (
                <Text type="success">
                  ✅ You meet the minimum requirements to create an Agent DID
                </Text>
              ) : (
                <Text type="warning">
                  ⚠️ You need at least basic verification to create an Agent DID
                </Text>
              )}
            </Paragraph>
          </Card>

          <Card size="small" title="Creation Process">
            <List size="small">
              <List.Item>
                <Text>1. Additional authentication methods (optional)</Text>
              </List.Item>
              <List.Item>
                <Text>2. Generate cryptographic keys</Text>
              </List.Item>
              <List.Item>
                <Text>3. Submit to Rooch blockchain</Text>
              </List.Item>
              <List.Item>
                <Text>4. Receive your Agent DID</Text>
              </List.Item>
            </List>
          </Card>

          <div style={{ textAlign: 'center' }}>
            <Button 
              type="primary" 
              size="large" 
              onClick={onContinue}
              disabled={userSybilLevel < 1}
              icon={<LinkOutlined />}
            >
              {userSybilLevel >= 1 ? 'Continue to Create' : 'Need More Verification'}
            </Button>
          </div>
        </Space>
      </Card>
    </div>
  );
}; 