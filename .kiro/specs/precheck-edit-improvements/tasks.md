# Implementation Plan

- [x] 1. Foundation: pure concern/suppression logic
- [x] 1.1 Derive concern identities from a detection result
  - Turn a fired detection result into an ordered, de-duplicated list of concern identities: the path-derived domain (when present) and each matched keyword, each kept distinct by kind so a keyword and a same-named domain never collide.
  - Provide a deterministic, filesystem-safe name for the suppression marker of a given session-and-concern pair, tolerating awkward concern text without producing unsafe or colliding names.
  - Guarantee a single fallback concern is returned when a path fired with neither domain nor keywords, so the result is never empty.
  - Observable completion: given representative results (keyword-only, path+domain, path-only), the functions return the expected stable token lists and safe marker names.
  - _Requirements: 1.4_
  - _Boundary: nudge-suppression_

- [x] 1.2 Decide suppression and expiry from marker age
  - Decide, for one concern, whether it is currently suppressed given its marker timestamp, the current time, and a suppression window; a missing marker means "not suppressed."
  - Resolve the suppression window from an optional environment value, falling back to a sane built-in default on missing or invalid input.
  - Keep all logic pure: current time and marker timestamps are passed in as values, with no clock or filesystem access inside these functions.
  - Observable completion: a marker within the window resolves to suppressed, one older than the window resolves to not suppressed, and an absent value resolves to the default window.
  - _Requirements: 3.1, 3.2, 3.3_
  - _Boundary: nudge-suppression_

- [x] 1.3 Unit tests for the pure logic
  - Cover concern derivation (keyword-only, path+domain, path-only fallback, de-duplication, ordering) and marker-name safety for awkward concern text.
  - Cover the suppression decision (within window, past window, absent marker) and window resolution (valid env, invalid env, unset).
  - Observable completion: the new test file passes under the repo test runner and exercises every acceptance criterion in requirements 1.4, 3.1, 3.2, and 3.3.
  - _Requirements: 1.4, 3.1, 3.2, 3.3_
  - _Boundary: nudge-suppression_

- [x] 2. Core: per-concern notification in the pre-edit hook
- [x] 2.1 Re-key suppression per concern with time-based expiry
  - Replace the single path-domain marker with one marker per concern, reading each concern's marker age to compute the set of concerns to surface (those not currently suppressed — new or expired).
  - Emit no notification and allow the edit to proceed when every detected concern is already suppressed within the window; otherwise persist a refreshed marker for each surfaced concern after composing the message.
  - Preserve the existing early exits (non-edit tool, empty target, not security-touching, already cited) and the non-blocking exit path; treat marker read/write failures as non-suppressing and never raise to the caller.
  - Observable completion: a second edit raising a previously surfaced concern stays silent within the window, a later edit raising a new concern notifies, and an edit after the window re-notifies — with the edit always allowed.
  - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4_
  - _Depends: 1.1, 1.2_
  - _Boundary: precheck-edit_

- [x] 2.2 Group control suggestions by surfaced concern
  - Retrieve control suggestions per surfaced concern and render them grouped so each surfaced concern is individually represented in the message, with small per-concern limits.
  - Fall back to a "run controls_for_change for full detail" line for any concern whose suggestions cannot be retrieved, without aborting the rest of the notification.
  - Cap the number of concerns rendered to keep the message a glanceable nudge and note any overflow count.
  - Observable completion: an edit touching multiple concerns prints a per-concern grouped suggestion block; a retrieval failure for one concern still yields a notification with the fallback line for that concern.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - _Depends: 2.1_
  - _Boundary: precheck-edit_

- [x] 3. Validation
- [x] 3.1 Verify build, types, and hook behavior
  - Run the repo typecheck and full test suite; confirm the new pure-logic tests pass and no existing tests regress.
  - Smoke-test the hook against representative payloads: single-concern, multi-concern, repeat within window (silent), new concern after a prior nudge (notifies), and an already-cited change (silent).
  - Observable completion: typecheck and tests pass, and the manual payload checks show the expected notify/suppress outcomes with the edit always allowed.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4_
  - _Depends: 1.3, 2.1, 2.2_
