# @nuwa-ai/identity-kit

## 0.8.0

### Minor Changes

- [#524](https://github.com/nuwa-protocol/nuwa/pull/524) [`25a7c31`](https://github.com/nuwa-protocol/nuwa/commit/25a7c31d20e4beddc983c0fe134a92edaac1ffe8) Thanks [@jolestar](https://github.com/jolestar)! - Release `nuwa-id` CLI workflow for remote DIDAuth usage on `id.nuwa.dev`.

  Key updates:
  - Add profile-based config layout and `set-did` command for smoother agent UX.
  - Unify key fragment naming and improve generated deep link payload compatibility.
  - Extract environment-agnostic deeplink/auth helpers shared by CLI and web paths.
  - Improve DID verification defaults and remove misleading hardcoded RPC fallback.

## 0.3.1

### Patch Changes

- fix deep link bug

## 0.3.0

### Minor Changes

- **Enhanced Multibase Support**: Added `decodeBase64urlToString()` and `decodeBase64urlpadToString()` methods to MultibaseCodec for improved payment channel integration
- **Payment Kit Integration**: Exported `utils/bytes.ts` module to provide foundational byte processing utilities for payment channels
- **Session Key Scopes**: Implemented comprehensive Rooch DID Session-Key Scopes with fine-grained contract function access control

### Patch Changes

- **VDR System**: Fixed VDR initialization issues for improved system stability
- **CADOP Protocol**: Enhanced VerificationRelationship handling in AddKeyRequestPayloadV1
- **Test Infrastructure**: Improved TestHelpers with better real on-chain DID creation support

## 0.2.2

### Patch Changes

- Fix VDR init

## 0.2.1

### Patch Changes

- Fix VerificationRelationship in AddKeyRequestPayloadV1

## 0.2.0

### Minor Changes

- 1. Add `decodeBase64urlToString` and `decodeBase64urlpadToString` to MultibaseCodec
  2. Export `utils/bytes.ts`

## 0.1.0

### Major Changes

- Refactor and prepare release
