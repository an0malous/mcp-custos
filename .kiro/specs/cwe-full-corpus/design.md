# Design Document — cwe-full-corpus

## Overview

**Purpose**: Replace the thin 30-entry CWE dataset with the full official MITRE CWE corpus (~970 weaknesses), carrying the guidance text that makes an entry code-prescriptive: descriptions, phase-tagged potential mitigations, language-labeled demonstrative code examples, detection methods, and official weakness relations.

**Users**: Agents and developers bridging scanner findings (CWE IDs) to remediation guidance and mitigating controls; the maintainer refreshing datasets.

**Impact**: `src/data/cwe-top-weaknesses.json` (hand-maintained) is replaced by a generated `src/data/cwe.json` plus a small hand-maintained curation overlay. The four CWE tools keep their names but gain a summary/detailed output split modeled on `nist.ts`. The refresh command gains a fifth source task.

### Goals
- Any current MITRE weakness ID resolves via `cwe_lookup`; deprecated IDs report absent (1.1–1.4).
- Detailed lookups return official mitigations, examples, detection methods, and relations (2.1–2.7).
- Search/list/summary outputs stay compact; heavy payloads only behind `detailed=true` (3.1–3.4).
- Curated ranks/mappings survive `bun run update-sources` (4.1–4.4) and the CWE source joins the refresh flow (5.1–5.4).

### Non-Goals
- Surfacing CWE guidance from `controls_for_change` or the hooks (later spec).
- OWASP Cheat Sheet dataset (later spec).
- Replacing curated ASVS/NIST mappings with official crosswalks (none exist yet; relations only supplement).

## Boundary Commitments

### This Spec Owns
- The bundled CWE dataset (`src/data/cwe.json`), its schema, and its provenance metadata.
- The curation overlay (`src/data/cwe-curated-overlay.json`) and its merge semantics.
- The CWE fetch/transform path inside the refresh flow (`scripts/_cwe.ts`, the `updateCwe` task).
- The four CWE tool implementations and their output shapes (`src/tools/cwe.ts`).

### Out of Boundary
- `controls_for_change`, `compliance-detect.ts`, and both hooks (unchanged; no CWE consumer exists there today).
- All non-CWE datasets, tools, and the shared refresh helpers' behavior for other sources.
- The `paginate`/`json`/`text` helpers in `_shared.ts` (consumed as-is).

### Allowed Dependencies
- `scripts/update-sources.ts` task registry (the fetcher registers there; it must not alter other tasks).
- `src/tools/_shared.ts` (`paginate`) and the established lazy module-cache loader idiom.
- New script-only libraries: `fflate` (unzip) and `fast-xml-parser` (XML→JS). These must not be imported from `src/` (server runtime stays dependency-light); enforced by import location (scripts/ only).

### Revalidation Triggers
- Any change to the `cwe.json` schema (tool layer and tests consume it).
- Any change to overlay merge semantics (curation loss risk).
- MITRE changing the cwec download URL or XML schema version (fetcher breaks loudly, see Error Handling).
- A future spec wiring CWE into `controls_for_change`/hooks must re-check the summary shape's token cost.

## Architecture

### Existing Architecture Analysis
- Every dataset follows: fetch+transform in `scripts/update-sources.ts` (shared parsing helpers in `scripts/_*.ts`) → bundled JSON in `src/data/` → tool module in `src/tools/` with a private lazy `load()` cache → registration in `src/index.ts`.
- `nist.ts` is the precedent for a summary/detailed split and is mirrored here.
- Precedent for dataset size: `nist-800-53.json` is 1.3 MB, fully parsed into memory on first tool call. `cwe.json` (est. 5–15 MB) follows the same pattern; no streaming or indexing is introduced.

**Dependency direction**: `scripts/_cwe.ts` → `scripts/update-sources.ts` (build time); `src/data/cwe.json` → `src/tools/cwe.ts` → `src/index.ts` (runtime). No runtime import of script code or script libraries.

### Technology Stack

| Layer | Choice / Version | Role in Feature | Notes |
|-------|------------------|-----------------|-------|
| Data source | MITRE cwec XML, `https://cwe.mitre.org/data/xml/cwec_latest.xml.zip` | Authoritative corpus | Floats to latest, matching the repo's convention for other sources; catalog `Version` attribute recorded in output |
| Build scripts | `fflate` (latest), `fast-xml-parser` (latest) | Unzip + XML→JS in the fetcher | devDependencies; scripts/ only, never imported from src/ |
| Runtime | Bun + bundled JSON | Same lazy-load idiom as all tools | No new runtime dependencies |

## File Structure Plan

```
scripts/
├── update-sources.ts        # MODIFIED: add updateCwe task; remove CWE from "skipped" header
├── _cwe.ts                  # NEW: cwec XML → CweDataset transform + overlay merge (pure, testable)
└── _cwe.test.ts             # NEW: transform tests against local fixture (no network)
scripts/fixtures/
└── cwec-sample.xml          # NEW: small hand-trimmed cwec XML fixture (3–4 weaknesses incl. one Deprecated)
src/data/
├── cwe.json                 # GENERATED: full corpus + merged overlay (replaces cwe-top-weaknesses.json)
├── cwe-curated-overlay.json # NEW: hand-maintained ranks + curated mappings (30 entries)
└── cwe-top-weaknesses.json  # DELETED
src/tools/
├── cwe.ts                   # REWRITTEN: summary/detailed split, full-corpus fields
└── cwe.test.ts              # EXTENDED: corpus coverage, detail gating, overlay presence
src/
├── index.ts                 # MODIFIED: cwe_lookup gains `detailed` param; descriptions updated
└── types.ts                 # MODIFIED (if CWE types live here): new CweWeakness/CweDataset types
README.md                    # MODIFIED: CWE tool table, Data table, Provenance row, Limitations bullet
```

## Requirements Traceability

| Requirement | Summary | Components | Interfaces |
|-------------|---------|------------|------------|
| 1.1 | Any current ID resolves | CweTools, CweDataset | `lookupCwe` |
| 1.2 | Deprecated IDs report absent | CweTransform (skips Deprecated) | `lookupCwe` returns null |
| 1.3 | Search spans full corpus | CweTools | `searchCwe` |
| 1.4 | Bare-number normalization kept | CweTools | `normalizeId` (existing) |
| 2.1 | Descriptions returned | CweTransform, CweTools | `detailed()` |
| 2.2 | Mitigations with phase | CweTransform, CweTools | `detailed().potential_mitigations` |
| 2.3 | Examples with language label | CweTransform, CweTools | `detailed().demonstrative_examples` |
| 2.4 | Detection methods | CweTransform, CweTools | `detailed().detection_methods` |
| 2.5 | Relations + observed CVEs | CweTransform, CweTools | `detailed().related_cwes`, `.observed_examples` |
| 2.6 | Relations in control mapping | CweTools | `cweMapToControls` |
| 2.7 | Official text only | CweTransform (verbatim extraction), overlay labeling | dataset `note`/`source` fields |
| 3.1 | Search/list return summaries | CweTools | `summarize()` |
| 3.2 | Summaries signal deeper detail | CweTools | `mitigation_count`, `has_examples` |
| 3.3 | Plain lookup = summary | CweTools | `lookupCwe(id, detailed=false)` |
| 3.4 | Detailed option = full entry | CweTools | `lookupCwe(id, true)` |
| 4.1 | Curation survives refresh | CurationOverlay, CweTransform merge | overlay file + merge step |
| 4.2 | Provenance self-describing | CweDataset metadata | `source`, `catalog_version`, `note` |
| 4.3 | Curated mappings + caveat kept | CweTools | `cweMapToControls` note |
| 4.4 | Top 25 stays exactly 25 ranked | CurationOverlay, CweTools | `listCweTop25` |
| 5.1 | Refresh joins the flow | UpdateCweTask | `tasks` registry entry |
| 5.2 | Catalog version recorded | CweTransform | `catalog_version` field |
| 5.3 | Fetch failure isolated | UpdateCweTask | `Promise.allSettled` (existing) |
| 5.4 | Tests offline via fixture | CweTransform tests | `scripts/fixtures/cwec-sample.xml` |

## Components and Interfaces

| Component | Layer | Intent | Req Coverage | Key Dependencies | Contracts |
|-----------|-------|--------|--------------|------------------|-----------|
| CweTransform (`scripts/_cwe.ts`) | Build | cwec XML → `CweDataset`, merge overlay | 1.2, 2.1–2.5, 2.7, 4.1, 5.2, 5.4 | fast-xml-parser (P0), fflate via caller (P1) | Service |
| UpdateCweTask (in `update-sources.ts`) | Build | Fetch zip, unzip, call transform, write `cwe.json` | 5.1, 5.3 | CweTransform (P0), fflate (P0) | Batch |
| CurationOverlay (`src/data/cwe-curated-overlay.json`) | Data | Hand-maintained ranks/mappings, merged at build | 4.1, 4.4 | — | State |
| CweDataset (`src/data/cwe.json`) | Data | Bundled corpus, provenance metadata | 1.1, 4.2 | generated by UpdateCweTask | State |
| CweTools (`src/tools/cwe.ts`) | Runtime | Lookup/search/top25/map with summary/detailed split | 1.1–1.4, 2.6, 3.1–3.4, 4.3 | CweDataset (P0), `_shared.paginate` (P2) | Service |
| Registration (`src/index.ts`) | Runtime | Tool schemas; `detailed` param on `cwe_lookup` | 3.3, 3.4 | CweTools (P0) | API |

### CweTransform — Service Interface

```typescript
// scripts/_cwe.ts — pure functions, no I/O (caller supplies XML string + overlay)
interface CweTransform {
  parseCwecXml(xml: string): { catalogVersion: string; weaknesses: RawWeakness[] };
  buildDataset(
    parsed: { catalogVersion: string; weaknesses: RawWeakness[] },
    overlay: CweCuratedOverlay
  ): CweDataset;
}
```
- Preconditions: `xml` is a cwec 4.x Weakness_Catalog document.
- Postconditions: no entry with `status === "Deprecated"`; every overlay ID present in the catalog carries its overlay fields; `catalog_version` equals the catalog's `Version` attribute.
- Invariants: all guidance strings are extracted verbatim (whitespace-normalized only); no synthesized text.
- Error envelope: throws on unparseable XML or missing `Version` — `Promise.allSettled` in the caller isolates the failure per 5.3.
- Overlay mismatch (curated ID absent from catalog): warn to stderr and keep the entry from overlay data alone — curation is never dropped silently (4.1).

### CweTools — Service Interface

```typescript
// src/tools/cwe.ts
lookupCwe(rawId: string, detailed?: boolean): Promise<CweSummary | CweDetailed | null>;
searchCwe(query: string, limit?: number): Promise<Paginated<CweSummary>>;   // matches id/name/description/owasp_top10
listCweTop25(): Promise<CweSummary[]>;                                       // exactly the 25 ranked, rank order
cweMapToControls(rawId: string): Promise<CweControlMapping | null>;          // curated mappings + official related_cwes + caveat note
```

### Data Contracts

```typescript
interface CweDataset {
  source: string;            // "MITRE CWE (cwec) v<catalog_version>"
  url: string;
  catalog_version: string;   // 5.2
  note: string;              // provenance: official text vs curated fields — 2.7, 4.2
  weaknesses: CweWeakness[];
}

interface CweWeakness {
  id: string;                // "CWE-79"
  name: string;
  abstraction: string;       // Base | Variant | Class | ...
  status: string;            // never "Deprecated" — 1.2
  description: string;
  extended_description?: string;
  potential_mitigations: Array<{ phase?: string; description: string }>;      // 2.2
  demonstrative_examples: Array<{ language?: string; body: string }>;         // 2.3
  detection_methods: Array<{ method: string; description: string; effectiveness?: string }>; // 2.4
  related_cwes: Array<{ nature: string; id: string }>;                        // 2.5
  observed_examples: Array<{ cve: string; description: string; link?: string }>; // 2.5
  // overlay fields (present only where curated) — 4.1
  rank_2024?: number;
  owasp_top10?: string;
  asvs_chapters?: string[];
  nist_families?: string[];
}

interface CweSummary {
  id: string; name: string; rank_2024?: number; owasp_top10?: string;
  description: string;          // first paragraph only — 3.1
  mitigation_count: number;     // 3.2
  has_examples: boolean;        // 3.2
  detail_hint: string;          // "call cwe_lookup with detailed=true for mitigations/examples" — 3.2
}
// CweDetailed = full CweWeakness (verbatim) — 3.4
```

### UpdateCweTask — Batch Contract
- Trigger: `bun run update-sources` (task registry entry alongside the four existing tasks).
- Input: HTTP GET of the cwec zip; unzip via fflate; single XML member expected.
- Output: `src/data/cwe.json` via `Bun.write`; summary string with size delta (existing convention).
- Idempotency: pure overwrite; re-runs converge on upstream state + overlay.

## Error Handling
- Fetch/unzip/parse failures throw inside the task; `Promise.allSettled` reports per-source failure without blocking other sources (5.3). No partial `cwe.json` is written on failure (transform completes before write).
- Tool layer: unknown/deprecated ID → `null` → existing "not found" text path in `index.ts`.
- Overlay drift (curated ID no longer in catalog) → stderr warning + retained entry, never silent loss.

## Testing Strategy
- **Transform unit tests** (`scripts/_cwe.test.ts`, fixture-driven, offline — 5.4): parses fixture; Deprecated entry excluded (1.2); mitigations/examples/detection/relations extracted verbatim (2.2–2.5); overlay merge attaches curated fields (4.1); catalog version captured (5.2).
- **Tool tests** (`src/tools/cwe.test.ts`, against generated `cwe.json`): CWE-611 resolves (1.1); bare "79" normalizes (1.4); search matches description text beyond curated 30 (1.3); summary has no examples/mitigation bodies and carries counts/hints (3.1–3.3); `detailed=true` returns non-empty mitigations for CWE-89 (2.2, 3.4); `listCweTop25` exactly 25 in rank order (4.4); `cweMapToControls` keeps curated mappings + caveat and adds `related_cwes` (2.6, 4.3).
- **Manual verification**: `bun run update-sources` regenerates; MCP dev session spot-checks per the plan's verification section.

## Security Considerations
- Upstream fetch is over HTTPS from mitre.org; no checksum verification exists for any source today — parity, not a regression (noted as future hardening for all sources, out of scope here).
- Script-only dependencies never ship in the server runtime path.
