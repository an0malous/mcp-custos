# Implementation Plan

- [x] 1. Shared guidance formatter with mitigation hints
  - Add the curated concern→weakness association covering the default detection domains and high-confidence keywords, labeled as project curation; omit concerns with no clear weakness
  - Add mitigation selection (implementation-phase preferred, verbatim text, bounded truncation, weakness-id attribution) and the shared per-concern line formatter with fallback to today's output on missing mapping, empty mitigations, or retrieval failure
  - Observable: unit tests pass offline against the bundled corpus — coverage of all mapped concerns, phase preference, truncation bound, unmapped fallback
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 4.1, 5.1_

- [x] 2. Wire both hooks through the shared formatter
  - Replace the duplicated per-concern line construction in the pre-edit nudge and the pre-commit gate with the shared formatter, preserving each hook's caps, overflow, suppression, fail-open wrapper, and exit codes
  - Observable: piping a security-touching edit payload through the pre-edit hook prints a mitigation line with a weakness id; the gate's formatter emits the identical guidance for the same concern; blocking behavior unchanged
  - _Requirements: 3.1, 3.2, 4.2_

- [x] 3. Full-suite validation
  - Run typecheck and the complete test suite
  - Observable: typecheck and all tests pass
  - _Requirements: 5.1_
