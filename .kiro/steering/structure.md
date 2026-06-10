# Project Structure

## Organization Philosophy

Layered by concern: an MCP entrypoint wires a set of single-responsibility **tool modules**, which read from **static authoritative datasets**. Standalone **scripts** reuse the same internal modules to provide CLI/hook entrypoints (pre-edit, pre-commit, evidence generation). Detection logic shared between a Claude Code hook and a git hook lives in one module so the two stay in lockstep.

## Directory Patterns

### MCP entrypoint
**Location**: `src/index.ts`
**Purpose**: Registers all tools with the MCP SDK and starts the server.
**Example**: Imports each `src/tools/*.ts` module and binds its exported tool definitions.

### Tool modules
**Location**: `src/tools/`
**Purpose**: One module per framework or capability — `asvs.ts`, `nist.ts`, `cwe.ts`, `ssdf.ts`, `cloud.ts`, `nist-cloud.ts`, `inventory.ts`, `pr-summary.ts`, `controls.ts`, `meta.ts`. Shared helpers in `_shared.ts`.
**Example**: `controls.ts` implements `controls_for_change`; `meta.ts` exposes `controlsForChange()` for reuse by scripts.

### Authoritative data
**Location**: `src/data/`
**Purpose**: Static JSON catalogs and official mapping sources (OLIR xlsx, OSCAL-derived). Never hand-edited for content; refreshed via `scripts/update-sources.ts`.
**Example**: `nist-800-53.json`, `owasp-asvs.json`, `iso-27001-controls.json`.

### Scripts (CLI / hooks)
**Location**: `scripts/`
**Purpose**: Standalone entrypoints that reuse `src/` modules — `precheck-edit.ts` (Claude Code PreToolUse hook), `check-compliance-citations.ts` (pre-commit), `generate-evidence-index.ts`, `update-sources.ts`, `verify-iso-controls.ts`, `init.ts`.
**Example**: `precheck-edit.ts` and `check-compliance-citations.ts` both import `src/compliance-detect.ts` so hook and gate share one detection grammar.

### Shared detection
**Location**: `src/compliance-detect.ts` (+ `compliance-detect.test.ts`)
**Purpose**: Path/keyword detection, citation extraction, and project-config resolution used by both hook scripts.

## Naming Conventions

- **Files**: kebab-case (`compliance-detect.ts`, `nist-cloud.ts`); private/shared helpers prefixed with `_` (`_shared.ts`, `_oscal.ts`).
- **Tests**: co-located `*.test.ts` next to the module under test.
- **Functions**: camelCase; exported tool implementations named for their MCP tool (`controlsForChange`).
- **Data files**: `<framework>-<version>-<kind>.json`.

## Import Organization

```typescript
import { existsSync } from "node:fs";              // Node/Bun builtins, node: prefix
import { controlsForChange } from "./tools/meta.js"; // intra-package, .js extension (ESM)
```

**Path conventions**:
- ESM with explicit `.js` extensions on relative imports (`"type": "module"`).
- Scripts import compiled-style paths from `src/` via relative `../src/...`.

## Code Organization Principles

- One tool module per framework/capability; cross-framework logic routes through NIST 800-53 as the hub.
- Hook scripts must not duplicate detection logic — extend `compliance-detect.ts` and let both hooks consume it.
- Datasets are authoritative inputs, not editable source; content changes go through `update-sources.ts`, not manual edits.

---
_Document patterns, not file trees. New files following patterns shouldn't require updates_
