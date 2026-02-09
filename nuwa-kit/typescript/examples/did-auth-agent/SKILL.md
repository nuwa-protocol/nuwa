---
name: did-auth-agent
description: Use `nuwa-id` (from identity-kit) to run a DIDAuth flow on `id.nuwa.dev`. The agent generates a key locally, sends a deep link to the user, asks user to return DID text, verifies key binding, then sends authenticated HTTP requests.
---

# DID Auth Agent Skill (CLI-first)

This skill is for agent environments where user and agent are on different devices and callback-to-localhost is not possible.

## Prerequisites

- Node.js >= 18
- `nuwa-id` CLI available
- Rooch mainnet + CADOP main domain (`id.nuwa.dev`)

## Install `nuwa-id`

```bash
npm i -g @nuwa-ai/identity-kit
nuwa-id help
```

## Commands

### 1) Initialize local key and config

```bash
nuwa-id init
```

This creates local state under:

- `~/.config/nuwa-did/config.json`
- `~/.config/nuwa-did/agent-key.json`

### 2) Create deep link and send it to user

```bash
nuwa-id link
```

Send the printed URL to the user.  
The user opens it in browser and approves adding your key to their DID authentication set.

### 3) Ask user to return DID text

User sends DID back, for example:

```text
did:rooch:rooch1...
```

### 4) Verify key binding on DID document

```bash
nuwa-id verify --did did:rooch:rooch1...
```

Only continue if verification succeeds.

### 5) Send DID-authenticated request

Option A: generate header only

```bash
nuwa-id auth-header \
  --did did:rooch:rooch1... \
  --method GET \
  --url https://did-check.nuwa.dev/whoami
```

Option B: send request directly

```bash
nuwa-id curl \
  --did did:rooch:rooch1... \
  --method GET \
  --url https://did-check.nuwa.dev/whoami
```

## Notes

- Default network is `main`.
- Default CADOP domain is `https://id.nuwa.dev`.
- Default key fragment is `agent-auth-1`.
- Private key never leaves `~/.config/nuwa-did`.
