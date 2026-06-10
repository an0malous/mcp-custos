/**
 * Shared compliance-citation detection used by both the per-edit Claude
 * Code hook (precheck-edit.ts) and the pre-commit script
 * (check-compliance-citations.ts).
 *
 * Conservative defaults — narrow path patterns, high-confidence content
 * keywords only. Users can extend per-project via .compliance-check.json
 * in the cwd; loadProjectConfig() reads it.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { controlsForChange } from "./tools/meta.js";

export const DEFAULT_SECURITY_PATHS = [
  /\bauth(n|z)?\b/,
  /\bauthentication\b/,
  /\bauthorization\b/,
  /\bcrypto(graphy)?\b/,
  /\bcipher\b/,
  /\bsecrets?\b/,
  /\bvault\b/,
  /\bkms\b/,
  /\bkeys?\b/,
  /\biam\b/,
  /\bidentity\b/,
  /\boauth\b/,
  /\boidc\b/,
  /\bsaml\b/,
  /\bsessions?\b/,
  /\btls\b/,
  /\bcerts?\b/,
];

/** Standard words — matched case-insensitive with word boundaries. */
export const DEFAULT_KEYWORDS_WORDS = [
  "password",
  "passwd",
  "bcrypt",
  "argon2",
  "scrypt",
  "pbkdf2",
  "jsonwebtoken",
  "oauth",
  "oidc",
  "openid",
  "passkey",
  "csrf",
  "xsrf",
  "xss",
  "private_key",
  "secret_key",
  "api_key",
];

/**
 * Acronyms and constants — case-sensitive substring match so they catch
 * camelCase neighbours (e.g. JWT in `signJWT`) without false-positive
 * matches on lowercase words containing the same letters.
 */
export const DEFAULT_KEYWORDS_EXACT = [
  "JWT",
  "MFA",
  "TOTP",
  "WebAuthn",
  "FIDO",
  "API_KEY",
  "SECRET_KEY",
  "PRIVATE_KEY",
  "apiKey",
  "X.509",
  "x509",
];

export const DEFAULT_SKIP_PATHS = [
  /\.lock$/,
  /^bun\.lock$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /Cargo\.lock$/,
  /\.md$/,
  /\.mdx$/,
  /\.css$/,
  /\.scss$/,
  /\.sass$/,
  /\.svg$/,
  /\.(png|jpg|jpeg|gif|webp|ico)$/,
  /\.gitignore$/,
  /\.editorconfig$/,
  /\.prettierrc/,
  /\.eslintrc/,
  /^LICENSE$/,
  /^NOTICE$/,
  /^CHANGELOG/i,
];

/**
 * One grammar for "Refs:" / "Compliance:" lines, accepting comment leaders
 * across every language we ship hooks for: //, #, --, /*, *, plus the bare
 * "Refs:" form used in commit messages.
 */
export const REF_LINE_RE =
  /(?:^|(?:\/\/|#|--|\/\*|\*))\s*(?:Refs|Compliance):\s*([^\n*]+)/gim;
export const NIST_RE = /\bNIST\s+([A-Z]{2}-\d+(?:\(\d+\))?(?:\.\d+)?)/gi;
export const ASVS_RE = /\bASVS\s+(V\d+(?:\.\d+){0,2})/gi;

/** Single-shot detector — true if any valid Refs/Compliance line is present. */
export function hasCitation(content: string): boolean {
  for (const m of content.matchAll(REF_LINE_RE)) {
    const body = m[1] ?? "";
    if (NIST_RE.test(body)) {
      NIST_RE.lastIndex = 0;
      return true;
    }
    NIST_RE.lastIndex = 0;
    if (ASVS_RE.test(body)) {
      ASVS_RE.lastIndex = 0;
      return true;
    }
    ASVS_RE.lastIndex = 0;
  }
  return false;
}

/** Pull every NIST and ASVS id out of arbitrary text. */
export function extractCitations(content: string): {
  nist: string[];
  asvs: string[];
} {
  const nist: string[] = [];
  const asvs: string[] = [];
  for (const m of content.matchAll(REF_LINE_RE)) {
    const body = m[1] ?? "";
    for (const n of body.matchAll(NIST_RE)) nist.push(n[1]);
    for (const a of body.matchAll(ASVS_RE)) asvs.push(a[1]);
  }
  return { nist, asvs };
}

export interface ProjectConfig {
  add_paths?: string[];
  add_keywords?: string[];
  add_exact_keywords?: string[];
  add_skip_paths?: string[];
  replace_paths?: string[];
  replace_keywords?: string[];
  replace_exact_keywords?: string[];
  replace_skip_paths?: string[];
}

export interface ResolvedConfig {
  paths: RegExp[];
  keywords: string[];
  exactKeywords: string[];
  skipPaths: RegExp[];
}

/**
 * Read .compliance-check.json from cwd if present. Returns empty config if not.
 */
export function loadProjectConfig(cwd: string = process.cwd()): ProjectConfig {
  const path = join(cwd, ".compliance-check.json");
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ProjectConfig;
  } catch (e) {
    process.stderr.write(
      `[compliance] failed to parse ${path}: ${e instanceof Error ? e.message : e} — using defaults\n`
    );
    return {};
  }
}

const compileRe = (s: string): RegExp => {
  try {
    return new RegExp(s);
  } catch {
    return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  }
};

export function resolveConfig(c: ProjectConfig = {}): ResolvedConfig {
  const paths = c.replace_paths
    ? c.replace_paths.map(compileRe)
    : [...DEFAULT_SECURITY_PATHS, ...(c.add_paths ?? []).map(compileRe)];
  const keywords = c.replace_keywords
    ? c.replace_keywords
    : [...DEFAULT_KEYWORDS_WORDS, ...(c.add_keywords ?? [])];
  const exactKeywords = c.replace_exact_keywords
    ? c.replace_exact_keywords
    : [...DEFAULT_KEYWORDS_EXACT, ...(c.add_exact_keywords ?? [])];
  const skipPaths = c.replace_skip_paths
    ? c.replace_skip_paths.map(compileRe)
    : [...DEFAULT_SKIP_PATHS, ...(c.add_skip_paths ?? []).map(compileRe)];
  return { paths, keywords, exactKeywords, skipPaths };
}

export interface DetectionResult {
  fired: boolean;
  reason: "path" | "keyword" | null;
  matchedPaths: string[];
  matchedKeywords: string[];
  hasCitation: boolean;
  domain: string | null;
}

export function pathIsSecurity(path: string, cfg?: ResolvedConfig): boolean {
  return (cfg?.paths ?? DEFAULT_SECURITY_PATHS).some((re) => re.test(path));
}

export function pathShouldSkip(path: string, cfg?: ResolvedConfig): boolean {
  return (cfg?.skipPaths ?? DEFAULT_SKIP_PATHS).some((re) => re.test(path));
}

export function findKeywords(content: string, cfg?: ResolvedConfig): string[] {
  const found: string[] = [];
  for (const kw of cfg?.keywords ?? DEFAULT_KEYWORDS_WORDS) {
    const re = new RegExp(
      `\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    );
    if (re.test(content)) found.push(kw);
  }
  for (const kw of cfg?.exactKeywords ?? DEFAULT_KEYWORDS_EXACT) {
    if (content.includes(kw)) found.push(kw);
  }
  return found;
}

/**
 * Format a one-line "Suggested controls: NIST X, Y, Z; ASVS V1, V2" string
 * for hook output. Returns an empty string on failure or no matches —
 * never throws — so hook callers can render it unconditionally.
 */
export async function formatSuggestedControls(
  description: string,
  nistN: number = 3,
  asvsN: number = 2
): Promise<string> {
  try {
    const r = await controlsForChange(description, "2", Math.max(nistN, asvsN));
    const nist = r.nist_800_53.results
      .slice(0, nistN)
      .map((c) => c.id)
      .join(", ");
    const asvs = r.asvs.results
      .slice(0, asvsN)
      .map((c) => c.id)
      .join(", ");
    return [nist && `NIST ${nist}`, asvs && `ASVS ${asvs}`]
      .filter(Boolean)
      .join("; ");
  } catch (e) {
    process.stderr.write(
      `[compliance] suggestion lookup failed: ${e instanceof Error ? e.message : e}\n`
    );
    return "";
  }
}

export function pathDomain(path: string): string | null {
  const lower = path.toLowerCase();
  if (/\bauth(n|z)?\b|\bauthentication\b|\bauthorization\b/.test(lower))
    return "auth";
  // `keys?` is the one DEFAULT_SECURITY_PATHS pattern with no domain case;
  // key material is cryptographic, so group it with crypto. `\bcrypto` is left
  // open-ended on purpose so "cryptography" paths still map here.
  if (/\bcrypto|\bcipher\b|\bkeys?\b/.test(lower)) return "crypto";
  if (/\bsecrets?\b|\bvault\b|\bkms\b/.test(lower)) return "secrets";
  if (/\biam\b|\bidentity\b/.test(lower)) return "iam";
  if (/\boauth|oidc|saml\b/.test(lower)) return "oauth";
  if (/\bsessions?\b/.test(lower)) return "session";
  if (/\btls|certs?\b/.test(lower)) return "tls";
  return null;
}

export function detect(
  filePath: string,
  newContent: string,
  existingFileContent?: string,
  cfg?: ResolvedConfig
): DetectionResult {
  if (pathShouldSkip(filePath, cfg)) {
    return {
      fired: false,
      reason: null,
      matchedPaths: [],
      matchedKeywords: [],
      hasCitation: false,
      domain: null,
    };
  }

  const pathHit = pathIsSecurity(filePath, cfg);
  const matchedKeywords = findKeywords(newContent, cfg);
  const fired = pathHit || matchedKeywords.length > 0;

  const haystack = (existingFileContent ?? "") + "\n" + newContent;
  const hasCit = hasCitation(haystack);

  return {
    fired,
    reason: pathHit ? "path" : matchedKeywords.length > 0 ? "keyword" : null,
    matchedPaths: pathHit ? [filePath] : [],
    matchedKeywords,
    hasCitation: hasCit,
    domain: pathDomain(filePath),
  };
}
