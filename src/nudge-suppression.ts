/**
 * Pure suppression/attribution logic for the pre-edit compliance nudge
 * (scripts/precheck-edit.ts). No filesystem, no clock, no network — current
 * time and marker timestamps are passed in as values so the suppression
 * decision is deterministic and unit-testable.
 *
 * A "concern" is the unit of suppression and attribution: the path-derived
 * domain (when present) and each matched keyword become distinct concerns,
 * so a later edit that raises a *new* concern re-notifies instead of being
 * swallowed by a prior path-domain-keyed suppression.
 */
import { createHash } from "node:crypto";
import type { DetectionResult } from "./compliance-detect.js";

/** Default suppression window: 30 minutes. */
export const DEFAULT_SUPPRESS_TTL_MS = 30 * 60 * 1000;

/** Token kinds are prefixed so a keyword never collides with a same-named domain. */
const DOMAIN_PREFIX = "domain:";
const KEYWORD_PREFIX = "kw:";
/** Fallback when a path fired with neither domain nor keywords. */
const PATH_FALLBACK_TOKEN = "path";

/**
 * Ordered, de-duplicated concern identities for a fired detection result.
 * Domain (when present) is listed first, then matched keywords in detection
 * order. Never empty for a fired result — falls back to a single path token.
 */
export function concernTokens(
  // `reason` is part of the concern-identity input contract (mirrors the
  // DetectionResult fields a concern derives from) even though tokenization
  // currently keys only on domain + keywords.
  result: Pick<DetectionResult, "matchedKeywords" | "domain" | "reason">
): string[] {
  const tokens: string[] = [];
  if (result.domain) tokens.push(`${DOMAIN_PREFIX}${result.domain}`);
  for (const kw of result.matchedKeywords) tokens.push(`${KEYWORD_PREFIX}${kw}`);

  const seen = new Set<string>();
  const deduped = tokens.filter((t) => (seen.has(t) ? false : seen.add(t)));
  return deduped.length > 0 ? deduped : [PATH_FALLBACK_TOKEN];
}

/**
 * Deterministic, filesystem-safe marker basename for a (session, concern).
 * The concern token is sanitized for the filename and disambiguated with a
 * short hash of the original token, so distinct tokens that sanitize to the
 * same string still get distinct marker files.
 */
export function flagFileName(sessionKey: string, token: string): string {
  const safeSession = sanitize(sessionKey).slice(0, 24);
  const safeToken = sanitize(token).slice(0, 40);
  const hash = createHash("sha1").update(token).digest("hex").slice(0, 8);
  return `.compliance-${safeSession}-${safeToken}-${hash}.flag`;
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_");
}

/**
 * True when a marker exists and its mtime is within the suppression window.
 * A null mtime (no marker / unreadable) means "not suppressed" — the safe
 * default that re-notifies.
 */
export function isSuppressed(
  flagMtimeMs: number | null,
  nowMs: number,
  ttlMs: number
): boolean {
  if (flagMtimeMs === null) return false;
  return nowMs - flagMtimeMs < ttlMs;
}

/**
 * Resolve the suppression window from an optional env value
 * (COMPLIANCE_NUDGE_TTL_MS in milliseconds). Missing or invalid
 * (non-numeric / non-positive) input falls back to the default.
 */
export function resolveTtlMs(envValue: string | undefined): number {
  if (envValue === undefined) return DEFAULT_SUPPRESS_TTL_MS;
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SUPPRESS_TTL_MS;
  return parsed;
}

/** Strip the kind prefix from a concern token for display (e.g. "kw:bcrypt" → "bcrypt"). */
export function conciseLabel(token: string): string {
  return token.replace(/^domain:/, "").replace(/^kw:/, "");
}

/**
 * Build a context-rich retrieval query for a concern: the concise label
 * combined with available detection context (domain and a path hint, e.g. a
 * filename), so a bare keyword is queried with surrounding context instead of
 * alone. The result is split into words, de-duplicated case-insensitively,
 * and space-joined; with no usable context it degrades to the label's words.
 */
export function concernQuery(
  token: string,
  context: { domain?: string | null; pathHint?: string | null }
): string {
  // Drop trailing file extension(s) from the path hint so "login.ts" → "login"
  // and "login.test.ts" → "login" (compound extensions don't leak noise words).
  const hint = (context.pathHint ?? "").replace(/(\.[A-Za-z0-9]+)+$/, "");
  const seen = new Set<string>();
  return [conciseLabel(token), context.domain ?? "", hint]
    .flatMap((part) => part.split(/[^A-Za-z0-9]+/))
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .filter((word) => {
      const key = word.toLowerCase();
      return seen.has(key) ? false : seen.add(key);
    })
    .join(" ");
}
