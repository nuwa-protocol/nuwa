import { useTranslation } from 'react-i18next';
import { TransferModalBase } from './TransferModalBase';
import { useHubDepositWithdraw } from '@/hooks/useHubDepositWithdraw';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_ASSET_ID } from '@/config/env';

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
  decimals = 8,
  onSuccess,
}: DepositToHubModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    depositToHub,
    isLoading,
  } = useHubDepositWithdraw(agentDid);

  const handleDeposit = async (_recipient: string, depositAmount: bigint): Promise<{ txHash?: string; success: boolean; error?: string }> => {
    try {
      const result = await depositToHub(depositAmount, DEFAULT_ASSET_ID);

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
          variant: 'destructive',
          title: t('transfer.depositFailed', 'Deposit Failed'),
          description: result.error || t('transfer.unknownError', 'Unknown error occurred'),
        });
        return { success: false, error: result.error };
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('transfer.depositFailed', 'Deposit Failed'),
        description: error?.message || t('transfer.unknownError', 'Unknown error occurred'),
      });
      return { success: false, error: error?.message };
    }
  };

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
      onTransfer={handleDeposit}
      isLoading={isLoading}
    />
  );
}