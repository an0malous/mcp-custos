# Custos (mcp-custos)

Custos — Latin for "guardian" — is a secure-coding helper for AI agents: an MCP server carrying official secure-coding and compliance guidance (full MITRE CWE corpus, NIST 800-53, OWASP ASVS, ISO 27001, NIST SSDF), plus hooks that make the guidance actually land in code.

This server addresses two pain points engineers have with compliance:

1. **Build-time** — Claude consults ISO 27001, NIST 800-53, OWASP ASVS, and NIST SSDF before writing security-touching code, so controls don't get forgotten. Optional pre-edit and pre-commit hooks make consultation deterministic.
2. **Audit-time** — citations Claude added in code (`// Refs: NIST IA-5(1)`) become a generated `COMPLIANCE.md` evidence index when an auditor asks "show me A.8.5".

All cross-framework mappings come from authoritative sources (NIST OLIR, NIST OSCAL, OWASP releases) — never AI-generated.

## What You Can Do

**Compliance lookups** — Look up any control by ID, search by keyword, or list entire control families. Covers ISO 27001:2022 (93 Annex A controls), NIST SP 800-53 Rev 5 (full catalog with enhancements), ISO 27017:2015 (cloud security), and NIST cloud security guidance (SP 800-144, 800-210, 800-146).

**Cross-framework translation** — ISO 27001 controls resolve their NIST 800-53 mappings inline. NIST SSDF tasks expose official cross-references to 800-53, BSIMM, OWASP ASVS/SAMM, ISO 27034, PCI SSLC, EO 14028, and 23 more. NIST 800-53 sits at the hub.

**Build-time guardrails** — Code-actionable best practices via OWASP ASVS 5.0 (345 testable requirements across 17 chapters) and NIST SSDF (40 SDLC practices). The `controls_for_change` tool takes a description of what you're about to build and returns a curated checklist before you write a line of code. Pre-edit and pre-commit hooks enforce that citations land in the diff.

**Secure-coding reference & scanner bridge** — the full MITRE CWE corpus (~944 weaknesses) with official guidance text: descriptions, phase-tagged potential mitigations, demonstrative vulnerable/fixed code examples, detection methods, and weakness relations. Any scanner finding (`CWE-79 XSS`, `CWE-611 XXE`, `CWE-918 SSRF`) resolves to remediation guidance, and curated Top 25 mappings translate findings into the ASVS chapters and NIST control families that mitigate them.

**Audit traceability** — `bun run evidence` walks the repo for `// Refs:` annotations, resolves NIST → ISO Annex A, and emits a `COMPLIANCE.md` audit-evidence index — auditor-ready in seconds.

## How the Mappings Work

NIST 800-53 is the hub that connects the frameworks:

```
ISO 27001 ──► NIST 800-53 ◄── OWASP ASVS, NIST SSDF
                   ↕
ISO 27017 ◄─► NIST Cloud Guidance (SP 800-144, 800-210, 800-146)
```

All cross-framework mappings come from official sources:

| Mapping | Source |
|---------|--------|
| ISO 27001 → NIST 800-53 | [NIST OLIR program](https://csrc.nist.gov/projects/olir/informative-reference-catalog/details?referenceId=99) |
| NIST SSDF → NIST 800-53 (and 28 others) | [NIST OSCAL catalog](https://github.com/usnistgov/oscal-content/tree/main/nist.gov/SP800-218/ver1) |
| ISO 27017 → NIST Cloud | NIST SP 800-144, SP 800-210 (Table 4), SP 800-146 |

## Setup

Requires [Bun](https://bun.sh) (the package executes TypeScript directly under Bun).

```bash
bun add -g mcp-custos   # or: npm install -g mcp-custos
```

This installs the server plus four commands: `mcp-custos` (the MCP server), `custos-precheck-edit` and `custos-check-citations` (the hooks), `custos-evidence` (audit index generator), and `custos-init` (project setup helper).

### Claude Code

```bash
claude mcp add custos -- mcp-custos
```

### Claude Desktop / Cursor

Add to your MCP config (`claude_desktop_config.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "custos": {
      "command": "mcp-custos"
    }
  }
}
```

### Development (from a checkout)

```bash
git clone <repo-url> && cd mcp-security-compliance
bun install
bun link   # exposes the same five commands from this checkout
```

## Example Prompts

```
"Look up ISO 27001 control A.8.24"
"What NIST controls relate to access management?"
"What does ISO 27017 say about virtual machine segregation?"
"What does NIST say about hypervisor access control in the cloud?"
"What ASVS L2 requirements cover OAuth refresh tokens?"
"What SSDF practices map to NIST SR-3?"
"What compliance controls cover encryption?"
```

## How to use this — composition patterns

This server provides primitives (lookup, search, list, map) that compose. You don't need a dedicated tool for every workflow — phrase the request in plain English and Claude will chain the primitives. Five common patterns:

### "Our org follows ISO 27001. Implement X properly."

Set this in your project's `CLAUDE.md` (once):

> *This project follows ISO 27001:2022. Use the custos MCP (mcp-custos). For any security-touching change, identify relevant ISO Annex A controls, resolve to mapped NIST 800-53 detailed guidance, implement to that spec. Cite NIST IDs in code comments and commit messages (`// Refs: NIST IA-5(1)`); ISO IDs belong in audit documentation, not source files.*

Then ask normally:

> *"Add password reset with refresh tokens."*

Claude chains: `iso_search_controls "authentication"` → `iso_lookup_control A.8.5` → resolves NIST IA-2/IA-5/IA-8 → `nist_lookup_control IA-5 detailed=true` → implements to that spec → annotates the code with `// Refs: NIST IA-5(1), ASVS V6.2.5`. The ISO traceability is recovered at audit time via `bun run evidence`, which walks NIST citations back to ISO Annex A automatically.

### "Build me an evidence index for control A.8.24."

Use the `audit-evidence` prompt or ask plainly:

> *"What evidence in this repo satisfies ISO A.8.24?"*

Claude chains: `iso_lookup_control A.8.24` → mapped NIST SC-12, SC-13, SC-17 → `nist_lookup_control SC-13 detailed=true` for what to look for → greps repo for matching IaC/config/tests/policy → produces a markdown evidence index.

### "What SDLC practices does NIST SC-13 satisfy?"

> *"What SSDF tasks reference NIST SC-13 — what process work backs the implementation?"*

Claude chains: `ssdf_map_from_nist SC-13` → returns SSDF tasks (e.g. PW.5.1, PW.6.2) → for each, `ssdf_external_refs` → cross-references to OWASP ASVS, BSIMM, ISO 27034. Useful when an auditor asks not "is the control implemented?" but "is it implemented with sound dev practice?"

### "Designing a logging pipeline — make it audit-ready."

Use the `secure-by-design-plan` prompt:

> `/mcp__custos__secure-by-design-plan system="centralized logging pipeline" level="2"`

Claude chains: `controls_for_change` for the system → SSDF practices PO + PW → ISO A.8.15, A.8.16 → mapped NIST AU-* → produces structured plan with controls and evidence requirements.

### "What changes when we start handling PII?"

> *"We're about to start storing user PII. What controls now apply?"*

Claude chains: `controls_for_change "handling PII"` → cross-checks ISO A.5.34 (Privacy and protection of PII) → NIST PT and PII control families → produces a delta checklist of new requirements.

## Compliance enforcement (optional)

Two hooks ship in `scripts/` to make compliance citations consistent across Claude and human edits. Both opt-in. Both use the same path/keyword detection (`src/compliance-detect.ts`) and call the MCP's `controls_for_change` to suggest specific NIST/ASVS IDs in their output.

| Layer | When it runs | Bypassable | Best for |
|-------|--------------|-----------|----------|
| Per-edit Claude hook (`precheck-edit.ts`) | Before each `Edit`/`Write` tool call | Hard (deny `--no-verify` to lock further) | Catching missing citations during real-time work |
| Pre-commit script (`check-compliance-citations.ts`) | At `git commit` | Yes (`--no-verify`) | Catching anything humans/Claude commit without citation |
| CI workflow (same script with `--strict`) | On every PR | Repo admin only | Hard enforcement before merge |

Defaults are conservative — narrow paths (`auth/`, `crypto/`, `iam/`, `secrets/`, `oauth/`, `session/`, `tls/`) and high-confidence keywords only (`password`, `bcrypt`, `JWT`, `oauth`, `MFA`, `csrf`, `private_key`, etc). Citations satisfy the check whether they're inline (`// Refs: NIST IA-5(1)`) or in the commit message (`Refs: NIST IA-5(1)`).

### Setup

Quickest path — run the init helper, pointing at your target project:

```bash
custos-init /path/to/your/project
```

It copies `.claude/settings.json`, `.husky/pre-commit`, and `.github/workflows/compliance-check.yml` into the target. The copied configs invoke the installed commands (`custos-precheck-edit`, `custos-check-citations`), so they work as long as the package is installed globally (or `bun link`ed from a checkout). Skip individual layers with `--skip-hooks=husky,ci`. Manual wiring: the templates live in `templates/`.

### What gets cited

The hook treats any of these as a valid citation:

- `// Refs: NIST <id>` — also accepts `#`, `--`, `/* */`, and `*` comment leaders (covers Python, Ruby, Shell, SQL, Lua, Haskell, Elm, JS/TS, C, Java, Go, Rust, etc.)
- `// Compliance: NIST <id>`
- `Refs: NIST <id>` in the commit message
- `// Refs: ASVS V<x.y.z>` (or commit equivalent)

ISO Annex A IDs alone don't satisfy the hook — ISO is too coarse to describe an implementation. Cite NIST or ASVS in code, then map to ISO at the audit boundary via `iso_lookup_control`.

## Audit prep

When you're heading into an audit, run the evidence index generator:

```bash
custos-evidence /path/to/your/repo --out=COMPLIANCE.md   # or from a checkout: bun run evidence
```

It walks the repo, finds every `// Refs: NIST <id>` and `// Refs: ASVS <id>` annotation, resolves NIST → ISO Annex A via the bundled OLIR mappings, and emits a markdown file grouped by ISO control id with file:line evidence pointers. Hand to the auditor.

## Tools

### ISO 27001:2022

| Tool | Description |
|------|-------------|
| `iso_lookup_control` | Look up a control by ID with mapped NIST guidance |
| `iso_search_controls` | Search controls by keyword |
| `iso_list_controls_by_category` | List controls in a category (A.5–A.8) |
| `iso_list_categories` | List categories with control counts |

### NIST SP 800-53 Rev 5

| Tool | Description |
|------|-------------|
| `nist_lookup_control` | Look up a control by ID |
| `nist_search_controls` | Search controls by keyword |
| `nist_list_family` | List controls in a family (AC, SC, IA, etc.) |
| `nist_list_families` | List all families with control counts |

### ISO 27017:2015 (Cloud)

| Tool | Description |
|------|-------------|
| `cloud_lookup_control` | Look up a cloud control by ID with resolved NIST cloud guidance |
| `cloud_search_controls` | Search cloud controls by keyword |
| `cloud_list_controls_by_section` | List controls in a section |
| `cloud_list_sections` | List all sections with control counts |

### NIST Cloud Security Guidance

| Tool | Description |
|------|-------------|
| `nist_cloud_lookup_topic` | Look up a cloud guidance topic by ID (e.g. SP800-210.3.1) |
| `nist_cloud_search` | Search cloud guidance by keyword |
| `nist_cloud_list_by_source` | List topics from a specific publication |
| `nist_cloud_list_sources` | List all NIST cloud publications with topic counts |

### OWASP ASVS 5.0

| Tool | Description |
|------|-------------|
| `asvs_lookup` | Look up an entry by ID — chapter (V11), section (V11.1), or requirement (V11.1.1) |
| `asvs_search` | Search requirements by keyword, optional level filter (1/2/3) |
| `asvs_list_by_chapter` | List requirements in a chapter, optional level filter |
| `asvs_list_chapters` | List all 17 chapters with section and requirement counts |

### NIST SSDF (SP 800-218)

| Tool | Description |
|------|-------------|
| `ssdf_lookup` | Look up by ID — group (PO, PS, PW, RV), practice (PO.1), or task (PO.1.1) |
| `ssdf_search` | Search practices and tasks by keyword |
| `ssdf_list_by_group` | List all practices and tasks in a group |
| `ssdf_list_groups` | List the four SSDF groups with practice and task counts |
| `ssdf_map_to_nist` | SSDF id → NIST 800-53 controls (official OSCAL mappings) |
| `ssdf_map_from_nist` | NIST 800-53 control → SSDF tasks that reference it |
| `ssdf_external_refs` | All cross-framework refs for an SSDF entry (BSIMM, OWASP, ISO 27034, PCI SSLC, etc.) |

### CWE (Common Weakness Enumeration)

The full MITRE CWE corpus (~944 weaknesses, deprecated entries excluded) with official guidance text — descriptions, potential mitigations, demonstrative code examples, detection methods, relations, and observed CVEs. Curated Top 25 (2024) ranks and ASVS/NIST mappings are overlaid on top. Use this both as a secure-coding reference and to bridge security-scanner output (CWE IDs) to the controls that mitigate them.

| Tool | Description |
|------|-------------|
| `cwe_lookup` | Look up any corpus CWE by ID; `detailed=true` returns full MITRE guidance (mitigations, code examples, detection methods, relations) |
| `cwe_search` | Search by keyword across name, ID, descriptions, OWASP Top 10 category |
| `cwe_list_top25` | List the CWE Top 25 (2024) with control mappings |
| `cwe_map_to_controls` | CWE → mitigating ASVS chapters + NIST 800-53 families + official related CWEs |

### Build-time guardrail

| Tool | Description |
|------|-------------|
| `controls_for_change` | Given a description of a code change, returns a curated checklist drawn from ASVS, SSDF, and NIST 800-53. Tokenizes the description (with security-abbreviation expansion: MFA, RBAC, CSRF, JWT, etc.) and ranks results by token-match score. Use at the start of any security-touching change. |
| `pr_compliance_summary` | Scans the current branch's diff for `// Refs:` annotations and produces a citation block for the PR description |
| `mapping_inventory` | Self-describes what frameworks the server covers, with control counts and cross-mapping totals |

## Prompts

The server also exposes MCP prompts — invoke them in Claude Code as `/mcp__custos__<name>`.

| Prompt | What it does |
|--------|-------------|
| `compliance-check` | Walks through a security-touching change against ASVS/SSDF/NIST. Args: `change`, optional `level` (1/2/3). |
| `audit-evidence` | Builds an evidence index for a specific control (ISO/NIST/ASVS/SSDF). Args: `control_id`. |
| `secure-by-design-plan` | Kicks off an architecture plan with relevant controls preloaded. Args: `system`, optional `level`. |

## Data

All data is bundled locally in `src/data/` — no API calls at runtime.

| File | What it is |
|------|------------|
| `iso-27001-controls.json` | 93 Annex A controls with official NIST mappings |
| `iso-27002-2022-toc.json` | Canonical ISO 27002:2022 TOC snapshot — used by `verify-iso` |
| `iso-27017-controls.json` | Cloud controls with NIST guidance references |
| `nist-cloud-guidance.json` | 30 cloud security topics from NIST SP 800-144, 800-210, 800-146 (verbatim language from source PDFs) |
| `nist-800-53.json` | Full NIST catalog parsed from [OSCAL](https://github.com/usnistgov/oscal-content) |
| `nist-ssdf.json` | NIST SSDF v1.1 from official OSCAL catalog with cross-refs to 800-53, BSIMM, OWASP, ISO 27034, etc. |
| `owasp-asvs.json` | OWASP ASVS 5.0 — 345 requirements across 17 chapters |
| `cwe.json` | Full MITRE CWE corpus (cwec catalog) with official guidance text, generated by `update-sources` with the curated overlay merged in |
| `cwe-curated-overlay.json` | Hand-curated Top 25 (2024) ranks + ASVS chapter and NIST 800-53 family mappings, merged onto the corpus at refresh time |
| `sp800-53r5-to-iso-27001-mapping-OLIR.xlsx` | Raw NIST OLIR source spreadsheet |

To refresh data from upstream:
```bash
bun run update-sources
```
Pulls latest NIST 800-53 OSCAL, NIST SSDF OSCAL, OWASP ASVS release, and the MITRE CWE catalog (merging the curated overlay), and re-verifies ISO 27001 against the snapshotted TOC. ISO 27017, NIST cloud guidance, and the CWE curated overlay are manually maintained and not auto-refreshed.

## Data Provenance

All guidance text is taken directly from official publications — no AI-generated summaries. Each data file in `src/data/` carries its own `source` (or `control_titles_source` / `nist_mapping_source`) field so provenance is self-describing at the file level.

| Dataset | Source Format | How It Was Extracted |
|---------|--------------|---------------------|
| NIST 800-53 | Machine-readable [OSCAL JSON](https://github.com/usnistgov/oscal-content) | Parsed directly |
| NIST SSDF (SP 800-218) | Machine-readable [NIST OSCAL catalog](https://github.com/usnistgov/oscal-content/tree/main/nist.gov/SP800-218/ver1) | Parsed directly. Includes official cross-references to NIST 800-53, BSIMM, OWASP ASVS/SAMM, ISO 27034, PCI SSLC, EO 14028, NIST CSF, IEC 62443, and others |
| OWASP ASVS 5.0 | [OWASP ASVS GitHub release JSON](https://github.com/OWASP/ASVS/releases) | Bundled directly from the official OWASP release artifact |
| ISO 27001:2022 Annex A control IDs and titles | [ISO/IEC 27002:2022 sample preview](https://cdn.standards.iteh.ai/samples/75652/f9b90f856c0d4c3dbef74cf67374d1c5/ISO-IEC-27002-2022.pdf) (TOC) | Snapshotted to `src/data/iso-27002-2022-toc.json`; `bun run verify-iso` diffs `iso-27001-controls.json` against it. Only IDs and titles are reproduced (factual references); no descriptive text from the standard is shipped. |
| ISO 27001 → NIST mappings | [OLIR spreadsheet](https://csrc.nist.gov/projects/olir/informative-reference-catalog/details?referenceId=99) | Parsed directly |
| ISO 27017:2015 cloud control IDs and titles | ISO/IEC 27017:2015 (paywalled) | Only IDs and short titles reproduced (factual references). Guidance text comes from public-domain NIST cloud SPs via `nist_refs`. |
| NIST cloud guidance | PDFs only (SP 800-144, 800-210, 800-146) | Verbatim text extracted from source PDFs; NIST 800-53 control mappings from SP 800-210 Table 4 |
| CWE corpus | [MITRE cwec catalog XML](https://cwe.mitre.org/data/xml/cwec_latest.xml.zip) | Parsed directly; all guidance text (descriptions, mitigations, examples, detection methods, relations) is verbatim from the catalog. Top 25 ranks and ASVS/NIST mappings are a project-curated overlay (not from an official crosswalk) |

## Limitations

Be honest about what this server is and isn't:

- **Not a vulnerability scanner.** It cites controls; it doesn't detect vulnerabilities. Pair with Claude Code's `/security-review`, Snyk, Checkov, Semgrep, etc.
- **Not a Statement of Applicability author.** The SoA is a hand-curated business document. This server gives you control facts, not the applicability decisions or business justifications.
- **ISO standard text is not shipped.** Only IDs and titles are reproduced (factual references). Implementation guidance comes from the mapped NIST 800-53 controls — that's why citations in code use NIST IDs, not ISO IDs.
- **Not a GRC platform.** No SSPs, no assessment plans, no evidence collection automation beyond the citation grep. For full OSCAL artifact lifecycle, see [awslabs/mcp-server-for-oscal](https://github.com/awslabs/mcp-server-for-oscal).
- **CWE→ASVS/NIST mappings are curated, not from an official crosswalk.** The CWE guidance text itself is official MITRE content, but the control mappings are starter pointers; confirm with `nist_search_controls` for specific control IDs.
- **OWASP ASVS 5.0 ships with empty CWE/NIST cross-ref columns** in OWASP's own data. Cross-mappings between ASVS and other frameworks are not yet available authoritatively.
- **No threat modeling.** ATT&CK is intentionally not included — pair with one of the dedicated ATT&CK MCPs ([imouiche/complete-mitre-attack-mcp-server](https://github.com/imouiche/complete-mitre-attack-mcp-server), [Montimage/mitre-mcp](https://github.com/Montimage/mitre-mcp)) when threat modeling is a recurring workflow.

## Development

```bash
bun run dev
```
