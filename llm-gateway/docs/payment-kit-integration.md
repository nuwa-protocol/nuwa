# Integrating **@nuwa-ai/payment-kit** into LLM Gateway  
_Revision 0.1 – 2025-07-30_

> This document describes the high-level plan, tasks, and local-dev setup required to replace the existing usage-tracking logic in **llm-gateway** with the payment-channel & billing solution provided by **@nuwa-ai/payment-kit** ("PK" below).

---

## 1. Goals

| ID | Goal | Success Metric |
|----|------|----------------|
| G1 | Per-request cost calculation & settlement via RAV | 100 % of `/chat/completions` traffic billed |
| G2 | Plug-and-play design (minimal business-code change) | Existing REST handlers untouched |
| G3 | Local debug ≤ 3 s start-up, no external blockchain needed | `npm run dev` boots with all PK mocks |
| G4 | Future optional on-chain settlement (Rooch) | Switchable by ENV var |

---

## 2. Target Architecture

```
┌────────────────────────────────────┐
│            LLM Gateway             │
│  (Express, existing codebase)      │
├───────────▲──────────┬─────────────┤
│           │ HTTP Req │             │
│           │          │             │
│   ╭───────┴──────╮   │             │
│   │ExpressPayment│   │             │
│   │     Kit      │───┼───▶ OpenRouter/LiteLLM
│   ╰───────▲──────╯   │             │
│           │          │             │
│   ╭───────┴──────╮   │             │
│   │ BillingEngine│   │             │
│   ╰───────▲──────╯   │             │
│           │          │             │
│   ╭───────┴──────╮   │             │
│   │ PayeeClient  │───┘             │
│   ╰──────────────╯                 │
└────────────────────────────────────┘
```

Key PK components used:

* `ExpressPaymentKit` – All-in-one Express integration  
* `BillingEngine` – Programmatic pricing rules  
* `PaymentChannelPayeeClient` – verifies & stores signed SubRAVs  
* (Optional) `ClaimScheduler` – background on-chain claim

---

## 3. Dependency Strategy

### 3.1 Options Considered

| Option | How | Pros | Cons |
|--------|-----|------|------|
| **O1. Local file path** | `"@nuwa-ai/payment-kit": "file:../nuwa-kit/typescript/packages/payment-kit"` | Instant edits, zero publish | Relative path juggling; CI needs `--workspaces` |
| **O2. PNPM/Yarn workspace reference** | Add both projects to same monorepo workspace | One-command bootstrap; correct TS path mapping | Requires moving `llm-gateway` into root workspace |
| **O3. Remote NPM release** | `"@nuwa-ai/payment-kit": "^0.1.0"` | Clean semver, CI-friendly | Slower debug loop; publish before every test |

### 3.2 Recommended

* **Dev**: use **O1** (local file).  
  ```jsonc
  // llm-gateway/package.json
  {
    "dependencies": {
      "@nuwa-ai/payment-kit": "file:../nuwa-kit/typescript/packages/payment-kit"
    }
  }
  ```
  Run `npm i --legacy-peer-deps` (or switch to pnpm). Local changes rebuild instantly with `ts-node-dev`.

* **CI / Production**: switch to **O3** once PK ≥ 0.2.x. Add `prepack` script in PK to generate build artefacts.

---

## 4. Implementation Steps

| Phase | Task | Owner | ETA |
|-------|------|-------|-----|
| P0 | Add local file dependency; ensure `ts-node` loads TS sources | BE | 0.5 d |
| P0 | Create programmatic billing rules (no YAML) | BE | 0.5 d |
| P1 | Replace `didAuth.ts` with `ExpressPaymentKit` (unified auth + billing) | BE | 1 d |
| P1 | Update middleware chain in `routes/llm.ts` | BE | 1 d |
| P1 | Forward OpenRouter usage data into billing context | BE | 1 d |
| P2 | Add admin endpoints `/api/v1/admin/billing` exposing PK stats | BE | 0.5 d |
| P2 | E2E test suite – handshake, pay, proposal | QA | 1 d |
| P3 | Switch `MockContract` → `RoochPaymentChannelContract` on DEVNET | BE | 1 d |
| P3 | Enable `ClaimScheduler` with cron | BE | 0.5 d |

---

## 5. Code Integration Checklist

1. **Install dep**

   ```
   npm i
   ```

2. **ExpressPaymentKit setup (replaces didAuth.ts)**

   ```ts
   import { createExpressPaymentKit } from '@nuwa-ai/payment-kit/integrations/express';
   import { MockContract } from '@nuwa-ai/payment-kit/test-helpers/mocks';

   const paymentKit = await createExpressPaymentKit({
     serviceId: 'llm-gateway',
     signer: mockSigner, // Use MockSigner for local dev
     debug: process.env.DEBUG?.includes('billing'),
     didAuth: true, // ✅ Built-in DID authentication
     // Use default asset (no custom assetId)
   });
   ```

3. **Replace existing middleware chain**

   ```ts
   // Before: separate didAuth + billing
   // router.use(didAuthMiddleware, billingMiddleware);
   
   // After: unified ExpressPaymentKit
   app.use('/api/v1', (req, res, next) => {
     if (process.env.ENABLE_PAYMENT_KIT === 'true') {
       return paymentKit.router(req, res, next);
     }
     // Fallback: only DID auth without billing
     return didAuthMiddleware(req, res, next);
   });
   ```

4. **Register routes with pricing**

   ```ts
   // LLM Gateway uses OpenRouter's pre-calculated usage data
   paymentKit.post('/chat/completions', {
     type: 'perToken',
     unitPricePicoUSD: '15e9', // 15 picoUSD per token
     usageKey: 'usage.total_tokens' // OpenRouter already provides this
   }, handler);
   
   // For non-token operations (file upload, etc.)
   paymentKit.post('/upload', {
     type: 'perRequest', 
     price: '5e11' // 500 picoUSD per request
   }, uploadHandler);
   ```

5. **Add environment variables**  
   ```
   ENABLE_PAYMENT_KIT=false  # Start with payment disabled
   LLM_GATEWAY_SERVICE_KEY=  # Service private key for signing
   DID_AUTH_ONLY=true        # Enable DID auth without billing
   ```

---

## 6. Integration with Existing Usage Tracking

### 6.1 OpenRouter Usage Data
LLM Gateway 已经通过 OpenRouter 获取了完整的 usage 数据：

```typescript
// 现有的 extractUsageInfo() 函数已经提供：
const usageData = {
  input_tokens: usage.prompt_tokens || 0,      // 输入 tokens
  output_tokens: usage.completion_tokens || 0,  // 输出 tokens  
  total_cost: usage.cost ?? undefined,         // OpenRouter 计算的美元成本
};
```

### 6.2 Payment-Kit 集成点
由于 `ExpressPaymentKit` 已经内置了 DID 认证和计费逻辑，集成变得更简单：

```typescript
// 在 routes/llm.ts 中，替换现有的中间件链
// Before:
router[method]("/*", didAuthMiddleware, async (req, res) => { ... });

// After:
router[method]("/*", async (req, res) => {
  // ExpressPaymentKit 已经处理了 DID 认证
  // req.didInfo 已经由 payment-kit 设置
  return handleLLMProxy(req, res, provider, providerName);
});

// 在 handleLLMProxy 中，OpenRouter usage 数据自动传递给 payment-kit
// 无需手动调用 processBilling，ExpressPaymentKit 自动处理
```

### 6.3 优势
- **统一认证**：ExpressPaymentKit 内置 DID 认证，替换现有的 `didAuth.ts`
- **无需重新计算**：直接使用 OpenRouter 的准确数据
- **成本透明**：OpenRouter 已经计算了实际成本
- **简化架构**：一个中间件处理认证 + 计费，减少代码复杂度

## 7. Local Debugging Tips

1. **Mock chain**

   ```ts
   import { MockContract } from '@nuwa-ai/payment-kit/test-helpers/mocks';
   const contract = new MockContract();
   ```

2. **Watch build**

   ```bash
   cd ../nuwa-kit/typescript/packages/payment-kit
   npm run build -- --watch
   ```

3. **Verbose logs**

   ```
   DEBUG=billing:*,payment:* npm run dev
   ```

---

## 8. Testing Matrix

| Layer | Scenario | Assertion |
|-------|----------|-----------|
| Unit | `BillingEngine.calcCost()` | Matches OpenRouter usage data |
| Unit | `ExpressPaymentKit` handshake | 200 + proposal header |
| Integration | Client → `/chat/completions` (stream) | OpenRouter usage → payment-kit billing |
| Integration | Admin trigger claim | RAV marked claimed |

---

## 9. DID Authentication Migration

### 9.1 Current vs New Architecture

**Current (separate middleware):**
```typescript
// routes/llm.ts
router[method]("/*", didAuthMiddleware, async (req, res) => {
  // req.didInfo set by didAuthMiddleware
  return handleLLMProxy(req, res, provider, providerName);
});
```

**New (unified ExpressPaymentKit):**
```typescript
// routes/llm.ts  
router[method]("/*", async (req, res) => {
  // req.didInfo set by ExpressPaymentKit's built-in DID auth
  return handleLLMProxy(req, res, provider, providerName);
});
```

### 9.2 Migration Steps

1. **Phase 1: Parallel Testing**
   ```typescript
   // Keep both middlewares, use feature flag
   const usePaymentKit = process.env.ENABLE_PAYMENT_KIT === 'true';
   
   if (usePaymentKit) {
     // Use ExpressPaymentKit (includes DID auth)
     return paymentKit.router(req, res, next);
   } else {
     // Use existing didAuthMiddleware
     return didAuthMiddleware(req, res, next);
   }
   ```

2. **Phase 2: Full Migration**
   - Remove `didAuthMiddleware` import
   - Remove `middleware/didAuth.ts` file
   - Update all route handlers to use `ExpressPaymentKit`

### 9.3 Benefits of Migration

- **Reduced Complexity**: One middleware instead of two
- **Better Integration**: DID auth and billing work together seamlessly
- **Consistent Error Handling**: Unified error responses
- **Future-Proof**: Built-in support for advanced payment features

## 10. Progressive Integration Strategy

### 10.1 Graceful Fallback
* Start with `ENABLE_PAYMENT_KIT=false` - payment errors don't break API
* Payment verification failures log warnings but don't return HTTP 402
* Existing usage tracking continues to work

### 10.2 Feature Flags
```bash
# Phase 1: DID auth only (no payment)
ENABLE_PAYMENT_KIT=false
DID_AUTH_ONLY=true

# Phase 2: Payment enabled, but graceful on errors  
ENABLE_PAYMENT_KIT=true
PAYMENT_STRICT_MODE=false

# Phase 3: Full payment enforcement
ENABLE_PAYMENT_KIT=true
PAYMENT_STRICT_MODE=true
```

### 10.3 Rollback Plan
* Keep old `didAuth.ts` as fallback during migration
* SubRAV verification failure ⇒ log warning + continue (not HTTP 402)
* Can instantly disable payment with `ENABLE_PAYMENT_KIT=false`
* Can instantly rollback to old DID auth with `DID_AUTH_ONLY=true`

---

## 11. Open Questions

1. **Client readiness** – when will `nuwa-client` start sending signed SubRAVs?  
2. **Pricing strategy** – programmatic rules vs database-driven pricing?  
3. **Asset migration** – when to switch from default asset to specific tokens?

---

### Appendix A – Programmatic Billing Rules

```ts
// LLM Gateway billing rules - leveraging OpenRouter's pre-calculated usage
const billingRules = [
  {
    id: 'chat-completions',
    path: '/chat/completions',
    method: 'POST',
    strategy: {
      type: 'perToken',
      unitPricePicoUSD: '15e9', // 15 picoUSD per token
      usageKey: 'usage.total_tokens' // OpenRouter provides: prompt_tokens + completion_tokens
    }
  },
  {
    id: 'file-upload', 
    path: '/upload',
    method: 'POST',
    strategy: {
      type: 'perRequest',
      price: '5e11' // 500 picoUSD per request
    }
  },
  {
    id: 'default',
    strategy: {
      type: 'perRequest',
      price: '0' // Free for unmatched routes
    }
  }
];

// Integration point: After OpenRouter response, pass usage data to payment-kit
// The existing extractUsageInfo() function already provides:
// - usageData.input_tokens (prompt_tokens)
// - usageData.output_tokens (completion_tokens) 
// - usageData.total_cost (OpenRouter's calculated cost in USD)

// Register with ExpressPaymentKit
billingRules.forEach(rule => {
  const pricing = rule.strategy.type === 'perToken' 
    ? rule.strategy 
    : rule.strategy.price;
    
  paymentKit[rule.method.toLowerCase()](rule.path, pricing, handler);
});
``` 