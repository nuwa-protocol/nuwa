---
name: did-auth-agent
description: End-to-end DIDAuth flow for remote agents on Rooch mainnet using pure Node crypto for client signing and deep-link key binding. Use when you need to add an Ed25519 auth key to a user's DID via deep link, let the user return their DID, and make authenticated HTTP calls against a did-check server.
---

# Remote DIDAuth (Rooch mainnet) Skill

Use this skill to let an agent that runs on a different device from the user obtain a DID-authenticated channel without local callbacks or request IDs. The user adds the agent’s public key to their Rooch DID; the agent verifies and then signs requests with DIDAuthV1.

## Files created
- `~/.config/nuwa-did/agent-key.pem` – Ed25519 private key (PEM)
- `~/.config/nuwa-did/agent-pub.pem` – public key (PEM)
- `~/.config/nuwa-did/didauth.js` – client header generator (pure Node, no deps)
- `~/.config/nuwa-did/make-deeplink.js` – helper to generate the user-facing deep link dynamically (pure Node + bs58)

## 0) Prereqs
- Node.js ≥ 18
- Access to Rooch testnet RPC: `https://test-seed.rooch.network`
- Repo available (for identity-kit dist): `nuwa-kit/typescript/packages/identity-kit/dist/index.cjs`

## 1) Generate keypair and helper scripts
```bash
mkdir -p ~/.config/nuwa-did
cat > ~/.config/nuwa-did/generate-keys.js <<'EOF'
const { generateKeyPairSync } = require('crypto');
const { writeFileSync } = require('fs');

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
writeFileSync('~/.config/nuwa-did/agent-key.pem'.replace('~', process.env.HOME), privateKey.export({ type: 'pkcs8', format: 'pem' }));
writeFileSync('~/.config/nuwa-did/agent-pub.pem'.replace('~', process.env.HOME), publicKey.export({ type: 'spki', format: 'pem' }));
console.log('generated agent-key.pem & agent-pub.pem under ~/.config/nuwa-did');
EOF
node ~/.config/nuwa-did/generate-keys.js
```

### didauth.js (client header generator, pure Node)
```bash
cat > ~/.config/nuwa-did/didauth.js <<'EOF'
#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');
const { parseArgs } = require('util');

function canonicalize(obj) {
  const keys = Object.keys(obj).sort();
  return JSON.stringify(obj, keys);
}

const args = parseArgs({
  options: {
    did: { type: 'string', required: true },
    key: { type: 'string', required: true }, // PEM private key
    keyId: { type: 'string', default: '' },  // optional fragment
    aud: { type: 'string', required: true }, // audience/base URL
    method: { type: 'string', required: true },
    path: { type: 'string', required: true },
    body: { type: 'string', default: '' },
  },
});

const did = args.values.did;
const keyId = args.values.keyId || `${did}#key-1`;
const bodyHash = crypto.createHash('sha256').update(args.values.body).digest('hex');

const signed_data = {
  operation: 'http_request',
  params: {
    method: args.values.method.toUpperCase(),
    path: args.values.path,
    body_hash: bodyHash,
    audience: args.values.aud,
  },
  nonce: crypto.randomUUID(),
  timestamp: Math.floor(Date.now() / 1000),
};

const dataToSign = Buffer.from('DIDAuthV1:' + canonicalize(signed_data));
const sigBytes = crypto.sign(null, dataToSign, {
  key: fs.readFileSync(args.values.key, 'utf8'),
  dsaEncoding: 'ieee-p1363',
});

const signedObj = {
  signed_data,
  signature: {
    signer_did: did,
    key_id: keyId,
    value: sigBytes.toString('base64url'),
  },
};

const header = `DIDAuthV1 u${Buffer.from(JSON.stringify(signedObj)).toString('base64url')}`;
console.log(header);
EOF
chmod +x ~/.config/nuwa-did/didauth.js
```

### make-deeplink.js (helper to build a dynamic deep link, pure Node)
Generates a payload with your public key and a fresh state/nonce, so you don’t hardcode URLs.
```bash
cat > ~/.config/nuwa-did/make-deeplink.js <<'EOF'
#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');
const bs58 = require('bs58');

const pubPem = fs.readFileSync('~/.config/nuwa-did/agent-pub.pem'.replace('~', process.env.HOME), 'utf8');
const jwk = crypto.createPublicKey(pubPem).export({ format: 'jwk' });
const raw = Buffer.from(jwk.x, 'base64url');
const publicKeyMultibase = 'z' + bs58.encode(raw); // base58btc with 'z' prefix

const idFragment = process.env.ID_FRAGMENT || 'agent-auth-1';
const redirectUri = process.env.REDIRECT_URI || 'https://id.nuwa.dev/close';
const state = crypto.randomUUID();

const payload = {
  version: 1,
  verificationMethod: {
    type: 'Ed25519VerificationKey2020',
    publicKeyMultibase,
    idFragment,
  },
  verificationRelationships: ['authentication'],
  redirectUri,
  state,
};

const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
const cadopDomain = process.env.CADOP_DOMAIN || 'https://id.nuwa.dev';
const deepLinkUrl = `${cadopDomain.replace(/\\/+$/, '')}/add-key?payload=${encodedPayload}`;

console.log('Deep link URL:');
console.log(deepLinkUrl);
console.log('\\nPayload:', JSON.stringify(payload, null, 2));
EOF
chmod +x ~/.config/nuwa-did/make-deeplink.js
```

Generate a fresh deep link each time:
```bash
~/.config/nuwa-did/make-deeplink.js
```

## 2) Share the deep link; user adds your key
- User opens the generated deep link in a browser (Rooch **mainnet**).
- They approve adding the key as `authentication` under fragment (default `#agent-auth-1`).

## 3) User returns their DID
Ask the user to paste their DID (e.g., `did:rooch:...`) back to the agent.

## 4) Agent verifies binding
From the repo root, resolve the DID on testnet and ensure `#agent-auth-1` is in both `verificationMethod` and `authentication`:
```bash
node - <<'NODE'
const { initRoochVDR, VDRRegistry } = require('./nuwa-kit/typescript/packages/identity-kit/dist/index.cjs');
const did = process.argv[1] || process.argv[process.argv.length-1]; // pass DID as arg
initRoochVDR('main','https://seed.rooch.network');
const resolver = VDRRegistry.getInstance();
(async()=>{
  const doc = await resolver.resolveDID(did, { forceRefresh: true });
  console.log('auth contains #agent-auth-1:', doc?.authentication?.some(a=>a.endsWith('#agent-auth-1')));
})();
NODE did:rooch:YOUR_DID_HERE
```

## 5) Make an authenticated call (against did-check server)
Start the did-check server (uses identity-kit middleware, testnet):
```bash
cd nuwa-kit/typescript/examples/did-check
pnpm install
pnpm dev:server   # listens on 3004
```

Call a protected endpoint from the agent:
```bash
cd ~/.config/nuwa-did
BODY='{"hello":"world"}'
AUTH=$(node didauth.js --did did:rooch:YOUR_DID_HERE --key agent-key.pem \
  --aud http://127.0.0.1:3004 --method GET --path /whoami --body "$BODY")
curl -X GET http://127.0.0.1:3004/whoami \
  -H "Authorization: $AUTH" -H "Content-Type: application/json"
```
Expected: HTTP 200 with your DID and key_id echoed.

## 6) Notes
- Storage: all client-side materials live under `~/.config/nuwa-did`.
- No request-id or local callback is needed; the DID document is the source of truth.
- If the user adds a different fragment, update `--keyId` and check for that fragment in the DID document.
