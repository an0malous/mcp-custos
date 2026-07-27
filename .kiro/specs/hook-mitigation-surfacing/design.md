# Design Document — hook-mitigation-surfacing

## Overview

**Purpose**: Each concern surfaced by the pre-edit nudge and pre-commit gate gains a one-line official MITRE mitigation, selected via a curated concern→CWE association, so hook output changes code rather than only requesting citations.

**Users**: Agents editing security-touching files (nudge); developers committing flagged changes (gate).

**Impact**: Extends `src/compliance-detect.ts` (shared by both hooks) with a concern→CWE map and a shared per-concern line formatter; both hook scripts switch to the shared formatter. No detection, suppression, blocking, or dataset changes.

### Goals
- One truncated, verbatim MITRE mitigation per surfaced concern, implementation-phase preferred (1.1, 1.2, 4.1).
- Graceful degradation to today's output on missing mapping/mitigations/failures (1.3, 1.4).
- Curated, reviewable concern→CWE map covering default domains and keywords (2.1–2.3).
- Gate/nudge parity by construction — one shared formatter (3.1, 3.2).
- Hermetic tests against the bundled corpus (5.1).

### Non-Goals
- Improving `controls_for_change` ranking quality (separate concern, previously deprioritized).
- Cheat-sheet content; changing what fires detection; changing suppression TTL logic.

## Boundary Commitments

### This Spec Owns
- The concern→CWE association (curated constant) and mitigation-selection/truncation logic in `src/compliance-detect.ts`.
- The shared per-concern guidance formatter and both hooks' use of it.

### Out of Boundary
- `src/tools/cwe.ts` output shapes (consumed as-is via `lookupCwe(id, true)`).
- Detection grammar, concern tokens, suppression (`src/nudge-suppression.ts` consumed as-is).
- Hook exit codes and blocking semantics.

### Allowed Dependencies
- `compliance-detect.ts` → `tools/cwe.js` (new import; same direction as its existing `tools/meta.js` import).
- Hooks → `compliance-detect.js` (existing direction). No new packages.

### Revalidation Triggers
- CWE dataset schema changes (mitigation field shape).
- New default detection domains/keywords (map coverage must be revisited — enforced by a coverage test).

## File Structure Plan

```
src/compliance-detect.ts        # MODIFIED: CONCERN_CWES map, mitigationHint(), formatConcernLine()
src/compliance-detect.test.ts   # EXTENDED: map coverage, selection, truncation, fallback tests
scripts/precheck-edit.ts        # MODIFIED: per-concern lines via formatConcernLine()
scripts/check-compliance-citations.ts  # MODIFIED: same
```

## Requirements Traceability

| Requirement | Summary | Design element |
|-------------|---------|----------------|
| 1.1 | Verbatim attributed mitigation line | `mitigationHint()` using `lookupCwe(id, true)` |
| 1.2 | Implementation-phase preference | phase ranking in `mitigationHint()` |
| 1.3 | Unmapped/empty → today's output | `formatConcernLine()` renders base line when hint is "" |
| 1.4 | Failure → degrade, never block | try/catch inside `mitigationHint()`; hooks' existing fail-open wrapper |
| 2.1 | Cover default domains + keywords | `CONCERN_CWES` entries for the 7 domains + high-confidence keywords |
| 2.2 | Omit rather than guess | absent key = no hint |
| 2.3 | Labeled as curation | comment + note string on the map |
| 3.1 | Gate parity | both hooks call shared `formatConcernLine()` |
| 3.2 | Blocking unchanged | hooks' control flow untouched beyond line construction |
| 4.1 | One bounded mitigation line | single hint, truncated to `MITIGATION_HINT_MAX` (≈200 chars, sentence-aware) |
| 4.2 | Within existing caps | hint attaches to a rendered concern; `MAX_RENDERED`/overflow logic untouched |
| 5.1 | Hermetic tests | tests read the bundled `cwe.json` via the tool layer; no network |

## Components and Interfaces

### compliance-detect additions (single component; shared by both hooks)

```typescript
/** Project-curated concern→weakness association (not an official crosswalk). */
const CONCERN_CWES: Record<string, string>; // e.g. { auth: "CWE-287", bcrypt: "CWE-916", jwt: "CWE-347", ... }

/** "CWE-916: <first implementation-phase mitigation, truncated>" or "" */
export async function mitigationHint(concernToken: string): Promise<string>;

/** Full per-concern guidance line(s): "<label> → <controls>" plus optional
 *  indented mitigation line. Replaces the duplicated logic in both hooks. */
export async function formatConcernLine(
  token: string,
  ctx: { domain: string | null; pathHint: string }
): Promise<string>;
```

- Preconditions: token is a concern from `concernTokens()`; keyword tokens carry the existing `kw:`-style shape used by `conciseLabel` (exact shape confirmed at implementation from `nudge-suppression.ts`).
- Postconditions: never throws; returns base line on any retrieval failure; mitigation text is verbatim-truncated MITRE content with the CWE id prefix.
- Phase preference: first mitigation whose phase includes "Implementation", else "Architecture and Design", else the first with a description.

Rendered shape (nudge and gate identical, indentation preserved per hook):

```
  - bcrypt → NIST IA-5(1); ASVS V6.2.5
      ↳ CWE-916: Use an adaptive hash function that can be configured to change the amount of computational effort…
```

## Error Handling
- `mitigationHint` wraps lookup in try/catch → `""`; `formatConcernLine` falls back to the existing `(run controls_for_change for full detail)` path. Hooks keep their outer fail-open wrappers; exit codes untouched.

## Testing Strategy
- Unit (`compliance-detect.test.ts`): every default domain token yields a hint from the bundled corpus; a mapped keyword (e.g. bcrypt) yields its expected CWE prefix; unmapped token → ""; phase preference picks an implementation-phase mitigation for a weakness that has several; truncation bound respected; formatConcernLine falls back when the map has no entry.
- Integration: pipe the dogfood payload through `precheck-edit.ts` and assert the output contains a `CWE-` line; run the gate's formatter path in a unit test for parity (same string for same token).
