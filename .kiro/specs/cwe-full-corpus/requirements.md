# Requirements Document

## Introduction

The CWE dataset is currently the thinnest in the server: 30 entries (CWE Top 25 2024 plus five high-frequency additions) carrying only IDs, names, ranks, and project-curated control mappings. A `cwe_lookup` returns nothing an engineer can act on, and any scanner finding outside the curated 30 (e.g. CWE-611, CWE-918) returns "not found" — undercutting the scanner-to-control bridge the tool advertises.

This feature replaces the thin dataset with the full official MITRE CWE corpus, including the guidance text that makes an entry code-prescriptive: descriptions, potential mitigations, demonstrative code examples, detection methods, and official weakness relations. It preserves the existing hand-curated ASVS/NIST mappings as an overlay that survives dataset refreshes.

Product context (agreed direction, July 2026): secure-coding depth is the product; every dataset must pass the bar "would a competent engineer write different code after reading the returned text." The current CWE file fails that bar; this feature makes it the strongest passer.

## Boundary Context

- **In scope**: the CWE dataset content and its refresh path; the CWE lookup/search/list/mapping tools' returned content and their output volume behavior; preservation of curated mappings across refreshes.
- **Out of scope**: surfacing CWE guidance from `controls_for_change` or the pre-edit/pre-commit hooks (later spec); the OWASP Cheat Sheet dataset (later spec); changes to any non-CWE dataset or tool; the ranking algorithm shared by search tools.
- **Adjacent expectations**: the refresh command (`bun run update-sources`) already updates other datasets in parallel and reports per-source outcomes; the CWE refresh must join that flow without changing other sources' behavior. The test suite must continue to run without network access. The four existing CWE tool names remain the MCP surface; output shapes are free to change (no in-repo consumer depends on them).

## Requirements

### Requirement 1: Full-corpus coverage

**Objective:** As a developer bridging scanner findings to controls, I want any current CWE identifier to resolve, so that findings outside the Top 25 no longer dead-end in "not found".

#### Acceptance Criteria

1. When a lookup is requested for any weakness identifier present in the current official MITRE CWE catalog, the CWE tools shall return that weakness's entry.
2. If a lookup is requested for an identifier that MITRE has deprecated, the CWE tools shall report it as absent rather than returning guidance text.
3. When a search is requested, the CWE tools shall match against the full corpus, including weaknesses outside the curated Top 25 set.
4. The CWE tools shall preserve the existing identifier normalization so that a bare number (e.g. "79") resolves the same as its prefixed form ("CWE-79").

### Requirement 2: Code-prescriptive entry content

**Objective:** As an engineer (or agent) consulting a weakness, I want the official guidance text — what the weakness is, how to mitigate it, how it looks in code, and how to detect it — so that reading the entry changes the code I write.

#### Acceptance Criteria

1. When a detailed lookup is requested for a weakness, the CWE tools shall return the official description and extended description for that weakness.
2. When a detailed lookup is requested for a weakness that has potential mitigations in the official catalog, the CWE tools shall return those mitigations with their lifecycle phase.
3. When a detailed lookup is requested for a weakness that has demonstrative code examples in the official catalog, the CWE tools shall return those examples, each labeled with its programming language where the catalog provides one.
4. When a detailed lookup is requested for a weakness that has detection methods in the official catalog, the CWE tools shall return those methods.
5. When a detailed lookup is requested for a weakness, the CWE tools shall return its official relations to other weaknesses and its observed real-world vulnerability examples where the catalog provides them.
6. When a control mapping is requested for a weakness, the CWE tools shall include the weakness's official relations to other weaknesses alongside the curated mappings.
7. The dataset shall contain only text taken from the official MITRE catalog or explicitly labeled project curation — no generated or paraphrased guidance.

### Requirement 3: Context-efficient output

**Objective:** As an agent with a bounded context window, I want list and search results to stay compact and heavy guidance to arrive only on request, so that full-corpus data does not flood my context.

#### Acceptance Criteria

1. When a search or list is requested, the CWE tools shall return summary entries that identify the weakness and its short description without including demonstrative examples, full mitigation texts, or detection methods.
2. When a summary entry is returned for a weakness that has deeper guidance available, the summary shall indicate that a detailed lookup will return it.
3. When a lookup is requested without the detailed option, the CWE tools shall return the summary form.
4. Where the detailed option is requested, the CWE tools shall return the complete entry content described in Requirement 2.

### Requirement 4: Curated mappings survive refreshes

**Objective:** As the project maintainer, I want the hand-curated Top 25 ranks and ASVS/NIST control mappings to persist through dataset refreshes, so that curation work is never silently lost to an upstream update.

#### Acceptance Criteria

1. When the dataset is refreshed from upstream, the refreshed dataset shall retain the curated rank, OWASP Top 10 category, and ASVS/NIST mapping fields for every weakness that has them.
2. The dataset shall distinguish official catalog content from project-curated content so that provenance remains self-describing at the file level.
3. When a control mapping is requested for a weakness, the CWE tools shall continue to return the curated ASVS and NIST mappings together with the existing caveat that they are curated rather than official.
4. The Top 25 listing shall continue to return exactly the 25 ranked weaknesses in rank order.

### Requirement 5: Refresh path parity

**Objective:** As the project maintainer, I want the CWE dataset refreshed by the same command and reporting flow as the other authoritative datasets, so that keeping sources current stays a single operation.

#### Acceptance Criteria

1. When the source refresh command runs, the system shall fetch the current official MITRE CWE catalog, transform it to the bundled dataset, and report the outcome alongside the other sources.
2. When the dataset is regenerated, the dataset shall record the official catalog version it was built from.
3. If the upstream fetch fails, the refresh command shall report the failure for the CWE source without preventing other sources from updating.
4. While the test suite runs, dataset transformation tests shall operate on local fixtures without network access.
