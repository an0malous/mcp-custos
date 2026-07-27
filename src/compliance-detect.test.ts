import { describe, expect, test } from "bun:test";
import {
  detect,
  pathIsSecurity,
  pathShouldSkip,
  pathDomain,
  findKeywords,
  hasCitation,
  extractCitations,
  resolveConfig,
  CONCERN_CWES,
  mitigationHint,
  formatConcernLine,
} from "./compliance-detect.js";
import { lookupCwe } from "./tools/cwe.js";

describe("path detection", () => {
  test.each([
    ["src/auth/login.ts", true],
    ["src/authn/oauth.ts", true],
    ["src/authz/policy.ts", true],
    ["src/crypto/aes.ts", true],
    ["src/iam/roles.ts", true],
    ["src/secrets/vault.ts", true],
    ["src/oauth/callback.ts", true],
    ["src/session/store.ts", true],
    ["src/tls/cert-loader.ts", true],
    ["src/utils/format.ts", false],
    ["src/api/users.ts", false],
    ["README.md", false],
    ["src/components/Button.tsx", false],
  ])("%s → security path: %p", (path, expected) => {
    expect(pathIsSecurity(path)).toBe(expected);
  });

  test.each([
    ["bun.lock", true],
    ["package-lock.json", true],
    ["README.md", true],
    ["docs/guide.mdx", true],
    ["styles/main.css", true],
    ["assets/logo.svg", true],
    [".gitignore", true],
    [".prettierrc.json", true],
    ["src/auth/login.ts", false],
  ])("%s → skip: %p", (path, expected) => {
    expect(pathShouldSkip(path)).toBe(expected);
  });

  test.each([
    ["src/auth/login.ts", "auth"],
    ["src/crypto/aes.ts", "crypto"],
    ["src/secrets/vault.ts", "secrets"],
    ["src/iam/roles.ts", "iam"],
    ["src/oauth/callback.ts", "oauth"],
    ["src/session/store.ts", "session"],
    ["src/tls/cert.ts", "tls"],
    // key material maps to crypto (previously resolved to null)
    ["src/keys/rotate.ts", "crypto"],
    ["src/api-key/issue.ts", "crypto"],
    ["src/utils/format.ts", null],
  ])("%s → domain: %p", (path, expected) => {
    expect(pathDomain(path)).toBe(expected);
  });

  test.each([
    ["src/keys/rotate.ts", true],
    ["src/utils/format.ts", false],
  ])("%s → firing unchanged by domain mapping: %p", (path, expected) => {
    expect(pathIsSecurity(path)).toBe(expected);
  });
});

describe("keyword detection", () => {
  test("matches high-confidence keywords", () => {
    const content = `
      const hash = await bcrypt.hash(password);
      const token = signJWT(user);
    `;
    const found = findKeywords(content);
    expect(found).toContain("password");
    expect(found).toContain("bcrypt");
    expect(found).toContain("JWT");
  });

  test("does not match common words", () => {
    const content = `
      function authorize() { /* nope */ }
      const token = parseToken();
      const session = openDbSession();
    `;
    const found = findKeywords(content);
    expect(found).toEqual([]);
  });

  test("matches case-sensitive constants", () => {
    expect(findKeywords("const API_KEY = process.env.API_KEY")).toContain(
      "API_KEY"
    );
    expect(findKeywords("private_key = read('id_rsa')")).toContain(
      "private_key"
    );
  });
});

describe("citation detection", () => {
  test("matches // Refs: NIST", () => {
    expect(hasCitation("// Refs: NIST SC-13, IA-5(1)")).toBe(true);
  });

  test("matches // Compliance: NIST", () => {
    expect(hasCitation("// Compliance: NIST AU-2")).toBe(true);
  });

  test("matches ASVS citation", () => {
    expect(hasCitation("// Refs: ASVS V11.1.1")).toBe(true);
  });

  test("matches commit-message style Refs:", () => {
    expect(hasCitation("Refs: NIST IA-5\nCloses #123")).toBe(true);
  });

  test("does not match unrelated 'refs'", () => {
    expect(hasCitation("// see refs above")).toBe(false);
  });

  test("does not match without framework id", () => {
    expect(hasCitation("// Refs: see above")).toBe(false);
  });

  test("matches SQL/Lua/Haskell -- comment", () => {
    expect(hasCitation("-- Refs: NIST AC-2")).toBe(true);
    expect(hasCitation("ALTER TABLE x;\n-- Refs: NIST AC-3")).toBe(true);
  });

  test("matches Python/Ruby/Shell # comment", () => {
    expect(hasCitation("# Refs: NIST IA-5(1)")).toBe(true);
  });

  test("matches /* C-style block comment */", () => {
    expect(hasCitation("/* Refs: NIST SC-13 */")).toBe(true);
  });

  test("matches *-prefixed JSDoc line", () => {
    expect(hasCitation("  * Refs: ASVS V6.2.5")).toBe(true);
  });
});

describe("extractCitations", () => {
  test("pulls NIST and ASVS ids from mixed content", () => {
    const r = extractCitations(
      "// Refs: NIST SC-13, NIST IA-5(1), ASVS V6.2.5"
    );
    expect(r.nist).toEqual(["SC-13", "IA-5(1)"]);
    expect(r.asvs).toEqual(["V6.2.5"]);
  });

  test("extracts across multiple comment leaders in one file", () => {
    const r = extractCitations([
      "-- Refs: NIST AC-2",
      "# Refs: NIST IA-2",
      "// Refs: ASVS V11.1.1",
    ].join("\n"));
    expect(r.nist).toEqual(["AC-2", "IA-2"]);
    expect(r.asvs).toEqual(["V11.1.1"]);
  });

  test("returns empty arrays for content without citations", () => {
    const r = extractCitations("function login() {}");
    expect(r.nist).toEqual([]);
    expect(r.asvs).toEqual([]);
  });
});

describe("detect (integration)", () => {
  test("auth path fires", () => {
    const r = detect("src/auth/login.ts", "function login() {}");
    expect(r.fired).toBe(true);
    expect(r.reason).toBe("path");
    expect(r.domain).toBe("auth");
  });

  test("non-security path with keyword fires", () => {
    const r = detect(
      "src/users/store.ts",
      "const hashed = await bcrypt.hash(password);"
    );
    expect(r.fired).toBe(true);
    expect(r.reason).toBe("keyword");
    expect(r.matchedKeywords).toContain("bcrypt");
  });

  test("skip-path never fires", () => {
    const r = detect("README.md", "password is mentioned here");
    expect(r.fired).toBe(false);
  });

  test("citation suppresses fire signal indirectly", () => {
    const r = detect(
      "src/auth/login.ts",
      "// Refs: NIST IA-5\nfunction login() {}"
    );
    expect(r.fired).toBe(true);
    expect(r.hasCitation).toBe(true);
  });

  test("non-security path with no keywords does not fire", () => {
    const r = detect("src/utils/format.ts", "export function fmt() {}");
    expect(r.fired).toBe(false);
  });
});

describe("project config overrides", () => {
  test("add_paths extends defaults", () => {
    const cfg = resolveConfig({ add_paths: ["billing"] });
    const r = detect("src/billing/charge.ts", "x", undefined, cfg);
    expect(r.fired).toBe(true);
    const baseline = detect("src/billing/charge.ts", "x");
    expect(baseline.fired).toBe(false);
  });

  test("add_keywords extends defaults", () => {
    const cfg = resolveConfig({ add_keywords: ["webhook"] });
    const r = detect(
      "src/utils/x.ts",
      "// register webhook for events",
      undefined,
      cfg
    );
    expect(r.fired).toBe(true);
    expect(r.matchedKeywords).toContain("webhook");
  });

  test("add_skip_paths excludes additional paths", () => {
    const cfg = resolveConfig({ add_skip_paths: ["src/auth/legacy"] });
    const r = detect("src/auth/legacy/old.ts", "password", undefined, cfg);
    expect(r.fired).toBe(false);
  });

  test("replace_paths wholesale replaces defaults", () => {
    const cfg = resolveConfig({ replace_paths: ["billing"] });
    const r = detect("src/auth/login.ts", "x", undefined, cfg);
    expect(r.fired).toBe(false); // auth no longer in path list
  });
});

describe("mitigation hints (hook-mitigation-surfacing)", () => {
  test("every mapped CWE exists in the bundled corpus", async () => {
    for (const cweId of new Set(Object.values(CONCERN_CWES))) {
      expect(await lookupCwe(cweId)).not.toBeNull();
    }
  });

  test("all default detection domains are mapped", () => {
    for (const domain of ["auth", "crypto", "secrets", "iam", "oauth", "session", "tls"]) {
      expect(CONCERN_CWES[domain]).toBeDefined();
    }
  });

  test("domain token yields an attributed, bounded hint", async () => {
    const hint = await mitigationHint("domain:tls");
    expect(hint).toStartWith("CWE-319: ");
    expect(hint.length).toBeLessThanOrEqual("CWE-319: ".length + 221);
  });

  test("keyword token normalizes case (kw:JWT → CWE-347 mapping)", async () => {
    // CWE-347 ships no mitigations upstream, so the hint degrades to "" —
    // the mapping itself is still exercised via the map key.
    expect(CONCERN_CWES.jwt).toBe("CWE-347");
    expect(await mitigationHint("kw:JWT")).toBe("");
  });

  test("bcrypt keyword prefers implementation-phase mitigation", async () => {
    const hint = await mitigationHint("kw:bcrypt");
    expect(hint).toStartWith("CWE-916: ");
    const w = (await lookupCwe("CWE-916", true)) as {
      potential_mitigations: Array<{ phase?: string; description: string }>;
    };
    const impl = w.potential_mitigations.find((m) =>
      m.phase?.includes("Implementation")
    )!;
    expect(hint).toContain(impl.description.replace(/\s+/g, " ").slice(0, 60));
  });

  test("unmapped concern yields empty hint", async () => {
    expect(await mitigationHint("kw:webhook")).toBe("");
    expect(await mitigationHint("path")).toBe("");
  });

  test("formatConcernLine appends mitigation line for mapped concerns", async () => {
    const line = await formatConcernLine("kw:bcrypt", "bcrypt password hashing", "  ");
    const [first, second] = line.split("\n");
    expect(first).toStartWith("  - bcrypt → ");
    expect(second).toStartWith("      ↳ CWE-916: ");
  });

  test("formatConcernLine falls back to single line for unmapped concerns", async () => {
    const line = await formatConcernLine("kw:webhook", "webhook", "  ");
    expect(line.split("\n").length).toBe(1);
    expect(line).toStartWith("  - webhook → ");
  });

  test("gate and nudge render identical guidance for the same concern", async () => {
    const nudge = await formatConcernLine("domain:auth", "auth login", "  ");
    const gate = await formatConcernLine("domain:auth", "auth login", "    ");
    expect(gate.replace(/^ {4}/gm, "  ")).toBe(nudge);
  });
});
