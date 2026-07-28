# Requirements Document

## Introduction

The server currently installs by cloning the repo and pointing `claude mcp add` at `src/index.ts`; hooks wire up by substituting an absolute checkout path (`MCP_PATH`) into templates. Before real-world dogfooding, Daniel wants the whole thing distributed as an npm package (`mcp-security-compliance` — name verified free on the registry, 2026-07-28) so installation is `npm install -g` and the hooks/tools resolve by command name instead of checkout path. Decisions made: publish to the public registry now (unscoped name), Bun remains a required runtime (no Node refactor).

## Boundary Context

- **In scope**: package metadata and contents; executable entry points for the server, both hooks, the evidence generator, and the project-init helper; templates/init switching from path substitution to installed command names; install documentation.
- **Out of scope**: Node compatibility (Bun stays required); any behavior change in server tools, hooks, or scripts; CI/release automation; registry credentials handling (owner logs in and the publish runs under their account).
- **Adjacent expectations**: `claude mcp add` invokes the server binary over stdio; Claude Code hooks and husky invoke the hook binaries; the bundled datasets ship inside the package so no network is needed at runtime.

## Requirements

### Requirement 1: Installable package

**Objective:** As a user, I want to install the server with npm, so that setup requires no repo checkout.

#### Acceptance Criteria

1. When the package is installed globally, the MCP server shall be invocable by command name and shall serve all tools with bundled datasets, without network access or a repo checkout.
2. The package shall declare Bun as a required runtime so the requirement is visible at install/run time rather than as a cryptic failure.
3. The package shall exclude development-only files (specs, fixtures, tests, raw source spreadsheets) from the published artifact.
4. When the package tarball is installed into a clean prefix, the server shall complete an MCP initialize handshake over stdio.

### Requirement 2: Hook and script entry points

**Objective:** As a user wiring the compliance hooks into a project, I want the pre-edit hook, pre-commit check, evidence generator, and init helper available as installed commands, so that project config references stable command names instead of absolute checkout paths.

#### Acceptance Criteria

1. When the package is installed, the pre-edit hook, pre-commit citation check, evidence generator, and init helper shall each be invocable by command name with their existing behavior.
2. When the init helper runs from an installed package, the copied templates shall reference the installed command names and shall require no path substitution.
3. The repo-checkout workflow shall keep working for development of this repo itself.

### Requirement 3: Publish readiness

**Objective:** As the package owner, I want the artifact verified before it reaches the registry, so that the first published version works.

#### Acceptance Criteria

1. When the packed tarball is inspected, it shall contain the server, tool modules, datasets, hook scripts, templates, license, and readme — and nothing from the excluded set.
2. The version shall be bumped to 0.4.0 and the metadata (description, repository, keywords, license) shall be present and accurate.
3. When the owner is authenticated, the publish shall run under their account; the flow shall stop and ask for login rather than failing mid-publish.
4. The readme shall document the npm install path (server registration and hook wiring by command name) alongside the existing checkout path.
