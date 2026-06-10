# Review Report — precheck-edit-improvements

Final review of the spec, steering, and implementation, conducted by two parallel read-only sub-agents using Kiro's review-gate rules as the rubric, then resolved by the implementer.

- **doc-reviewer** — steering + spec trio vs requirements/design/tasks gates + steering-principles + EARS.
- **implementation-validator** — code vs approved design; re-ran `typecheck` + `bun test`; probed fail-open edge cases.

## Verdict

Implementation is faithful to the approved design. One genuine correctness gap (R4.4 fail-open) was found and fixed; the rest were documentation/clarity nits, the warranted ones applied. Post-fix: `tsc --noEmit` clean, **116/116** tests pass, hook smoke green across all scenarios.

Full requirements traceability confirmed by the doc-reviewer: all 15 IDs (1.1–1.4, 2.1–2.4, 3.1–3.3, 4.1–4.4) flow requirements → design table → ≥1 task.

## Findings and resolutions

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| IV-1 | Blocker→fixed | **R4.4 fail-open incomplete**: `resolveConfig`/`loadProjectConfig`/`detect` ran outside any try/catch; a regex or fs throw would exit non-zero and read as a hook error, violating R4.1/R4.4 and the design's own Error Handling section. | **Fixed** — wrapped all post-parse logic in `scripts/precheck-edit.ts` in a top-level try/catch that logs to stderr and exits 0. Verified with a no-cwd payload (exit 0). |
| DR-B1 | Should-fix | **Boundary ambiguity**: design listed `formatSuggestedControls` as an allowed dependency without making clear it comes from `compliance-detect.ts`, and the Mermaid `Controls` node read like a separate file. | **Fixed** — design Allowed Dependencies now states both imports come from `compliance-detect.ts` and the `Controls` node is a logical alias. |
| DR-S2 | Should-fix | **Range notation** (`1.x`, `2.x`, `1.1–1.4`) in the design Components table defeats the gate's mechanical per-ID scan. | **Fixed** — expanded to explicit comma-separated IDs. |
| DR-S3 | Should-fix | **Steering enumeration**: `structure.md` listed all 10 tool modules and all 6 scripts by name, against steering-principles "avoid complete file listings." | **Fixed** — replaced with naming-pattern description; kept only the two architecture-significant hook scripts named. |
| IV-Nit | Nit | `concernTokens` accepts `reason` in its `Pick` but never uses it. | **Kept, documented** — `reason` mirrors the DetectionResult fields a concern derives from and is named in the design interface; removing it would churn the design + 5 test literals for no behavioral gain. Added a clarifying comment. |
| DR-N4 | Nit | `tech.md` wrote `^1.12.x` (invalid semver hybrid). | **Fixed** — now `^1.12.1` matching package.json. |

## Accepted as-is (recorded, not changed)

- **DR-S1 / DR-N1 (Req 2.4 / 3.3 wording)**: 2.4 ("glanceable nudge") and 3.3 ("Where … configured") are slightly soft/awkward as EARS. Requirements are approved and implemented with a concrete cap (`MAX_RENDERED = 5`) and an env-with-default; rewording would be cosmetic-only on a closed spec. Noted for any future revision.
- **DR-S4 / DR-N3**: minor `_Depends: 1.1_` annotation on task 1.2 and a one-word gloss on `controls_for_change` in product.md — cosmetic; left as-is.

## Observation (out of scope)

**Per-concern query width** (both agents): each surfaced concern now queries `formatSuggestedControls` with just its concise label (e.g. `bcrypt`) rather than the old blended path+keyword string. For single bare keywords this can return no match (→ the `controls_for_change` fallback line), as seen for `bcrypt`. This matches the approved design and is not a regression (the old single-keyword query behaved the same), but a future enhancement could pass a richer context string per concern. Deferred — outside this spec's scope.
