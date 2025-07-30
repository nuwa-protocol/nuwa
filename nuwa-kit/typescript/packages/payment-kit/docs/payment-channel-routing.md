# Unified Payment-Channel Routing Guide

> **Scope**: ExpressPaymentKit · Admin / Recovery APIs · DID-based authentication

This document describes how to **consolidate all built-in management and recovery endpoints of `ExpressPaymentKit` under a single, dedicated route prefix – `/payment-channel`**.  
The goal is to avoid clashes with business APIs and to remove ad-hoc admin code from host applications.

---

## 1  Why `/payment-channel`?

* Host applications (e.g. LLM gateways) usually expose their own REST paths such as `/api/chat` or `/v1/messages`.  
  Sharing the same prefix with billing/admin endpoints leads to naming conflicts and unclear separation of concerns.
* A well-known, reserved prefix allows reverse-proxy rules, firewall filters, or monitoring dashboards to target Payment-Kit traffic precisely.

```
┌────────────┐            ┌───────────────┐
│  Browser   │  ─────►   │  /api/*        │  (Business logic)
└────────────┘            ├───────────────┤
                          │  /payment-channel/* │  (Payment-Kit)
                          └───────────────┘
```

---

## 2  Endpoint Map

The table below shows where **legacy** routes map in the new scheme.  
All paths are relative to the `/payment-channel` base.

| Category | Old Path (v0.4) | New Path | Method | Description |
|----------|-----------------|----------|--------|-------------|
| Health   | `/health`                       | `/health`            | GET | Heart-beat incl. PaymentKit status |
| Admin    | `/admin/claims`                 | `/admin/claims`      | GET | Current claim queue and stats |
| Admin    | `/admin/claim/:channelId`       | `/admin/claim/:channelId` | POST | Manual claim trigger |
| Admin    | `/admin/subrav/:channelId/:nonce` | `/admin/subrav/:channelId/:nonce` | GET | Retrieve a pending SubRAV |
| Admin    | `/admin/cleanup` (DELETE)       | `/admin/cleanup`     | DELETE | Remove expired proposals |
| Stats    | `/admin/billing/status`         | `/admin/status`      | GET | Payee-client status insight |
| Stats    | `/admin/billing/stats`          | `/admin/stats`       | GET | Aggregate channel statistics |
| Channels | `/admin/billing/channels`       | `/admin/channels`    | GET | List all open channels |
| Config   | **host-app specific**           | *(keep in host app)* | — | Application configuration dump |
| Recovery | `/payment/pending`              | `/recovery`  | GET | Combined channel + pending SubRAV recovery |
| Recovery | (new)                          | `/commit`        | POST | Submit signed SubRAV to finalise previous RAV |
| Recovery | `/payment/price/:assetId`       | `/price` | GET | Current asset price (via ?assetId=) |

*Endpoints not provided by ExpressPaymentKit, such as application-level `/config`, remain in the host code base.*

---

## 2.1  Service Info & Recovery

When a **client connects for the first time** (or has lost local state), it needs to discover the server's DID and find the latest channel information.

### Public Endpoints (no authentication)

| Path | Method | Purpose |
|------|--------|---------|
| `/info` | GET | Return immutable metadata needed to `openChannel`. |
| `/price` | GET | Get current asset price (via `?assetId=` parameter). |

### Authenticated Endpoints (require DIDAuthV1)

| Path | Method | Purpose |
|------|--------|---------|
| `/recovery` | GET | Return channel status **and** pending SubRAV for the authenticated client. |
| `/commit` | POST | Submit signed SubRAV to finalize previous RAV. |

_All paths are relative to the `/payment-channel` base._

#### 2.1.1  `GET /payment-channel/info`

```jsonc
{
  "serviceId": "llm-gateway",
  "serviceDid": "did:rooch:0xabc…",
  "network": "dev",
  "defaultAssetId": "0x3::gas_coin::RGas",
  "defaultPricePicoUSD": "1000000000",
  "timestamp": "2024-06-19T12:34:56.789Z"
}
```

#### 2.1.2  `GET /payment-channel/recovery`

Retrieve channel state and pending SubRAV for the authenticated client.

**Authentication**: Requires `DIDAuthV1` authorization header. The client DID is automatically extracted from the authenticated DID info.

Request:
```
GET /payment-channel/recovery
Authorization: DIDAuthV1 <signed-auth-payload>
```

Possible responses:
* **200** – JSON with `channel` (state) and `pendingSubRav` (or null).
* **401** – Missing or invalid DID authentication.
* **404** – No channel yet opened.

#### 2.1.3  `POST /payment-channel/commit`

Submit the **client-signed SubRAV** so that the Payee can finalise the previous RAV cycle **without issuing a new bill**.

**Authentication**: Requires `DIDAuthV1` authorization header. The channel ID is automatically derived from the authenticated client DID.

Headers
```
Authorization: DIDAuthV1 <signature>
Content-Type: application/json
```

Body
```jsonc
{
  "subRav": "0xabc…"  // Hex or base64 - channelId no longer required
}
```

Possible responses
* **200** – `{ "success": true, "channelId": "0x123..." }` – SubRAV accepted and stored.
* **401** – Missing or invalid DID authentication.
* **409** – SubRAV already processed or nonce mismatch.
* **400** – Validation error (missing fields / bad signature).

#### 2.1.4  `GET /payment-channel/price`

Get current asset price information from the rate provider.

**Authentication**: No authentication required - this is a public endpoint.

Request:
```
GET /payment-channel/price?assetId=0x3::gas_coin::RGas
```

Response (200):
```jsonc
{
  "assetId": "0x3::gas_coin::RGas",
  "priceUSD": "0.001",
  "pricePicoUSD": "1000000000",
  "timestamp": "2024-06-19T12:34:56.789Z",
  "source": "rate_provider",
  "lastUpdated": 1703001234567
}
```

Possible responses:
* **200** – Asset price information successfully retrieved.
* **400** – Missing `assetId` query parameter.
* **500** – Rate provider error or asset not supported.

### Implementation Hints in ExpressPaymentKit

```ts
router.get('/info', (_req, res) => res.json(this.getServiceInfo()));

router.get('/recovery', async (req, res) => {
  // Get clientDid from authenticated DID info (set by performDIDAuth)
  const didInfo = (req as any).didInfo;
  if (!didInfo || !didInfo.did) {
    return res.status(401).json({ error: 'DID authentication required' });
  }
  const clientDid = didInfo.did;

  // 1) derive channelId
  const channelId = deriveChannelId(clientDid, this.serviceDid);

  // 2) query channel state (opened, latestNonce, settleBlock ...)
  const channel = await this.payeeClient.getChannelState(channelId);
  
  // 3) find the latest pending SubRAV for this channel (for recovery scenarios)
  const pending = await this.middleware.findLatestPendingProposal(channelId);

  res.json({
    channel: channel ?? null,
    pendingSubRav: pending ?? null,
    timestamp: new Date().toISOString()
  });
});

// ---- Submit signed SubRAV ----
router.post('/commit', async (req, res) => {
  // Get clientDid from authenticated DID info (set by performDIDAuth)
  const didInfo = (req as any).didInfo;
  if (!didInfo || !didInfo.did) {
    return res.status(401).json({ error: 'DID authentication required' });
  }
  const clientDid = didInfo.did;

  const { subRav } = req.body;
  if (!subRav) {
    return res.status(400).json({ error: 'subRav required' });
  }

  // Additional security: verify the SubRAV is for the authenticated client's channel
  const expectedChannelId = deriveChannelId(clientDid, this.serviceDid);
  
  try {
    await this.payeeClient.processSignedSubRAV(subRav);
    res.json({ success: true, channelId: expectedChannelId });
  } catch (e) {
    res.status(409).json({ error: (e as Error).message });
  }
});

// ---- Asset price query ----
router.get('/price', async (req, res) => {
  const assetId = req.query.assetId as string;
  if (!assetId) {
    return res.status(400).json({ error: 'Missing assetId parameter' });
  }

  try {
    const pricePicoUSD = await this.rateProvider.getPricePicoUSD(assetId);
    const priceUSD = (Number(pricePicoUSD) / 1e12).toString();
    
    res.json({ 
      assetId,
      priceUSD,
      pricePicoUSD: pricePicoUSD.toString(),
      timestamp: new Date().toISOString(),
      source: 'rate_provider',
      lastUpdated: this.rateProvider.getLastUpdated(assetId) || undefined
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get asset price',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});
```

`ExpressPaymentKitOptions` gains an **optional** field for extra public info:

```ts
publicInfoHeaders?: Record<string, string>;
```

---

## 3  DID-based Admin Authentication

> **Status**: ✅ **Implemented** - DID-based admin authentication is now available.

`ExpressPaymentKit` extends its existing **request-level DIDAuthV1 verification** to **protect every admin route automatically**.

### 3.1  Configuration

```typescript
export interface ExpressPaymentKitOptions {
  /* …existing fields… */

  /**
   * One or more DIDs that are authorised to call admin endpoints.  
   * If omitted, the service's own signer DID is used.
   */
  adminDid?: string | string[];
}
```

### 3.2  Runtime Checks

The middleware automatically:

1. Verifies the `Authorization: DIDAuthV1 <signature>` header using `DIDAuth.v1.verifyAuthHeader()`.
2. Checks that the resolved `signer_did` appears in `adminDid` (or equals the service signer DID).
3. Returns **401 Unauthorized** for missing/invalid auth or **403 Forbidden** for non-authorized DIDs.

This eliminates the need for `x-admin-key` secrets or environment variables.

---

## 4  Using the Router in an Express App

```typescript
import express from 'express';
import { createExpressPaymentKit } from '@nuwa-ai/payment-kit/express';
import { KeyManager } from '@nuwa-ai/identity-kit';

const app = express();

const paymentKit = await createExpressPaymentKit({
  serviceId: 'llm-gateway',
  signer: KeyManager.fromPrivateKey(process.env.SERVICE_PRIVATE_KEY!),
  rpcUrl: process.env.ROOCH_NODE_URL,
  network: 'dev',
  debug: process.env.NODE_ENV !== 'production',
  adminDid: undefined       // defaults to signer DID
});

// 1. Mount **only** the kit’s business-aware router where you declare priced endpoints
app.use(paymentKit.router);

// 2. Mount management & recovery endpoints under **/payment-channel**
app.use('/payment-channel', paymentKit.adminRouter());
app.use('/payment-channel', paymentKit.recoveryRouter());

app.listen(3000);
```

---

## 5  Migrating Existing Projects

1. **Delete** bespoke `admin.ts` routes that replicate Payment-Kit features.  
   Keep only endpoints that are purely application-specific (e.g. `/config`).
2. Replace any API-key checks with regular DIDAuthV1 headers when calling admin APIs:

```
GET /payment-channel/admin/claims
Authorization: DIDAuthV1 <signed-payload>
```

3. Update Nginx/Traefik or Cloud Functions to allow the new prefix.
4. Verify health by calling `GET /payment-channel/health`.

---

## 6  FAQ

### Q: Can I expose the admin router under a different prefix?
Yes.  While `/payment-channel` is the convention, you may choose any mount path:

```ts
app.use('/internal/pc', paymentKit.adminRouter());
```

### Q: How do I add **multiple** admins?
Pass an array to `adminDid`:

```ts
adminDid: [did1, did2, did3]
```

### Q: Do client-side recovery routes need authentication?
By default **no**.  They are considered public for lost-state recovery.  
If your threat model requires it, you can wrap `paymentKit.recoveryRouter()` with your own auth middleware.

---

## 7  Changelog

* **v0.6.0** – Added unified `/info` + `/recovery` flow; removed legacy `/recovery/channel` & `/recovery/pending`.
* **v0.5.0** – Introduced `/payment-channel` unified prefix & DID-based admin auth.
* **v0.4.x** – Legacy scattered admin endpoints (`/admin/*`, `/payment/*`, gateway-local routes).
