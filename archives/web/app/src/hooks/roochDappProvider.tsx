import type {ReactNode} from 'react';

import {RoochProvider, WalletProvider} from '@roochnetwork/rooch-sdk-kit';

import {networkConfig} from './use-networks';
import {PACKAGE_ID} from '../constants'


export default function RoochDappProvider({children}: { children: ReactNode }) {
  return (
    <RoochProvider
      networks={networkConfig}
      defaultNetwork='testnet'
      sessionConf={{
        appName: "Nuwa AI Agents",
        appUrl: "https://nuwa.rooch.io/",
        scopes: [`${PACKAGE_ID}::*::*`],
        maxInactiveInterval: 3600,
      }}
    >
      <WalletProvider chain="bitcoin" autoConnect>
        {children}
      </WalletProvider>
    </RoochProvider>
  );
}
