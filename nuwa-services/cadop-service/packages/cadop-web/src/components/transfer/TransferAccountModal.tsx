import React from 'react';
import { useTranslation } from 'react-i18next';
import { TransferModalBase } from './TransferModalBase';
import { useAccountTransfer } from '@/hooks/useAccountTransfer';
import { normalizeAddress, isValidDID, isValidRoochAddress } from '@/utils/addressValidation';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_ASSET_ID } from '@/config/env';

export interface TransferAccountModalProps {
  open: boolean;
  onClose: () => void;
  agentDid: string;
  currentBalance: bigint;
  decimals?: number;
  onSuccess?: () => void;
}

export function TransferAccountModal({
  open,
  onClose,
  agentDid,
  currentBalance,
  decimals = 8,
  onSuccess,
}: TransferAccountModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { transfer, isLoading } = useAccountTransfer(agentDid);

  const handleTransfer = async (
    recipient: string,
    amount: bigint
  ): Promise<{ txHash?: string; success: boolean; error?: string }> => {
    try {
      const normalizedRecipient = normalizeAddress(recipient);
      const result = await transfer(normalizedRecipient, amount, DEFAULT_ASSET_ID);

      if (result.success) {
        toast({
          variant: 'success',
          title: t('transfer.success', 'Transfer Successful'),
          description: t(
            'transfer.successDescription',
            'Successfully transferred RGAS to the recipient'
          ),
        });
        onSuccess?.();
        return { txHash: result.txHash, success: true };
      } else {
        toast({
          variant: 'error',
          title: t('transfer.failed', 'Transfer Failed'),
          description: result.error || t('transfer.unknownError', 'Unknown error occurred'),
        });
        return { success: false, error: result.error };
      }
    } catch (error: any) {
      toast({
        variant: 'error',
        title: t('transfer.failed', 'Transfer Failed'),
        description: error?.message || t('transfer.unknownError', 'Unknown error occurred'),
      });
      return { success: false, error: error?.message };
    }
  };

  const validateRecipient = (recipient: string) => {
    const trimmed = recipient.trim();

    if (!trimmed) {
      return {
        valid: false,
        error: t('transfer.recipientRequired', 'Recipient address is required'),
      };
    }

    try {
      normalizeAddress(trimmed);
      return { valid: true };
    } catch {
      return {
        valid: false,
        error: t(
          'transfer.invalidAddressFormat',
          'Invalid address format. Please enter a valid Rooch address or DID'
        ),
      };
    }
  };

  return (
    <TransferModalBase
      open={open}
      onClose={onClose}
      title={t('transfer.accountTransfer', 'Transfer Account Balance')}
      description={t(
        'transfer.accountTransferDescription',
        'Transfer RGAS from your account balance to another address'
      )}
      agentDid={agentDid}
      currentBalance={currentBalance}
      balanceLabel={t('transfer.accountBalance', 'Account Balance')}
      balanceSymbol="RGAS"
      decimals={decimals}
      maxAmount={currentBalance}
      showRecipientInput={true}
      recipientLabel={t('transfer.recipientAddress', 'Recipient Address')}
      recipientPlaceholder={t(
        'transfer.recipientPlaceholder',
        'Enter Rooch address (0x...) or DID (did:rooch:0x...)'
      )}
      showAmountInput={true}
      amountLabel={t('transfer.amount', 'Amount')}
      amountPlaceholder="0.00"
      showBalanceInfo={true}
      showPercentageButtons={true}
      onTransfer={handleTransfer}
      validateRecipient={validateRecipient}
      isLoading={isLoading}
    />
  );
}
