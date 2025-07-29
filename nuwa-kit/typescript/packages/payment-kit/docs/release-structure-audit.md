# Payment Kit Release Audit 

> **Date**: 2025-07-29  
> **Scope**: `nuwa-kit/typescript/packages/payment-kit`  
> **Audience**: Payment Kit maintainers preparing the first stable release.

---

## 1  High-Level Directory Layout

```
src/
  billing/            # Cost calculation engines & rate providers
  client/             # Payer / Payee high-level SDKs
  core/               # Protocol primitives (SubRAV, utils, codec)
  middlewares/        # HTTP / Express integration helpers
  rooch/              # Rooch-chain smart-contract adapter
  storage/            # Storage backends (memory / indexeddb / sql)
  factory/            # Helper for creating contract + SDK instances
  utils/              # Generic helper functions
examples/             # Usage demos
__tests__ & test/     # Unit + E2E tests (jest)
docs/                 # Design docs & migration guides
scripts/              # Helper scripts
```

This structure cleanly separates *domain layers* (billing, storage, protocol) from *adapters* (HTTP, Rooch).  Overall, the organisation is logical and discoverable.

### Minor Observations

| Area | Observation | Recommendation |
|------|-------------|----------------|
| **Tests** | Two top-level test roots: `src/__tests__` and `test/` | Consolidate under a single `tests/` root to avoid confusion. |
| **Docs** | `docs/refactor-summary.md` and `docs/refactoring-summary.md` duplicate. Several empty placeholders (`E2E_STRUCTURE_GUIDE.md`, `E2E_TESTING.md`) | Remove duplicates, either complete or delete stubs. |
| **Examples** | Example files live in both `examples/` and `src/examples/` | Keep all end-user examples in top-level `examples/` ; move dev-only experiment code to `internal/` or delete. |
| **Scripts** | Mixed bash & node scripts scattered | Group under `scripts/` with sub-folders (`dev/`, `ci/`) and add shebang + `chmod +x`. |

---

## 2  Module & File Naming Consistency

1. **Barrel Files** – All major sub-modules expose a concise public API via `index.ts` (e.g. `billing/index.ts`). 👍  
   • Ensure the root package `src/index.ts` re-exports *only stable* symbols (avoid leaking internals).
2. **CamelCase vs kebab-case** – Source uses *PascalCase* for classes (`BillingEngine`) and *camelCase* for vars. Filenames are consistently *kebab-case* except a few (`HttpPaymentCodec.ts`). Acceptable, but consider `http-payment-codec.ts` for strict consistency.
3. **Pluralisation** – `strategies/`, `rate/` singular. OK.
4. **Config loaders** – Path `billing/config/fileLoader.ts` is fine; the default export is `FileConfigLoader`. Align filename to `file-loader.ts` or rename class to `BillingFileConfigLoader` to avoid generic collisions across package.

---

## 3  Potential Duplications

| Item | Detail | Resolution |
|------|--------|------------|
| **Documentation** | `refactor-summary.md` vs `refactoring-summary.md` (same content) | Keep one, delete/redirect the other. |
| **Rate Providers** | Only `CoingeckoRateProvider` implemented now; no duplicate logic. | N/A |
| **Storage Backends** | Memory / IndexedDB / SQL intentionally overlap. | Document that they share the `ChannelRepository` interface and are interchangeable— not duplicates. |

No critical duplicate implementations were found in source code.

---

## 4  Pre-Release Polish Checklist

1. **Public API Freeze**  
   • Add an explicit `exports` map in `package.json` to expose only:  
     `./billing`, `./client`, `./core`, `./middlewares`, `./factory`, `./utils`  
     Everything else should be imported internally through barrel files.
2. **Semantic Versioning Baseline**  
   • Start at `1.0.0` – breaking changes will then follow semver.
3. **Type Declarations**  
   • Ensure `tsc --build` emits `.d.ts`; run `api-extractor` to generate a rolled-up *public* d.ts for consumers.
4. **Tree-shaking**  
   • Mark side-effect-free files in `package.json` (`"sideEffects": false`) once verified.
5. **E2E CI Matrix**  
   • Currently PostgreSQL-dependent tests are skipped unless `PG_URL` is set. Provide a Docker service in CI to always run full test suite.
6. **Code Quality Gates**  
   • ESLint + Prettier config exists locally; add `pnpm lint` to CI and block on warnings.  
   • Consider `tsup`/`tsx` build with `--strict`.
7. **Documentation Build**  
   • Move release docs into `/docs` and generate site via `docusaurus` (optional).
8. **Placeholder Clean-up**  
   • Remove empty files (`E2E_STRUCTURE_GUIDE.md`) before publish to reduce noise.
9. **Runtime Dependencies**  
   • Verify that `package.json` lists `axios`, `pg`, etc. under correct `dependencies` vs `devDependencies` to avoid forcing heavy deps on browser builds.
10. **Browser vs Node Bundles**  
    • Mark IndexedDB backend as *browser-only* using conditional exports:  
      ```json
      {
        "imports": {
          "./storage/indexeddb/*": {
            "browser": "./dist/browser/indexeddb/*.js",
            "default": "./dist/empty.js"
          }
        }
      }
      ```
11. **Changelog Hygiene**  
    • Move `[Unreleased]` section to `## 0.2.0` or `1.0.0-beta` and keep upcoming items under a new empty `[Unreleased]`.

---

## 5  Compatibility Warnings

1. **BigInt in Browsers** – Ensure *polyfill note* for Safari < 14 or use `bigint-polyfill` fallback for strategy maths.
2. **Node Version** – Document `"engines": { "node": ">=18" }` – required for `fetch` & `globalThis.crypto`.
3. **Experimental Decorators** – Not used now; avoid adopting until TS 5.4 to keep `isolatedModules` compatibility.
4. **DID Resolver Plug-in API** – Currently returns `any`; lock interface before 1.0.
5. **SQL Migration Safety** – `allowUnsafeAutoMigrateInProd` default is **false** – highlight in README.

---

## 6  Action Items Summary

- [ ] Remove / merge duplicate docs (`refactor-*.md`, placeholders).  
- [ ] Consolidate test roots.  
- [ ] Audit `package.json` `exports`, `dependencies`.  
- [ ] Finalise public barrel exports.  
- [ ] Enable full CI (unit + e2e + lint + build).  
- [ ] Tag stable release `v1.0.0`.

---

*Prepared by AI-assisted code audit.* 