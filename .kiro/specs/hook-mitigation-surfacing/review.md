# Review Report — hook-mitigation-surfacing (dual-phase extension, 2026-07-30)

Scope note: this records the review of the **dual-phase hint extension** landed in
`1f0a75e` (v0.4.3), which changes the behavior this spec introduced. It is not a
retroactive review of the original spec implementation.

## Change

`mitigationHint()` → `mitigationHints()`: when a mapped CWE ships a distinct
Architecture-and-Design mitigation and an Implementation-phase mitigation, both are
rendered, labeled `(design)` / `(impl)`, and both hooks append a one-line
`PHASE_FOOTER` telling the model to apply whichever phase matches its change. The
hook stays deterministic; the design-vs-implementation judgment is deferred to the
reader, which knows what kind of change it is making. Single-phase weaknesses keep
the original unlabeled one-line form; unmapped concerns still degrade to no hint.
`CONCERN_CWES` remains a plain string map — an earlier static per-concern phase
override was prototyped and discarded in favor of this design.

## Review conducted

Lighter loop than the parallel-reviewer pass used for prior specs (extension-sized
change, single module + two hook call sites):

- Plan-mode design iteration with the user (static override → Write/Edit heuristic
  → defer-to-reader; the first two were rejected for not knowing the change's intent).
- Corpus survey of all 12 mapped CWEs' mitigation phases to ground the test fixtures
  (dual-phase: CWE-916, CWE-319, CWE-521, CWE-352, CWE-79, CWE-295, CWE-327;
  single-phase: CWE-287, CWE-613, CWE-798, CWE-269, CWE-308; none: CWE-347).
- `tsc --noEmit` clean; **186/186** tests pass, including 6 tests covering the new
  behavior (dual rendering, single-phase regression guard, degradation cases).
- End-to-end hook smoke: fake Write payload with bcrypt in an auth path → both
  labeled hints + footer; session-only payload → single hint, no footer.

## Known gap (recorded)

The footer-appending wiring in `scripts/precheck-edit.ts` and
`scripts/check-compliance-citations.ts` (`suggestionLines.some(hasDualPhaseHint)`)
is verified end-to-end but not unit-tested — the scripts' message assembly has no
test harness. If it grows further, extract the message assembly into a testable
function.
