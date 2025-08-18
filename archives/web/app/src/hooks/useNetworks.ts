import { getRoochNodeUrl } from '@roochnetwork/rooch-sdk'
import { createNetworkConfig } from "@roochnetwork/rooch-sdk-kit"
import {PACKAGE_ID} from '../constants'

const { networkConfig, useNetworkVariable, useNetworkVariables } =
  createNetworkConfig({
    mainnet: {
      url: getRoochNodeUrl("mainnet"),
      variables: {
        packageId: PACKAGE_ID,
        roochscanUrl: 'https://roochscan.io',
      },
    },
    testnet: {
      url: getRoochNodeUrl("testnet"),
      variables: {
        packageId: PACKAGE_ID,
        roochscanUrl: 'https://test.roochscan.io',
      },
    },
    devnet: {
      url: getRoochNodeUrl("devnet"),
      variables: {
        packageId: PACKAGE_ID,
        roochscanUrl: 'https://dev.roochscan.io',
      },
    },
    localnet: {
      url: getRoochNodeUrl("localnet"),
      variables: {
        packageId: PACKAGE_ID,
        roochscanUrl: 'http://local.roochscan.io',
      },
    },
  })

export { useNetworkVariable, useNetworkVariables, networkConfig }