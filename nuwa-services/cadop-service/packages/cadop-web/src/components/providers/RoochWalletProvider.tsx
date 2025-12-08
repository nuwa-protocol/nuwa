import React from 'react';
import { RoochProvider, WalletProvider } from '@roochnetwork/rooch-sdk-kit';
import { getRoochNodeUrl } from '@roochnetwork/rooch-sdk';
import { createNetworkConfig } from '@roochnetwork/rooch-sdk-kit';

// Create network configuration
const { networkConfig } = createNetworkConfig({
  mainnet: {
    url: getRoochNodeUrl('mainnet'),
    variables: {},
  },
  testnet: {
    url: getRoochNodeUrl('testnet'),
    variables: {},
  },
  devnet: {
    url: getRoochNodeUrl('devnet'),
    variables: {},
  },
  localnet: {
    url: getRoochNodeUrl('localnet'),
    variables: {},
  },
});

interface RoochWalletProviderProps {
  children: React.ReactNode;
}

/**
 * Rooch Wallet Provider Wrapper
 *
 * Wraps the application with necessary Rooch SDK Kit providers
 * Note: Assumes QueryClientProvider is already provided by parent
 */
export function RoochWalletProvider({ children }: RoochWalletProviderProps) {
  const defaultNetwork = import.meta.env.VITE_ROOCH_NETWORK || 'devnet';

  return (
    <RoochProvider
      networks={networkConfig}
      defaultNetwork={defaultNetwork}
      sessionConf={{
        appName: 'CADOP',
        appUrl: window.location.origin,
        scopes: ['0x3::*::*'], // Allow all scopes for now
        maxInactiveInterval: 1200, // 20 minutes
      }}
    >
      <WalletProvider
        enableLocal={false} // Disable local wallet due to getBitcoinAddressWith error
        preferredWallets={['UniSat', 'OKX']} // Preferred Bitcoin wallets
        chain="bitcoin"
        autoConnect={true} // Enable auto-connect to restore wallet connection on page refresh
      >
        {children}
      </WalletProvider>
    </RoochProvider>
  );
}
