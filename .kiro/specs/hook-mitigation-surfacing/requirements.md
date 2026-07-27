# Requirements Document

## Introduction

The pre-edit nudge and pre-commit gate currently surface control *identifiers* (`NIST AC-12(1); ASVS V6.4.3`) but no guidance text. Dogfooding (2026-07-27) showed a security-touching edit containing an obvious SQL injection received a nudge listing auth-related control IDs with nothing actionable — the agent learns "add a citation," not "parameterize the query."

The full MITRE CWE corpus (spec `cwe-full-corpus`) now carries official phase-tagged mitigations for 944 weaknesses. This feature wires that guidance into both hooks: each surfaced concern gains a one-line official mitigation hint drawn from the weakness most associated with it, so the nudge changes code, not just citations.

## Boundary Context

- **In scope**: the guidance content of the pre-edit nudge and the pre-commit gate's suggestion output; a curated concern→weakness association used to select which mitigation to show.
- **Out of scope**: which paths/keywords count as security-touching; the notify/suppress/expiry behavior; the control-suggestion ranking algorithm (`controls_for_change`); blocking behavior of either hook; the CWE dataset itself.
- **Adjacent expectations**: both hooks share detection and formatting via the detection module; the CWE tools provide mitigations from the bundled corpus. The nudge's non-blocking, fail-open guarantee (shipped in `precheck-edit-improvements`) must be preserved exactly.

## Requirements

### Requirement 1: Mitigation guidance per surfaced concern

**Objective:** As an agent receiving the pre-edit nudge, I want each surfaced concern to carry a short official mitigation, so that the nudge tells me what to do in code rather than only which IDs to cite.

#### Acceptance Criteria

1. When the nudge surfaces a concern that has an associated weakness, the nudge shall include a one-line mitigation drawn verbatim (truncation allowed) from that weakness's official mitigations, attributed with the weakness identifier.
2. When a weakness has multiple mitigations, the nudge shall prefer one tagged to an implementation-time lifecycle phase over other phases.
3. If a concern has no associated weakness, or its weakness has no mitigations, then the nudge shall render that concern exactly as it does today.
4. If mitigation retrieval fails for any reason, the nudge shall degrade to today's output and still never block the edit.

### Requirement 2: Concern-to-weakness association

**Objective:** As the project maintainer, I want the mapping from detection concerns to weaknesses to be explicit and curated, so that the selected mitigation is relevant and the mapping is reviewable.

#### Acceptance Criteria

1. The association shall cover every default detection domain and every default high-confidence keyword that has a clearly corresponding weakness.
2. Where a concern has no clearly corresponding weakness, the association shall omit it rather than guess.
3. The association shall be labeled as project curation, consistent with the existing curated-mapping caveats.

### Requirement 3: Pre-commit gate parity

**Objective:** As a developer whose commit is gated, I want the gate's suggestions to carry the same mitigation guidance as the advisory nudge, so that the enforcing layer is at least as helpful as the advisory one.

#### Acceptance Criteria

1. When the gate reports suggested controls for a flagged change, each represented concern shall carry the same mitigation hint the nudge would show for it.
2. The gate shall continue to block or pass commits exactly as it does today; only its guidance text may change.

### Requirement 4: Output discipline

**Objective:** As an agent with a bounded context window, I want the nudge to stay a glanceable message, so that added guidance does not turn the hook into a wall of text.

#### Acceptance Criteria

1. The nudge shall render at most one mitigation line per surfaced concern, truncated to a bounded length.
2. While the existing per-concern cap and overflow behavior apply, mitigation lines shall count within the existing rendered-concern cap, not extend it.

### Requirement 5: Offline verification

**Objective:** As the project maintainer, I want the new behavior covered by tests that run without network access, so that the suite stays hermetic.

#### Acceptance Criteria

1. While the test suite runs, association coverage, mitigation selection, phase preference, truncation, and fallback behavior shall be verified against the bundled dataset without network access.
