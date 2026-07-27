import { describe, expect, test } from "bun:test";
import { lookupControl, searchControls, listByCategory } from "./controls.js";
import {
  lookupNistControl,
  searchNistControls,
  listNistFamily,
  normalizeNistId,
  citationForm,
} from "./nist.js";
import { lookupCloudControl, searchCloudControls } from "./cloud.js";
import { lookupNistCloudTopic, searchNistCloudTopics } from "./nist-cloud.js";

describe("ISO 27001", () => {
  test("lookupControl A.8.24 resolves to crypto NIST controls", async () => {
    const r = await lookupControl("A.8.24");
    expect(r).not.toBeNull();
    expect(r!.iso_control.id).toBe("A.8.24");
    const ids = r!.mapped_nist_controls.map((c) => c.nist_id);
    expect(ids).toEqual(expect.arrayContaining(["SC-12", "SC-13"]));
  });

  test("lookupControl returns null for unknown id", async () => {
    expect(await lookupControl("A.99.99")).toBeNull();
  });

  test("searchControls respects limit and reports total", async () => {
    const all = await searchControls("a", 200);
    const capped = await searchControls("a", 3);
    expect(capped.results.length).toBeLessThanOrEqual(3);
    expect(capped.total).toBe(all.total);
    expect(all.total).toBeGreaterThan(3);
  });

  test("listByCategory A.5 returns controls", async () => {
    const r = await listByCategory("A.5");
    expect(r).not.toBeNull();
    expect(r!.length).toBeGreaterThan(0);
  });
});

describe("NIST 800-53", () => {
  test("lookup AC-1 returns Policy and Procedures", async () => {
    const r = (await lookupNistControl("AC-1")) as { id: string; title: string };
    expect(r.id).toBe("AC-1");
    expect(r.title.toLowerCase()).toContain("policy");
  });

  test("normalizes underscore to dash (AC_1 → AC-1)", async () => {
    const r = (await lookupNistControl("ac_1")) as { id: string };
    expect(r.id).toBe("AC-1");
  });

  test("searchNistControls limit caps results", async () => {
    const r = await searchNistControls("access", 5);
    expect(r.results.length).toBeLessThanOrEqual(5);
    expect(r.total).toBeGreaterThanOrEqual(r.results.length);
  });

  test("listNistFamily AC returns controls", async () => {
    const r = await listNistFamily("AC");
    expect(r).not.toBeNull();
    expect(r!.length).toBeGreaterThan(0);
  });

  test("enhancement lookup accepts citation form IA-5(1)", async () => {
    const r = (await lookupNistControl("IA-5(1)")) as {
      id: string;
      cite_as: string;
      title: string;
      statement: string;
    };
    expect(r).not.toBeNull();
    expect(r.id).toBe("IA-5.1");
    expect(r.cite_as).toBe("IA-5(1)");
    expect(r.title.toLowerCase()).toContain("password");
    expect(r.statement.length).toBeGreaterThan(0);
  });

  test("enhancement lookup accepts OSCAL dot form IA-5.1", async () => {
    const dot = (await lookupNistControl("IA-5.1")) as { id: string };
    const paren = (await lookupNistControl("IA-5(1)")) as { id: string };
    expect(dot.id).toBe(paren.id);
  });

  test("normalizeNistId and citationForm round-trip", () => {
    expect(normalizeNistId(" ia_5(1) ")).toBe("IA-5.1");
    expect(citationForm("IA-5.1")).toBe("IA-5(1)");
    expect(citationForm("AC-1")).toBe("AC-1");
  });

  test("withdrawn control returns marker, not blank guidance", async () => {
    const r = (await lookupNistControl("AC-13")) as {
      withdrawn?: boolean;
      statement?: string;
    };
    expect(r).not.toBeNull();
    expect(r.withdrawn).toBe(true);
    expect(r.statement).toBeUndefined();
  });

  test("search excludes withdrawn entries", async () => {
    const r = await searchNistControls("review", 200);
    const ids = r.results.map((c) => c.id);
    expect(ids).not.toContain("AC-13");
    for (const c of r.results) {
      expect(c.statement.length).toBeGreaterThan(0);
    }
  });

  test("detailed lookup filters withdrawn enhancements", async () => {
    const r = (await lookupNistControl("AC-2", true)) as {
      enhancements: Array<{ id: string; statement: string; cite_as: string }>;
    };
    const ids = r.enhancements.map((e) => e.id);
    expect(ids).not.toContain("AC-2.10");
    for (const e of r.enhancements) {
      expect(e.statement.length).toBeGreaterThan(0);
      expect(e.cite_as).toMatch(/^AC-2\(\d+\)$/);
    }
  });

  test("listNistFamily excludes withdrawn controls", async () => {
    const r = (await listNistFamily("AC")) as Array<{ id: string }>;
    expect(r.map((c) => c.id)).not.toContain("AC-13");
  });
});

describe("ISO 27017 cloud", () => {
  test("lookupCloudControl CLD.6.3.1 resolves nist_refs", async () => {
    const r = await lookupCloudControl("CLD.6.3.1");
    expect(r).not.toBeNull();
    expect(r!.id).toBe("CLD.6.3.1");
    expect(r!.nist_cloud_guidance.length).toBeGreaterThan(0);
  });

  test("searchCloudControls returns shape with total/results", async () => {
    const r = await searchCloudControls("cloud", 10);
    expect(r).toHaveProperty("total");
    expect(r).toHaveProperty("results");
    expect(r.results.length).toBeLessThanOrEqual(10);
  });
});

describe("NIST cloud guidance", () => {
  test("lookupNistCloudTopic SP800-210.3.1 found", async () => {
    const r = await lookupNistCloudTopic("SP800-210.3.1");
    expect(r).not.toBeNull();
    expect(r!.id).toBe("SP800-210.3.1");
  });

  test("searchNistCloudTopics caps to limit", async () => {
    const r = await searchNistCloudTopics("cloud", 3);
    expect(r.results.length).toBeLessThanOrEqual(3);
  });
});
