import React from 'react';
import { useTranslation } from 'react-i18next';
import { TransferModalBase } from './TransferModalBase';
import { useHubTransfer } from '@/hooks/useHubTransfer';
import { normalizeAddress, didToAddress } from '@/utils/addressValidation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Lock, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface TransferHubModalProps {
  open: boolean;
  onClose: () => void;
  agentDid: string;
  decimals?: number;
  onSuccess?: () => void;
}

export function TransferHubModal({
  open,
  onClose,
  agentDid,
  decimals = 8,
  onSuccess,
}: TransferHubModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    transfer,
    isLoading,
    unlockedBalance,
    totalBalance,
    lockedBalance,
    activeChannels,
  } = useHubTransfer(agentDid);

  const handleTransfer = async (recipient: string, amount: bigint): Promise<{ txHash?: string; success: boolean; error?: string }> => {
    try {
      const result = await transfer(recipient, amount, '0x3::rgas::RGAS');

      if (result.success) {
        toast({
          variant: 'success',
          title: t('transfer.hubTransferSuccess', 'Hub Transfer Successful'),
          description: t('transfer.hubTransferSuccessDescription', 'Successfully transferred RGAS to the recipient\'s Payment Hub'),
        });
        onSuccess?.();
        return { txHash: result.txHash, success: true };
      } else {
        toast({
          variant: 'error',
          title: t('transfer.hubTransferFailed', 'Hub Transfer Failed'),
          description: result.error || t('transfer.unknownError', 'Unknown error occurred'),
        });
        return { success: false, error: result.error };
      }
    } catch (error: any) {
      toast({
        variant: 'error',
        title: t('transfer.hubTransferFailed', 'Hub Transfer Failed'),
        description: error?.message || t('transfer.unknownError', 'Unknown error occurred'),
      });
      return { success: false, error: error?.message };
    }
  };

  const validateRecipient = (recipient: string) => {
    const trimmed = recipient.trim();

    if (!trimmed) {
      return { valid: false, error: t('transfer.recipientRequired', 'Recipient DID is required') };
    }

    try {
      // For hub transfers, we prefer DID format but also accept addresses
      const isDID = trimmed.startsWith('did:rooch:');
      const isAddress = /^0x[a-fA-F0-9]{64}$/.test(trimmed);

      if (!isDID && !isAddress) {
        return {
          valid: false,
          error: t('transfer.invalidHubRecipientFormat', 'Invalid format. Please enter a valid DID or Rooch address')
        };
      }

      const normalizedAddress = isDID ? didToAddress(trimmed) : trimmed;

      if (normalizedAddress === agentDid) {
        return { valid: false, error: t('transfer.cannotTransferToSelf', 'Cannot transfer to your own address') };
      }

      return { valid: true };
    } catch {
      return {
        valid: false,
        error: t('transfer.invalidHubRecipientFormat', 'Invalid format. Please enter a valid DID or Rooch address')
      };
    }
  };

  const formatBalance = (balance: bigint) => {
    const balanceNumber = Number(balance) / Math.pow(10, decimals);
    return balanceNumber.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    });
  };

  const lockedBalanceText = activeChannels > 0
    ? t('transfer.lockedBalanceWithChannels', 'Locked balance ({{channels}} active channels)', {
        channels: activeChannels
      })
    : t('transfer.lockedBalance', 'Locked balance');

  // Extra content showing balance breakdown
  const extraContent = activeChannels > 0 && (
    <div className="space-y-3">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          {t('transfer.hubTransferInfo', 'Only unlocked balance can be transferred. Locked balance is held as collateral for active payment channels.')}
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('transfer.totalBalance', 'Total Balance')}:</span>
          <span className="font-mono">{formatBalance(totalBalance)} RGAS</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center">
            <Lock className="h-3 w-3 mr-1" />
            {lockedBalanceText}:
          </span>
          <span className="font-mono text-orange-600">{formatBalance(lockedBalance)} RGAS</span>
        </div>

        <div className="flex items-center justify-between text-sm font-medium">
          <span>{t('transfer.unlockedBalance', 'Unlocked Balance')}:</span>
          <span className="font-mono text-green-600">{formatBalance(unlockedBalance)} RGAS</span>
        </div>
      </div>

      {activeChannels > 0 && (
        <div className="flex items-center space-x-2">
          <Badge variant="secondary">
            {t('transfer.activeChannelsBadge', '{{count}} active channels', { count: activeChannels })}
          </Badge>
        </div>
      )}
    </div>
  );

  return (
    <TransferModalBase
      open={open}
      onClose={onClose}
      title={t('transfer.hubTransfer', 'Transfer Payment Hub Balance')}
      description={t('transfer.hubTransferDescription', 'Transfer RGAS from your Payment Hub to another address\'s Payment Hub')}
      agentDid={agentDid}
      currentBalance={unlockedBalance} // Use unlocked balance as available amount
      balanceLabel={t('transfer.unlockedBalance', 'Unlocked Balance')}
      balanceSymbol="RGAS"
      decimals={decimals}
      maxAmount={unlockedBalance}
      showRecipientInput={true}
      recipientLabel={t('transfer.recipientDID', 'Recipient DID')}
      recipientPlaceholder={t('transfer.recipientDIDPlaceholder', 'Enter DID (did:rooch:0x...) or Rooch address')}
      showAmountInput={true}
      amountLabel={t('transfer.amount', 'Amount')}
      amountPlaceholder="0.00"
      showBalanceInfo={false} // We'll show custom balance info in extraContent
      showPercentageButtons={true}
      extraContent={extraContent}
      onTransfer={handleTransfer}
      validateRecipient={validateRecipient}
      isLoading={isLoading}
    />
  );
}