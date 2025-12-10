# Rooch Payment Channel Contract Tests

This directory contains comprehensive tests for the Rooch Payment Channel Contract implementation.

## Test Files

### Integration Tests

#### `RoochPaymentChannelContract.integration.test.ts`

This file contains end-to-end integration tests that verify the complete payment channel workflow on the Rooch blockchain.

**Test Setup:**

- Creates two DIDs (payer and payee) using the test helper `createSelfDid`
- Initializes a `RoochPaymentChannelContract` instance connected to a test Rooch node
- Sets up a test asset (RGas) for payment channel operations

**Test Coverage:**

1. **Asset Information Tests:**
   - `should get asset info for RGas` - Verifies asset metadata retrieval
   - `should get asset price for RGas` - Validates asset pricing in pUSD
   - **`should get chain ID`** - NEW: Tests chain ID retrieval from the blockchain

2. **Payment Channel Operations:**
   - `should get channel status` - Tests channel status retrieval after opening
   - `should get sub-channel info` - Verifies sub-channel information after authorization
   - **`should claim from channel`** - NEW: Tests the complete claim workflow

**New Test: `should claim from channel`**

This test verifies the complete claim process:

1. **Setup Phase:**
   - Opens a payment channel between payer and payee
   - Authorizes a sub-channel for the payer

2. **SubRAV Creation:**
   - Creates a SubRAV (Sub-channel Receipt And Voucher) with:
     - Version: 1 (current protocol version)
     - Chain ID: dynamically retrieved from `contract.getChainId()` (improved from hardcoded value)
     - Channel ID: from the opened channel
     - Channel Epoch: from channel status
     - VM ID Fragment: payer's key fragment
     - Accumulated Amount: 5,000,000 (0.05 RGas)
     - Nonce: 1

3. **Signing Process:**
   - Gets the payer's key ID from the key manager
   - Signs the SubRAV using `SubRAVSigner.sign()`

4. **Claim Execution:**
   - Creates claim parameters with the signed SubRAV
   - Uses the payee's signer for the claim transaction (correct workflow)
   - Calls `contract.claimFromChannel()`

5. **Verification:**
   - Validates the claim result has a transaction hash
   - Checks the claimed amount and block height
   - Verifies the sub-channel state is updated correctly
   - Ensures `lastClaimedAmount` and `lastConfirmedNonce` are properly incremented

**Running Integration Tests:**

```bash
# Requires a running Rooch node at localhost:6767 or ROOCH_NODE_URL env var
npm run test:integration

# To run only the claim test:
npm test -- --testNamePattern="should claim from channel"
```

**Note:** Integration tests will be skipped if no Rooch node is available, making them CI-friendly.

### Unit Tests

#### `RoochPaymentChannelContract.test.ts`

Contains unit tests that verify contract logic without requiring a live blockchain connection.

#### `contract.test.ts`

Tests for contract utilities and helper functions.

## Test Dependencies

- `@nuwa-ai/identity-kit/testHelpers` - Provides `TestEnv`, `createSelfDid` for DID creation
- `SubRAVSigner` - For signing SubRAV messages
- Jest test framework with custom matchers
