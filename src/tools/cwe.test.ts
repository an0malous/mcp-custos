import { describe, expect, test } from "bun:test";
import {
  lookupCwe,
  searchCwe,
  listCweTop25,
  cweMapToControls,
} from "./cwe.js";

describe("CWE full corpus", () => {
  test("lookup CWE-79 resolves with curated overlay fields", async () => {
    const r = (await lookupCwe("CWE-79")) as {
      id: string;
      name: string;
      rank_2024?: number;
    };
    expect(r).not.toBeNull();
    expect(r.id).toBe("CWE-79");
    expect(r.name.toLowerCase()).toContain("cross-site scripting");
    expect(r.rank_2024).toBe(1);
  });

  test("bare number normalizes (79 → CWE-79)", async () => {
    const r = (await lookupCwe("79")) as { id: string };
    expect(r.id).toBe("CWE-79");
  });

  test("beyond-curated ID resolves (CWE-611 XXE)", async () => {
    const r = (await lookupCwe("CWE-611")) as {
      id: string;
      description: string;
    };
    expect(r).not.toBeNull();
    expect(r.id).toBe("CWE-611");
    expect(r.description.length).toBeGreaterThan(0);
  });

  test("unknown ID returns null", async () => {
    expect(await lookupCwe("CWE-99999")).toBeNull();
  });

  test("summary excludes heavy fields and signals detail", async () => {
    const r = (await lookupCwe("CWE-89")) as Record<string, unknown>;
    expect(r.demonstrative_examples).toBeUndefined();
    expect(r.potential_mitigations).toBeUndefined();
    expect(r.detection_methods).toBeUndefined();
    expect(r.mitigation_count as number).toBeGreaterThan(0);
    expect(r.has_examples).toBe(true);
    expect(String(r.detail_hint)).toContain("detailed=true");
  });

  test("detailed lookup returns official MITRE guidance for CWE-89", async () => {
    const r = (await lookupCwe("CWE-89", true)) as {
      potential_mitigations: Array<{ phase?: string; description: string }>;
      demonstrative_examples: Array<{ body: string }>;
      detection_methods: Array<{ method: string }>;
      related_cwes: Array<{ nature: string; id: string }>;
      observed_examples: Array<{ cve: string }>;
    };
    expect(r.potential_mitigations.length).toBeGreaterThan(2);
    const all = r.potential_mitigations.map((m) => m.description).join(" ");
    expect(all).toContain("prepared statements");
    expect(r.potential_mitigations.some((m) => m.phase)).toBe(true);
    expect(r.demonstrative_examples.length).toBeGreaterThan(0);
    expect(r.detection_methods.length).toBeGreaterThan(0);
    expect(r.related_cwes.length).toBeGreaterThan(0);
    expect(r.observed_examples[0]?.cve).toMatch(/^CVE-/);
  });

  test("search matches description text across full corpus", async () => {
    const r = await searchCwe("deserialization", 50);
    expect(r.results.map((w) => w.id)).toContain("CWE-502");
    // "clickjacking" appears only in extended description text — proves
    // matching goes beyond name/id/owasp fields.
    const r2 = await searchCwe("clickjacking", 20);
    expect(r2.results.map((w) => w.id)).toContain("CWE-451");
  });

  test("search returns summaries only", async () => {
    const r = await searchCwe("injection", 5);
    expect(r.results.length).toBeGreaterThan(0);
    for (const w of r.results as Array<Record<string, unknown>>) {
      expect(w.potential_mitigations).toBeUndefined();
      expect(w.mitigation_count).toBeDefined();
    }
  });

  test("top 25 returns exactly 25 ranked entries in rank order", async () => {
    const r = await listCweTop25();
    expect(r.length).toBe(25);
    expect(r[0].rank_2024).toBe(1);
    expect(r[24].rank_2024).toBe(25);
  });

  test("map_to_controls keeps curated mappings + caveat, adds relations", async () => {
    const r = (await cweMapToControls("CWE-89"))!;
    expect(r.mitigating_nist_families).toContain("SI-10");
    expect(r.mitigating_asvs_chapters).toContain("V2");
    expect(r.note).toContain("curated");
    expect(r.related_cwes.length).toBeGreaterThan(0);
    expect(r.related_cwes[0].id).toMatch(/^CWE-\d+$/);
  });

  test("map_to_controls unknown id returns null", async () => {
    expect(await cweMapToControls("CWE-99999")).toBeNull();
  });

  test("uncurated weakness maps with empty curated arrays, not undefined", async () => {
    const r = (await cweMapToControls("CWE-611"))!;
    expect(r.mitigating_asvs_chapters).toEqual([]);
    expect(r.related_cwes.length).toBeGreaterThan(0);
  });
});
