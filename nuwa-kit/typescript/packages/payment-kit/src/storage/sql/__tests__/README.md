# SQL Storage Testing Guide

This directory contains comprehensive tests for the SQL storage implementations in the Payment Kit.

## Test Types

### 1. Unit Tests (`sql-unit.test.ts`)

- **Purpose**: Test business logic and SQL query generation without real database
- **Dependencies**: None (uses mocked database connections)
- **Speed**: Fast (~500ms)
- **Coverage**: SQL repository methods, error handling, parameter validation

### 2. Integration Tests (`sql-storage.test.ts`)

- **Purpose**: Test actual database operations and data persistence
- **Dependencies**: PostgreSQL database
- **Speed**: Medium (~5-10s)
- **Coverage**: End-to-end functionality, real SQL operations, data integrity

## Running Tests

### Quick Start (Recommended)

Use the provided script to run all SQL tests with a temporary database:

```bash
# From payment-kit directory
./scripts/test-sql.sh
```

This script will:

1. Start a PostgreSQL test database using Docker
2. Run all SQL-related tests
3. Clean up the test environment

### Manual Setup

#### Prerequisites

1. **PostgreSQL Database**:

   ```bash
   # Option 1: Docker Compose (recommended)
   docker-compose -f docker-compose.test.yml up -d postgres-test

   # Option 2: Local PostgreSQL installation
   createdb nuwa_test
   ```

2. **Environment Variables**:
   ```bash
   export TEST_DB_HOST=localhost
   export TEST_DB_PORT=5433  # 5432 for local PostgreSQL
   export TEST_DB_NAME=nuwa_test
   export TEST_DB_USER=test_user  # postgres for local
   export TEST_DB_PASSWORD=test_password
   export NODE_ENV=test
   ```

#### Running Tests

```bash
# Run all tests
npm test

# Run only SQL tests
npm test -- --testPathPattern="sql.*test"

# Run with verbose output
npm test -- --testPathPattern="sql.*test" --verbose

# Run only unit tests (no database required)
npm test -- --testNamePattern="Unit Tests"

# Run only integration tests
npm test -- --testNamePattern="SQL Storage Repositories"
```

### CI/CD Integration

For continuous integration, use the provided setup:

```yaml
# GitHub Actions example
- name: Start PostgreSQL
  run: |
    docker-compose -f docker-compose.test.yml up -d postgres-test

- name: Wait for PostgreSQL
  run: |
    timeout 60 bash -c 'until docker-compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U test_user -d nuwa_test; do sleep 2; done'

- name: Run SQL tests
  run: npm test -- --testPathPattern="sql.*test"
  env:
    TEST_DB_HOST: localhost
    TEST_DB_PORT: 5433
    TEST_DB_NAME: nuwa_test
    TEST_DB_USER: test_user
    TEST_DB_PASSWORD: test_password
```

## Test Configuration

### Environment Variables

| Variable           | Default         | Description             |
| ------------------ | --------------- | ----------------------- |
| `TEST_DB_HOST`     | `localhost`     | PostgreSQL host         |
| `TEST_DB_PORT`     | `5433`          | PostgreSQL port         |
| `TEST_DB_NAME`     | `nuwa_test`     | Test database name      |
| `TEST_DB_USER`     | `test_user`     | Database user           |
| `TEST_DB_PASSWORD` | `test_password` | Database password       |
| `SKIP_SQL_TESTS`   | `false`         | Skip SQL tests entirely |

### Test Database Schema

The tests use the same schema as production but with a `test_` prefix for table names:

- `test_ravs` - Signed SubRAV storage
- `test_claims` - Claim tracking
- `test_channels` - Channel metadata
- `test_sub_channel_states` - Sub-channel states
- `test_pending_sub_ravs` - Pending proposals

## Test Scenarios

### RAV Repository Tests

- ✅ Save and retrieve signed SubRAVs with BCS serialization
- ✅ Handle multiple RAVs per channel/VM fragment
- ✅ Track claimed vs unclaimed RAVs
- ✅ Repository statistics and cleanup operations
- ✅ Concurrent access and transaction safety

### Channel Repository Tests

- ✅ Channel metadata CRUD operations
- ✅ Sub-channel state management
- ✅ Pagination and filtering
- ✅ Concurrent updates and consistency

### Pending SubRAV Repository Tests

- ✅ Temporary proposal storage
- ✅ Automatic cleanup of expired proposals
- ✅ Statistics and monitoring
- ✅ JSON serialization integrity

### Error Handling Tests

- ✅ Database connection failures
- ✅ Transaction rollbacks
- ✅ Resource cleanup (connection pooling)
- ✅ Invalid data handling

## Performance Benchmarks

The tests include performance benchmarks for:

- Bulk RAV insertion (1000+ records)
- Large-scale pagination queries
- Complex filtering operations
- Cleanup operations on large datasets

Example performance targets:

- Save 1000 RAVs: < 2 seconds
- Query with pagination: < 100ms
- Statistics calculation: < 500ms

## Debugging

### Enable SQL Query Logging

```bash
export DEBUG=nuwa:sql
npm test -- --testPathPattern="sql.*test"
```

### Test Database Inspection

```bash
# Connect to test database
docker-compose -f docker-compose.test.yml exec postgres-test psql -U test_user -d nuwa_test

# List tables
\dt test_*

# Check table contents
SELECT * FROM test_ravs LIMIT 5;
```

### Common Issues

1. **Database connection timeout**:
   - Ensure PostgreSQL is running
   - Check firewall and network settings
   - Verify connection parameters

2. **Permission errors**:
   - Ensure database user has CREATE/DROP privileges
   - Check password authentication

3. **Schema conflicts**:
   - Drop and recreate test database
   - Verify table prefix configuration

## Adding New Tests

When adding new SQL storage features:

1. **Add unit tests** to `sql-unit.test.ts` for business logic
2. **Add integration tests** to `sql-storage.test.ts` for database operations
3. **Update schema** in `schemas/001_init.sql` if needed
4. **Add performance benchmarks** for operations handling large datasets

Example test structure:

```typescript
describe('NewFeature', () => {
  it('should handle basic operations', async () => {
    // Setup test data
    // Execute operation
    // Verify results
    // Check side effects
  });

  it('should handle edge cases', async () => {
    // Test boundary conditions
    // Test error scenarios
  });

  it('should maintain data consistency', async () => {
    // Test concurrent operations
    // Verify transaction isolation
  });
});
```
