import { describe, expect, test } from "bun:test";
import { lookupControl, searchControls, listByCategory } from "./controls.js";
import { lookupNistControl, searchNistControls, listNistFamily } from "./nist.js";
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
