# Custos

**Custos** is a secure-coding helper for AI agents — an MCP server that puts official security guidance in the agent's context while it writes code, enforces that the guidance lands, and turns the result into audit evidence.

## Guide → Enforce → Prove

**Guide** — official secure-coding guidance, in-context, at write time.
MCP tools over the full MITRE CWE corpus (944 weaknesses with official mitigations and vulnerable/fixed code examples), NIST 800-53 Rev 5, OWASP ASVS 5.0, NIST SSDF, ISO 27001/27017, and NIST cloud guidance. `controls_for_change` turns *"add password reset"* into the exact controls and mitigations before a line is written; `cwe_lookup` turns any scanner finding into remediation guidance. All text verbatim from the official publications — nothing AI-generated, no network at runtime.

**Enforce** — the guidance has to land in code.
A pre-edit nudge (Claude Code hook) surfaces relevant controls and CWE mitigations the moment a security-touching edit starts, and a pre-commit/CI gate blocks commits to security-sensitive code that carry no citation receipt (`// Refs: NIST IA-5(1)` inline or in the commit message). Advisory at edit time, enforced at commit, non-bypassable in CI (`--strict`).

**Prove** — audit evidence out the other end.
`custos-evidence` walks a repo, collects every citation, resolves NIST → ISO 27001 Annex A through the official NIST OLIR mappings, and emits a `COMPLIANCE.md` evidence index with file:line pointers — the answer to an auditor's "show me A.8.5."

## Install

Requires [Bun](https://bun.sh).

```bash
bun add -g mcp-custos        # or: npm install -g mcp-custos
```

**Claude Code**

```bash
claude mcp add custos -- mcp-custos
```

**Any other MCP client** (Claude Desktop, Cursor, …) — add to its MCP config:

```json
{ "mcpServers": { "custos": { "command": "mcp-custos" } } }
```

The pre-edit nudge is Claude Code-specific; the tools, commit gate, CI check, and evidence generator work with any agent (or none).

## Project setup (optional hooks + server registration)

Two install styles, one command either way:

**Team (recommended)** — add it as a devDependency so teammates get it with plain `pnpm install` and the lockfile keeps everyone on the same version:

```bash
pnpm add -D mcp-custos                 # or npm i -D / yarn add -D / bun add -d
pnpm exec custos-init .
```

**Solo/global** — with the package installed globally:

```bash
custos-init /path/to/your/project      # --skip-hooks=husky,ci to skip layers
```

`custos-init` detects the install mode (override with `--local`/`--global`), registers the `custos` server in the project's `.mcp.json` (matched to your package manager), and copies three opt-in layers: `.claude/settings.json` (pre-edit nudge), `.husky/pre-commit` (citation gate — requires husky in the project), and a GitHub Actions workflow (the same gate with `--strict`). Existing files are never overwritten. Humans can `git commit --no-verify` locally; CI is the backstop.

## Generate audit evidence

```bash
custos-evidence /path/to/your/repo --out=COMPLIANCE.md
```

## Data and provenance

All datasets are bundled (`src/data/`) and refreshed from official sources via `bun run update-sources`: the MITRE cwec catalog, NIST OSCAL (800-53, SSDF), the OWASP ASVS release JSON, NIST OLIR mappings, and verbatim extracts from the NIST cloud SPs. ISO standard text is not shipped (paywalled) — only IDs/titles, with implementation detail coming from the mapped NIST controls. The only project-curated (non-official) data: the CWE→ASVS/NIST starter mappings and the Top 25 overlay, labeled as such inside the dataset.

## Development

```bash
git clone https://github.com/an0malous/mcp-custos && cd mcp-custos
bun install
bun link            # exposes the mcp-custos / custos-* commands from this checkout
bun run typecheck && bun test
```

Feature work runs through the Kiro spec flow — see `CLAUDE.md`.

MIT © an0malous
