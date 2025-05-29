import React from 'react';
import { Card, CardContent } from './card';
import { Button } from './button';
import { Copy, QrCode } from 'lucide-react';

interface DIDDisplayProps {
  did: string;
  showCopy?: boolean;
  showQR?: boolean;
  sybilLevel?: number;
  status?: 'active' | 'pending' | 'inactive';
}

export const DIDDisplay: React.FC<DIDDisplayProps> = ({
  did,
  showCopy = true,
  showQR = true,
  sybilLevel,
  status = 'active',
}) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(did);
  };

  const statusColors = {
    active: 'text-green-500',
    pending: 'text-yellow-500',
    inactive: 'text-red-500',
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="font-mono text-sm break-all">{did}</div>
            <div className="mt-2 flex items-center gap-4">
              <span className={`text-sm ${statusColors[status]}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              {sybilLevel !== undefined && (
                <span className="text-sm text-muted-foreground">
                  Sybil Level: {sybilLevel}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {showCopy && (
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                title="复制 DID"
              >
                <Copy className="h-4 w-4" />
              </Button>
            )}
            {showQR && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => {}}
                title="显示二维码"
              >
                <QrCode className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}; 