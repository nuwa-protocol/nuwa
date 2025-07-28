# SQL Storage Implementation

This directory contains PostgreSQL/Supabase implementations of the Payment Kit storage repositories using BCS serialization for cross-platform consistency.

## Features

- **BCS Serialization**: Uses the same BCS schema as Move contracts for guaranteed consistency
- **Auto-Migration**: Optionally creates tables automatically in development
- **Production-Safe**: Controlled migration process for production environments
- **Dual Schema Management**: Both code-based auto-migration and SQL file migration support

## Quick Start

```typescript
import { Pool } from 'pg';
import { createRAVRepo, SqlRAVRepository } from '@nuwa-ai/payment-kit/storage';

// Using factory function (recommended)
const pool = new Pool({
  connectionString: 'postgresql://user:pass@localhost/db'
});

const ravRepo = createRAVRepo({
  backend: 'sql',
  pool,
  tablePrefix: 'my_app_',
  autoMigrate: true, // Only in development
});

// Or direct instantiation
const ravRepoSql = new SqlRAVRepository({
  pool,
  tablePrefix: 'nuwa_',
  autoMigrate: process.env.NODE_ENV !== 'production',
  allowUnsafeAutoMigrateInProd: false,
});
```

## Schema Management

### Development (Auto-Migration)

Tables are automatically created when `autoMigrate: true`:

```typescript
const repos = createStorageRepositories({
  backend: 'sql',
  pool,
  autoMigrate: true, // Safe in development
});
```

### Production (Manual Migration)

1. Disable auto-migration in production:
```typescript
const repos = createStorageRepositories({
  backend: 'sql', 
  pool,
  autoMigrate: false, // Disabled in production
});
```

2. Run schema files manually:
```bash
psql -d mydb -f nuwa-kit/typescript/packages/payment-kit/src/storage/sql/schemas/001_init.sql
```

## Serialization

RAVs are serialized using BCS (Binary Canonical Serialization) to ensure consistency with Move contracts:

```typescript
import { encodeSignedSubRAV, decodeSignedSubRAV, getSubRAVHex } from '@nuwa-ai/payment-kit/storage';

// Encode for storage
const buffer = encodeSignedSubRAV(signedSubRAV);

// Decode from storage  
const restored = decodeSignedSubRAV(buffer);

// Get BCS hex for contract calls
const hex = getSubRAVHex(signedSubRAV);
```

## Database Schema

### Tables

- `nuwa_ravs` - Stores signed SubRAVs with BCS serialization
- `nuwa_claims` - Tracks claimed RAVs to prevent double-spending
- `nuwa_channels` - Channel metadata and state
- `nuwa_sub_channel_states` - Sub-channel states per key
- `nuwa_pending_sub_ravs` - Temporary storage for pending SubRAVs

### Indexes

Optimized indexes are created for efficient queries:
- Channel-based lookups
- VM fragment filtering  
- Claim status checking
- Cleanup operations

## Environment Variables

```bash
# Database connection
DATABASE_URL=postgresql://user:pass@localhost:5432/nuwa_payments

# Migration control
NODE_ENV=production  # Disables auto-migration
ALLOW_UNSAFE_AUTO_MIGRATE=false  # Extra safety in production
```

## Best Practices

1. **Development**: Use `autoMigrate: true` for rapid iteration
2. **Staging**: Test with `autoMigrate: false` and manual schema files
3. **Production**: Always use manual migrations with proper review process
4. **Monitoring**: Track table sizes and query performance
5. **Backup**: Regular backups especially before schema changes 