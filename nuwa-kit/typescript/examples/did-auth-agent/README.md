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
nuwa-id link --key-fragment support-agent-main
```

User opens the URL, approves adding key `#support-agent-main`, and sends DID text back, for example:

```text
did:rooch:rooch1...
```

```bash
# 3) Verify DID contains your key
nuwa-id verify --did did:rooch:rooch1... --key-fragment support-agent-main

# 4) Create auth header (for manual curl usage)
nuwa-id auth-header --did did:rooch:rooch1... --key-fragment support-agent-main --method GET --url https://did-check.nuwa.dev/whoami

# 5) Send signed request directly
nuwa-id curl --did did:rooch:rooch1... --key-fragment support-agent-main --method GET --url https://did-check.nuwa.dev/whoami
```

## Storage

All agent-side state is in `~/.config/nuwa-did`:

- `config.json`
- `agent-key.json`

Do not share `agent-key.json`.

If you omit `--key-fragment` on `nuwa-id init`, the CLI generates a timestamp-based fragment automatically.
