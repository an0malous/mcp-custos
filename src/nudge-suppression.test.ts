import { describe, expect, test } from "bun:test";
import {
  concernTokens,
  flagFileName,
  isSuppressed,
  resolveTtlMs,
  DEFAULT_SUPPRESS_TTL_MS,
} from "./nudge-suppression.js";

describe("concernTokens", () => {
  test("keyword-only result yields prefixed keyword tokens in order", () => {
    expect(
      concernTokens({
        matchedKeywords: ["password", "JWT"],
        domain: null,
        reason: "keyword",
      })
    ).toEqual(["kw:password", "kw:JWT"]);
  });

  test("path+domain lists domain first, then keywords", () => {
    expect(
      concernTokens({
        matchedKeywords: ["bcrypt"],
        domain: "auth",
        reason: "path",
      })
    ).toEqual(["domain:auth", "kw:bcrypt"]);
  });

  test("path-only with no domain and no keywords falls back to a single token", () => {
    expect(
      concernTokens({ matchedKeywords: [], domain: null, reason: "path" })
    ).toEqual(["path"]);
  });

  test("de-duplicates repeated tokens while preserving first-seen order", () => {
    expect(
      concernTokens({
        matchedKeywords: ["oauth", "oauth"],
        domain: "oauth",
        reason: "path",
      })
    ).toEqual(["domain:oauth", "kw:oauth"]);
  });

  test("a keyword never collides with a same-named domain", () => {
    const tokens = concernTokens({
      matchedKeywords: ["oauth"],
      domain: "oauth",
      reason: "path",
    });
    expect(new Set(tokens).size).toBe(2);
  });
});

describe("flagFileName", () => {
  test("produces a filesystem-safe name for awkward tokens", () => {
    const name = flagFileName("sess123", "kw:private_key");
    expect(name).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(name.endsWith(".flag")).toBe(true);
  });

  test("is deterministic for the same inputs", () => {
    expect(flagFileName("s", "kw:x509")).toBe(flagFileName("s", "kw:x509"));
  });

  test("distinct tokens produce distinct names even after sanitization", () => {
    // Both sanitize the colon to '_', so only the hash suffix keeps them apart.
    expect(flagFileName("s", "kw:a")).not.toBe(flagFileName("s", "domain:a"));
  });
});

describe("isSuppressed", () => {
  const ttl = 1000;
  test("a marker within the window is suppressed", () => {
    expect(isSuppressed(900, 1500, ttl)).toBe(true);
  });

  test("a marker older than the window is not suppressed", () => {
    expect(isSuppressed(100, 1500, ttl)).toBe(false);
  });

  test("an absent marker is not suppressed", () => {
    expect(isSuppressed(null, 1500, ttl)).toBe(false);
  });
});

describe("resolveTtlMs", () => {
  test("unset env falls back to the default window", () => {
    expect(resolveTtlMs(undefined)).toBe(DEFAULT_SUPPRESS_TTL_MS);
  });

  test("a valid numeric env value is used", () => {
    expect(resolveTtlMs("60000")).toBe(60000);
  });

  test("invalid or non-positive env values fall back to the default", () => {
    expect(resolveTtlMs("abc")).toBe(DEFAULT_SUPPRESS_TTL_MS);
    expect(resolveTtlMs("0")).toBe(DEFAULT_SUPPRESS_TTL_MS);
    expect(resolveTtlMs("-5")).toBe(DEFAULT_SUPPRESS_TTL_MS);
  });
});
