/**
 * Parses NIST SSDF v1.1 from the official NIST OSCAL catalog and emits
 * src/data/nist-ssdf.json with practices, tasks, and cross-references to
 * NIST 800-53, BSIMM, OWASP ASVS/SAMM, ISO 27034, PCI SSLC, EO 14028, etc.
 *
 * Source: https://github.com/usnistgov/oscal-content/blob/main/nist.gov/SP800-218/ver1/json/NIST_SP800-218_ver1_catalog-min.json
 */

const SOURCE_URL =
  "https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-218/ver1/json/NIST_SP800-218_ver1_catalog-min.json";

const GROUP_NAMES: Record<string, string> = {
  PO: "Prepare the Organization",
  PS: "Protect the Software",
  PW: "Produce Well-Secured Software",
  RV: "Respond to Vulnerabilities",
};

interface OscalPart {
  id?: string;
  name: string;
  prose?: string;
}

interface OscalLink {
  href: string;
  rel?: string;
  text?: string;
}

interface OscalControl {
  id: string;
  class?: string;
  title: string;
  parts?: OscalPart[];
  links?: OscalLink[];
  controls?: OscalControl[];
}

interface OscalGroup {
  id: string;
  title: string;
  parts?: OscalPart[];
  controls: OscalControl[];
}

interface OscalResource {
  uuid: string;
  title: string;
}

interface OscalCatalog {
  catalog: {
    metadata: { title: string; version: string; "last-modified": string };
    groups: OscalGroup[];
    "back-matter": { resources: OscalResource[] };
  };
}

const oscal = (await fetch(SOURCE_URL).then((r) => r.json())) as OscalCatalog;
const cat = oscal.catalog;

// Build UUID -> resource title map
const resourceTitleByUuid: Record<string, string> = {};
for (const r of cat["back-matter"].resources) {
  resourceTitleByUuid[r.uuid] = r.title;
}

const statement = (c: OscalControl): string =>
  c.parts?.find((p) => p.name === "statement")?.prose?.trim() ?? "";

const parseRefs = (links?: OscalLink[]): Record<string, string[]> => {
  const refs: Record<string, string[]> = {};
  if (!links) return refs;
  for (const l of links) {
    if (!l.href?.startsWith("#") || !l.text) continue;
    const uuid = l.href.slice(1);
    const framework = resourceTitleByUuid[uuid];
    if (!framework) continue;
    const ids = l.text
      .split(/[,;]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) continue;
    refs[framework] = (refs[framework] ?? []).concat(ids);
  }
  return refs;
};

const groups = cat.groups.map((g) => ({
  id: g.id,
  name: GROUP_NAMES[g.id] ?? g.title,
  description: statement(g as unknown as OscalControl),
  practices: g.controls.map((p) => ({
    id: p.id,
    title: p.title,
    text: statement(p),
    references: parseRefs(p.links),
    tasks: (p.controls ?? []).map((t) => ({
      id: t.id,
      text: statement(t),
      references: parseRefs(t.links),
    })),
  })),
}));

const out = {
  standard: "NIST SP 800-218",
  name: "Secure Software Development Framework (SSDF)",
  version: "1.1",
  oscal_version: cat.metadata.version,
  last_modified: cat.metadata["last-modified"],
  url: "https://csrc.nist.gov/pubs/sp/800/218/final",
  source: SOURCE_URL,
  groups,
};

await Bun.write(
  "src/data/nist-ssdf.json",
  JSON.stringify(out, null, 2) + "\n"
);

const groupCount = out.groups.length;
const practiceCount = out.groups.reduce((s, g) => s + g.practices.length, 0);
const taskCount = out.groups.reduce(
  (s, g) => s + g.practices.reduce((t, p) => t + p.tasks.length, 0),
  0
);
const tasksWithNist = out.groups.flatMap((g) =>
  g.practices.flatMap((p) =>
    p.tasks.filter((t) => (t.references["SP80053"] ?? []).length > 0)
  )
).length;

console.log(
  `Wrote nist-ssdf.json: ${groupCount} groups, ${practiceCount} practices, ${taskCount} tasks`
);
console.log(`Tasks with NIST 800-53 mappings: ${tasksWithNist} / ${taskCount}`);
console.log(
  `External frameworks referenced: ${
    new Set(
      out.groups
        .flatMap((g) => g.practices.flatMap((p) => p.tasks))
        .flatMap((t) => Object.keys(t.references))
    ).size
  }`
);
