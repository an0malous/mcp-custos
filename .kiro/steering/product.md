# Product Overview

`mcp-security-compliance` is an MCP server that gives AI-assisted development authoritative, queryable access to security-compliance reference data — ISO 27001:2022, NIST SP 800-53 Rev 5, OWASP ASVS 5.0, NIST SSDF (SP 800-218), ISO 27017:2015, and NIST cloud guidance (SP 800-144/210/146) — plus tooling that makes the compliance actually land in code.

It serves engineers and AI agents who must produce security-touching code that satisfies an audit, without memorizing control catalogs or hand-maintaining cross-framework mappings.

## Core Capabilities

- **Compliance lookups** — look up any control by ID, search by keyword, or list entire families across ISO 27001, NIST 800-53, OWASP ASVS, ISO 27017, and NIST cloud guidance.
- **Cross-framework translation** — NIST 800-53 is the hub; ISO 27001, ASVS, and SSDF all resolve to it. Mappings come from official sources (NIST OLIR, NIST OSCAL, OWASP releases) — never AI-generated.
- **Build-time guardrail** — `controls_for_change` turns a one-line description of upcoming work into a curated ASVS/NIST checklist before code is written. Optional pre-edit (Claude Code hook) and pre-commit hooks make consultation deterministic.
- **Scanner-to-control bridge** — CWE Top 25 entries map to ASVS chapters and NIST families, translating vulnerability findings into mitigating controls.
- **Audit traceability** — `// Refs: NIST …` citations in code are walked into a generated `COMPLIANCE.md` evidence index, resolving NIST → ISO Annex A for auditors.

## Target Use Cases

- An agent about to implement auth/crypto/secrets/logging consults the relevant controls *before* writing code, then cites them inline.
- A pre-commit gate enforces that security-touching diffs carry valid `// Refs:` citations.
- An auditor asks "show me ISO A.8.5" and the repo produces resolved evidence in seconds.

## Value Proposition

Compliance is consulted at build time and proven at audit time from the same authoritative dataset — controls don't get forgotten, and mappings are never fabricated.

---
_Focus on patterns and purpose, not exhaustive feature lists_
