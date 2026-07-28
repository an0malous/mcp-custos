# Implementation Plan

- [x] 1. Helpers, tokens, and rewritten init
  - Extract mode/package-manager detection and mode-config building as exported helpers; tokenize the settings and pre-commit templates; add `.mcp.json` create/merge; keep never-overwrite, --skip-hooks, and executable-bit behavior; report mode and reason
  - Observable: init against a devDependency fixture emits node_modules/.bin-guarded configs and a PM-matched .mcp.json entry; against a bare fixture emits guarded global-command configs
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

- [x] 2. Tests and docs
  - Co-located tests for detection, config contents, and temp-dir e2e in both modes; README hook-wiring section documents one-command setup for both modes
  - Observable: typecheck and full suite pass with the new tests
  - _Requirements: 4.1, 4.2_
