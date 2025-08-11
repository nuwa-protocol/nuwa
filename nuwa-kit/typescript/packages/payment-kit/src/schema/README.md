# Payment Kit Schema Architecture

This directory contains the Zod schema definitions for the Payment Kit, organized in a layered architecture for maximum reusability and type safety.

## Directory Structure

```
src/schema/
├── core/           # Core business object schemas
│   └── index.ts    # SubRAV, ChannelInfo, AssetInfo, etc.
├── api/            # API endpoint-specific schemas
│   ├── recovery.ts
│   ├── commit.ts
│   ├── health.ts
│   ├── discovery.ts
│   ├── subrav.ts
│   └── admin.ts
└── index.ts        # Public exports
```

## Design Principles

### 1. Core Schema First

Core business objects are defined once in `core/index.ts` and reused across API endpoints:

```typescript
// ✅ Good: Reuse core schema
import { SubRAVSchema } from '../core';
export const RecoveryResponseSchema = z.object({
  pendingSubRav: SubRAVSchema.nullable(),
  // ...
});

// ❌ Avoid: Duplicating field definitions
export const RecoveryResponseSchema = z.object({
  pendingSubRav: z
    .object({
      version: z.number(),
      chainId: createBigIntSchema(),
      // ... duplicate SubRAV fields
    })
    .nullable(),
});
```

### 2. BigInt Support

All schemas automatically handle BigInt conversion from multiple input types:

```typescript
const createBigIntSchema = () =>
  z.union([
    z.bigint(), // Native BigInt
    z.string().transform(BigInt), // String from JSON
    z.number().transform(BigInt), // Small numbers
    z.instanceof(LosslessNumber).transform(val => BigInt(val.toString())), // lossless-json
  ]);
```

### 3. Type Alignment

Schema types are designed to match the core TypeScript interfaces:

```typescript
// Core interface (from core/types.ts)
interface SubRAV {
  chainId: bigint;
  // ...
}

// Schema type matches exactly
const SubRAVSchema = z.object({
  chainId: createBigIntSchema(), // → bigint
  // ...
});

type SubRAV = z.infer<typeof SubRAVSchema>; // Compatible with core interface
```

## Usage Examples

### Server-Side Validation

```typescript
import { CommitRequestSchema, SignedSubRAVSchema } from '@nuwa-ai/payment-kit/schema';

// Validate incoming API request
const validateCommitRequest = (rawData: unknown) => {
  try {
    const validated = CommitRequestSchema.parse(rawData);
    // validated.subRav is now properly typed with BigInt fields
    return validated;
  } catch (error) {
    throw new ValidationError('Invalid commit request', error);
  }
};
```

### Client-Side Response Parsing

```typescript
import { RecoveryResponseSchema } from '@nuwa-ai/payment-kit/schema';

// Parse API response with automatic BigInt conversion
const response = await fetch('/recovery');
const rawData = await response.json();
const recoveryData = RecoveryResponseSchema.parse(rawData);

// recoveryData.pendingSubRav.nonce is now bigint, not string
console.log(recoveryData.pendingSubRav?.nonce); // bigint
```

### Storage/Serialization

```typescript
import { SubRAVSchema, ChannelInfoSchema } from '@nuwa-ai/payment-kit/schema';

// Validate data from storage
const validateStoredChannel = (data: unknown) => {
  return ChannelInfoSchema.parse(data);
};

// Validate SubRAV before processing
const validateSubRAV = (data: unknown) => {
  return SubRAVSchema.parse(data);
};
```

## Core Schemas Available

- **`SubRAVSchema`** - Core SubRAV structure with BigInt fields
- **`SignedSubRAVSchema`** - SubRAV with signature fields
- **`ChannelInfoSchema`** - Channel state information
- **`AssetInfoSchema`** - Asset metadata
- **`ServiceDiscoverySchema`** - Service discovery information
- **`HealthCheckSchema`** - Health check response structure
- **Administrative schemas** - Claims, cleanup, trigger operations

## Benefits

1. **DRY Principle**: Core types defined once, reused everywhere
2. **Type Safety**: Runtime validation matches compile-time types
3. **BigInt Support**: Automatic conversion from JSON strings to BigInt
4. **Maintainability**: Single source of truth for data structures
5. **API Consistency**: All endpoints use consistent field types and validation

## Migration Notes

When updating core business logic types:

1. Update the core schema in `src/schema/core/index.ts`
2. The change automatically propagates to all API endpoints
3. TypeScript will catch any incompatibilities at compile time
4. Tests will validate runtime behavior matches expectations

This architecture ensures that our BigInt-heavy payment channel data is handled consistently and safely across the entire payment kit ecosystem.
