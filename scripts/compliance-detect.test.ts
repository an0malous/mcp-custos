import { describe, expect, test } from "bun:test";
import {
  detect,
  pathIsSecurity,
  pathShouldSkip,
  pathDomain,
  findKeywords,
  hasCitation,
  resolveConfig,
} from "./_compliance-detect.js";

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
    ["src/utils/format.ts", null],
  ])("%s → domain: %p", (path, expected) => {
    expect(pathDomain(path)).toBe(expected);
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
