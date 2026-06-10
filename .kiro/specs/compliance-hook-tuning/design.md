# Design Document

## Overview

**Purpose**: Tune three quality gaps in the compliance hooks surfaced by the `precheck-edit-improvements` review: thin per-concern suggestion queries, the pre-commit gate's blended suggestion, and incomplete path→domain mapping.

**Users**: Agents and developers receiving control guidance from the pre-edit nudge and the pre-commit gate get more relevant, per-concern controls and finer concern identity.

**Impact**: Adds pure concern-query helpers reused by both hooks, expands `pathDomain()` coverage, and replaces both the hook's bare-label query and the gate's single blended query with context-rich per-concern queries. No change to detection scope, notify/suppress flow, or gate block/pass behavior.

### Goals
- Query suggestions per concern with detection context so single keywords return controls (1.x).
- Make the gate's guidance per-concern, matching the nudge (2.x).
- Map every security path with a recognized domain to that domain (3.x).

### Non-Goals
- Changing what counts as security-touching, the ranking algorithm, or the datasets.
- Changing the notify/suppress/expiry behavior shipped in v0.3.0.
- Changing whether the gate blocks or passes a commit.

## Boundary Commitments

### This Spec Owns
- The suggestion-query string construction in both hooks.
- The per-concern grouping of guidance in the pre-commit gate.
- The path→domain mapping (`pathDomain`) and a small set of pure concern-query helpers.

### Out of Boundary
- `detect()` firing logic and the path/keyword lists (only the *domain label* of an already-detected path changes).
- `formatSuggestedControls` / `controls_for_change` retrieval and ranking — reused as-is.
- The notify/suppress/expiry logic from the prior spec — unchanged.

### Allowed Dependencies
- `compliance-detect.ts` — `detect`, `pathDomain` (modified here), `formatSuggestedControls`, `hasCitation`, `DetectionResult`.
- `nudge-suppression.ts` — gains pure label/query helpers reused by both scripts.
- Node/Bun `fs`/`os`/`child_process` as today.

### Revalidation Triggers
- A change to `DetectionResult` shape or `formatSuggestedControls` signature.
- A change to `DEFAULT_SECURITY_PATHS` that introduces a new domain keyword (must be reflected in `pathDomain`).

## Architecture

Dependency direction (each module imports only from those to its left; the arrow points from a module to the consumers that import it):

`compliance-detect (detect, pathDomain, formatSuggestedControls, types)` → `nudge-suppression (pure concern helpers)` → `{ precheck-edit, check-compliance-citations }`

**Key decisions**:
- A new pure helper builds a **context-rich query** for a concern by combining its label with the available detection context (domain + path basename), so a bare keyword like `bcrypt` is queried with surrounding context instead of alone.
- Both hooks reuse the same concern tokenization (`concernTokens`) + query helper, so the advisory nudge and the enforcing gate produce guidance the same way.
- `pathDomain` is extended to cover every domain its sibling `DEFAULT_SECURITY_PATHS` can match; the concrete gap is `keys`/`key`. A path that fires but maps to no domain keeps a generic path-level concern (already handled by `concernTokens`' fallback).

## File Structure Plan

### Modified Files
- `src/compliance-detect.ts` — extend `pathDomain()` to map the `keys?` path pattern to a domain; no change to `pathIsSecurity`/`DEFAULT_SECURITY_PATHS`.
- `src/compliance-detect.test.ts` — add cases asserting the newly mapped domain and unchanged firing.
- `src/nudge-suppression.ts` — add pure `conciseLabel(token)` (moved out of the script) and `concernQuery(token, context)`. The existing `concernTokens` export is consumed unchanged (now also by the gate).
- `src/nudge-suppression.test.ts` — add cases for `conciseLabel` and `concernQuery`.
- `scripts/precheck-edit.ts` — build the suggestion query via `concernQuery` using the edit's detection context (R1).
- `scripts/check-compliance-citations.ts` — retain its domain per hit, derive concern tokens across hits, and render per-concern suggestions instead of one blended query (R2).

> No new files; no third-party dependencies.

## Components and Interfaces

| Component | Layer | Intent | Req Coverage | Key Dependencies | Contracts |
|-----------|-------|--------|--------------|------------------|-----------|
| pathDomain | Detection (pure) | Map an already-detected security path to a domain | 3.1, 3.2, 3.3, 3.4 | — | Service |
| concern-query helpers | Pure | Concise label + context-rich query for a concern | 1.1, 1.2, 2.1 | DetectionResult (type) | Service |
| precheck-edit | Script/IO | Query suggestions per concern with context | 1.1, 1.2, 1.3, 1.4 | nudge-suppression (P0), compliance-detect (P0) | Service |
| check-compliance-citations | Script/IO | Per-concern guidance in the gate | 2.1, 2.2, 2.3 | nudge-suppression (P0), compliance-detect (P0) | Service |

### Detection (pure)

#### pathDomain (modified)

| Field | Detail |
|-------|--------|
| Intent | Return a stable domain string for a security path, covering every domain keyword the path list can match |
| Requirements | 3.1, 3.2, 3.3, 3.4 |

**Responsibilities & Constraints**
- Add a mapping for the `keys?` path pattern (the one `DEFAULT_SECURITY_PATHS` entry with no `pathDomain` case); group it with `crypto` (key material is cryptographic).
- Return `null` only for paths that genuinely correspond to no domain; callers already fall back to a generic concern.
- Pure; no signature change (`(path: string) => string | null`).

**Implementation Notes**
- Integration: `concernTokens` consumes the domain unchanged; an existing-domain path keeps its current token (3.4).
- Validation: a `src/keys/rotate.ts` path resolves to a domain instead of null; an `auth` path still resolves to `auth`; firing is unchanged.

### Pure concern-query helpers (in nudge-suppression)

| Field | Detail |
|-------|--------|
| Intent | Provide a human label and a retrieval query for a concern token |
| Requirements | 1.1, 1.2, 2.1 |

**Contracts**: Service [x]

##### Service Interface
```typescript
/** Strip the kind prefix for display (e.g. "kw:bcrypt" → "bcrypt"). */
export function conciseLabel(token: string): string;

/**
 * Context-rich retrieval query for a concern: the concise label combined
 * with available detection context (domain and/or a path hint), so a bare
 * keyword is queried with surrounding context rather than alone. Returns a
 * trimmed, de-duplicated space-joined string.
 */
export function concernQuery(
  token: string,
  context: { domain?: string | null; pathHint?: string | null }
): string;
```
- Preconditions: `token` is a value returned by `concernTokens`.
- Postconditions: non-empty string; never includes the kind prefix.
- Invariants: pure; same inputs → same output.

**Implementation Notes**
- Integration: the pre-edit hook passes `{ domain: result.domain, pathHint: basename(filePath) }`; the gate passes the hit's domain and path.
- Validation: `concernQuery("kw:bcrypt", { domain: "auth", pathHint: "login.ts" })` yields a query containing `bcrypt auth login` (order/format per implementation), de-duplicated.

### Script / IO

#### precheck-edit (modified)
- Replace the inline `conciseLabel` and bare-label query with the shared helpers: query each surfaced concern via `concernQuery(token, { domain, pathHint })` (1.1, 1.2).
- Preserve grouping, the per-concern fallback, the cap/overflow note, suppression, and the non-blocking/fail-open guarantees (1.3, 1.4).

#### check-compliance-citations (modified)
- Store each hit's `domain` (currently discarded) alongside path/keywords.
- Derive concern tokens across all hits (dedupe), cap the count, and for each render a `concernQuery`-based suggestion line grouped per concern, replacing the single blended `formatSuggestedControls(description, …)` call (2.1).
- Keep the existing hit listing, citation logic, `--strict` exit semantics, and block/pass behavior unchanged (2.3). If analysis already grouped per concern, parity would be a no-op; it does not today, so this is a real change (2.2).

## Requirements Traceability

| Requirement | Summary | Components |
|-------------|---------|------------|
| 1.1 | Query with detection context | concern-query helpers, precheck-edit |
| 1.2 | Preserve per-concern grouping | concern-query helpers, precheck-edit |
| 1.3 | Fallback when still empty | precheck-edit |
| 1.4 | No change to surfaced concerns / suppression / non-blocking | precheck-edit |
| 2.1 | Gate represents each concern | check-compliance-citations, concern-query helpers |
| 2.2 | Record parity (real change, since gate blends today) | check-compliance-citations |
| 2.3 | Gate block/pass unchanged | check-compliance-citations |
| 3.1 | Map recognized-domain paths to their domain | pathDomain |
| 3.2 | Generic fallback for domainless security paths | pathDomain, concernTokens |
| 3.3 | No change to detection firing | pathDomain |
| 3.4 | Existing domain identities preserved | pathDomain |

## Error Handling
- All retrieval stays wrapped per concern (existing pattern); a failed query yields the `controls_for_change` fallback (1.3) without aborting siblings.
- `pathDomain` is total (returns a string or null); no new failure modes.
- The gate's existing `--strict`/exit handling and git-failure paths are untouched.

## Testing Strategy

### Unit Tests
- `pathDomain` (`compliance-detect.test.ts`): `keys` path → mapped domain; an `auth` path still `auth`; a non-security path still null; `pathIsSecurity` unchanged for the same inputs.
- `conciseLabel` / `concernQuery` (`nudge-suppression.test.ts`): prefix stripping; context-rich query composition; de-duplication; empty/absent context degrades to the label alone.

### Integration (lightweight, manual — consistent with the repo)
- Pre-edit hook: a `bcrypt`-only edit now returns non-empty controls (was the bare fallback).
- Gate: a staged multi-concern diff prints per-concern suggestion lines rather than one blended line; a single-concern diff is unchanged in spirit; block/pass and `--strict` exit codes unchanged.
