import { paginate } from "./_shared.js";

interface CweEntry {
  id: string;
  name: string;
  rank_2024?: number;
  owasp_top10?: string;
  asvs_chapters: string[];
  nist_families: string[];
}

interface CweData {
  source: string;
  url: string;
  note: string;
  weaknesses: CweEntry[];
}

let data: CweData | null = null;

async function load(): Promise<CweData> {
  if (data) return data;
  const file = Bun.file(
    new URL("../data/cwe-top-weaknesses.json", import.meta.url).pathname
  );
  data = (await file.json()) as CweData;
  return data;
}

function normalizeId(id: string): string {
  const upper = id.trim().toUpperCase();
  return upper.startsWith("CWE-") ? upper : `CWE-${upper.replace(/^CWE/, "")}`;
}

export async function lookupCwe(rawId: string) {
  const d = await load();
  const id = normalizeId(rawId);
  const w = d.weaknesses.find((x) => x.id === id);
  return w ?? null;
}

export async function searchCwe(query: string, limit: number = 20) {
  const d = await load();
  const q = query.toLowerCase();
  const matches = d.weaknesses.filter(
    (w) =>
      w.name.toLowerCase().includes(q) ||
      w.id.toLowerCase().includes(q) ||
      (w.owasp_top10 ?? "").toLowerCase().includes(q)
  );
  return paginate(matches, limit, (w) => w);
}

export async function listCweTop25() {
  const d = await load();
  return d.weaknesses
    .filter((w) => w.rank_2024 !== undefined)
    .sort((a, b) => (a.rank_2024 ?? 99) - (b.rank_2024 ?? 99));
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
    mitigating_asvs_chapters: w.asvs_chapters,
    mitigating_nist_families: w.nist_families,
    note: "ASVS chapters and NIST families are starter pointers. Use asvs_list_by_chapter and nist_list_family for specific requirements/controls under each.",
  };
}
