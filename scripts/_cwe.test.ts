import { describe, expect, test } from "bun:test";
import { parseCwecXml, buildDataset } from "./_cwe.js";
import type { CweCuratedOverlay } from "./_cwe.js";

const fixtureXml = await Bun.file(
  new URL("./fixtures/cwec-sample.xml", import.meta.url).pathname
).text();

const parsed = parseCwecXml(fixtureXml);

describe("parseCwecXml", () => {
  test("captures catalog version", () => {
    expect(parsed.catalogVersion).toBe("4.20");
  });

  test("excludes Deprecated entries (fixture contains CWE-1187)", () => {
    const ids = parsed.weaknesses.map((w) => w.id);
    expect(ids).toContain("CWE-89");
    expect(ids).toContain("CWE-79");
    expect(ids).not.toContain("CWE-1187");
  });

  test("extracts description and extended description verbatim", () => {
    const w = parsed.weaknesses.find((x) => x.id === "CWE-89")!;
    expect(w.name).toContain("SQL");
    expect(w.description).toContain(
      "constructs all or part of an SQL command"
    );
    const x79 = parsed.weaknesses.find((x) => x.id === "CWE-79")!;
    expect(x79.extended_description).toContain(
      "many variants of cross-site scripting"
    );
  });

  test("extracts mitigations with phase and strategy", () => {
    const w = parsed.weaknesses.find((x) => x.id === "CWE-89")!;
    expect(w.potential_mitigations.length).toBeGreaterThan(2);
    const param = w.potential_mitigations.find(
      (m) => m.strategy === "Parameterization"
    );
    expect(param).toBeDefined();
    expect(param!.phase).toContain("Architecture and Design");
    expect(param!.description).toContain("prepared statements");
  });

  test("extracts demonstrative examples with language labels and code", () => {
    const w = parsed.weaknesses.find((x) => x.id === "CWE-89")!;
    expect(w.demonstrative_examples.length).toBeGreaterThan(1);
    const withCode = w.demonstrative_examples.find((e) =>
      e.body.includes("DELETE FROM items")
    );
    expect(withCode).toBeDefined();
    expect(w.demonstrative_examples.some((e) => e.language)).toBe(true);
  });

  test("extracts detection methods", () => {
    const w = parsed.weaknesses.find((x) => x.id === "CWE-89")!;
    const methods = w.detection_methods.map((d) => d.method);
    expect(methods).toContain("Automated Static Analysis");
  });

  test("extracts relations and observed CVEs", () => {
    const w = parsed.weaknesses.find((x) => x.id === "CWE-89")!;
    expect(w.related_cwes).toContainEqual({
      nature: "ChildOf",
      id: "CWE-943",
    });
    expect(w.observed_examples.length).toBeGreaterThan(0);
    expect(w.observed_examples[0].cve).toMatch(/^CVE-/);
  });
});

describe("buildDataset overlay merge", () => {
  const overlay: CweCuratedOverlay = {
    note: "curated",
    weaknesses: [
      {
        id: "CWE-89",
        rank_2024: 3,
        owasp_top10: "A03:2021-Injection",
        asvs_chapters: ["V1", "V2"],
        nist_families: ["SI-10"],
      },
      {
        id: "CWE-99999",
        asvs_chapters: ["V9"],
        nist_families: ["SC-8"],
      },
    ],
  };
  const ds = buildDataset(parsed, overlay);

  test("attaches curated fields to matching weaknesses", () => {
    const w = ds.weaknesses.find((x) => x.id === "CWE-89")!;
    expect(w.rank_2024).toBe(3);
    expect(w.asvs_chapters).toEqual(["V1", "V2"]);
    expect(w.potential_mitigations.length).toBeGreaterThan(0);
  });

  test("keeps overlay-only entries instead of dropping curation", () => {
    const orphan = ds.weaknesses.find((x) => x.id === "CWE-99999")!;
    expect(orphan.status).toBe("OverlayOnly");
    expect(orphan.nist_families).toEqual(["SC-8"]);
  });

  test("records provenance metadata", () => {
    expect(ds.catalog_version).toBe("4.20");
    expect(ds.source).toContain("MITRE CWE");
    expect(ds.note).toContain("project-curated");
  });

  test("uncurated weaknesses carry no overlay fields", () => {
    const w = ds.weaknesses.find((x) => x.id === "CWE-79")!;
    expect(w.rank_2024).toBeUndefined();
  });
});
