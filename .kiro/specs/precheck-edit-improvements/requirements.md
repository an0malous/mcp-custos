# Requirements Document

## Introduction

The pre-edit hook (`scripts/precheck-edit.ts`) is a non-blocking Claude Code PreToolUse hook that, on a security-touching Edit/Write, injects a short message naming the detected concern and the likely controls, then reminds the agent to add a `// Refs:` citation. Today it has three behavioral limits that reduce its usefulness on real edits:

1. Suppression is keyed only on the path-derived domain, so once a domain has been surfaced, a *different* security concern introduced by a later edit is silently swallowed for the rest of the session.
2. The suggested controls are produced from a single blended query over all detected concerns combined, so when one file touches multiple concerns the weaker concern's controls can fall off the top-N list and never be shown.
3. Suppression is permanent for the session, so a long session gets exactly one reminder per domain with no later re-prompt.

This feature improves the **notification behavior** of the pre-edit hook to address these three limits. It does not change what counts as security-touching, and it does not change the blocking pre-commit gate.

## Boundary Context

- **In scope**: The notification and suppression behavior of the pre-edit hook (`precheck-edit.ts`) — when a notification is emitted, what it contains, and when it is suppressed or re-emitted.
- **Out of scope**: The detection grammar itself (which paths/keywords count as security-touching, in `compliance-detect.ts`); the blocking pre-commit citation gate (`check-compliance-citations.ts`); the content of the control datasets.
- **Adjacent expectations**: The hook continues to consume detection results from `compliance-detect.ts` and continues to be non-blocking (always allows the edit to proceed). Any shared detection data it needs must be available from the existing detection result without changing the gate's behavior.

## Requirements

### Requirement 1: Re-notify on newly detected concerns

**Objective:** As an agent relying on the pre-edit nudge, I want to be notified again when a later edit introduces a security concern that was not part of an earlier notification, so that a new concern is not silently swallowed by a prior suppression.

#### Acceptance Criteria

1. When a security-touching edit is detected and no notification has been emitted this session for the set of concerns it raises, the hook shall emit a notification.
2. When a later security-touching edit raises a concern that was not included in any notification already emitted this session, the hook shall emit a notification for the newly raised concern.
3. When a security-touching edit raises only concerns that have already been surfaced in a notification this session, the hook shall suppress the notification.
4. While determining whether a concern is new, the hook shall treat the specific detected concerns (the matched keywords and the path-derived domain) as the basis for comparison, not the path-derived domain alone.

### Requirement 2: Attribute suggested controls to each detected concern

**Objective:** As an agent editing a file that touches more than one security concern, I want the suggested controls attributed to each concern, so that no concern's controls are dropped by a single blended ranking.

#### Acceptance Criteria

1. When an edit raises a single concern, the hook shall present suggested controls for that concern.
2. When an edit raises multiple concerns, the hook shall present suggested controls grouped by concern so that each detected concern is represented in the message.
3. If control suggestions cannot be retrieved for a concern, then the hook shall still emit the notification and indicate that full detail can be obtained by running `controls_for_change`.
4. The hook shall keep the notification concise enough to remain a glanceable nudge rather than a full control listing.

### Requirement 3: Expire suppression after a bounded window

**Objective:** As an agent in a long-running session, I want a previously surfaced concern to be eligible for re-notification after a period of time, so that I receive an occasional reminder instead of permanent silence for the rest of the session.

#### Acceptance Criteria

1. While a concern's prior notification is within the suppression window, the hook shall suppress re-notification for that concern.
2. When a security-touching edit raises a concern whose prior notification is older than the suppression window, the hook shall emit a notification for that concern again.
3. Where no suppression window is configured, the hook shall apply a sensible default window without requiring configuration.

### Requirement 4: Preserve non-blocking behavior and existing suppression intent

**Objective:** As a developer who installed the hook, I want these changes to preserve the hook's non-blocking, low-noise behavior, so that edits are never blocked and the agent is not spammed.

#### Acceptance Criteria

1. The hook shall always allow the edit to proceed regardless of detection, retrieval success, or notification outcome.
2. When an edit target is outside the security-touching set, the hook shall emit no notification.
3. When a valid `// Refs:` citation already covers the change, the hook shall emit no notification.
4. If any error occurs while determining suggestions or suppression state, then the hook shall fail open by allowing the edit and shall not raise an error to the caller.
