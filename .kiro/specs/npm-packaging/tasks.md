# Implementation Plan

- [x] 1. Package metadata and entry points
  - Bump to 0.4.0; add bin map, files whitelist, engines, repository/keywords/license/author metadata; add shebangs and executable modes to the server and the four scripts
  - Observable: `npm pack --dry-run` lists server, tools, datasets, four scripts, templates, LICENSE, README — and no specs/tests/fixtures/xlsx
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 3.1, 3.2_

- [x] 2. Templates and init by command name
  - Rewrite the three templates to invoke installed bin names; drop path substitution from the init helper; document the `bun link` development flow
  - Observable: init into a scratch project produces configs referencing bin names with no MCP_PATH placeholders
  - _Requirements: 2.2, 2.3_

- [x] 3. Tarball verification and docs
  - Install the packed tarball into a clean prefix; smoke-test the MCP initialize handshake, the pre-edit hook payload, and the evidence generator; rewrite README setup with npm as the primary path
  - Observable: handshake returns server info from the installed copy; hook prints a nudge; README documents both install paths
  - _Requirements: 1.4, 3.4_

- [ ] 4. Publish (owner-gated)
  - Verify npm auth; publish only when `npm whoami` succeeds, otherwise stop and request login
  - Observable: package visible on the registry at 0.4.0, or an explicit login request to the owner
  - _Requirements: 3.3_
