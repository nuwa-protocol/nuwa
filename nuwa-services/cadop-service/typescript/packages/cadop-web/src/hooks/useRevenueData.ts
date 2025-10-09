import { useState, useEffect, useCallback } from 'react';
import { PaymentRevenueClient, RoochPaymentRevenueContract } from '@nuwa-ai/payment-kit';
import { SignerFactory } from '../lib/auth/signers/SignerFactory';
import { DEFAULT_ASSET_ID } from '../config/env';

// Simple rate provider interface
interface SimpleRateProvider {
  getPricePicoUSD(assetId: string): Promise<bigint>;
  getAssetInfo(
    assetId: string
  ): Promise<{ assetId: string; symbol: string; decimals: number } | null>;
  getLastUpdated(assetId: string): number | null;
  clearCache(): Promise<void>;
}

export interface RevenueBalance {
  assetId: string;
  balance: bigint;
  balanceUSD: bigint;
  symbol: string;
  decimals: number;
}

export interface RevenueDataResult {
  revenueClient: PaymentRevenueClient | null;
  balances: RevenueBalance[];
  totalUSD: bigint;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  hasRevenue: boolean;
  hubExists: boolean;
}

export interface WithdrawParams {
  assetId: string;
  amount: bigint;
}

export interface PreviewParams {
  assetId: string;
  amount: bigint;
}

/**
 * Hook for managing revenue data and operations for an Agent DID
 */
export function useRevenueData(agentDid: string | undefined): RevenueDataResult {
  const [revenueClient, setRevenueClient] = useState<PaymentRevenueClient | null>(null);
  const [balances, setBalances] = useState<RevenueBalance[]>([]);
  const [totalUSD, setTotalUSD] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hubExists, setHubExists] = useState(false);
  const [hasRevenue, setHasRevenue] = useState(false);

  // Initialize Revenue Client
  useEffect(() => {
    if (!agentDid) {
      setRevenueClient(null);
      return;
    }

    async function initClient() {
      try {
        setLoading(true);
        setError(null);

        // Create signer from Agent DID
        const signer = await SignerFactory.getInstance().createSignerFromAgentDID(agentDid!);

        // Create Rooch contract instance
        const revenueContract = new RoochPaymentRevenueContract();

        // Create a reasonable rate provider for RGAS
        // Based on typical testnet values: 1 RGAS ≈ $0.0001 USD (100 RGAS = $0.01)
        const rateProvider: SimpleRateProvider = {
          getPricePicoUSD: async (_assetId: string): Promise<bigint> => {
            // Return 0.0001 USD = 100 picoUSD for RGAS (much more reasonable than $1)
            return BigInt(100); // 0.0001 USD in picoUSD
          },
          getAssetInfo: async (
            _assetId: string
          ): Promise<{ assetId: string; symbol: string; decimals: number } | null> => {
            return {
              assetId: _assetId,
              symbol: _assetId.split('::').pop() || 'RGAS',
              decimals: 8,
            };
          },
          getLastUpdated: (_assetId: string): number | null => {
            return Date.now();
          },
          clearCache: async (): Promise<void> => {
            // No-op for simple provider
          },
        };

        // Create Revenue Client with reasonable rate provider
        const client = new PaymentRevenueClient({
          contract: revenueContract,
          signer,
          defaultAssetId: DEFAULT_ASSET_ID,
          rateProvider,
        });

        setRevenueClient(client);
      } catch (err) {
        console.error('[useRevenueData] Failed to initialize revenue client:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize revenue client');
      } finally {
        setLoading(false);
      }
    }

    initClient();
  }, [agentDid]);

  // Fetch revenue data
  const fetchRevenue = useCallback(async () => {
    if (!revenueClient || !agentDid) {
      setBalances([]);
      setTotalUSD(0n);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Check if revenue hub exists
      const hubExists = await revenueClient.revenueHubExists();
      setHubExists(hubExists);

      if (!hubExists) {
        setBalances([]);
        setTotalUSD(0n);
        setHasRevenue(false);
        return;
      }

      // Get revenue balance with USD conversion
      const balanceWithUsd = await revenueClient.getRevenueBalanceWithUsd();

      // Get asset info from rate provider (we know the symbol and decimals for RGAS)
      const symbol = DEFAULT_ASSET_ID.split('::').pop() || 'RGAS';
      const decimals = 8; // RGAS has 8 decimals

      // Convert to our interface format
      const revenueBalance: RevenueBalance = {
        assetId: DEFAULT_ASSET_ID,
        balance: balanceWithUsd.balance,
        balanceUSD: balanceWithUsd.balancePicoUSD,
        symbol,
        decimals,
      };

      setBalances([revenueBalance]);
      setTotalUSD(balanceWithUsd.balancePicoUSD);

      // Determine if there's actual revenue (balance > 0)
      const hasActualRevenue = balanceWithUsd.balance > 0n;
      setHasRevenue(hasActualRevenue);
    } catch (err) {
      console.error('[useRevenueData] Failed to fetch revenue:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch revenue data');
      setBalances([]);
      setTotalUSD(0n);
      setHubExists(false);
      setHasRevenue(false);
    } finally {
      setLoading(false);
    }
  }, [revenueClient, agentDid]);

  // Fetch data when client is ready
  useEffect(() => {
    if (revenueClient) {
      fetchRevenue();
    }
  }, [revenueClient, fetchRevenue]);

  return {
    revenueClient,
    balances,
    totalUSD,
    loading,
    error,
    refetch: fetchRevenue,
    hasRevenue,
    hubExists,
  };
}

/**
 * Hook for revenue operations (withdraw, preview, etc.)
 */
export function useRevenueOperations(agentDid: string | undefined) {
  const { revenueClient } = useRevenueData(agentDid);

  const withdrawRevenue = useCallback(
    async (params: WithdrawParams) => {
      if (!revenueClient) {
        throw new Error('Revenue client not initialized');
      }

      const result = await revenueClient.withdraw(params.assetId, params.amount);
      return result;
    },
    [revenueClient]
  );

  const previewWithdrawal = useCallback(
    async (params: PreviewParams) => {
      if (!revenueClient) {
        throw new Error('Revenue client not initialized');
      }

      return await revenueClient.previewWithdrawal(params.assetId, params.amount);
    },
    [revenueClient]
  );

  const ensureRevenueHub = useCallback(async () => {
    if (!revenueClient) {
      throw new Error('Revenue client not initialized');
    }

    return await revenueClient.ensureRevenueHub();
  }, [revenueClient]);

  const hasRevenue = useCallback(
    async (assetId?: string): Promise<boolean> => {
      if (!revenueClient) {
        return false;
      }

      return await revenueClient.hasRevenue({ assetId });
    },
    [revenueClient]
  );

  return {
    withdrawRevenue,
    previewWithdrawal,
    ensureRevenueHub,
    hasRevenue,
    isReady: !!revenueClient,
  };
}
