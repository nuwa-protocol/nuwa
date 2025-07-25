# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0

### Major Changes

- Initial release of Payment Kit
- Core NIP-4 protocol implementation
- SubRAV encoding, signing, and verification
- HTTP Gateway Profile support
- Rooch blockchain integration framework (placeholder)
- TypeScript support with full type definitions

### Features

- **Core Protocol**: Complete SubRAV (Sub-channel Receipt And Voucher) implementation
- **HTTP Integration**: Built-in `X-Payment-Channel-Data` header handling
- **Multi-device Support**: Sub-channel authorization for different verification methods
- **Type Safety**: 100% TypeScript with comprehensive type definitions
- **Extensible Design**: Abstract interfaces for future blockchain integrations

### Note

This initial release includes placeholder implementations for Rooch blockchain integration. Actual Move contract integration will be added in future releases when the payment channel contracts are available. 

## [Unreleased]

### Added
- **`getChainId()` method to `RoochPaymentChannelContract`** - Dynamically retrieve chain ID from blockchain instead of hardcoding
- **`getChainId()` method to `IPaymentChannelContract` interface** - Chain-agnostic interface for getting chain ID
- **`claimFromChannel` integration test** - Complete end-to-end test for payment channel claiming functionality
- **Dynamic chain ID usage in tests** - Tests now use `contract.getChainId()` instead of hardcoded values

### Changed
- **Improved test reliability** - SubRAV creation in tests now uses dynamic chain ID retrieval
- **Enhanced documentation** - Updated README files with chain ID information and new test descriptions

### Technical Details
- Chain ID mapping for Rooch networks:
  - 1 = Rooch Mainnet
  - 2 = Rooch Testnet  
  - 3 = Rooch Devnet
  - 4 = Rooch Local
- The `getChainId()` method uses the underlying `RoochClient.getChainId()` RPC call
- All tests (unit and integration) updated to support the new method
- Mock implementations updated to include `getChainId()` method

## [Previous versions]
... 