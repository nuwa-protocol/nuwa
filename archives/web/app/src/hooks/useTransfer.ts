import {
    UseMutationOptions,
    UseMutationResult,
    useMutation,
  } from "@tanstack/react-query";
  
  import { TypeArgs } from "@roochnetwork/rooch-sdk";
  import { useCurrentSession, useRoochClient } from "@roochnetwork/rooch-sdk-kit";
  import { mutationKeys } from "./mutationKeys";
  
  type UseTransferArgs = {
    recipient: string;
    amount: number | bigint;
    coinType: TypeArgs;
  };
  
  type UseTransferResult = void;
  
  type UseTransferOptions = Omit<
    UseMutationOptions<UseTransferResult, Error, UseTransferArgs, unknown>,
    "mutationFn"
  >;
  
  export function useTransfer({
    mutationKey,
    ...mutationOptions
  }: UseTransferOptions = {}): UseMutationResult<
    UseTransferResult,
    Error,
    UseTransferArgs,
    unknown
  > {
    const client = useRoochClient();
    const session = useCurrentSession();
  
    return useMutation({
      mutationKey: mutationKeys.createAgent(mutationKey),
      mutationFn: async (args) => {
         client.transfer({
            signer: session!,
            recipient: args.recipient,
            amount: args.amount,
            coinType: args.coinType,
        });
      },
      ...mutationOptions,
    });
  }
  