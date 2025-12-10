# LLM Gateway - DIDAuth V1 Integration Plan

> Status: Draft • 2025-06-19

This document describes how to integrate **Nuwa Identity Kit**'s `DIDAuth` (v1)
into the LLM-Gateway service. It is based on the architecture proposal inside
`nuwa-identity-kit/docs/did-auth-refactor-plan.md`.

---

## 1. Goals

1. **Standardised authentication** – replace bespoke `x-did*` headers with the
   spec-compliant `Authorization: DIDAuthV1 …` header.
2. **Server-side verification** – leverage `DIDAuth.v1.verifyAuthHeader()` to
   validate signatures, timestamps and nonces (replay protection).
3. **Pluggable DID resolution** – use `VDRRegistry` with an LRU cache by
   default; allow future Redis-backed cache.
4. **Minimal impact on business logic** – keep existing request handling /
   usage-tracking flow intact; only swap the auth layer.

---

## 2. Current State Overview

```txt
src/
 ├─ index.ts            # App bootstrap (Express)
 ├─ routes/
 │   ├─ llm.ts          # Main LLM proxy
 │   └─ usage.ts        # Usage query API
 ├─ middleware/
 │   ├─ auth.ts         # ❌ custom x-did headers (to be removed)
 │   └─ userInit.ts
 ├─ services/
 │   ├─ did.ts          # ❌ stub DID validation (to be removed)
 │   └─ openrouter.ts
 └─ types/index.ts      # DIDInfo etc.
```

The current `authMiddleware` trusts `DIDService.validateDID`, which is not
implemented.

---

## 3. Target Architecture

```txt
src/
 ├─ index.ts            # Registers default VDRs at startup
 ├─ middleware/
 │   ├─ didAuth.ts      # ✅ NEW – verifies Authorization header via DIDAuth
 │   └─ userInit.ts
 ├─ routes/
 │   ├─ llm.ts          # Replace authMiddleware -> didAuthMiddleware
 │   └─ usage.ts
 ├─ services/
 │   └─ openrouter.ts   # unchanged
 └─ types/index.ts      # DIDInfo { did: string }
```

### 3.1 Request Flow

1. **Client** attaches header produced by the Identity Kit:
   ```ts
   const sigObj = DIDAuth.v1.createSignature(payload, signer, keyId);
   const header = DIDAuth.v1.toAuthorizationHeader(sigObj);
   fetch('/api/v1/chat/completions', { headers: { Authorization: header } });
   ```
2. **didAuthMiddleware**
   1. Reads `req.headers.authorization`.
   2. Calls `DIDAuth.v1.verifyAuthHeader(header, VDRRegistry.getInstance())`.
   3. On success → sets `req.didInfo = { did: signerDid }` and `next()`.
   4. On failure → returns `401` with JSON `{ success:false, error: <reason> }`.
3. Down-stream middlewares/services use `req.didInfo.did` as before.

---

## 4. Implementation Steps

| #   | Task                            | Files                                          |
| --- | ------------------------------- | ---------------------------------------------- |
| 1   | **Init VDRs** in `src/index.ts` | add `initRoochVDR("test")`                     |
| 2   | **New Middleware** `didAuth.ts` | implements verification & error handling       |
| 3   | **Swap Middlewares**            | Update `routes/llm.ts`, `routes/usage.ts`      |
| 4   | **Type Cleanup**                | `types/index.ts` → `DIDInfo { did: string }`   |
| 5   | Remove obsolete code            | delete `middleware/auth.ts`, `services/did.ts` |
| 6   | **Tests**                       | integration test for valid / invalid headers   |
| 7   | **Docs**                        | update README with client usage snippet        |

---

## 5. VDR Initialisation Example (Rooch-only)

```ts
// src/index.ts (before app.listen)
import {
  VDRRegistry,
  initRoochVDR,
  InMemoryLRUDIDDocumentCache,
} from 'nuwa-identity-kit';

const registry = VDRRegistry.getInstance();
registry.setCache(new InMemoryLRUDIDDocumentCache(2000)); // optional tuning

// Register a default Rooch VDR (network can be 'local' | 'dev' | 'test' | 'main')
initRoochVDR('test', undefined, registry);
```

---

## 6. didAuthMiddleware Sketch

```ts
// src/middleware/didAuth.ts
import { Request, Response, NextFunction } from 'express';
import { DIDAuth, VDRRegistry } from 'nuwa-identity-kit';
import { ApiResponse } from '../types';

export async function didAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers['authorization'] as string | undefined;
    if (!authHeader) {
      return res
        .status(401)
        .json<ApiResponse>({ success: false, error: 'Missing Authorization' });
    }

    const { ok, error } = await DIDAuth.v1.verifyAuthHeader(
      authHeader,
      VDRRegistry.getInstance()
    );
    if (!ok) {
      return res.status(401).json<ApiResponse>({ success: false, error });
    }

    // signer_did is inside the signature object → DIDAuth returns it
    req.didInfo = { did: (error as any)?.signer_did ?? 'unknown' }; // adapt as needed
    next();
  } catch (e) {
    console.error('DIDAuth error', e);
    return res
      .status(500)
      .json<ApiResponse>({ success: false, error: 'Auth error' });
  }
}
```

---

## 7. Replay-Protection & Caching

- `DIDAuth` 默认携带 `InMemoryNonceStore`，足够单实例。本地开发无需额外配置。
- 若部署多 Pod，可实现 Redis 版本并通过 `verifyAuthHeader(..., { nonceStore })`
  注入。
- `VDRRegistry` 内置 LRU 缓存；可替换为共享缓存：
  ```ts
  import { RedisDIDCache } from './redisCache';
  VDRRegistry.getInstance().setCache(new RedisDIDCache());
  ```

---

## 8. Roll-out & Compatibility

- Client applications must migrate to the new `Authorization` header.
- During transition you can run both middlewares in parallel (old first, then
  new) and deprecate once clients are updated.

---

## 9. Open Questions

1. Do we need **API-Key + DID** double authentication? (current flow keeps
   Supabase key-management unchanged.)
2. Should the gateway support multiple `DIDAuth` versions concurrently?
   (`DIDAuth.v2` in future)
3. Cluster-wide **NonceStore** standardisation – which backend (Redis, DynamoDB,
   …)?

---

_Maintainer_: @nuwa-team
