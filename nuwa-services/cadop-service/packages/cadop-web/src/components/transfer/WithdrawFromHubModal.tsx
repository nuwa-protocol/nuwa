import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TransferModalBase } from './TransferModalBase';
import { useHubDepositWithdraw } from '@/hooks/useHubDepositWithdraw';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpCircle, Wallet, AlertTriangle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_ASSET_ID } from '@/config/env';

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
      const result = await withdrawFromHub(withdrawAmount, DEFAULT_ASSET_ID);

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
      const result = await withdrawAllFromHub(DEFAULT_ASSET_ID);

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
  const extraContent = null;

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
      showBalanceInfo={false}
      showPercentageButtons={false}
      extraContent={extraContent}
      onTransfer={handleWithdraw}
      isLoading={isLoading}
    />
  );
}