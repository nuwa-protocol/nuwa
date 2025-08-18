import { useRoochClient } from "@roochnetwork/rooch-sdk-kit";
import { useQuery } from "@tanstack/react-query";
import { AllBalance, TokenBalance, Token } from "@/types/user";
import { RoochAddress, BalanceInfoView } from "@roochnetwork/rooch-sdk";

interface BalanceResponse {
  data: BalanceInfoView[];
  next_cursor: any;
  has_next_page: boolean;
}

// Helper function to calculate token balance with decimals
const calculateBalance = (balance: string, decimals: number): number => {
  return Number(balance) / Math.pow(10, decimals);
};

// Helper function to transform balance item to Token
const transformToToken = (item: BalanceInfoView): Token => {
  return {
    id: item.coin_type,
    name: item.name,
    symbol: item.symbol,
    logo: item.icon_url || "",
    balance: calculateBalance(item.balance, item.decimals),
    decimals: item.decimals,
  };
};

export default function useAllBalance(address: string | undefined): AllBalance {
  const client = useRoochClient();

  const {
    data: balance,
    isPending,
    isError,
    refetch: refetchBalance,
  } = useQuery({
    queryKey: ["useBalance", address],
    queryFn: async () => {
      if (!address) return null;

      try {
        // Ensure correct address format
        const roochAddress = new RoochAddress(address);
        const bech32Address = roochAddress.toBech32Address();

        const balance = await client.getBalances({
          owner: bech32Address,
        });
        return balance as BalanceResponse;
      } catch (error) {
        throw error;
      }
    },
    enabled: !!address,
  });

  // Transform balance data into TokenBalance format
  const tokenBalances: TokenBalance[] = (balance?.data || []).map(
    (item: BalanceInfoView) => {
      const token = transformToToken(item);
      return {
        token,
        balance: calculateBalance(item.balance, item.decimals),
        isPending: false,
        isError: false,
      };
    }
  );

  // Filter out tokens with zero balance
  const nonZeroBalances = tokenBalances.filter((item) => item.balance > 0);

  return {
    balances: nonZeroBalances,
    isPending,
    isError,
    refetchBalance,
  };
}
