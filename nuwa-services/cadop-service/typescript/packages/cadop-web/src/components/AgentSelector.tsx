import { Check } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { SpinnerContainer } from '@/components/ui';
import { DEFAULT_ASSET_ID } from '@/config/env';
import { usePaymentHubClient } from '../hooks/usePaymentHubClient';
import { useAuth } from '../lib/auth/AuthContext';
import { UserStore } from '../lib/storage';

interface AgentSelectorProps {
  onSelect: (did: string) => void;
  /**
   * Whether to automatically select the first agent in the list when the component mounts.
   * Defaults to true. Pass false if you want the user to make an explicit choice each time.
   */
  autoSelectFirst?: boolean;
}

interface AgentItemProps {
  did: string;
  isSelected: boolean;
  onSelect: (did: string) => void;
}

function AgentItem({ did, isSelected, onSelect }: AgentItemProps) {
  const { hubClient } = usePaymentHubClient(did);
  const [usdBalance, setUsdBalance] = useState<string>('0');
  const [usdBalanceError, setUsdBalanceError] = useState<string | null>(null);
  const [usdLoading, setUsdLoading] = useState(false);

  // Format DID to show beginning and end with middle truncated
  const formatDID = (did: string) => {
    if (did.length <= 20) return did;
    return `${did.slice(0, 25)}...${did.slice(-10)}`;
  };

  // Format bigint with decimals
  const formatBigIntWithDecimals = useCallback(
    (value: bigint, decimals: number, fractionDigits?: number): string => {
      const negative = value < 0n;
      const v = negative ? -value : value;
      const base = 10n ** BigInt(decimals);
      const integer = v / base;
      let fraction = (v % base).toString().padStart(decimals, '0');
      if (typeof fractionDigits === 'number') {
        fraction = fraction.slice(0, fractionDigits);
      }
      const fracPart =
        fraction && fraction !== '0'.repeat(fraction.length)
          ? `.${fraction.replace(/0+$/, '')}`
          : '';
      return `${negative ? '-' : ''}${integer.toString()}${fracPart}`;
    },
    []
  );

  // Get USD balance from payment hub
  useEffect(() => {
    const fetchUsdBalance = async () => {
      if (!hubClient) {
        setUsdBalance('0');
        return;
      }

      setUsdLoading(true);
      try {
        const res = await hubClient.getBalanceWithUsd({
          ownerDid: did,
          assetId: DEFAULT_ASSET_ID,
        });
        const usd = formatBigIntWithDecimals(res.balancePicoUSD, 12, 2);
        setUsdBalance(usd);
      } catch (error) {
        console.error('Failed to fetch USD balance:', error);
        setUsdBalanceError(error instanceof Error ? error.message : String(error));
      } finally {
        setUsdLoading(false);
      }
    };

    fetchUsdBalance();
  }, [hubClient, formatBigIntWithDecimals]);

  return (
    <button
      type="button"
      onClick={() => onSelect(did)}
      className={`
        w-full p-4 text-left rounded-lg border transition-all duration-200
        hover:border-primary-300 hover:bg-primary-50
        ${
          isSelected
            ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
            : 'border-gray-200 bg-white'
        }
      `}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <img
          src={`https://avatar.vercel.sh/${did.slice(-4)}`}
          alt="DID Avatar"
          className="w-10 h-10 rounded-full bg-gray-200"
        />

        {/* DID Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 font-mono">{formatDID(did)}</div>
          <div className="text-xs text-gray-500">
            {usdLoading
              ? 'Loading USD...'
              : usdBalanceError
                ? 'DID not found, please create a new DID'
                : `$${usdBalance} USD`}
          </div>
        </div>

        {/* Check mark */}
        {isSelected && <Check className="h-5 w-5 text-primary-600 flex-shrink-0" />}
      </div>
    </button>
  );
}

export function AgentSelector({ onSelect, autoSelectFirst = true }: AgentSelectorProps) {
  const { userDid } = useAuth();
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | undefined>();

  const loadAgents = useCallback(async () => {
    if (!userDid) return;

    setLoading(true);
    try {
      // Get agent DIDs from local storage
      const agentDids = UserStore.listAgents(userDid);
      setAgents(agentDids || []);

      if (agentDids && agentDids.length > 0) {
        if (autoSelectFirst) {
          // Auto-select the first agent to reduce one user action
          setSelected(agentDids[0]);
          onSelect(agentDids[0]);
        } else {
          setSelected(undefined);
        }
      } else {
        setSelected(undefined);
      }
    } catch (error) {
      console.error('Failed to load agents from storage:', error);
    } finally {
      setLoading(false);
    }
  }, [userDid, autoSelectFirst, onSelect]);

  useEffect(() => {
    if (userDid) {
      loadAgents();
    }
  }, [userDid, loadAgents]);

  const handleSelect = (did: string) => {
    setSelected(did);
    onSelect(did);
  };

  if (loading) {
    return <SpinnerContainer loading={true} />;
  }

  if (agents.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No agent DIDs found</p>
        <p className="text-sm mt-1">Create an agent first to continue</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {agents.map(agent => (
        <AgentItem
          key={agent}
          did={agent}
          isSelected={selected === agent}
          onSelect={handleSelect}
        />
      ))}
    </div>
  );
}
