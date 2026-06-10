# Review Report — compliance-hook-tuning

Final review by two parallel read-only sub-agents (doc-reviewer on the spec vs Kiro gates; implementation-validator on code vs design), resolved by the implementer.

## Verdict

No blockers; implementation faithful to the approved design. Full 11-ID traceability confirmed (1.1–1.4, 2.1–2.3, 3.1–3.4 → design table → ≥1 task). Two Should-fixes applied, plus two suggested tests and two doc clarifications. Post-fix: `tsc --noEmit` clean, **129/129** tests, both hooks smoke-green (context-rich query returns controls for `bcrypt` in an auth path; `keys`→crypto concern; gate emits per-concern guidance with unchanged exit codes).

## Findings and resolutions

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| IV-1 | Should-fix | `concernQuery` stripped only the final extension, so `login.test.ts` → `login.test` leaked "test"; `precheck-edit` passes any basename including `*.test.ts`. | **Fixed** — strip compound extensions `(\.[A-Za-z0-9]+)+$`; added a test. |
| IV-2 | Should-fix | `pathDomain` crypto line had an asymmetric word boundary (`cipher\b` missing a leading `\b`); pre-existing from v0.3.0, on the line this spec edited. | **Fixed (safe variant)** — added cipher's leading `\b`. Did **not** apply the agent's suggested `\bcrypto\b`, which would regress `cryptography` paths (left `\bcrypto` open-ended on purpose). |
| IV-Nit | Nit | No test for a fully-empty context object `{}`. | **Fixed** — added `concernQuery("kw:oauth", {})` test. |
| DR-SF2 | Should-fix | `concernTokens` referenced in design Architecture but absent from the File Structure Plan (orphan-component gate check). | **Fixed** — noted it as a pre-existing export consumed unchanged (now also by the gate). |
| DR-N2 | Nit | "leftward imports only" caption sat above rightward arrows — ambiguous. | **Fixed** — caption now states the arrow points from a module to its importers. |

## Accepted as-is (recorded, not changed)

- **DR-SF1 (requirements wording)**: 1.1/3.1 ACs use "detection context"/"detection result", mildly implementation-flavored. Requirements are approved and implemented; rewording a closed spec is cosmetic. Noted for future revision.
- **DR-SF3 ((P) on Foundation tasks)**: 1.1/1.2 are marked parallel though Foundation tasks "rarely" are; the reviewer confirmed the claim is valid (non-overlapping files, no runtime dependency) and that no action is strictly required. Boundaries already make this checkable. Left as-is.
- **DR-N1 / DR-N3 / IV-Nit(path token)**: inconsistent EARS subject across requirement groups; validation task listing all IDs; the generic `path` fallback token producing a thin query. Cosmetic / pre-existing fallback behavior; left as-is.

## Note

The validator confirmed the v0.3.0 fail-open guarantee (top-level try/catch, exit 0) and the gate's `--strict` exit semantics are preserved unchanged by this feature.
