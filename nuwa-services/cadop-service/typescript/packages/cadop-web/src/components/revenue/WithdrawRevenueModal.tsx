import { useState, useEffect } from 'react';
import { Loader, AlertTriangle, DollarSign, ArrowRight, CheckCircle } from 'lucide-react';
import {
  Modal,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  AlertTitle,
  AlertDescription,
  Badge,
} from '@/components/ui';
import { useRevenueOperations, type RevenueBalance } from '@/hooks/useRevenueData';
import { formatTokenAmount, parseAmount } from '@/utils/formatters';

// Import WithdrawalPreview type from payment-kit
interface WithdrawalPreview {
  grossAmount: bigint; // Original withdrawal amount
  feeAmount: bigint; // Fee to be deducted (currently 0)
  netAmount: bigint; // Net amount after fees
  feeRateBps: number; // Fee rate in basis points (currently 0)
}

interface WithdrawRevenueModalProps {
  agentDid: string;
  availableBalances: RevenueBalance[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function WithdrawRevenueModal({
  agentDid,
  availableBalances,
  isOpen,
  onClose,
  onSuccess,
}: WithdrawRevenueModalProps) {
  const { withdrawRevenue, previewWithdrawal, isReady } = useRevenueOperations(agentDid);

  const [selectedAsset, setSelectedAsset] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [preview, setPreview] = useState<WithdrawalPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  // Initialize with first available asset
  useEffect(() => {
    if (availableBalances.length > 0 && !selectedAsset) {
      setSelectedAsset(availableBalances[0].assetId);
    }
  }, [availableBalances, selectedAsset]);

  // Get selected asset info
  const selectedAssetInfo = availableBalances.find(b => b.assetId === selectedAsset);

  // Update preview when amount or asset changes
  useEffect(() => {
    if (!selectedAssetInfo || !amount || !isReady) {
      setPreview(null);
      return;
    }

    const amountBigInt = parseAmount(amount, selectedAssetInfo.decimals);
    if (amountBigInt <= 0n) {
      setPreview(null);
      return;
    }

    const updatePreview = async () => {
      try {
        setPreviewLoading(true);
        setError(null);

        const previewResult = await previewWithdrawal({
          assetId: selectedAsset,
          amount: amountBigInt,
        });

        setPreview(previewResult);
      } catch (err) {
        console.error('Failed to preview withdrawal:', err);
        setError(err instanceof Error ? err.message : 'Failed to preview withdrawal');
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    };

    const debounceTimer = setTimeout(updatePreview, 500);
    return () => clearTimeout(debounceTimer);
  }, [selectedAsset, amount, selectedAssetInfo, previewWithdrawal, isReady]);

  const handleMaxClick = () => {
    if (selectedAssetInfo) {
      const maxAmount = formatTokenAmount(selectedAssetInfo.balance, selectedAssetInfo.decimals);
      setAmount(maxAmount);
    }
  };

  const handleWithdraw = async () => {
    if (!selectedAssetInfo || !amount || !preview) return;

    try {
      setLoading(true);
      setError(null);

      const amountBigInt = parseAmount(amount, selectedAssetInfo.decimals);

      await withdrawRevenue({
        assetId: selectedAsset,
        amount: amountBigInt,
      });

      // Show success state immediately
      setWithdrawSuccess(true);
      setError(null);

      // Wait for blockchain state to update before refreshing data
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000); // 2 seconds delay to allow blockchain state to propagate
    } catch (err) {
      console.error('Withdrawal failed:', err);
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setLoading(false);
    }
  };

  const canWithdraw =
    !loading &&
    !previewLoading &&
    preview &&
    selectedAssetInfo &&
    amount &&
    parseAmount(amount, selectedAssetInfo.decimals) > 0n;

  const maxAmount = selectedAssetInfo
    ? formatTokenAmount(selectedAssetInfo.balance, selectedAssetInfo.decimals)
    : '0';

  return (
    <Modal open={isOpen} onClose={onClose} title="Withdraw Revenue">
      <div className="space-y-6">
        {withdrawSuccess ? (
          // Success state - show only success message
          <div className="text-center py-6">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-green-700 mb-2">Withdrawal Successful!</h3>
            <p className="text-sm text-gray-600">
              Your withdrawal has been processed. Updating balance data...
            </p>
          </div>
        ) : (
          // Normal form state
          <>
            {/* Asset Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">Select Asset</label>
              <Select value={selectedAsset} onValueChange={setSelectedAsset}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose asset to withdraw" />
                </SelectTrigger>
                <SelectContent>
                  {availableBalances.map(asset => (
                    <SelectItem key={asset.assetId} value={asset.assetId}>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        <span className="font-medium">{asset.symbol}</span>
                        <Badge variant="secondary" className="text-xs">
                          {formatTokenAmount(asset.balance, asset.decimals)}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount Input */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Amount
                {selectedAssetInfo && (
                  <span className="text-gray-500 font-normal">
                    {' '}
                    (Available: {maxAmount} {selectedAssetInfo.symbol})
                  </span>
                )}
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.00000001"
                  disabled={loading}
                />
                <Button
                  variant="outline"
                  onClick={handleMaxClick}
                  disabled={loading || !selectedAssetInfo}
                >
                  Max
                </Button>
              </div>
            </div>

            {/* Preview Loading */}
            {previewLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader className="h-4 w-4 animate-spin" />
                Calculating fees...
              </div>
            )}

            {/* Withdrawal Preview */}
            {preview && selectedAssetInfo && (
              <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4" />
                  <span className="font-medium">Withdrawal Summary</span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Withdrawal Amount:</span>
                    <span className="font-medium">
                      {amount} {selectedAssetInfo.symbol}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Network Fee:</span>
                    <span className="font-medium">
                      {formatTokenAmount(preview.feeAmount, selectedAssetInfo.decimals)}{' '}
                      {selectedAssetInfo.symbol}
                    </span>
                  </div>

                  <hr className="my-2" />

                  <div className="flex justify-between items-center">
                    <span className="font-medium">You&apos;ll receive:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-green-600">
                        {formatTokenAmount(preview.netAmount, selectedAssetInfo.decimals)}{' '}
                        {selectedAssetInfo.symbol}
                      </span>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Withdrawal Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleWithdraw} disabled={!canWithdraw} className="flex-1">
                {loading ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Withdraw'
                )}
              </Button>
            </div>

            {/* Additional Info */}
            <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded">
              <p className="font-medium mb-1">Important:</p>
              <ul className="space-y-1">
                <li>• Withdrawals are processed on the Rooch blockchain</li>
                <li>• Network fees are deducted from your withdrawal amount</li>
                <li>• This action cannot be reversed once confirmed</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
