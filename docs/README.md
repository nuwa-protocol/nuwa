# Nuwa AI Documentation

This folder contains the source for the Nuwa AI docs site, built with Mintlify.

- Live site: https://docs.nuwa.dev
- Framework: Mintlify

Docs are written with `mdx` files. It is recommended to install an mdx plugin to your code editor for spotting syntax errors.

## Public Endpoints

These endpoints are hosted from the docs site and are useful for LLMs and tool integrations:

- MCP Server: https://docs.nuwa.dev/mcp
- LLM Text: https://docs.nuwa.dev/llms.txt
- LLM Text (full): https://docs.nuwa.dev/llms-full.txt

## Local Development

Install the Mintlify CLI to preview documentation changes locally:

```
npm i -g mint
```

From this `docs/` directory (where `docs.json` lives), start the dev server:

```
mint dev
```

Then open http://localhost:3000.

Tips:
- If the dev server fails to start, run `mint update` to upgrade the CLI.
- If you see a 404 locally, ensure you are in `docs/` and that `docs.json` is valid.

### Working with AI
use the `MINTLIFY.md` file as rules for your AI to write docs and avoid errors.

## Editing Content

- Pages are MDX files under this folder (see subfolders like `getting-started/`, `core-concepts/`, `sdk/`).
- Navigation and metadata are defined in `docs.json`.
- Static assets (e.g., `logo/`, `favicon.svg`) are served by Mintlify.

## Deployment

The site is deployed via Mintlify. The Mintlify GitHub App is connected for this repository, changes merged to the main branch are automatically published to https://docs.nuwa.dev.

## Resources

- Mintlify docs: https://mintlify.com/docs



### to do
- [ ] update the mcp-server example
    - [ ] how to obtain service key
    - [ ] how to return an UI resource
    - [ ] set pico USD
    - [ ] remove prompt and resource as they are not used by the client 
    - [ ] how to use official mcp sdk
    - [ ] default identity kit settings

-[] artifact
    - [] what is artifact
    - 