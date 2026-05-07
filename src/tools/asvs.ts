import { paginate } from "./_shared.js";

interface AsvsRequirement {
  Shortcode: string;
  Ordinal: number;
  Description: string;
  L: string;
}

interface AsvsSection {
  Shortcode: string;
  Ordinal: number;
  Name: string;
  Items: AsvsRequirement[];
}

interface AsvsChapter {
  Shortcode: string;
  Ordinal: number;
  ShortName: string;
  Name: string;
  Items: AsvsSection[];
}

interface AsvsData {
  Name: string;
  ShortName: string;
  Version: string;
  Description: string;
  Requirements: AsvsChapter[];
}

let data: AsvsData | null = null;

async function load(): Promise<AsvsData> {
  if (data) return data;
  const file = Bun.file(
    new URL("../data/owasp-asvs.json", import.meta.url).pathname
  );
  data = (await file.json()) as AsvsData;
  return data;
}

function allRequirements(d: AsvsData) {
  const out: Array<{
    id: string;
    description: string;
    level: string;
    chapter: string;
    section: string;
  }> = [];
  for (const ch of d.Requirements) {
    for (const sec of ch.Items) {
      for (const r of sec.Items) {
        out.push({
          id: r.Shortcode,
          description: r.Description,
          level: r.L,
          chapter: ch.Shortcode + " " + ch.Name,
          section: sec.Shortcode + " " + sec.Name,
        });
      }
    }
  }
  return out;
}

function normalizeId(id: string): string {
  const upper = id.trim().toUpperCase();
  return /^\d/.test(upper) ? "V" + upper : upper;
}

export async function lookupAsvs(rawId: string) {
  const d = await load();
  const id = normalizeId(rawId);

  const ch = d.Requirements.find((c) => c.Shortcode === id);
  if (ch) {
    const reqCount = ch.Items.reduce((s, sec) => s + sec.Items.length, 0);
    return {
      kind: "chapter" as const,
      id: ch.Shortcode,
      name: ch.Name,
      sections: ch.Items.map((s) => ({
        id: s.Shortcode,
        name: s.Name,
        requirement_count: s.Items.length,
      })),
      requirement_count: reqCount,
    };
  }

  for (const c of d.Requirements) {
    const sec = c.Items.find((s) => s.Shortcode === id);
    if (sec) {
      return {
        kind: "section" as const,
        id: sec.Shortcode,
        name: sec.Name,
        chapter: c.Shortcode + " " + c.Name,
        requirements: sec.Items.map((r) => ({
          id: r.Shortcode,
          description: r.Description,
          level: r.L,
        })),
      };
    }
  }

  for (const c of d.Requirements) {
    for (const sec of c.Items) {
      const r = sec.Items.find((x) => x.Shortcode === id);
      if (r) {
        return {
          kind: "requirement" as const,
          id: r.Shortcode,
          description: r.Description,
          level: r.L,
          chapter: c.Shortcode + " " + c.Name,
          section: sec.Shortcode + " " + sec.Name,
        };
      }
    }
  }

  return null;
}

export async function searchAsvs(
  query: string,
  level?: string,
  limit: number = 20
) {
  const d = await load();
  const q = query.toLowerCase();
  const all = allRequirements(d);
  const matches = all.filter(
    (r) =>
      (level == null || r.level === String(level)) &&
      (r.description.toLowerCase().includes(q) ||
        r.section.toLowerCase().includes(q) ||
        r.chapter.toLowerCase().includes(q))
  );
  return paginate(matches, limit, (r) => r);
}

export async function listAsvsByChapter(rawId: string, level?: string) {
  const d = await load();
  const id = normalizeId(rawId);
  const ch = d.Requirements.find((c) => c.Shortcode === id);
  if (!ch) return null;
  const requirements: Array<{
    id: string;
    description: string;
    level: string;
    section: string;
  }> = [];
  for (const sec of ch.Items) {
    for (const r of sec.Items) {
      if (level != null && r.L !== String(level)) continue;
      requirements.push({
        id: r.Shortcode,
        description: r.Description,
        level: r.L,
        section: sec.Shortcode + " " + sec.Name,
      });
    }
  }
  return {
    id: ch.Shortcode,
    name: ch.Name,
    requirements,
    requirement_count: requirements.length,
  };
}

export async function listAsvsChapters() {
  const d = await load();
  return {
    standard: d.Name,
    version: d.Version,
    chapters: d.Requirements.map((c) => {
      const reqCount = c.Items.reduce((s, sec) => s + sec.Items.length, 0);
      return {
        id: c.Shortcode,
        name: c.Name,
        section_count: c.Items.length,
        requirement_count: reqCount,
      };
    }),
  };
}
