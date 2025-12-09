import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TransferModalBase } from './TransferModalBase';
import { useHubDepositWithdraw } from '@/hooks/useHubDepositWithdraw';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpCircle, Wallet, AlertTriangle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface WithdrawFromHubModalProps {
  open: boolean;
  onClose: () => void;
  agentDid: string;
  decimals?: number;
  onSuccess?: () => void;
}

export function WithdrawFromHubModal({
  open,
  onClose,
  agentDid,
  decimals = 8,
  onSuccess,
}: WithdrawFromHubModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const {
    withdrawFromHub,
    withdrawAllFromHub,
    isLoading,
    totalBalance,
    lockedBalance,
    unlockedBalance,
    activeChannels,
  } = useHubDepositWithdraw(agentDid);

  const handleWithdraw = async (_recipient: string, withdrawAmount: bigint): Promise<{ txHash?: string; success: boolean; error?: string }> => {
    try {
      const result = await withdrawFromHub(withdrawAmount, '0x3::rgas::RGAS');

      if (result.success) {
        toast({
          variant: 'success',
          title: t('transfer.withdrawSuccess', 'Withdrawal Successful'),
          description: t('transfer.withdrawSuccessDescription', 'Successfully withdrew RGAS to your account balance'),
        });
        onSuccess?.();
        return { txHash: result.txHash, success: true };
      } else {
        toast({
          variant: 'error',
          title: t('transfer.withdrawFailed', 'Withdrawal Failed'),
          description: result.error || t('transfer.unknownError', 'Unknown error occurred'),
        });
        return { success: false, error: result.error };
      }
    } catch (error: any) {
      toast({
        variant: 'error',
        title: t('transfer.withdrawFailed', 'Withdrawal Failed'),
        description: error?.message || t('transfer.unknownError', 'Unknown error occurred'),
      });
      return { success: false, error: error?.message };
    }
  };

  const handleWithdrawAll = async () => {
    if (unlockedBalance <= 0n) return;

    try {
      const result = await withdrawAllFromHub('0x3::rgas::RGAS');

      if (result.success) {
        toast({
          variant: 'success',
          title: t('transfer.withdrawAllSuccess', 'All Funds Withdrawn'),
          description: t('transfer.withdrawAllSuccessDescription', 'Successfully withdrew all available RGAS to your account balance'),
        });
        onSuccess?.();
        return { txHash: result.txHash, success: true };
      } else {
        toast({
          variant: 'error',
          title: t('transfer.withdrawFailed', 'Withdrawal Failed'),
          description: result.error || t('transfer.unknownError', 'Unknown error occurred'),
        });
        return { success: false, error: result.error };
      }
    } catch (error: any) {
      toast({
        variant: 'error',
        title: t('transfer.withdrawFailed', 'Withdrawal Failed'),
        description: error?.message || t('transfer.unknownError', 'Unknown error occurred'),
      });
      return { success: false, error: error?.message };
    }
  };

  const formatBalance = (balance: bigint) => {
    const balanceNumber = Number(balance) / Math.pow(10, decimals);
    return balanceNumber.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    });
  };

  const parseAmountToBigInt = (amountStr: string) => {
    try {
      return BigInt(Math.floor(parseFloat(amountStr) * Math.pow(10, decimals)));
    } catch {
      return 0n;
    }
  };

  const getNewHubBalance = (withdrawAmount: bigint) => {
    const current = BigInt(totalBalance);
    return current > withdrawAmount ? current - withdrawAmount : 0n;
  };

  // Extra content showing withdrawal preview and balance information
  const extraContent = (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          {t('transfer.withdrawInfo', 'Withdraw funds from your Payment Hub back to your account balance. Only unlocked (non-locked) funds can be withdrawn.')}
        </AlertDescription>
      </Alert>

      {/* Balance breakdown */}
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('transfer.totalHubBalance', 'Total Hub Balance')}:</span>
            <span className="font-mono">{formatBalance(totalBalance)} RGAS</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('transfer.lockedBalance', 'Locked Balance')}:</span>
            <span className="font-mono text-orange-600">{formatBalance(lockedBalance)} RGAS</span>
          </div>

          <div className="flex items-center justify-between text-sm font-medium bg-green-50 p-2 rounded">
            <span>{t('transfer.unlockedBalance', 'Available for Withdrawal')}:</span>
            <span className="font-mono text-green-600">{formatBalance(unlockedBalance)} RGAS</span>
          </div>
        </div>

        {activeChannels > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('transfer.lockedBalanceWarning', 'You have {{count}} active payment channels. {{amount}} RGAS is locked as collateral. Close channels to unlock these funds.', {
                count: activeChannels,
                amount: formatBalance(lockedBalance)
              })}
            </AlertDescription>
          </Alert>
        )}

        {/* Preview new balances if amount is entered */}
        {amount && !isNaN(parseFloat(amount)) && parseAmountToBigInt(amount) > 0n && parseAmountToBigInt(amount) <= unlockedBalance && (
          <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
            <div className="text-sm font-medium">{t('transfer.withdrawalPreview', 'Withdrawal Preview')}</div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">{t('transfer.toAccount', 'To Account')}</div>
                <div className="font-mono font-semibold text-green-600">
                  +{formatBalance(parseAmountToBigInt(amount))} RGAS
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">{t('transfer.fromHub', 'From Hub')}</div>
                <div className="font-mono font-semibold text-red-600">
                  {formatBalance(getNewHubBalance(parseAmountToBigInt(amount)))} RGAS
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick action buttons */}
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAmount(formatBalance(unlockedBalance))}
            disabled={unlockedBalance <= 0n || isLoading}
            className="flex-1"
          >
            {t('transfer.setMaxAmount', 'Set Max')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleWithdrawAll}
            disabled={unlockedBalance <= 0n || isLoading}
            className="flex-1"
          >
            {t('transfer.withdrawAll', 'Withdraw All')}
          </Button>
        </div>

        {activeChannels > 0 && (
          <div className="flex items-center space-x-2">
            <Badge variant="secondary">
              {t('transfer.activeChannelsBadge', '{{count}} active channels', { count: activeChannels })}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <TransferModalBase
      open={open}
      onClose={onClose}
      title={t('transfer.withdrawFromHub', 'Withdraw from Payment Hub')}
      description={t('transfer.withdrawFromHubDescription', 'Transfer RGAS from Payment Hub back to your account balance')}
      agentDid={agentDid}
      currentBalance={unlockedBalance} // Use unlocked balance as available amount
      balanceLabel={t('transfer.withdrawableBalance', 'Withdrawable Balance')}
      balanceSymbol="RGAS"
      decimals={decimals}
      maxAmount={unlockedBalance}
      showRecipientInput={false} // No recipient needed for withdrawal
      showAmountInput={true}
      amountLabel={t('transfer.withdrawAmount', 'Withdrawal Amount')}
      amountPlaceholder="0.00"
      showBalanceInfo={false} // We'll show custom balance info in extraContent
      showPercentageButtons={false} // Using custom buttons instead
      extraContent={extraContent}
      onTransfer={handleWithdraw}
      isLoading={isLoading}
    />
  );
}