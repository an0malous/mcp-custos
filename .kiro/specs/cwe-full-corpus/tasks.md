# Implementation Plan

- [x] 1. Foundation: transform engine and test fixture
- [x] 1.1 Add script-only parsing dependencies and an offline catalog fixture
  - Declare the unzip and XML-parsing libraries as devDependencies used only by build scripts
  - Hand-trim a small sample of the official catalog (3–4 weaknesses, including one deprecated entry, one with mitigations/examples/detection methods/relations) into a local fixture
  - Observable: fixture file exists and typecheck passes with the new devDependencies declared
  - _Requirements: 5.4_
- [x] 1.2 Build the catalog transform with overlay merge
  - Parse the catalog XML into the dataset shape from the design's data contract, extracting official text verbatim (descriptions, phase-tagged mitigations, language-labeled examples, detection methods, relations, observed CVEs)
  - Exclude deprecated entries; record the catalog version; merge curated overlay fields onto matching weaknesses, warning (not silently dropping) when a curated ID is absent upstream
  - Observable: transform unit tests against the fixture pass offline, covering deprecated exclusion, verbatim field extraction, overlay merge, and version capture
  - _Requirements: 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 4.1, 5.2, 5.4_

- [x] 2. Core: dataset generation and tool layer
- [x] 2.1 Extract the curation overlay and wire the refresh task
  - Move the hand-curated ranks, OWASP categories, and ASVS/NIST mappings for the existing 30 entries into the standalone overlay file with its provenance caveat
  - Add the CWE fetch task (download, unzip, transform, write) to the refresh command's task registry so failures report per-source without blocking other sources; drop CWE from the "manually curated" skip list
  - Regenerate the bundled dataset from upstream and delete the old thin dataset file
  - Observable: running the refresh command reports the CWE source alongside the other four and produces the full-corpus dataset with overlay fields and catalog version present
  - _Requirements: 4.1, 4.2, 5.1, 5.2, 5.3_
- [x] 2.2 Rewrite the CWE tools with the summary/detailed split
  - Keep the lazy load idiom and existing ID normalization; look up any corpus weakness by ID, returning the summary form by default and the complete entry (mitigations, examples, detection methods, relations, observed CVEs, curated fields) when detail is requested
  - Summaries carry the short description, mitigation count, example flag, and a hint that detailed lookup returns the rest; search matches description text across the full corpus; Top 25 listing returns exactly the 25 ranked entries in rank order; control mapping returns curated mappings with their caveat plus official related weaknesses
  - Observable: tool unit tests pass — beyond-curated ID resolves, deprecated ID reports absent, summary outputs exclude heavy fields, detailed lookup returns non-empty mitigations, Top 25 and control-mapping behaviors hold
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.6, 3.1, 3.2, 3.3, 3.4, 4.3, 4.4_

- [x] 3. Integration and validation
- [x] 3.1 Update tool registration and server surface
  - Add the detail option to the lookup tool's schema and refresh the four CWE tool descriptions to reflect full-corpus coverage
  - Observable: an MCP dev session resolves a non-curated ID as a summary and returns mitigations plus examples with the detail option set
  - _Requirements: 3.3, 3.4_
- [x] 3.2 Full-suite validation and documentation alignment
  - Run typecheck and the complete test suite; update the README's CWE tool table, data table, provenance row, and limitations bullet to match the new dataset
  - Observable: typecheck and all tests pass; README describes the full-corpus dataset with official guidance text and curated-mapping caveat
  - _Requirements: 2.7, 4.2_
