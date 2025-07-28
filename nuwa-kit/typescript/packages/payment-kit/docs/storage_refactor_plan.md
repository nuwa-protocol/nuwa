# Payment-Kit Storage Layer – Refactor Proposal

> Last updated: {{DATE}}

## Goals

1. **Single Responsibility** – Keep interfaces and implementations separate.
2. **Discoverability** – Use consistent naming & directory hierarchy that clearly communicates “Domain Object × Data Source”.
3. **Multi-Environment Support** – Provide coherent implementations for Node (SQL), Browser (IndexedDB) and Memory, with easy extensibility.

---

## Problems Found

| No | Issue | Impact |
|----|-------|--------|
| 1 | Interfaces and multiple implementations share the same files (`BaseStorage.ts`, etc.). | Hard to tree-shake & navigate. |
| 2 | Channel / RAV / PendingSubRAV storage code scattered across files with inconsistent naming (`Store`, `Storage`, `Cache`). | Cognitive overhead, duplicate patterns. |
| 3 | SQL implementation lives in `sql-storage.ts` beside browser code. | Mixed runtime concerns. |
| 4 | Node-only code (`pg`, `Buffer`) is bundled with browser libraries. | Larger browser bundles, runtime errors in non-Node env. |

---

## Target Structure

```text
src/storage/
├─ index.ts                    # Barrel exports & factory helpers
├─ types/                      # Pure TypeScript types (no runtime code)
│  └─ pagination.ts
├─ interfaces/                 # Interfaces only
│  ├─ ChannelRepository.ts     # (was ChannelStateStorage + extensions)
│  ├─ RAVRepository.ts         # (was RAVStore)
│  └─ PendingSubRAVRepository.ts
├─ memory/
│  ├─ channel.memory.ts
│  ├─ rav.memory.ts
│  └─ pendingSubRav.memory.ts
├─ indexeddb/
│  ├─ channel.indexeddb.ts
│  ├─ rav.indexeddb.ts
│  └─ pendingSubRav.indexeddb.ts
├─ sql/
│  ├─ channel.sql.ts           # placeholder
│  ├─ rav.sql.ts               # moved from sql-storage.ts
│  └─ pendingSubRav.sql.ts     # placeholder
└─ factories/
   ├─ createChannelRepo.ts
   ├─ createRAVRepo.ts
   └─ createPendingSubRAVRepo.ts
```

### Naming Conventions

* Use **`Repository`** (or `Repo`) for the main persistence abstraction.
* Implementation files follow `name.<datasource>.ts` pattern.
* New data sources (e.g. Redis) get their own sub-folder.
* `interfaces/` contain zero runtime code – fully tree-shakable.
 Protocol-level domain types (`SubRAV`, `ChannelInfo`, etc.) stay under **`src/core/types`** (already exists) because they are reused well beyond the storage layer.

---

## Interface Definitions

### ChannelRepository
```ts
getChannelMetadata();
setChannelMetadata();
getSubChannelState();
updateSubChannelState();
listChannelMetadata();
removeChannelMetadata();
listSubChannelStates();
removeSubChannelState();
getStats();
clear();
```

### RAVRepository
```ts
save();
getLatest();
list();
getUnclaimedRAVs();
markAsClaimed();
getStats?();
cleanup?();
```

### PendingSubRAVRepository
```ts
save();
find();
remove();
cleanup();
getStats();
clear();
```

Common utilities: `PaginationParams`, `PaginatedResult<T>`.

---

## Factory Helpers

```ts
export function createRAVRepo(opts?: {
  backend?: 'memory' | 'indexeddb' | 'sql';
  connectionString?: string;
  pool?: Pool;
}): RAVRepository {
  /* switch … */
}
```

Business code depends **only** on interfaces + factories, remaining agnostic of data-source specifics.

---

## Migration Plan

1. **Extract interfaces** to `src/storage/interfaces` (copy-paste, no logic changes).  Storage-specific helper types (e.g., `PaginationParams`, `PaginatedResult<T>`) live in `src/storage/types`.  Domain/protocol model types remain in `src/core/types` and are imported where needed.
2. **Move implementations** into `memory/`, `indexeddb/`, `sql/` sub-folders.
3. Implement factory functions & new `storage/index.ts` barrel.
4. Update application imports to `create*Repo` factories.
5. Remove deprecated exports.

---

## Optional Enhancements

* Shared bigint/serialization helpers (`serialization.ts`).
* Abstract base classes for common logic (size estimation, TTL).
* Jest test suites per data-source implementation.
* Documentation update: “Storage architecture” chapter with examples.

---

## Expected Benefits

* **Discoverability** – file names self-describe both *domain* & *data-source*.
* **Bundle Size** – browser builds exclude Node-only code (e.g. `pg`).
* **Maintainability** – adding a new backend touches a single directory.
* **Business Decoupling** – calling code is fully insulated from persistence details.