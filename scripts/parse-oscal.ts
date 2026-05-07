/**
 * Parses the NIST OSCAL SP 800-53 rev5 catalog JSON into a clean format
 * for the MCP server.
 *
 * Usage: bun run scripts/parse-oscal.ts <path-to-oscal-json>
 */
import { parseNistControl, type OscalCatalog } from "./_oscal.js";

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: bun run scripts/parse-oscal.ts <oscal-json-path>");
    process.exit(1);
  }

  const raw = (await Bun.file(inputPath).json()) as OscalCatalog;
  const cat = raw.catalog;

  const output = {
    standard: "NIST SP 800-53",
    version: cat.metadata.version,
    last_modified: cat.metadata["last-modified"],
    source:
      "https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog-min.json",
    source_repo: "https://github.com/usnistgov/oscal-content",
    families: cat.groups.map((g) => ({
      id: g.id.toUpperCase(),
      name: g.title,
      controls: g.controls.map(parseNistControl),
    })),
  };

  const totalControls = output.families.reduce(
    (sum, f) => sum + f.controls.length,
    0
  );
  const totalEnhancements = output.families.reduce(
    (sum, f) => sum + f.controls.reduce((s, c) => s + c.enhancements.length, 0),
    0
  );

  const outPath = new URL("../src/data/nist-800-53.json", import.meta.url)
    .pathname;
  await Bun.write(outPath, JSON.stringify(output, null, 2));

  console.log(`Parsed ${totalControls} controls + ${totalEnhancements} enhancements`);
  console.log(`Written to ${outPath}`);
}

main().catch(console.error);
