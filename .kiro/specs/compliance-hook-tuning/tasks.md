# Implementation Plan

- [x] 1. Foundation: detection mapping and pure concern-query helpers
- [x] 1.1 (P) Complete the path-to-domain mapping
  - Map the one security path pattern that currently resolves to no domain (key material) to a recognized domain, grouped with cryptography.
  - Leave detection firing and the security-path/keyword lists unchanged; only the domain label of an already-detected path changes.
  - Observable completion: a key-material path resolves to a domain instead of null, an existing auth path still resolves to auth, a non-security path still resolves to null, and the firing decision for all three is unchanged.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - _Boundary: pathDomain_

- [x] 1.2 (P) Add concise-label and context-rich query helpers
  - Provide a pure helper that strips the kind prefix from a concern token for display, and a pure helper that builds a retrieval query combining the concern label with available detection context (domain and a path hint), de-duplicated and degrading to the label alone when no context is present.
  - Keep both helpers pure (no filesystem, clock, or network).
  - Observable completion: unit tests show the label helper strips prefixes and the query helper composes a context-rich, de-duplicated string for a keyword with context and the bare label without context.
  - _Requirements: 1.1, 1.2, 2.1_
  - _Boundary: nudge-suppression_

- [x] 2. Core: per-concern context-rich guidance in both hooks
- [x] 2.1 (P) Query the pre-edit nudge per concern with context
  - Replace the bare-label suggestion query in the pre-edit hook with the context-rich query helper, passing each surfaced concern's domain and a path hint from the current edit.
  - Preserve the per-concern grouping, the empty-retrieval fallback, the cap and overflow note, the suppression behavior, and the non-blocking fail-open guarantee.
  - Observable completion: a single-keyword edit that previously degraded to the bare fallback now prints actual controls for that concern, with the edit still always allowed.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Depends: 1.2_
  - _Boundary: precheck-edit_

- [x] 2.2 (P) Make the pre-commit gate guidance per concern
  - Retain each flagged hit's domain (currently discarded), derive de-duplicated concern identities across the flagged changes, cap them, and render a suggestion line per concern using the context-rich query helper, replacing the single blended query.
  - Keep the existing flagged-file listing, citation detection, strict-mode exit codes, and block/pass behavior exactly as they are.
  - Observable completion: a staged multi-concern diff prints per-concern suggestion lines instead of one blended line, while commit block/pass and strict exit codes are unchanged.
  - _Requirements: 2.1, 2.2, 2.3_
  - _Depends: 1.2_
  - _Boundary: check-compliance-citations_

- [x] 3. Validation
- [x] 3.1 Verify build, types, and both hooks
  - Run the repo typecheck and full test suite; confirm new mapping and helper tests pass with no regressions.
  - Smoke-test the pre-edit hook (single-keyword concern now yields controls; key-material path yields a domain concern) and the gate (multi-concern staged diff yields per-concern guidance; block/pass and strict exits unchanged).
  - Observable completion: typecheck and tests pass and the manual checks for both hooks show the expected per-concern, context-rich output.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_
  - _Depends: 1.1, 1.2, 2.1, 2.2_
