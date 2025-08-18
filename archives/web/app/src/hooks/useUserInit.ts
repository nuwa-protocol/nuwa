import {
  UseMutationOptions,
  UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { Transaction, Args } from "@roochnetwork/rooch-sdk";
import { useCurrentSession, useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { mutationKeys } from "./mutationKeys";
import { useNetworkVariable } from "./useNetworks";

type UseUserInitArgs = {
  name: string;
  username: string;
  avatar?: string;
};

type UseUserInitResult = void;

type UseUserInitOptions = Omit<
  UseMutationOptions<UseUserInitResult, Error, UseUserInitArgs, unknown>,
  "mutationFn"
>;

export function useUserInit({
  mutationKey,
  ...mutationOptions
}: UseUserInitOptions = {}): UseMutationResult<
  UseUserInitResult,
  Error,
  UseUserInitArgs,
  unknown
> {
  const client = useRoochClient();
  const session = useCurrentSession();
  const packageId = useNetworkVariable("packageId");
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: mutationKeys.initUser(mutationKey),
    mutationFn: async (args) => {
      console.log(args);

      // verify the parameters
      if (!args.username) {
        throw new Error("Username is required");
      }

      // verify the username length
      if (args.username.length < 4 || args.username.length > 16) {
        throw new Error("Username must be between 4-16 characters");
      }

      // verify the username format
      if (!/^[a-zA-Z0-9_]+$/.test(args.username)) {
        throw new Error(
          "Username can only contain letters, numbers, and underscores"
        );
      }

      // verify the username cannot be all numbers
      if (/^\d+$/.test(args.username)) {
        throw new Error("Username cannot be all numbers");
      }

      const tx = new Transaction();
      tx.callFunction({
        target: `${packageId}::user_profile::init_profile`,
        args: [
          Args.string(args.name),
          Args.string(args.username),
          Args.string(args.avatar || ""),
        ],
      });

      tx.setMaxGas(5_00000000);

      const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: session!,
      });

      if (result.execution_info.status.type !== "executed") {
        throw new Error(
          `Failed to create profile: ${JSON.stringify(
            result.execution_info.status
          )}`
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["useUserInfo"] });
    },
    ...mutationOptions,
  });
}
