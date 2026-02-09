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
nuwa-id init --key-fragment support-agent-main
```

This creates local state under:

- `~/.config/nuwa-did/config.json`
- `~/.config/nuwa-did/keys/default.json`

Optional: create additional profiles and switch active profile:

```bash
nuwa-id profile create --name support-b --key-fragment support-agent-b
nuwa-id profile use --name support-b
nuwa-id profile list
```

If `--key-fragment` is not provided, `nuwa-id` generates a timestamp-based fragment.
Use an explicit, human-readable fragment for easier debugging and operations.

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

### 4) Persist DID into local config

Save DID into `~/.config/nuwa-did/config.json`:

```bash
nuwa-id set-did --did did:rooch:rooch1...
```

### 5) Verify key binding on DID document

```bash
nuwa-id verify
```

Only continue if verification succeeds.

### 6) Send DID-authenticated request

Option A: generate header only

```bash
nuwa-id auth-header \
  --method GET \
  --url https://did-check.nuwa.dev/whoami
```

Option B: send request directly

```bash
nuwa-id curl \
  --method GET \
  --url https://did-check.nuwa.dev/whoami
```

## Notes

- Default network is `main`.
- Default CADOP domain is `https://id.nuwa.dev`.
- Key fragment comes from active profile config after `nuwa-id init`.
- Private key never leaves `~/.config/nuwa-did/keys`.
