# CLAUDE.md — agent guide

`mcp-custos` (package name; repo: mcp-security-compliance) is an MCP server exposing secure-coding and compliance reference data (ISO 27001, NIST 800-53, OWASP ASVS, NIST SSDF, ISO 27017, NIST cloud guidance) plus the pre-edit and pre-commit hooks that make consultation land in code. See `README.md` for the product picture.

This repo uses **Kiro-style spec-driven development**. Read the steering docs as project memory before non-trivial work, and run feature work through the spec flow below.

## Project context

- **Steering** (`.kiro/steering/{product,structure,tech}.md`) — project-wide rules and context. Load as project memory.
- **Specs** (`.kiro/specs/<feature>/`) — one directory per feature: `spec.json`, `requirements.md`, `design.md`, `tasks.md`, and a `review.md` after review.
- **Rules + templates** (`.kiro/settings/`) — the spec engine. `rules/` holds the authoring/review gates; `templates/` holds the artifact skeletons.

## Spec flow (human-approved gates)

Author each artifact from its template in `.kiro/settings/templates/`, self-check it against the matching gate in `.kiro/settings/rules/`, then get user approval before moving on. There are no `/kiro-*` slash commands in this repo — the flow is driven manually.

1. **Requirements** → `templates/specs/requirements.md`, gate `rules/requirements-review-gate.md` + `rules/ears-format.md`. EARS acceptance criteria, numeric IDs only.
2. **Design** → `templates/specs/design.md`, gate `rules/design-review-gate.md` + `rules/design-principles.md`. Boundary sections + file plan + full requirements traceability (explicit IDs, no ranges).
3. **Tasks** → `templates/specs/tasks.md`, gate `rules/tasks-generation.md` + `rules/tasks-parallel-analysis.md`. Foundation → Core → Validation; `(P)` only for non-overlapping boundaries.
4. **Implementation** — code to the approved design, then a review pass (e.g. parallel doc + implementation reviewers) before landing. Record outcomes in `review.md`.

Update `spec.json` `phase`/`approvals` as each gate passes. Steering edits follow `rules/steering-principles.md` (patterns, not file trees).

## Conventions

- **English only.** All persisted artifacts (steering, specs, code comments, commit messages) are in English. `spec.json.language` is `en`.
- **Tests are co-located** `*.test.ts` next to the module. Detection/mapping changes must carry tests, since both hooks depend on them.
- **Datasets are authoritative inputs**, not editable source — refresh `src/data/` via `bun run update-sources`, never by hand.
- **Shared detection grammar**: `precheck-edit.ts` (advisory) and `check-compliance-citations.ts` (enforcing) both consume `src/compliance-detect.ts` — change detection there once, not per-hook.

## Commands

```bash
bun run dev          # run the MCP server
bun run typecheck    # tsc --noEmit
bun test             # full suite
bun run update-sources   # refresh authoritative datasets
bun run evidence         # generate COMPLIANCE.md audit index
```

Quality bar before landing: `bun run typecheck` and `bun test` pass.
