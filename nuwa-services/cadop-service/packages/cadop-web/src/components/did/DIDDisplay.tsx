import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import { Button, Badge, Card, CardContent } from '@/components/ui';

interface DIDDisplayProps {
  did: string;
  alias?: string;
  showCopy?: boolean;
  shortForm?: boolean;
  sybilLevel?: 0 | 1 | 2 | 3 | 4;
  status?: 'active' | 'pending' | 'inactive' | 'error';
}

const statusColors = {
  active: 'bg-green-500',
  pending: 'bg-yellow-500',
  inactive: 'bg-gray-500',
  error: 'bg-red-500',
};

const sybilLevelColors = {
  0: 'bg-gray-500',
  1: 'bg-blue-500',
  2: 'bg-green-500',
  3: 'bg-purple-500',
  4: 'bg-yellow-500',
};

export const DIDDisplay: React.FC<DIDDisplayProps> = ({
  did,
  alias,
  showCopy = true,
  shortForm = false,
  sybilLevel,
  status,
}) => {
  const displayDID = shortForm ? `${did.slice(0, 8)}...${did.slice(-6)}` : did;

  const [copyFeedback, setCopyFeedback] = useState<null | 'success' | 'error'>(null);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback('success');
    } catch (err) {
      console.error('Failed to copy:', err);
      setCopyFeedback('error');
    } finally {
      // Hide feedback after 2 seconds
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {alias && <span className="text-sm font-medium text-gray-700">{alias}</span>}
            <span className="font-mono text-sm">{displayDID}</span>
            {status && (
              <Badge variant="secondary" className={statusColors[status]}>
                {status}
              </Badge>
            )}
            {typeof sybilLevel === 'number' && (
              <Badge variant="secondary" className={sybilLevelColors[sybilLevel]}>
                Level {sybilLevel}
              </Badge>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {showCopy && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(did)}
                className="h-8 w-8 p-0"
              >
                <Copy className="h-4 w-4" />
                <span className="sr-only">Copy DID</span>
              </Button>
            )}
            {copyFeedback === 'success' && <span className="text-xs text-green-600">Copied!</span>}
            {copyFeedback === 'error' && (
              <span className="text-xs text-red-600">Failed to copy</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
