# WebAuthn Public-Key & Signature Format Cheat Sheet

> Lessons learned while debugging Passkey / WebAuthn verification in this repo.<br/>
> Focused on browser-side TypeScript / JavaScript integration with **crypto.subtle**.

> A companion file, **`webauthn_debug.html`**, lives in the same directory.  
> Open it over `https://` or `http://localhost` and you will:  
> 1. Register a new Passkey on the current origin.  
> 2. Obtain an assertion and verify it three ways on-page:  
>    • WebCrypto + **raw** signature (expected ✅)  
>    • WebCrypto + **DER** signature (may ❌)  
>    • Noble `p256.verify` (expected ✅)  
> Use this minimal repro whenever you need to demonstrate or debug browser discrepancies.

### Quick Start (local)

```bash
# From this directory
npx http-server -p 8080 | cat
# then visit http://localhost:8080/webauthn_debug.html
```

---

## 1. Public-Key Formats in the WebAuthn Pipeline

| Stage | Byte-level format | Description |
|-------|------------------|-------------|
| Registration (`navigator.credentials.create`) | **SPKI** (`SubjectPublicKeyInfo`) | Returned by `AuthenticatorAttestationResponse.getPublicKey()` |
| Original container | **COSE_Key** (CBOR Map) | If you parse `attestationObject.authData`, you get a COSE map; labels `-2/-3` hold X/Y. |
| Runtime verification | **65-byte Uncompressed** → `0x04‖X32‖Y32`<br/>or **33-byte Compressed** → `0x02/0x03‖X32` | 65-byte form is accepted by noble / OpenSSL / `crypto.subtle` (`'raw'`); noble also accepts 33-byte. |

> **Extract 65-byte key from SPKI**
>
> ```ts
> const spki = new Uint8Array(getPublicKey());
> const idx = spki.indexOf(0x04);      // first byte of uncompressed key
> const pubU = spki.slice(idx, idx + 65); // 65 bytes
> ```

---

## 2. Signature Format

Browsers return **DER-encoded ECDSA** in `AuthenticatorAssertionResponse.signature`:

```
30 len 02 lenR R 02 lenS S   // ASN.1 SEQUENCE of two INTEGERs
```

Common pitfalls:
1. If `S` is high (> n/2) or starts with a leading `0x00`, some implementations mark it "non-canonical" → `verify` returns `false`.
2. Different browsers perform slightly different DER validation, causing cross-browser discrepancies.

### 2.1 64-byte Raw Signature

Pad `r` and `s` to 32 bytes each and concatenate → **raw (= 64 B)**:

```ts
import { p256 } from '@noble/curves/p256';
const sigRaw = p256.Signature.fromDER(sigDER).toCompactRawBytes(); // Uint8Array(64)
```

---

## 3. `crypto.subtle` Requirements

### 3.1 `importKey`

| format | keyData | Notes |
|--------|---------|-------|
| `'jwk'` | { kty:'EC', crv:'P-256', x, y } | x/y are **Base64URL** (no padding) |
| `'raw'` | 65-byte uncompressed (`0x04‖X‖Y`) | Simple; no JWK conversion required |

```ts
const key = await crypto.subtle.importKey(
  'raw',                      // or 'jwk'
  pubU,                       // Uint8Array(65)
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['verify']
);
```

### 3.2 `verify`

| Signature given to `verify` | Compatibility | Recommendation |
|-----------------------------|---------------|----------------|
| DER (default) | Fragile — some signatures return `false` | ❌ Avoid |
| **raw (r32‖s32)** | Works in all major browsers | ✅ Preferred |

> **Best practice**: Always convert DER → raw before calling `verify`.
>
> ```ts
> const ok = await crypto.subtle.verify(
>   { name: 'ECDSA', hash: 'SHA-256' },
>   key,
>   sigRaw,            // 64 bytes
>   message,           // authenticatorData ‖ SHA-256(clientDataJSON)
> );
> ```

---

## 4. Low-S Normalization (optional)

RFC 6979 suggests ECDSA signatures use **low-S** (`S ≤ n/2`). If you need chain-friendly output (Move / Solidity, etc.):

```ts
import { p256 } from '@noble/curves/p256';
const lowS = p256.Signature.fromCompact(sigRaw).normalizeS().toCompactRawBytes();
```

---

## 5. End-to-End Verification Snippet

```ts
import { p256 } from '@noble/curves/p256';

// 1. Build message
const msg = new Uint8Array(authData.length + clientHash.length);
msg.set(authData);
msg.set(clientHash, authData.length);

// 2. Import public key
const key = await crypto.subtle.importKey(
  'raw',
  pubU,
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['verify']
);

// 3. Convert signature DER → raw
const sigRaw = p256.Signature.fromDER(sigDER).toCompactRawBytes();

// 4. Verify
const ok = await crypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  key,
  sigRaw,
  msg,
);
```

---

## 6. Quick Debug Checklist

1. **Use raw signatures first** — avoids DER parsing bugs.  
2. **Public-key pipeline**: `getPublicKey()` → SPKI → locate `0x04` → 65-byte uncompressed.  
3. noble is the lightest "source of truth" in browsers; if `verify` fails, cross-check with noble.  
4. If `getPublicKey()` is unsupported, fall back to parsing `attestationObject.authData` (COSE_Key).  
5. Whether you import as JWK or `'raw'`, end result is the same; `'raw'` is simpler.  

---

## 7. References

* FIDO Dev Discussion: *Webauthn verify signature using crypto.subtle*  – multiple developers confirmed the same issue <https://groups.google.com/a/fidoalliance.org/g/fido-dev/c/kkZWPBhUFKk>
* Phil Holden gist failed example  – data is correct but WebCrypto still returns false <https://gist.github.com/philholden/50120652bfe0498958fd5926694ba354>

