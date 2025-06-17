import React from 'react';
import { Card, Progress, Typography, Space, Tag, Button, Timeline } from 'antd';
import {
  LoadingOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  RedoOutlined,
} from '@ant-design/icons';

export interface DIDStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  transactionHash?: string;
  agentDid?: string;
  error?: string;
}

export interface DIDCreationStatusComponentProps {
  status: DIDStatus | null;
  onRetry: () => void;
}

const { Title, Text, Paragraph } = Typography;

export const DIDCreationStatus: React.FC<DIDCreationStatusComponentProps> = ({
  status,
  onRetry,
}) => {
  if (!status) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <ClockCircleOutlined style={{ fontSize: 48, color: '#faad14', marginBottom: 16 }} />
          <Title level={4}>Waiting to Start</Title>
          <Text type="secondary">DID creation hasn't started yet</Text>
        </div>
      </Card>
    );
  }

  const getStatusIcon = () => {
    switch (status.status) {
      case 'pending':
        return <ClockCircleOutlined style={{ color: '#faad14' }} />;
      case 'processing':
        return <LoadingOutlined style={{ color: '#1890ff' }} />;
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'failed':
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <ClockCircleOutlined style={{ color: '#d9d9d9' }} />;
    }
  };

  const getStatusColor = () => {
    switch (status.status) {
      case 'pending':
        return 'warning';
      case 'processing':
        return 'processing';
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const getProgressPercent = () => {
    switch (status.status) {
      case 'pending':
        return 25;
      case 'processing':
        return 75;
      case 'completed':
        return 100;
      case 'failed':
        return 0;
      default:
        return 0;
    }
  };

  const getStatusText = () => {
    switch (status.status) {
      case 'pending':
        return 'Request submitted, waiting for processing...';
      case 'processing':
        return 'Creating your Agent DID on the blockchain...';
      case 'completed':
        return 'Your Agent DID has been created successfully!';
      case 'failed':
        return 'Failed to create Agent DID. Please try again.';
      default:
        return 'Unknown status';
    }
  };

  const timelineItems = [
    {
      dot:
        status.status === 'pending' ? (
          <LoadingOutlined />
        ) : (
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
        ),
      children: (
        <div>
          <Text strong>Request Submitted</Text>
          <br />
          <Text type="secondary">{status.createdAt.toLocaleString()}</Text>
        </div>
      ),
    },
    {
      dot:
        status.status === 'processing' ? (
          <LoadingOutlined />
        ) : status.status === 'completed' ? (
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
        ) : (
          <ClockCircleOutlined style={{ color: '#d9d9d9' }} />
        ),
      children: (
        <div>
          <Text strong>Blockchain Processing</Text>
          <br />
          <Text type="secondary">
            {status.status === 'processing'
              ? 'In progress...'
              : status.status === 'completed'
                ? 'Completed'
                : 'Waiting...'}
          </Text>
        </div>
      ),
    },
    {
      dot:
        status.status === 'completed' ? (
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
        ) : (
          <ClockCircleOutlined style={{ color: '#d9d9d9' }} />
        ),
      children: (
        <div>
          <Text strong>DID Created</Text>
          <br />
          <Text type="secondary">
            {status.status === 'completed' ? status.updatedAt.toLocaleString() : 'Pending...'}
          </Text>
        </div>
      ),
    },
  ];

  return (
    <Card>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{getStatusIcon()}</div>
          <Title level={3}>DID Creation Status</Title>
          <Space>
            <Text>Status:</Text>
            <Tag color={getStatusColor()} icon={getStatusIcon()}>
              {status.status.toUpperCase()}
            </Tag>
          </Space>
        </div>

        <Progress
          percent={getProgressPercent()}
          status={
            status.status === 'failed'
              ? 'exception'
              : status.status === 'completed'
                ? 'success'
                : 'active'
          }
          strokeColor={
            status.status === 'failed'
              ? '#ff4d4f'
              : status.status === 'completed'
                ? '#52c41a'
                : '#1890ff'
          }
        />

        <Card size="small">
          <Paragraph>{getStatusText()}</Paragraph>

          {status.transactionHash && (
            <div style={{ marginTop: 16 }}>
              <Text strong>Transaction Hash:</Text>
              <br />
              <Text code copyable style={{ fontSize: '12px' }}>
                {status.transactionHash}
              </Text>
            </div>
          )}

          {status.agentDid && (
            <div style={{ marginTop: 16 }}>
              <Text strong>Agent DID:</Text>
              <br />
              <Text code copyable style={{ fontSize: '12px' }}>
                {status.agentDid}
              </Text>
            </div>
          )}

          {status.error && (
            <div style={{ marginTop: 16 }}>
              <Text type="danger" strong>
                Error:
              </Text>
              <br />
              <Text type="danger">{status.error}</Text>
            </div>
          )}
        </Card>

        <Timeline items={timelineItems} />

        {status.status === 'failed' && (
          <div style={{ textAlign: 'center' }}>
            <Button type="primary" danger icon={<RedoOutlined />} onClick={onRetry}>
              Retry Creation
            </Button>
          </div>
        )}
      </Space>
    </Card>
  );
};
