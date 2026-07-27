import { paginate } from "./_shared.js";

// Runtime view of the dataset produced by scripts/_cwe.ts (schema kept in
// sync by the tool tests; src/ does not import script code).
interface CweWeakness {
  id: string;
  name: string;
  abstraction: string;
  status: string;
  description: string;
  extended_description?: string;
  potential_mitigations: Array<{
    phase?: string;
    strategy?: string;
    description: string;
  }>;
  demonstrative_examples: Array<{ language?: string; body: string }>;
  detection_methods: Array<{
    method: string;
    description: string;
    effectiveness?: string;
  }>;
  related_cwes: Array<{ nature: string; id: string }>;
  observed_examples: Array<{ cve: string; description: string; link?: string }>;
  rank_2024?: number;
  owasp_top10?: string;
  asvs_chapters?: string[];
  nist_families?: string[];
}

interface CweData {
  source: string;
  url: string;
  catalog_version: string;
  note: string;
  weaknesses: CweWeakness[];
}

let data: CweData | null = null;

async function load(): Promise<CweData> {
  if (data) return data;
  const file = Bun.file(
    new URL("../data/cwe.json", import.meta.url).pathname
  );
  data = (await file.json()) as CweData;
  return data;
}

function normalizeId(id: string): string {
  return id.trim().toUpperCase().replace(/^(?:CWE-?)?/, "CWE-");
}

function firstParagraph(text: string): string {
  return text.split("\n\n")[0] ?? "";
}

function summarize(w: CweWeakness) {
  return {
    id: w.id,
    name: w.name,
    rank_2024: w.rank_2024,
    owasp_top10: w.owasp_top10,
    description: firstParagraph(w.description),
    mitigation_count: w.potential_mitigations.length,
    has_examples: w.demonstrative_examples.length > 0,
    detail_hint:
      "Call cwe_lookup with detailed=true for mitigations, code examples, detection methods, and relations.",
  };
}

export async function lookupCwe(rawId: string, detailed: boolean = false) {
  const d = await load();
  const id = normalizeId(rawId);
  const w = d.weaknesses.find((x) => x.id === id);
  if (!w) return null;
  return detailed ? w : summarize(w);
}

export async function searchCwe(query: string, limit: number = 20) {
  const d = await load();
  const q = query.toLowerCase();
  const matches = d.weaknesses.filter(
    (w) =>
      w.name.toLowerCase().includes(q) ||
      w.id.toLowerCase().includes(q) ||
      w.description.toLowerCase().includes(q) ||
      (w.extended_description ?? "").toLowerCase().includes(q) ||
      (w.owasp_top10 ?? "").toLowerCase().includes(q)
  );
  return paginate(matches, limit, summarize);
}

export async function listCweTop25() {
  const d = await load();
  return d.weaknesses
    .filter((w) => w.rank_2024 !== undefined)
    .sort((a, b) => (a.rank_2024 ?? 99) - (b.rank_2024 ?? 99))
    .map(summarize);
}

/**
 * Map a CWE id to ASVS chapters and NIST 800-53 control families. Use this
 * to bridge security-scanner output (CWE) to the controls that mitigate it.
 */
export async function cweMapToControls(rawId: string) {
  const d = await load();
  const id = normalizeId(rawId);
  const w = d.weaknesses.find((x) => x.id === id);
  if (!w) return null;
  return {
    cwe: { id: w.id, name: w.name },
    owasp_top10: w.owasp_top10 ?? null,
    mitigating_asvs_chapters: w.asvs_chapters ?? [],
    mitigating_nist_families: w.nist_families ?? [],
    related_cwes: w.related_cwes,
    note: "ASVS chapters and NIST families are curated starter pointers, not an official crosswalk. Use asvs_list_by_chapter and nist_list_family for specific requirements/controls under each. related_cwes are official MITRE relations.",
  };
}
