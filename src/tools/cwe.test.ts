import { describe, expect, test } from "bun:test";
import {
  lookupCwe,
  searchCwe,
  listCweTop25,
  cweMapToControls,
} from "./cwe.js";

describe("CWE", () => {
  test("lookup CWE-79 returns XSS", async () => {
    const r = await lookupCwe("CWE-79");
    expect(r).not.toBeNull();
    expect(r!.name.toLowerCase()).toContain("cross-site scripting");
  });

  test("normalizes id without prefix (79 → CWE-79)", async () => {
    const r = await lookupCwe("79");
    expect(r).not.toBeNull();
    expect(r!.id).toBe("CWE-79");
  });

  test("listCweTop25 returns 25 ranked entries", async () => {
    const r = await listCweTop25();
    expect(r.length).toBe(25);
    expect(r[0].rank_2024).toBe(1);
    expect(r[24].rank_2024).toBe(25);
  });

  test("searchCwe finds by OWASP category", async () => {
    const r = await searchCwe("injection", 50);
    const ids = r.results.map((w) => w.id);
    expect(ids).toContain("CWE-79");
    expect(ids).toContain("CWE-89");
  });

  test("cweMapToControls returns NIST families and ASVS chapters", async () => {
    const r = await cweMapToControls("CWE-89");
    expect(r).not.toBeNull();
    expect(r!.mitigating_nist_families).toContain("SI-10");
    expect(r!.mitigating_asvs_chapters).toContain("V2");
  });

  test("cweMapToControls returns null for unknown id", async () => {
    expect(await cweMapToControls("CWE-99999")).toBeNull();
  });
});
