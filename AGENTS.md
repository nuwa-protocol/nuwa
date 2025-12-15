# Repository Guidelines

## Project Structure & Module Organization

This repo is a pnpm monorepo for the Nuwa Protocol ecosystem.

- `nuwa-kit/typescript/packages/*`: TypeScript SDKs and shared libraries.
- `nuwa-kit/typescript/examples/*`: runnable examples (clients, demos).
- `nuwa-services/*`: backend services (e.g. `llm-gateway`, `mcp-server-proxy`, `cadop-service`).
- `contracts/move/rooch/*`: Rooch Move smart contracts (e.g. `acp-registry/`).
- `nips/`: protocol proposals/spec discussions.
- `website/` and `docs/`: documentation and site content.
- `deps/`: vendored dependencies / submodules (see `.gitmodules`).

Each major directory has its own `README.md` with component-specific setup.

## Build, Test, and Development Commands

From the repo root (requires Node.js `>=18` and pnpm `>=8`; some services require Node `>=20`):

- `pnpm install`: install all workspace dependencies.
- `pnpm build`: build TypeScript packages in `nuwa-kit/typescript/packages/*`.
- `pnpm build:services`: build service packages (gateway/proxy/indexer/cadop).
- `pnpm dev`: run package dev watchers in parallel where supported.
- `pnpm test`: run tests across all workspace packages (`pnpm -r run test`).
- `pnpm lint`: run package linters.
- `pnpm format`: format the repo with Prettier.

Target a single package when iterating:

- `pnpm --filter @nuwa-ai/mcp-server-proxy dev`
- `pnpm --filter @nuwa-ai/llm-gateway test`

Move contracts (example):

- `cd contracts/move/rooch && rooch move test -p acp-registry`

## Coding Style & Naming Conventions

- Formatting: Prettier (`.prettierrc`) with 2-space indentation, single quotes, semicolons, `printWidth: 100`.
- Linting: ESLint for TypeScript (`.eslintrc.js`); unused args should be prefixed with `_` and avoid `console.log` (prefer `console.warn/error`).
- Keep build artifacts out of PRs (`dist/`, `build/`, `coverage/`).

## Testing Guidelines

Testing is per-package:

- Jest is used in some services (e.g. `nuwa-services/llm-gateway`).
- Vitest is used in others (e.g. `nuwa-services/mcp-server-proxy`).

Prefer colocated tests under `test/` using `*.test.ts` (or the package’s existing convention), and include coverage-focused tests for bug fixes.

## Commit & Pull Request Guidelines

- Commit messages should follow Conventional Commits where practical (e.g. `fix(mcp-server-proxy): handle empty config`).
- PRs should: describe the change and motivation, link related issues, include tests for behavior changes, and ensure `pnpm lint` + `pnpm test` pass for affected packages.
- If a service’s config/env changes, document required variables and defaults in the service README.

## Security & Configuration Tips

- Services commonly load environment variables via `.env`, `.env.local`, and `.env.test`; do not commit secrets.
- When adding new configuration, prefer explicit validation (e.g. Zod) and safe defaults.

