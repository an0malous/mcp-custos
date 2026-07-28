# Design Document — init-dual-mode

## Overview

**Purpose**: `custos-init` detects how mcp-custos is installed in the target (project devDependency vs global), emits configs that resolve in that mode, and registers the MCP server in `.mcp.json`.

**Impact**: `scripts/init.ts` refactored into exported pure helpers + CLI main (enables co-located tests); templates gain substitution tokens; README's hook-wiring section updated. No server/hook behavior changes.

### Goals
- Auto mode detection with `--local`/`--global` override, reported in output (1.1–1.4).
- Guard-wrapped, mode-correct hook configs (2.1–2.3).
- `.mcp.json` create/merge with PM-appropriate runner (3.1–3.4).
- Pure-helper tests + temp-dir e2e for both modes (4.1–4.2).

### Non-Goals
- Lockfile-pinned CI (CI template keeps global install in both modes); auto-installing the package; supporting non-Claude hook formats.

## Boundary Commitments

- **Owns**: `scripts/init.ts` (helpers + CLI), the three templates' token contract, init tests.
- **Out of boundary**: hook scripts, server, datasets, `update-sources`.
- **Allowed dependencies**: node builtins + Bun only (no new packages).
- **Revalidation triggers**: renaming bins; template file additions.

## Design Decisions

1. **Detection** — `detectMode(target)`: local if `node_modules/.bin/custos-precheck-edit` exists OR root `package.json` lists `mcp-custos` in any dependency block; else global. `detectPm(target)`: `pnpm-lock.yaml`→pnpm, `bun.lock`/`bun.lockb`→bun, `yarn.lock`→yarn, else npm.
2. **Templates carry tokens**, init substitutes per mode — single source of truth, manual-wiring users still read templates as documentation of the global form (tokens documented in a template comment):
   - settings.json: `{{PRECHECK_CMD}}` → local: `[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/custos-precheck-edit" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/custos-precheck-edit" || true`; global: `command -v custos-precheck-edit >/dev/null 2>&1 && custos-precheck-edit || true` (guard added to global too — resilience parity).
   - pre-commit: `{{CHECK_GUARD}}` / `{{CHECK_RUN}}` / `{{CHECK_HINT}}` → local: `[ -x node_modules/.bin/custos-check-citations ]` / `node_modules/.bin/custos-check-citations` / "run <pm> install"; global: `command -v … ` / bare bin / "npm i -g mcp-custos".
   - CI workflow: no tokens (global install on the runner in both modes).
3. **`.mcp.json` merge** — parse-if-exists, add `custos` key only when absent: local → PM runner (`pnpm exec mcp-custos`, `npx mcp-custos`, `yarn exec mcp-custos`, `bunx mcp-custos`); global → `{ "command": "mcp-custos" }`. Existing entry → untouched + notice.
4. **Testability** — export `detectMode`, `detectPm`, `buildModeConfig(mode, pm)` (returns the substitution map + mcp entry); CLI main guarded by `import.meta.main` so importing in tests doesn't execute argv logic.

## File Structure Plan

```
scripts/init.ts                  # REWRITTEN: exported helpers + import.meta.main CLI
scripts/init.test.ts             # NEW: detection + config-content tests, temp-dir e2e both modes
templates/.claude/settings.json  # MODIFIED: {{PRECHECK_CMD}} token
templates/.husky/pre-commit      # MODIFIED: {{CHECK_GUARD}}/{{CHECK_RUN}}/{{CHECK_HINT}} tokens
README.md                        # MODIFIED: hook-wiring section documents both modes + .mcp.json registration
```

## Requirements Traceability

| Requirement | Design element |
|---|---|
| 1.1–1.2 | `detectMode` | 
| 1.3 | `--local`/`--global` flags |
| 1.4 | mode+reason line in CLI output |
| 2.1–2.3 | token substitution via `buildModeConfig` |
| 3.1–3.3 | `.mcp.json` create/merge/skip logic |
| 3.4 | `detectPm` → runner map |
| 4.1 | pure-helper tests on fixtures |
| 4.2 | temp-dir e2e per mode |

## Testing Strategy
- `detectPm`: one fixture dir per lockfile + default.
- `detectMode`: package.json-dep fixture, .bin fixture, neither.
- `buildModeConfig`: local/pnpm and global maps contain expected guard/run/hint strings and mcp entries.
- e2e: run init (spawn) against temp projects in each mode; assert copied files contain the right commands, `.mcp.json` created/merged, existing files never overwritten.
