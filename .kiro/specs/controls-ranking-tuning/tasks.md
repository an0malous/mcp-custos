# Implementation Plan

- [x] 1. Baseline eval suite (red first)
  - Write the retrieval eval suite with five realistic change descriptions and expected top hits; run it against the current ranking and record which evals fail pre-fix
  - Observable: suite exists, runs offline, and the password-storage eval fails against the unmodified ranking
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 2. Ranking fix
  - Tally against complete per-token match sets; weight token contributions inversely to match breadth; make tie-breaks deterministic without reducing to catalog order; keep results ordered best-first by the exposed score; add password-hashing mechanism expansions without altering existing ones
  - Observable: all evals pass; existing controls_for_change tests pass unmodified; same query twice returns identical order
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2_

- [x] 3. Validation and review notes
  - Run typecheck and full suite; record pre-fix eval failures and post-fix results in review.md
  - Observable: typecheck and all tests pass; review.md records the red→green evidence
  - _Requirements: 4.4_
