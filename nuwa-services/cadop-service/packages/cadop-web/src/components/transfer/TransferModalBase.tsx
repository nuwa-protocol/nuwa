import React, { ReactNode, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent } from '@/components/ui/card';
import { Info, AlertCircle, CheckCircle, Wallet } from 'lucide-react';
import {
  formatAddressDisplay,
  PercentageHelpers,
  normalizeAddress,
} from '@/utils/addressValidation';

export interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  agentDid: string;
  // Current balance info
  currentBalance?: bigint;
  balanceLabel?: string;
  balanceSymbol?: string;
  decimals?: number;
  // Configuration
  showRecipientInput?: boolean;
  recipientLabel?: string;
  recipientPlaceholder?: string;
  showAmountInput?: boolean;
  amountLabel?: string;
  amountPlaceholder?: string;
  showBalanceInfo?: boolean;
  showPercentageButtons?: boolean;
  maxAmount?: bigint;
  // Custom content
  extraContent?: ReactNode;
  // Actions
  onTransfer: (
    recipient: string,
    amount: bigint
  ) => Promise<{ txHash?: string; success: boolean; error?: string }>;
  onSuccess?: (txHash: string) => void;
  // Loading state
  isLoading?: boolean;
  // Validation
  validateRecipient?: (recipient: string) => { valid: boolean; error?: string };
  validateAmount?: (amount: bigint) => { valid: boolean; error?: string };
  // Callbacks
  onAmountChange?: (amount: string) => void;
}

type TransferStatus = 'idle' | 'validating' | 'ready' | 'transferring' | 'success' | 'error';

export function TransferModalBase({
  open,
  onClose,
  title,
  description,
  agentDid,
  currentBalance = 0n,
  balanceLabel = 'Available Balance',
  balanceSymbol = 'RGAS',
  decimals = 8,
  showRecipientInput = true,
  recipientLabel = 'Recipient Address',
  recipientPlaceholder = 'Enter Rooch address (0x...) or DID (did:rooch:0x...)',
  showAmountInput = true,
  amountLabel = 'Amount',
  amountPlaceholder = '0.00',
  showBalanceInfo = true,
  showPercentageButtons = true,
  maxAmount,
  extraContent,
  onTransfer,
  onSuccess,
  isLoading = false,
  validateRecipient,
  validateAmount,
  onAmountChange,
}: TransferModalProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<TransferStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    if (onAmountChange) {
      onAmountChange(amount);
    }
  }, [amount, onAmountChange]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setRecipient('');
      setAmount('');
      setStatus('idle');
      setError(null);
      setTxHash(null);
    }
  }, [open]);

  // Validation functions
  const validateRecipientInput = (recipient: string) => {
    if (!showRecipientInput) return { valid: true };
    if (!recipient.trim()) return { valid: false, error: 'Recipient address is required' };

    if (validateRecipient) {
      return validateRecipient(recipient);
    }

    try {
      normalizeAddress(recipient);
      return { valid: true };
    } catch (e: any) {
      return { valid: false, error: e?.message || 'Invalid address format' };
    }
  };

  const validateAmountInput = (amountStr: string) => {
    if (!showAmountInput) return { valid: true };
    if (!amountStr.trim()) return { valid: false, error: 'Amount is required' };

    if (validateAmount) {
      return validateAmount(BigInt(Math.floor(parseFloat(amountStr) * Math.pow(10, decimals))));
    }

    // Default validation
    try {
      const parsedAmount = BigInt(Math.floor(parseFloat(amountStr) * Math.pow(10, decimals)));
      if (parsedAmount <= 0) {
        return { valid: false, error: 'Amount must be greater than 0' };
      }

      const max = maxAmount || currentBalance;
      if (parsedAmount > max) {
        return { valid: false, error: 'Amount exceeds available balance' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid amount format' };
    }
  };

  // Auto-validation
  useEffect(() => {
    if (!showRecipientInput && !showAmountInput) {
      setStatus('ready');
      return;
    }

    const recipientValid = showRecipientInput ? validateRecipientInput(recipient) : { valid: true };
    const amountValid = showAmountInput ? validateAmountInput(amount) : { valid: true };

    const needsRecipient = showRecipientInput && !recipient;
    const needsAmount = showAmountInput && !amount;

    if (needsRecipient || needsAmount) {
      setStatus('idle');
      setError(null);
      return;
    }

    if (!recipientValid.valid || !amountValid.valid) {
      setStatus('validating');
      setError(recipientValid.error || amountValid.error || null);
      return;
    }

    setStatus('ready');
    setError(null);
  }, [recipient, amount, showRecipientInput, showAmountInput]);

  const handleTransfer = async () => {
    if (status !== 'ready') return;

    setStatus('transferring');
    setError(null);

    try {
      const parsedAmount = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)));
      const result = await onTransfer(recipient, parsedAmount);

      if (result.success) {
        setTxHash(result.txHash || null);
        setStatus('success');
        if (result.txHash && onSuccess) {
          onSuccess(result.txHash);
        }
      } else {
        setError(result.error || 'Transfer failed');
        setStatus('error');
      }
    } catch (e: any) {
      setError(e?.message || 'Transfer failed');
      setStatus('error');
    }
  };

  const handlePercentageClick = (percentage: number) => {
    const max = maxAmount || currentBalance;
    const percentageAmount = (max * BigInt(percentage)) / 100n;
    const decimalAmount = Number(percentageAmount) / Math.pow(10, decimals);
    setAmount(decimalAmount.toFixed(decimals).replace(/\.?0+$/, ''));
  };

  const formatBalance = (balance: bigint) => {
    const balanceNumber = Number(balance) / Math.pow(10, decimals);
    return balanceNumber.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  };

  const getTransactionStatusIcon = () => {
    switch (status) {
      case 'transferring':
        return <Spinner size="sm" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  const getTransactionStatusText = () => {
    switch (status) {
      case 'transferring':
        return 'Transaction in progress...';
      case 'success':
        return 'Transfer completed successfully!';
      case 'error':
        return 'Transfer failed';
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">{title}</DialogTitle>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </DialogHeader>

        <div className="space-y-6">
          {/* Balance Info */}
          {showBalanceInfo && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Wallet className="h-4 w-4" />
                    <span className="text-sm font-medium">{balanceLabel}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold">
                      {formatBalance(currentBalance)} {balanceSymbol}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recipient Input */}
          {showRecipientInput && (
            <div className="space-y-2">
              <Label htmlFor="recipient">{recipientLabel}</Label>
              <Input
                id="recipient"
                type="text"
                placeholder={recipientPlaceholder}
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                disabled={status === 'transferring'}
                className="font-mono"
              />
              {recipient && validateRecipientInput(recipient).valid && (
                <p className="text-xs text-muted-foreground">{formatAddressDisplay(recipient)}</p>
              )}
            </div>
          )}

          {/* Amount Input */}
          {showAmountInput && (
            <div className="space-y-2">
              <Label htmlFor="amount">{amountLabel}</Label>
              <Input
                id="amount"
                type="text"
                placeholder={amountPlaceholder}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={status === 'transferring'}
                className="font-mono"
              />

              {/* Percentage Buttons */}
              {showPercentageButtons && (
                <div className="flex space-x-2">
                  {PercentageHelpers.getPercentageOptions().map(option => (
                    <Button
                      key={option.value}
                      variant="outline"
                      size="sm"
                      onClick={() => handlePercentageClick(option.value)}
                      disabled={status === 'transferring' || (maxAmount || currentBalance) <= 0n}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Extra Content */}
          {extraContent}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Transaction Status */}
          {status === 'transferring' || status === 'success' || status === 'error' ? (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                {getTransactionStatusIcon()}
                <span className="text-sm font-medium">{getTransactionStatusText()}</span>
              </div>

              {status === 'transferring' && <Progress value={undefined} className="h-2" />}

              {txHash && status === 'success' && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Transaction Hash:</p>
                  <div className="flex items-center space-x-2">
                    <code className="text-xs bg-muted p-2 rounded font-mono break-all">
                      {txHash}
                    </code>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2">
            {status !== 'transferring' && status !== 'success' && (
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}

            {status === 'success' ? (
              <Button onClick={onClose}>Done</Button>
            ) : (
              <Button
                onClick={handleTransfer}
                disabled={status !== 'ready' || isLoading || status === 'transferring'}
              >
                {status === 'transferring' || isLoading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Transferring...
                  </>
                ) : (
                  'Confirm Transfer'
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
