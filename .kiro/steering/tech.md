# Technology Stack

## Architecture

A single MCP (Model Context Protocol) server process exposes compliance reference data and guardrail tooling over stdio. Tools are pure functions over static authoritative datasets — no database, no network at request time. The same internal modules are reused by standalone CLI scripts and by two optional git/agent hooks (pre-edit, pre-commit), keeping interactive and enforcement paths on identical logic.

## Core Technologies

- **Language**: TypeScript (strict, ESM — `"type": "module"`)
- **Runtime**: Bun
- **Protocol/SDK**: `@modelcontextprotocol/sdk` (^1.12.x)

## Key Libraries

- `@modelcontextprotocol/sdk` — MCP server + tool registration. The only runtime dependency; everything else is the standard library and static data.

## Development Standards

### Type Safety
TypeScript strict mode; `tsc --noEmit` for typecheck. Avoid `any`; model control/catalog shapes in `src/types.ts`.

### Code Quality
Keep tool modules single-responsibility and side-effect-free at import time. Shared logic (detection, mapping) lives in one module rather than being duplicated across hook scripts.

### Testing
`bun test`, with co-located `*.test.ts` files next to the modules they cover (e.g. `compliance-detect.test.ts`, `tools/*.test.ts`). Detection and mapping changes must carry tests, since both hooks depend on them.

## Development Environment

### Required Tools
- Bun (runtime, test runner, bundler)
- TypeScript 5.7+

### Common Commands
```bash
# Dev (run server):   bun run dev          # bun run src/index.ts
# Build:              bun run build        # bundle to dist/, target bun
# Test:               bun test
# Typecheck:          bun run typecheck    # tsc --noEmit
# Refresh datasets:   bun run update-sources
# Audit evidence:     bun run evidence     # generate COMPLIANCE.md
# Verify ISO mappings: bun run verify-iso
```

## Key Technical Decisions

- **Static data over live APIs** — catalogs and cross-framework mappings ship as vetted JSON from official sources (NIST OLIR, NIST OSCAL, OWASP); never AI-generated, never fetched at request time. Refresh is an explicit `update-sources` step.
- **NIST 800-53 as the mapping hub** — ISO 27001, ASVS, and SSDF all resolve through it; ISO is the audit-side index, resolved at the audit boundary.
- **Shared detection grammar** — `precheck-edit.ts` (non-blocking agent hook) and `check-compliance-citations.ts` (blocking pre-commit gate) consume the same `compliance-detect.ts`, so a detection change applies to both consultation and enforcement.
- **Consumer-side wiring** — downstream repos point at this package via an env var (e.g. `MCP_SECURITY_COMPLIANCE_PATH`) and invoke the hook scripts; the server itself stays repo-agnostic.

---
_Document standards and patterns, not every dependency_
