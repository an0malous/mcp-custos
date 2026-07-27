# Design Document — controls-ranking-tuning

## Overview

**Purpose**: Fix the three diagnosed ranking defects in `controls_for_change` (truncation bias, equal token weights, missing hash-mechanism expansion) and pin quality with a retrieval eval suite.

**Impact**: Confined to `src/tools/meta.ts` (`tokenScored`, `SYNONYMS`) and tests. Output schema unchanged; all three sources (ASVS, SSDF, NIST) benefit since they share `tokenScored`.

### Goals
- Every match participates in tallying (1.1); deterministic, catalog-order-free tie-break (1.2).
- IDF-style token weighting (2.1) with `match_score` remaining the best-first sort key (2.2).
- bcrypt/argon2/scrypt/pbkdf2 expand to password-storage vocabulary (3.1, 3.2).
- ≥5-query offline eval suite with expected top hits (4.1–4.4).

### Non-Goals
- Changing per-source substring matching, output schema, or hook rendering.
- Semantic/embedding retrieval (out of scale for a bundled-data MCP).

## Boundary Commitments

- **Owns**: `tokenScored` scoring/tie-break, `SYNONYMS` additions, eval tests.
- **Out of boundary**: `searchAsvs`/`searchSsdf`/`searchNistControls` matching logic (consumed as-is; only the per-token `limit` argument passed to them changes), `paginate`, hooks.
- **Allowed dependencies**: unchanged (meta → per-source search modules).
- **Revalidation triggers**: dataset refreshes that materially change corpus sizes (weights shift; evals guard).

## File Structure Plan

```
src/tools/meta.ts            # MODIFIED: tokenScored weighting + tie-break; SYNONYMS additions
src/tools/meta-evals.test.ts # NEW: retrieval eval suite (offline, bundled datasets)
src/tools/asvs-ssdf.test.ts  # CHECKED: existing controls_for_change tests still pass
```

## Requirements Traceability

| Requirement | Design element |
|-------------|----------------|
| 1.1 | per-token search called with `TALLY_LIMIT` (500) so tallies see all matches; display slicing stays at the end |
| 1.2 | tie-break: weighted score desc → distinct-token count desc → id asc (id only as final resort) |
| 2.1 | token weight = `1 / log2(2 + matches_for_token_in_source)`; contribution summed per entry |
| 2.2 | `match_score` becomes the weighted score (rounded to 3 decimals), still the sort key |
| 3.1 | `SYNONYMS` gains bcrypt/argon2/scrypt/pbkdf2 → "password hashing storage verifier" (existing entries untouched — 3.2) |
| 4.1–4.3 | `meta-evals.test.ts`: five queries × expected id in top N of the relevant source, run against bundled data |
| 4.4 | pre-fix failure of the password-storage eval recorded in `review.md` |

## Scoring Decision

Per source: for each token, run the search once with `TALLY_LIMIT`; `total` from the paginated result gives the token's corpus breadth. Weight `w(t) = 1 / Math.log2(2 + total_t)` — a token matching 344 entries contributes ~0.12 per hit, one matching 15 contributes ~0.24, one matching 1 contributes ~0.63. Entry score = Σ w(t) over matching tokens. This is standard IDF shape without new dependencies; the log keeps broad tokens contributing *something* (a stopword-style hard cutoff is deliberately avoided so short queries still rank).

`match_score` keeps its ordering contract (results sorted by it, descending) — consumers (hooks slice top-N, tests assert descending) are unaffected by it becoming fractional.

## Testing Strategy
- Eval suite (all offline): password storage → NIST IA-5.1 in top 5; session lifecycle → AC-12 or AC-11 in top 5; data-at-rest encryption → SC-28 in top 5; input validation → SI-10 in top 5; authorization → AC-3 or AC-6 in top 5. ASVS-side spot check: password storage → a V6.x requirement in top 5.
- Existing `asvs-ssdf.test.ts` `controls_for_change` block must pass unmodified (descending-order assertion validates the new fractional scores).
- Determinism: same query twice → identical result order.
