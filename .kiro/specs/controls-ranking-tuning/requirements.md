# Requirements Document

## Introduction

`controls_for_change` is the retrieval primitive every guidance surface funnels through (tool calls, both hooks via `formatSuggestedControls`). Dogfooding (2026-07-27) showed it ranking session-logout controls above password-storage guidance for a password-hashing change. Diagnosis found three defects in the token-scored ranking: per-token result truncation discards matches before tallying (biasing toward catalog order), all tokens carry equal weight regardless of how discriminating they are, and password-hashing algorithm names expand to nothing. This feature fixes the ranking and establishes a regression eval suite of realistic change descriptions.

## Boundary Context

- **In scope**: the ranking/tallying logic behind `controls_for_change`, the security-vocabulary expansion table, and a retrieval eval suite.
- **Out of scope**: the underlying per-source search implementations' matching semantics (substring match stays); output schema of `controls_for_change`; hook rendering; datasets.
- **Adjacent expectations**: hooks and tests consume `results` ranked best-first with a `match_score` field; that contract is preserved.

## Requirements

### Requirement 1: Complete tallying

**Objective:** As a user of `controls_for_change`, I want every source match to participate in ranking, so that results are not biased toward entries that happen to sort early in a source catalog.

#### Acceptance Criteria

1. When a query token matches more source entries than a display page holds, the ranking shall still credit every matching entry, not only a truncated page.
2. When two candidates have equal scores, the tie-break shall be deterministic and shall not reduce to source-catalog order alone.

### Requirement 2: Token selectivity weighting

**Objective:** As a user describing a change, I want discriminating terms to outweigh near-ubiquitous ones, so that a specific term like "password" beats a broad term like "auth" in deciding relevance.

#### Acceptance Criteria

1. When tokens differ widely in how many entries they match, the ranking shall weight each token's contribution inversely to its match breadth.
2. The ranking shall continue to expose a per-result score by which results are ordered best-first.

### Requirement 3: Security-vocabulary expansion

**Objective:** As a user naming concrete mechanisms (bcrypt, argon2, scrypt, pbkdf2), I want those to resolve to the guidance vocabulary the frameworks use, so that the most specific token in a query contributes signal instead of zero matches.

#### Acceptance Criteria

1. When a query names a password-hashing mechanism, the expansion shall include the password-storage vocabulary used by the frameworks.
2. Existing expansions shall continue to apply unchanged.

### Requirement 4: Retrieval eval suite

**Objective:** As the maintainer, I want a regression suite of realistic change descriptions with expected top hits, so that ranking quality is measured, not vibes, and future tuning cannot silently regress it.

#### Acceptance Criteria

1. The suite shall cover at least five realistic change descriptions spanning distinct security domains (password storage, session lifecycle, data-at-rest encryption, input validation, authorization).
2. For each description, the suite shall assert the expected control appears within the top results for its source.
3. While the test suite runs, the evals shall execute offline against the bundled datasets.
4. When run against the pre-fix ranking, at least the password-storage eval shall fail (demonstrating the fix is real, recorded in the spec's review notes).
