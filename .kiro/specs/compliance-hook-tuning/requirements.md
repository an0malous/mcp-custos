# Requirements Document

## Introduction

The per-concern pre-edit nudge (spec `precheck-edit-improvements`, v0.3.0) improved when and how the hook notifies, but the final review surfaced three remaining quality gaps in the surrounding compliance hooks:

1. **Thin suggestion queries** — each surfaced concern now queries control suggestions with only its bare label (e.g. `bcrypt`), which often returns no match and degrades to the "run controls_for_change" fallback, losing the inline value.
2. **Unverified gate parity** — the *enforcing* pre-commit citation gate was never reviewed for the same blending/coverage weaknesses the nudge just fixed; the enforcer's guidance should be at least as accurate as the advisory nudge.
3. **Coarse domain mapping** — some paths that fire as security-touching map to no domain, so they fall back to a coarser concern identity than the detection data supports.

This feature tunes those three areas. It does not change the EARS-level notification flow already shipped, nor the set of paths/keywords that count as security-touching.

## Boundary Context

- **In scope**: the suggestion-query construction in the pre-edit hook; the control-guidance presentation in the pre-commit gate; and the path→domain mapping used to derive concern identity.
- **Out of scope**: the notify/suppress/expiry behavior shipped in `precheck-edit-improvements`; the underlying control datasets and their ranking algorithm; whether a given path/keyword counts as security-touching at all.
- **Adjacent expectations**: the path→domain mapping is shared by both hooks via the detection module, so a change there must remain backward-compatible for existing concern identities and must not alter what is detected, only how a detected path is named.

## Requirements

### Requirement 1: Context-rich per-concern suggestions

**Objective:** As an agent receiving the pre-edit nudge, I want each concern's control suggestions queried with enough context that a single keyword still returns relevant controls, so that the inline suggestion rarely degrades to a bare fallback.

#### Acceptance Criteria

1. When the hook surfaces a concern, the hook shall query control suggestions using the concern together with the available detection context for that edit.
2. When suggestions are retrieved, the hook shall present them attributed to the concern that produced them, preserving the per-concern grouping already shipped.
3. If no suggestions can be retrieved for a concern after applying context, then the hook shall present the "run controls_for_change for full detail" fallback for that concern.
4. The change shall not alter which concerns are surfaced, the suppression behavior, or the non-blocking guarantee of the hook.

### Requirement 2: Pre-commit gate guidance parity

**Objective:** As a developer whose commit is gated, I want the pre-commit citation gate's control guidance to represent each detected concern rather than a single blended result, so that the enforcer's guidance is at least as accurate as the advisory nudge.

#### Acceptance Criteria

1. When the gate reports suggested controls for a flagged change, the gate shall represent each detected concern in that change rather than a single combined query.
2. Where the gate already attributes guidance per concern, the system shall require no behavioral change and the parity shall be recorded as verified.
3. The gate shall continue to block or pass commits exactly as it does today; only the control guidance it surfaces may change.

### Requirement 3: Complete path-to-domain mapping

**Objective:** As an agent editing a security path, I want the path mapped to a concern domain whenever the detection rules recognize one, so that suppression and attribution are no coarser than the detection data allows.

#### Acceptance Criteria

1. When a file path matches a security path pattern that corresponds to a recognized domain, the system shall assign that domain to the detection result.
2. Where a security path fires but corresponds to no recognized domain, the system shall fall back to a generic path-level concern identity.
3. The mapping change shall not alter whether a path is detected as security-touching, only the domain assigned to an already-detected path.
4. While deriving concern identity, existing concern identities for already-mapped domains shall remain unchanged so that prior behavior is preserved.
