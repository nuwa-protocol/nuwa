# did-auth-agent (CLI-first)

This example uses the `nuwa-id` CLI from `@nuwa-ai/identity-kit` to run remote DIDAuth without custom scripts.

## Goal

1. Agent generates a local key.
2. Agent sends a deep link to the user.
3. User adds that key to their DID on `id.nuwa.dev`.
4. User sends DID text back to agent.
5. Agent verifies binding and sends DIDAuth requests.

## Prerequisites

- Node.js >= 18
- CLI available:
  - package install: `npm i -g @nuwa-ai/identity-kit` (when published), or
  - run from repo build output during development

## Quick flow

```bash
# 1) Initialize local key/config under ~/.config/nuwa-did
nuwa-id init --key-fragment support-agent-main

# 2) Generate deep link and send to user
nuwa-id link
```

User opens the URL, approves adding key `#support-agent-main`, and sends DID text back, for example:

```text
did:rooch:rooch1...
```

```bash
# 3) Save DID into local config
nuwa-id set-did --did did:rooch:rooch1...

# 4) Verify DID contains your key
nuwa-id verify

# 5) Create auth header (for manual curl usage)
nuwa-id auth-header --method GET --url https://did-check.nuwa.dev/whoami

# 6) Send signed request directly
nuwa-id curl --method GET --url https://did-check.nuwa.dev/whoami
```

## Storage

All agent-side state is in `~/.config/nuwa-did`:

- `config.json`
- `keys/default.json`

Do not share any files under `keys/`.

## Optional: multi-profile

```bash
nuwa-id profile create --name support-b --key-fragment support-agent-b
nuwa-id profile list
nuwa-id profile use --name support-b
```

If you omit `--key-fragment` on `nuwa-id init`, the CLI generates a timestamp-based fragment automatically.
