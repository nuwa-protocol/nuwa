# Payment-Channel Discovery & Routing (v0.5)

> Status: **Draft – will ship with the first public release of `@nuwa-ai/payment-kit`**
>
> This document supersedes the fixed `/payment-channel/*` routing described in
> `payment-channel-routing.md`.  Because the package has **not been released yet**,
> we introduce a breaking-but-final design that supports configurable path prefixes
> _and_ fully automatic client discovery.

---

## 1  Why a discovery endpoint?

* Host applications may need to expose the payment APIs behind a gateway such as
  `/api/pay/*`, `/billing/*`, or any other prefix dictated by deployment rules.
* Hard-coding `/payment-channel` in every place makes such re-routing impossible
  without reverse-proxy hacks.
* By exposing a single **well-known** discovery document we can:
  1. Tell the client which prefix (`basePath`) to use for all payment-related
     calls.
  2. Return other immutable metadata (service DID, default asset, network…)
     in one round-trip.
  3. Stay compatible with existing Web-standards that already rely on
     `/.well-known/…` resources (OpenID Connect, WebFinger, security.txt, ACME…).

---

## 2  Well-Known URI

| Path | Method | Auth | Body | Description |
|------|--------|------|------|-------------|
| `/.well-known/nuwa-payment/info` | `GET` | ❌ | — | Public JSON describing the Payment Kit configuration.

### 2.1  Response schema (v1)

```jsonc
{
  "version": 1,
  "serviceId": "echo-service",
  "serviceDid": "did:rooch:0x9ab…",
  "network": "test",                  // local, dev, test, main
  "defaultAssetId": "0x3::gas_coin::RGas",
  "defaultPricePicoUSD": "500000000",  // optional
  "basePath": "/payment-channel"       // prefix for **all** other routes
}
```

* **version**   Allows future extensibility (clients MUST ignore unknown fields).
* **basePath**  Leading slash required, trailing slash **not** included.

Cache headers should be set to `Cache-Control: max-age=3600, public` so that
clients can safely cache the response for one hour (or any period you prefer).

---

## 3  Server-Side Integration

### 3.1  `ExpressPaymentKitOptions`

```ts
export interface ExpressPaymentKitOptions {
  …
  /**
   * Prefix under which all payment-channel routes are mounted.
   * Defaults to "/payment-channel".
   * Example: "/billing" or "/api/pay"
   */
  basePath?: string;
}
```

### 3.2  Mounting

```ts
const paymentKit = await createExpressPaymentKitFromEnv(env, {
  serviceId: "echo-service",
  basePath: "/billing",          // optional – default is "/payment-channel"
  …
});

// ONE call – mounts both discovery & all functional routes
app.use(paymentKit.router);
```

* The kit automatically registers:
  * `/.well-known/nuwa-payment/info` (public, no auth, no billing)
  * `<basePath>/info`, `<basePath>/price`, `<basePath>/recovery`, `<basePath>/commit`
  * `<basePath>/admin/*` (protected)
  * All billable business routes declared via `paymentKit.get/post/…`
* The host application therefore **never** has to know the internal structure
  or worry about mount order.

---

## 4  Client-Side Flow (`PaymentChannelHttpClient`)

```
+----------------------+        1 GET /.well-known/nuwa-payment/info
|  Payer Application   |  ────────────────────────────────────────────▶
+----------------------+        2 JSON (basePath = "/billing", …)
                │
                │ 3 Subsequent calls use discovered prefix
                ▼
      <basePath>/info | /price | /recovery | /admin/…
```

### 4.1  Algorithm

1. Attempt to fetch `/.well-known/nuwa-payment/info`.
2. If the request succeeds and the body contains a string `basePath`, store it
   internally (persisted with the rest of the client state).
3. All further endpoint URLs are built via:
   ```ts
   const url = new URL(`${basePath}/info`, baseUrl);
   ```
4. If step 1 returns **404** or network error, fall back to the default
   `"/payment-channel"` so the client still works with pre-0.5 server builds
   when running integration tests.

### 4.2  Configuration

```ts
new PaymentChannelHttpClient({
  baseUrl: "https://example.org",   // required
  …
});
```


---

## 5  Endpoint Summary (after discovery)

Assuming the server replies `{ "basePath": "/billing" }`.

| Category | Path | Notes |
|----------|------|-------|
| Public Info | `/.well-known/nuwa-payment/info` | discovery, cacheable |
| — | `/billing/info` | duplicate under prefix for convenience |
| Price | `/billing/price?assetId=` |
| Recovery | `/billing/recovery` | DIDAuth required |
| Commit | `/billing/commit` | DIDAuth required |
| Admin | `/billing/admin/…` | DIDAuth + admin check |
| Billable APIs | `/billing/<business-route>` | defined via `BillableRouter` |

---

## 6  Route Registration Options

`ExpressPaymentKit` 将 **认证** 与 **计费** 拆分为显式参数，避免通过挂载顺序或路径来隐式决定行为。

### 6.1  `RouteOptions` 接口

```ts
interface RouteOptions {
  /**
   * 计费策略。\n   * 0 / '0' 表示免费（跳过计费逻辑）
   */
  pricing: bigint | string | StrategyConfig;

  /**
   * 是否需要 DIDAuthV1 认证。\n   * 默认规则：\n   *   pricing == 0  → false\n   *   pricing  > 0  → true\n   * 开发者若显式写成 false 且 pricing>0，框架将在启动时抛错。
   */
  authRequired?: boolean;
}
```

### 6.2  使用示例

```ts
// ① 免费公开接口（不鉴权）
billing.get('/public/ping', { pricing: 0 }, pingHandler);

// ② 免费但需要鉴权
billing.get('/v1/profile', { pricing: 0, authRequired: true }, profileHandler);

// ③ 计费 + 必须鉴权（authRequired 默认 true）
billing.post('/v1/echo', { pricing: '1000000000' }, echoHandler);
```

### 6.3  框架行为

1. **注册时校验**  
   * `pricing !== 0` 且 `authRequired === false` → 抛错，阻止“匿名付费接口”。
2. **处理中间件顺序**

```ts
if (route.authRequired) await performDIDAuth(req, res);
if (route.pricing !== 0) await billingMiddleware(req, res, next);
```

这样保证：
* 任何收费接口都强制认证。
* 免费接口默认允许匿名访问，也可通过 `authRequired: true` 保护。

---

## 7  Open Questions & Next Steps

* **IANA registration** – if we decide to standardise, we SHALL file `nuwa-payment` token at IANA Well-Known URI Registry.
* **Version negotiation** – currently a simple integer.  We may adopt semver or content-type versioning once feedback arrives.

---

## 8  Changelog

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 0.5-draft | 2025-08-04 | core team | Initial proposal replacing fixed prefix design |
