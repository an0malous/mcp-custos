# Design Document — npm-packaging

## Overview

**Purpose**: Distribute the server, hooks, and helper scripts as the npm package `mcp-security-compliance` (Bun-required), replacing the checkout+MCP_PATH install story with command names.

**Impact**: Metadata/packaging only — `package.json`, shebangs on entry scripts, template contents, init helper's substitution logic, README. No tool/hook behavior changes.

### Goals
- `npm i -g mcp-security-compliance` → working server + 4 command-line entry points, datasets bundled (1.1, 2.1).
- Templates/init reference command names; dev-checkout flow still works (2.2, 2.3).
- Verified tarball, version 0.4.0, publish under owner's account after login (3.1–3.4).

### Non-Goals
- Node runtime support; build/bundling step (Bun executes TS directly — the published package ships TS sources); release CI.

## Boundary Commitments

- **Owns**: package.json packaging fields, bin wrappers/shebangs, `templates/*` contents, `scripts/init.ts` substitution behavior, README install sections.
- **Out of boundary**: server/tool/hook logic, datasets, spec directories (excluded from the artifact), registry credentials (owner-interactive).
- **Allowed dependencies**: existing runtime deps only (`@modelcontextprotocol/sdk`, `zod`); no new packages.
- **Revalidation triggers**: renaming any bin; moving data out of `src/data/`; a future Node-compat effort.

## Design Decisions

1. **Bins execute TS directly under Bun.** Each entry gets `#!/usr/bin/env bun` and executable mode; `bin` maps command → TS file. No dist build — Bun runs TS natively, and shipping sources keeps the package debuggable. `engines: { bun: ">=1.0" }` declares the requirement (npm warns, not blocks — acceptable per decision to require Bun).
2. **Bin names**: `mcp-security-compliance` (server, matches package), `mcp-sc-precheck-edit`, `mcp-sc-check-citations`, `mcp-sc-evidence`, `mcp-sc-init`.
3. **Templates reference bin names** (`mcp-sc-precheck-edit` instead of `bun run /MCP_PATH/scripts/precheck-edit.ts`). `init.ts` drops MCP_PATH substitution and copies verbatim; it keeps working identically from a checkout because the checkout's own `bun link`/global install provides the bins — README documents `bun link` for development (2.3).
4. **files whitelist** (3.1): `src/**` (excluding `*.test.ts` via `!` patterns), `scripts/*.ts` (excluding tests/fixtures/_cwe dev deps? — `_cwe.ts`/`_oscal.ts`/`update-sources.ts`/`verify-iso-controls.ts` are dev-only but harmless; exclude to keep artifact lean: ship only the four bin scripts + their imports), `templates/**`, `LICENSE`, `README.md`. The xlsx source spreadsheet and `.kiro/` are excluded.
   - Import audit: the four shipped scripts import only from `src/` (`compliance-detect`, `nudge-suppression`, `diff-utils`, tools) — no `_cwe`/`_oscal` imports, so excluding update-sources machinery is safe. `update-sources`/`verify-iso` remain repo-only workflows.
5. **Version 0.4.0** — matches the "v0.4.0 candidate" CWE merge label; publish is `npm publish` run only after `npm whoami` succeeds (3.3).

## File Structure Plan

```
package.json                 # MODIFIED: version, bin, files, engines, repository, keywords, license, author
src/index.ts                 # MODIFIED: add shebang (server bin)
scripts/precheck-edit.ts     # MODIFIED: shebang already present — verify + chmod
scripts/check-compliance-citations.ts  # MODIFIED: shebang/chmod
scripts/generate-evidence-index.ts     # MODIFIED: shebang/chmod
scripts/init.ts              # MODIFIED: shebang/chmod; remove MCP_PATH substitution
templates/.claude/settings.json        # MODIFIED: hook command → mcp-sc-precheck-edit
templates/.husky/pre-commit            # MODIFIED: → mcp-sc-check-citations
templates/.github/workflows/compliance-check.yml  # MODIFIED: install package + bun, run bin
README.md                    # MODIFIED: npm install as primary setup; checkout as dev path
```

## Requirements Traceability

| Requirement | Design element |
|-------------|----------------|
| 1.1 | bin map + bundled `src/data/**` in files whitelist |
| 1.2 | `engines.bun` + README requirement note |
| 1.3, 3.1 | files whitelist + `npm pack --dry-run` inspection in verification |
| 1.4 | tarball smoke test: global install to temp prefix, MCP initialize over stdio |
| 2.1 | four script bins with shebangs |
| 2.2 | templates use bin names; init copies verbatim |
| 2.3 | `bun link` dev flow documented |
| 3.2 | version 0.4.0 + metadata fields |
| 3.3 | publish gated on `npm whoami` success |
| 3.4 | README install sections |

## Testing Strategy
- `npm pack --dry-run` → assert required files present, excluded files absent.
- Install packed tarball into a scratch prefix; run `mcp-security-compliance` with an MCP `initialize` message over stdio → valid response listing server info; run `mcp-sc-precheck-edit` with the dogfood payload → nudge output; `mcp-sc-evidence --help`-style invocation on a scratch repo.
- Existing full suite unchanged (no behavior edits): typecheck + 168 tests green.
