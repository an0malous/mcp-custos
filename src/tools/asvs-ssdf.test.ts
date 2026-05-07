import { describe, expect, test } from "bun:test";
import {
  lookupAsvs,
  searchAsvs,
  listAsvsByChapter,
  listAsvsChapters,
} from "./asvs.js";
import {
  lookupSsdf,
  searchSsdf,
  listSsdfByGroup,
  listSsdfGroups,
  ssdfMapToNist,
  ssdfMapFromNist,
  ssdfExternalRefs,
} from "./ssdf.js";
import { tokenize, controlsForChange } from "./meta.js";

describe("ASVS", () => {
  test("lookup chapter V11 returns Cryptography", async () => {
    const r = await lookupAsvs("V11");
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("chapter");
    if (r!.kind === "chapter") {
      expect(r!.name.toLowerCase()).toContain("cryptography");
      expect(r!.requirement_count).toBeGreaterThan(0);
    }
  });

  test("lookup requirement V11.1.1 returns full description", async () => {
    const r = await lookupAsvs("V11.1.1");
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("requirement");
    if (r!.kind === "requirement") {
      expect(r!.id).toBe("V11.1.1");
      expect(r!.description.length).toBeGreaterThan(20);
      expect(["1", "2", "3"]).toContain(r!.level);
    }
  });

  test("normalizes id without V prefix (11.1.1 → V11.1.1)", async () => {
    const r = await lookupAsvs("11.1.1");
    expect(r).not.toBeNull();
    if (r && r.kind === "requirement") expect(r.id).toBe("V11.1.1");
  });

  test("lookup unknown id returns null", async () => {
    expect(await lookupAsvs("V99.99.99")).toBeNull();
  });

  test("searchAsvs filters by level", async () => {
    const all = await searchAsvs("password", undefined, 200);
    const l1 = await searchAsvs("password", "1", 200);
    expect(l1.results.every((r) => r.level === "1")).toBe(true);
    expect(l1.total).toBeLessThanOrEqual(all.total);
  });

  test("searchAsvs respects limit", async () => {
    const r = await searchAsvs("token", undefined, 3);
    expect(r.results.length).toBeLessThanOrEqual(3);
  });

  test("listAsvsByChapter V6 returns auth requirements", async () => {
    const r = await listAsvsByChapter("V6");
    expect(r).not.toBeNull();
    expect(r!.requirement_count).toBeGreaterThan(0);
  });

  test("listAsvsByChapter level filter narrows results", async () => {
    const all = await listAsvsByChapter("V11");
    const l3 = await listAsvsByChapter("V11", "3");
    expect(l3!.requirement_count).toBeLessThanOrEqual(all!.requirement_count);
    expect(l3!.requirements.every((r) => r.level === "3")).toBe(true);
  });

  test("listAsvsChapters returns all 17 chapters", async () => {
    const r = await listAsvsChapters();
    expect(r.chapters.length).toBe(17);
    expect(r.version).toBe("5.0.0");
  });
});

describe("SSDF", () => {
  test("lookup group PO returns Prepare the Organization", async () => {
    const r = await lookupSsdf("PO");
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("group");
    if (r!.kind === "group") {
      expect(r!.name).toBe("Prepare the Organization");
      expect(r!.practices.length).toBeGreaterThan(0);
    }
  });

  test("lookup practice PO.1 returns its tasks", async () => {
    const r = await lookupSsdf("PO.1");
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("practice");
    if (r!.kind === "practice") {
      expect(r!.tasks.length).toBeGreaterThan(0);
    }
  });

  test("lookup task PO.1.1 returns text and parents", async () => {
    const r = await lookupSsdf("PO.1.1");
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("task");
    if (r!.kind === "task") {
      expect(r!.id).toBe("PO.1.1");
      expect(r!.text.length).toBeGreaterThan(20);
    }
  });

  test("normalizes lowercase id (po.1.1 → PO.1.1)", async () => {
    const r = await lookupSsdf("po.1.1");
    expect(r).not.toBeNull();
    if (r && r.kind === "task") expect(r.id).toBe("PO.1.1");
  });

  test("searchSsdf respects limit", async () => {
    const r = await searchSsdf("vulnerability", 3);
    expect(r.results.length).toBeLessThanOrEqual(3);
  });

  test("listSsdfGroups returns all 4 groups", async () => {
    const r = await listSsdfGroups();
    expect(r.groups.length).toBe(4);
    expect(r.groups.map((g) => g.id).sort()).toEqual(["PO", "PS", "PW", "RV"]);
  });

  test("listSsdfByGroup PW returns practices and tasks", async () => {
    const r = await listSsdfByGroup("PW");
    expect(r).not.toBeNull();
    expect(r!.practices.length).toBeGreaterThan(0);
  });

  test("lookup task includes references map", async () => {
    const r = await lookupSsdf("PO.1.1");
    expect(r).not.toBeNull();
    if (r && r.kind === "task") {
      expect(Object.keys(r.references).length).toBeGreaterThan(0);
      expect(r.references["SP80053"]).toContain("SA-8");
    }
  });
});

describe("SSDF cross-mapping tools", () => {
  test("ssdfMapToNist task PO.1.1 returns expected NIST controls", async () => {
    const r = await ssdfMapToNist("PO.1.1");
    expect(r).not.toBeNull();
    if (r && r.kind === "task") {
      expect(r.nist_controls).toContain("SA-1");
      expect(r.nist_controls).toContain("SA-8");
    }
  });

  test("ssdfMapToNist practice aggregates child task controls", async () => {
    const r = await ssdfMapToNist("PO.1");
    expect(r).not.toBeNull();
    if (r && r.kind === "practice") {
      expect(r.nist_controls.length).toBeGreaterThan(0);
      expect(r.by_task.length).toBeGreaterThan(0);
    }
  });

  test("ssdfMapToNist group aggregates across all tasks", async () => {
    const r = await ssdfMapToNist("PO");
    expect(r).not.toBeNull();
    if (r && r.kind === "group") {
      expect(r.nist_controls.length).toBeGreaterThan(5);
    }
  });

  test("ssdfMapFromNist round-trip: SA-8 → contains PO.1.1", async () => {
    const r = await ssdfMapFromNist("SA-8");
    expect(r).not.toBeNull();
    const ids = r!.ssdf_tasks.map((t) => t.id);
    expect(ids).toContain("PO.1.1");
  });

  test("ssdfMapFromNist normalizes underscores (sa_8 → SA-8)", async () => {
    const r = await ssdfMapFromNist("sa_8");
    expect(r).not.toBeNull();
    expect(r!.nist_control).toBe("SA-8");
  });

  test("ssdfMapFromNist returns null for unknown control", async () => {
    expect(await ssdfMapFromNist("ZZ-99")).toBeNull();
  });

  test("ssdfExternalRefs PO.1.1 returns multiple framework refs", async () => {
    const r = await ssdfExternalRefs("PO.1.1");
    expect(r).not.toBeNull();
    expect(r!.frameworks).toContain("SP80053");
    expect(r!.frameworks).toContain("BSIMM");
    expect(r!.frameworks.length).toBeGreaterThan(5);
  });
});

describe("controls_for_change meta tool", () => {
  test("tokenize drops stopwords and short tokens", () => {
    const t = tokenize("Implementing OAuth login with refresh tokens");
    expect(t).toContain("oauth");
    expect(t).toContain("login");
    expect(t).toContain("refresh");
    expect(t).toContain("tokens");
    expect(t).not.toContain("with");
    expect(t).not.toContain("implementing");
  });

  test("tokenize expands common security abbreviations", () => {
    const mfa = tokenize("Add MFA to login");
    expect(mfa).toContain("mfa");
    expect(mfa).toContain("multi");
    expect(mfa).toContain("factor");
    expect(mfa).toContain("authentication");

    const csrf = tokenize("CSRF protection");
    expect(csrf).toContain("csrf");
    expect(csrf).toContain("cross");
    expect(csrf).toContain("forgery");

    const rbac = tokenize("Wire up RBAC");
    expect(rbac).toContain("rbac");
    expect(rbac).toContain("role");
    expect(rbac).toContain("based");
    expect(rbac).toContain("access");
  });

  test("OAuth/refresh-token query surfaces V10.* and IA-* controls", async () => {
    const r = await controlsForChange(
      "implementing OAuth login with refresh tokens",
      "2",
      8
    );
    expect(r.tokens_used.length).toBeGreaterThan(0);
    const asvsIds = r.asvs.results.map((x: any) => x.id);
    expect(asvsIds.some((id: string) => id.startsWith("V10."))).toBe(true);
    const nistIds = r.nist_800_53.results.map((x: any) => x.id);
    expect(nistIds.some((id: string) => id.startsWith("IA-"))).toBe(true);
  });

  test("vulnerability-process query surfaces SSDF RV/PW practices", async () => {
    const r = await controlsForChange(
      "set up vulnerability disclosure and security review process",
      "2",
      8
    );
    const ssdfIds = r.ssdf.results.map((x: any) => x.id);
    expect(
      ssdfIds.some(
        (id: string) => id.startsWith("RV.") || id.startsWith("PW.")
      )
    ).toBe(true);
  });

  test("results are ranked by match_score (descending)", async () => {
    const r = await controlsForChange("password authentication session", "2", 5);
    const scores = r.asvs.results.map((x: any) => x.match_score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });
});
