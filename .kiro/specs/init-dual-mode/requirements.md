# Requirements Document

## Introduction

`custos-init` currently emits configs that invoke bare `custos-*` command names, which only resolve when the package is installed globally. Teams installing `mcp-custos` as a project devDependency (the recommended team setup, as wired manually into kataru on 2026-07-28) get configs that silently no-op. Also, init never registers the MCP server itself — users hand-edit `.mcp.json`. This feature makes init handle both install modes end-to-end.

## Boundary Context

- **In scope**: install-mode detection, package-manager detection, mode-appropriate contents for the three copied configs, `.mcp.json` server registration, init helper tests.
- **Out of scope**: hook/server behavior; lockfile-pinned CI installs (CI template stays global-install in both modes — hermetic on runners); auto-installing the package into the target.
- **Adjacent expectations**: existing behavior preserved — never overwrite existing files, `--skip-hooks` respected, executable bit on the husky hook.

## Requirements

### Requirement 1: Install-mode detection with override

**Objective:** As a user running init, I want the emitted configs to match how the package is installed in the target project, so that hooks resolve without hand-editing.

#### Acceptance Criteria

1. When the target project declares the package as a dependency or has its executable in local binaries, init shall emit local-mode configs.
2. When no local installation is detected, init shall emit global-mode configs.
3. Where `--local` or `--global` is passed, the flag shall override detection.
4. When init completes, it shall report which mode it used and why.

### Requirement 2: Mode-correct configs

**Objective:** As a teammate on a devDependency project, I want the pre-edit hook and pre-commit gate to run from the project's own binaries, so that plain install-and-pull is sufficient.

#### Acceptance Criteria

1. Where local mode applies, the pre-edit hook and pre-commit gate shall invoke the project-local binaries and shall degrade to a skip-with-hint when the binaries are absent (dependencies not yet installed).
2. Where global mode applies, the configs shall invoke the global command names and shall degrade to a skip-with-hint when the commands are absent.
3. The pre-commit skip hint shall name the fix for the active mode (project install command vs global install command).

### Requirement 3: MCP server registration

**Objective:** As a user setting up a new project, I want init to register the MCP server too, so that setup is one command.

#### Acceptance Criteria

1. When the target has no `.mcp.json`, init shall create one with a `custos` server entry appropriate to the mode (project-local execution via the project's package manager in local mode; the global command in global mode).
2. When the target has a `.mcp.json` without a `custos` entry, init shall add the entry and preserve everything else.
3. If a `custos` entry already exists, init shall leave it untouched and say so.
4. When local mode applies, the package-manager runner in the entry shall match the target project's package manager (detected from its lockfile).

### Requirement 4: Tests

**Objective:** As the maintainer, I want the mode/PM detection and emitted contents covered by tests, so that both paths stay working.

#### Acceptance Criteria

1. While the test suite runs, detection (mode and package manager) and the mode-specific config contents shall be verified offline against temporary fixtures.
2. An end-to-end init run against a temporary project shall produce resolvable, guard-wrapped configs for each mode.
