import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TransferModalBase } from './TransferModalBase';
import { useHubDepositWithdraw } from '@/hooks/useHubDepositWithdraw';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ArrowDownCircle, TrendingUp, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface DepositToHubModalProps {
  open: boolean;
  onClose: () => void;
  agentDid: string;
  currentAccountBalance: bigint;
  currentHubBalance: bigint;
  decimals?: number;
  onSuccess?: () => void;
}

export function DepositToHubModal({
  open,
  onClose,
  agentDid,
  currentAccountBalance,
  currentHubBalance,
  decimals = 8,
  onSuccess,
}: DepositToHubModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const {
    depositToHub,
    isLoading,
    totalBalance: hubTotalBalance,
    unlockedBalance,
    activeChannels,
  } = useHubDepositWithdraw(agentDid);

  const handleDeposit = async (_recipient: string, depositAmount: bigint): Promise<{ txHash?: string; success: boolean; error?: string }> => {
    try {
      const result = await depositToHub(depositAmount, '0x3::rgas::RGAS');

      if (result.success) {
        toast({
          variant: 'success',
          title: t('transfer.depositSuccess', 'Deposit Successful'),
          description: t('transfer.depositSuccessDescription', 'Successfully deposited RGAS to your Payment Hub'),
        });
        onSuccess?.();
        return { txHash: result.txHash, success: true };
      } else {
        toast({
          variant: 'error',
          title: t('transfer.depositFailed', 'Deposit Failed'),
          description: result.error || t('transfer.unknownError', 'Unknown error occurred'),
        });
        return { success: false, error: result.error };
      }
    } catch (error: any) {
      toast({
        variant: 'error',
        title: t('transfer.depositFailed', 'Deposit Failed'),
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

  const getNewHubBalance = (depositAmount: bigint) => {
    const currentBalance = BigInt(hubTotalBalance);
    return currentBalance + depositAmount;
  };

  const parseAmountToBigInt = (amountStr: string) => {
    try {
      return BigInt(Math.floor(parseFloat(amountStr) * Math.pow(10, decimals)));
    } catch {
      return 0n;
    }
  };

  // Extra content showing deposit preview and information
  const extraContent = (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          {t('transfer.depositInfo', 'Deposit funds from your account balance to Payment Hub for fast payment channels and instant micro-payments.')}
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <ArrowDownCircle className="h-3 w-3" />
              <span>{t('transfer.fromAccount', 'From Account')}</span>
            </div>
            <div className="font-mono text-sm">
              {formatBalance(currentAccountBalance)} RGAS
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span>{t('transfer.toHub', 'To Payment Hub')}</span>
            </div>
            <div className="font-mono text-sm">
              {formatBalance(BigInt(hubTotalBalance))} RGAS
            </div>
          </div>
        </div>

        {/* Preview new balance if amount is entered */}
        {amount && !isNaN(parseFloat(amount)) && (
          <div className="border rounded-lg p-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('transfer.newHubBalance', 'New Hub Balance')}</span>
              <span className="font-mono font-semibold text-green-600">
                {formatBalance(getNewHubBalance(parseAmountToBigInt(amount)))} RGAS
              </span>
            </div>
          </div>
        )}

        {activeChannels > 0 && (
          <div className="flex items-center space-x-2">
            <Badge variant="secondary">
              {t('transfer.activeChannelsBadge', '{{count}} active channels', { count: activeChannels })}
            </Badge>
          </div>
        )}
      </div>

      <Alert variant="outline">
        <ArrowDownCircle className="h-4 w-4" />
        <AlertDescription>
          {t('transfer.depositNote', 'After deposit, you can use the funds to open payment channels for instant, low-cost transactions without waiting for blockchain confirmation each time.')}
        </AlertDescription>
      </Alert>
    </div>
  );

  return (
    <TransferModalBase
      open={open}
      onClose={onClose}
      title={t('transfer.depositToHub', 'Deposit to Payment Hub')}
      description={t('transfer.depositToHubDescription', 'Transfer RGAS from your account balance to Payment Hub')}
      agentDid={agentDid}
      currentBalance={currentAccountBalance}
      balanceLabel={t('transfer.availableAccountBalance', 'Available Account Balance')}
      balanceSymbol="RGAS"
      decimals={decimals}
      maxAmount={currentAccountBalance}
      showRecipientInput={false} // No recipient needed for deposit
      showAmountInput={true}
      amountLabel={t('transfer.depositAmount', 'Deposit Amount')}
      amountPlaceholder="0.00"
      showBalanceInfo={true}
      showPercentageButtons={true}
      extraContent={extraContent}
      onAmountChange={setAmount}
      onTransfer={handleDeposit}
      isLoading={isLoading}
    />
  );
}