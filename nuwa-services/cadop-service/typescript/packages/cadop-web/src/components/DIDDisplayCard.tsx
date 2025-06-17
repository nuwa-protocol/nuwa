import React from 'react';
import { Card, Typography, Space, Button, Tag, Divider } from 'antd';
import { CopyOutlined, LinkOutlined, CheckCircleOutlined, QrcodeOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export interface DIDDisplayCardProps {
  agentDid?: string | undefined;
  transactionHash?: string | undefined;
  createdAt?: Date | undefined;
}

export const DIDDisplayCard: React.FC<DIDDisplayCardProps> = ({
  agentDid,
  transactionHash,
  createdAt,
}) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
      console.log('Copied to clipboard:', text);
    });
  };

  const openExplorer = (hash?: string) => {
    if (hash) {
      // Open blockchain explorer - replace with actual Rooch explorer URL
      const explorerUrl = `https://explorer.rooch.network/tx/${hash}`;
      window.open(explorerUrl, '_blank');
    }
  };

  if (!agentDid) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <QrcodeOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
          <Title level={4}>No Agent DID Created</Title>
          <Text type="secondary">Your Agent DID will appear here once created</Text>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <span>Your Agent DID</span>
          <Tag color="success">Active</Tag>
        </Space>
      }
      extra={
        <Button
          type="text"
          icon={<QrcodeOutlined />}
          onClick={() => {
            // Could implement QR code modal
            console.log('Show QR code for:', agentDid);
          }}
        >
          QR Code
        </Button>
      }
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Text strong>Agent DID:</Text>
          <br />
          <div
            style={{
              background: '#f5f5f5',
              padding: '12px',
              borderRadius: '6px',
              fontFamily: 'monospace',
              fontSize: '14px',
              wordBreak: 'break-all',
              marginTop: '8px',
            }}
          >
            {agentDid}
          </div>
          <div style={{ textAlign: 'right', marginTop: '8px' }}>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => copyToClipboard(agentDid)}
            >
              Copy
            </Button>
          </div>
        </div>

        {transactionHash && (
          <>
            <Divider />
            <div>
              <Text strong>Transaction Hash:</Text>
              <br />
              <div
                style={{
                  background: '#f5f5f5',
                  padding: '12px',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  wordBreak: 'break-all',
                  marginTop: '8px',
                }}
              >
                {transactionHash}
              </div>
              <div style={{ textAlign: 'right', marginTop: '8px' }}>
                <Space>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(transactionHash)}
                  >
                    Copy
                  </Button>
                  <Button
                    type="text"
                    size="small"
                    icon={<LinkOutlined />}
                    onClick={() => openExplorer(transactionHash)}
                  >
                    View on Explorer
                  </Button>
                </Space>
              </div>
            </div>
          </>
        )}

        {createdAt && (
          <>
            <Divider />
            <div>
              <Text strong>Created:</Text>
              <br />
              <Text type="secondary">{createdAt.toLocaleString()}</Text>
            </div>
          </>
        )}

        <Card size="small" style={{ background: '#f9f9f9' }}>
          <Title level={5}>What can you do with your Agent DID?</Title>
          <ul style={{ marginBottom: 0 }}>
            <li>🤖 Create and manage AI agents</li>
            <li>🔐 Sign transactions and messages</li>
            <li>🌐 Interact with other DIDs in the network</li>
            <li>📝 Issue and verify credentials</li>
            <li>🏪 Access decentralized services</li>
          </ul>
        </Card>
      </Space>
    </Card>
  );
};
