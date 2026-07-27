import { searchAsvs } from "./asvs.js";
import { searchSsdf } from "./ssdf.js";
import { searchNistControls } from "./nist.js";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "onto", "this", "that",
  "are", "was", "were", "have", "has", "had", "but", "not", "any", "all",
  "some", "our", "your", "their", "about", "implement", "implementing",
  "adding", "wiring", "build", "building", "code", "system",
]);

/**
 * Common security abbreviations expand to their full forms before tokenizing
 * so a query for "MFA" finds requirements that say "multi-factor
 * authentication". Lowercase keys; values get joined with spaces.
 */
const SYNONYMS: Record<string, string> = {
  mfa: "multi factor authentication",
  "2fa": "two factor authentication",
  sso: "single sign on",
  rbac: "role based access control",
  abac: "attribute based access control",
  acl: "access control list",
  authn: "authentication",
  authz: "authorization",
  otp: "one time password",
  totp: "time based one time password",
  hotp: "hmac one time password",
  jwt: "json web token",
  jws: "json web signature",
  jwe: "json web encryption",
  jwk: "json web key",
  oidc: "openid connect",
  saml: "security assertion markup language",
  csrf: "cross site request forgery",
  xsrf: "cross site request forgery",
  xss: "cross site scripting",
  ssrf: "server side request forgery",
  sqli: "sql injection",
  rce: "remote code execution",
  lfi: "local file inclusion",
  rfi: "remote file inclusion",
  idor: "insecure direct object reference",
  pii: "personally identifiable information",
  phi: "protected health information",
  kms: "key management service",
  hsm: "hardware security module",
  iam: "identity and access management",
  pam: "privileged access management",
  siem: "security information event management",
  edr: "endpoint detection response",
  waf: "web application firewall",
  dlp: "data loss prevention",
  ids: "intrusion detection system",
  ips: "intrusion prevention system",
  vpn: "virtual private network",
  tls: "transport layer security",
  mtls: "mutual transport layer security",
  ssl: "secure sockets layer",
  rng: "random number generator",
  prng: "pseudorandom number generator",
  csp: "content security policy",
  cors: "cross origin resource sharing",
  hsts: "http strict transport security",
  pkce: "proof key for code exchange",
  api: "application programming interface",
  sdk: "software development kit",
  ci: "continuous integration",
  cd: "continuous deployment",
  sbom: "software bill of materials",
  sast: "static application security testing",
  dast: "dynamic application security testing",
  iast: "interactive application security testing",
  sca: "software composition analysis",
  rasp: "runtime application self protection",
  // Password-hashing mechanisms: the frameworks never name algorithms, so
  // expand to the storage vocabulary they do use (NIST IA-5(1) "salted key
  // derivation function", ASVS V6.x "password storage/verifier").
  bcrypt: "password hashing storage salted key derivation",
  argon2: "password hashing storage salted key derivation",
  scrypt: "password hashing storage salted key derivation",
  pbkdf2: "password hashing storage salted key derivation",
  // Vocabulary bridge: engineers say "authorization"; NIST names the same
  // concept "access enforcement" (AC-3) and "least privilege" (AC-6).
  authorization: "access enforcement least privilege",
};

function expandSynonyms(text: string): string {
  return text.replace(/\b[a-z0-9]+\b/gi, (m) => {
    const expansion = SYNONYMS[m.toLowerCase()];
    return expansion ? `${m} ${expansion}` : m;
  });
}

export function tokenize(description: string): string[] {
  return Array.from(
    new Set(
      expandSynonyms(description)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    )
  );
}

/**
 * Per-token searches use this internal limit so the tally sees the complete
 * match set — slicing to the display limit happens only after scoring.
 * Truncating per token would bias results toward whatever sorts early in the
 * source catalog (e.g. the AC family in NIST).
 */
const TALLY_LIMIT = 500;

/**
 * Reduce a token to a substring-friendly stem so inflections match ("validate"
 * → "validat" matches "validation"; "checks" → "check"). One conservative
 * suffix strip, longest first, only when a ≥4-char stem remains — the stem is
 * always a prefix of the original token, so direct occurrences still match.
 */
export function searchStem(token: string): string {
  for (const suffix of ["ing", "ed", "es", "s", "e"]) {
    if (
      token.endsWith(suffix) &&
      token.length - suffix.length >= 4 &&
      !(suffix === "s" && token.endsWith("ss"))
    ) {
      return token.slice(0, token.length - suffix.length);
    }
  }
  return token;
}

async function tokenScored<T extends { id: string }>(
  tokens: string[],
  runner: (q: string) => Promise<{ total: number; results: T[] }>,
  limit: number
): Promise<Array<T & { match_score: number }>> {
  const perToken = await Promise.all(tokens.map(runner));
  const tally = new Map<
    string,
    { score: number; distinct: number; item: T }
  >();
  for (const r of perToken) {
    // IDF-style selectivity: a token matching 344 entries says far less about
    // any one of them than a token matching 15. log keeps broad tokens
    // contributing something so short queries still rank.
    const weight = 1 / Math.log2(2 + r.total);
    for (const item of r.results) {
      const prev = tally.get(item.id);
      if (prev) {
        prev.score += weight;
        prev.distinct += 1;
      } else tally.set(item.id, { score: weight, distinct: 1, item });
    }
  }
  return Array.from(tally.values())
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.distinct - a.distinct ||
        a.item.id.localeCompare(b.item.id)
    )
    .slice(0, limit)
    .map((x) => ({
      ...x.item,
      match_score: Math.round(x.score * 1000) / 1000,
    }));
}

export async function controlsForChange(
  description: string,
  asvsLevel: "1" | "2" | "3" = "2",
  perSourceLimit: number = 10
) {
  const tokens = tokenize(description);
  // Search on de-duplicated stems ("validate" and "validation" become one
  // signal instead of double-counting); tokens_used reports the readable
  // originals.
  const stems = Array.from(new Set(tokens.map(searchStem)));

  const [asvs, ssdf, nist] = await Promise.all([
    tokenScored(
      stems,
      (q) => searchAsvs(q, asvsLevel, TALLY_LIMIT),
      perSourceLimit
    ),
    tokenScored(stems, (q) => searchSsdf(q, TALLY_LIMIT), perSourceLimit),
    tokenScored(
      stems,
      (q) => searchNistControls(q, TALLY_LIMIT),
      perSourceLimit
    ),
  ]);

  return {
    change: description,
    tokens_used: tokens,
    note: "Starter checklist — not exhaustive. Items are ranked by how many query tokens they matched. Refine with targeted lookups (asvs_lookup, ssdf_lookup, nist_lookup_control) before implementing.",
    asvs: { level: asvsLevel, results: asvs },
    ssdf: { results: ssdf },
    nist_800_53: { results: nist },
  };
}
