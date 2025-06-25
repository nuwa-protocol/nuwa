import React from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  Progress,
  Button,
  Typography,
  Space,
  Tag,
  Timeline,
  TimelineItem
} from '@/components/ui';
import {
  Loader,
  CheckCircle,
  AlertCircle,
  Clock,
  RotateCcw
} from 'lucide-react';

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
        <CardContent className="text-center py-12">
          <Clock className="w-12 h-12 text-amber-400 mb-4 mx-auto" />
          <Title level={4}>Waiting to Start</Title>
          <Text type="secondary">DID creation hasn't started yet</Text>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = () => {
    switch (status.status) {
      case 'pending':
        return <Clock className="text-amber-400" />;
      case 'processing':
        return <Loader className="text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="text-green-500" />;
      case 'failed':
        return <AlertCircle className="text-red-500" />;
      default:
        return <Clock className="text-gray-300" />;
    }
  };

  const getStatusColor = () => {
    switch (status.status) {
      case 'pending':
        return 'warning';
      case 'processing':
        return 'default';
      case 'completed':
        return 'success';
      case 'failed':
        return 'danger';
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
          <Loader className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle className="h-4 w-4 text-green-500" />
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
          <Loader className="h-4 w-4 animate-spin" />
        ) : status.status === 'completed' ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <Clock className="h-4 w-4 text-gray-300" />
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
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <Clock className="h-4 w-4 text-gray-300" />
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
      <CardContent>
        <Space direction="vertical" size="large" className="w-full">
          <div className="text-center">
            <div className="text-5xl mb-4">{getStatusIcon()}</div>
            <Title level={3}>DID Creation Status</Title>
            <Space>
              <Text>Status:</Text>
              <Tag variant={getStatusColor()} icon={getStatusIcon()}>
                {status.status.toUpperCase()}
              </Tag>
            </Space>
          </div>

          <Progress
            value={getProgressPercent()}
            className={
              status.status === 'failed'
                ? 'text-destructive'
                : status.status === 'completed'
                  ? 'text-green-500'
                  : 'text-blue-500'
            }
          />

          <Card className="bg-muted">
            <CardContent className="pt-6">
              <Paragraph>{getStatusText()}</Paragraph>

              {status.transactionHash && (
                <div className="mt-4">
                  <Text strong>Transaction Hash:</Text>
                  <br />
                  <Text code copyable className="text-xs">
                    {status.transactionHash}
                  </Text>
                </div>
              )}

              {status.agentDid && (
                <div className="mt-4">
                  <Text strong>Agent DID:</Text>
                  <br />
                  <Text code copyable className="text-xs">
                    {status.agentDid}
                  </Text>
                </div>
              )}

              {status.error && (
                <div className="mt-4">
                  <Text type="danger" strong>
                    Error:
                  </Text>
                  <br />
                  <Text type="danger">{status.error}</Text>
                </div>
              )}
            </CardContent>
          </Card>

          <Timeline items={timelineItems} />

          {status.status === 'failed' && (
            <div className="text-center">
              <Button variant="destructive" onClick={onRetry} className="flex items-center mx-auto">
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry Creation
              </Button>
            </div>
          )}
        </Space>
      </CardContent>
    </Card>
  );
};
