#!/usr/bin/env bun
/**
 * Pre-commit / CI hook. Scans the staged diff (or a base..HEAD diff if
 * COMPLIANCE_BASE is set) for security-touching changes that lack
 * a "Refs:" / "Compliance:" citation.
 *
 * Usage:
 *   bun run scripts/check-compliance-citations.ts          # warn, exit 0
 *   bun run scripts/check-compliance-citations.ts --strict # warn, exit 1
 *   COMPLIANCE_BASE=origin/main bun run ... --strict       # CI mode
 */
import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import {
  detect,
  hasCitation,
  loadProjectConfig,
  resolveConfig,
  formatConcernLine,
} from "../src/compliance-detect.js";
import {
  concernTokens,
  concernQuery,
} from "../src/nudge-suppression.js";
import { parseAddedByFile } from "../src/diff-utils.js";

const STRICT = process.argv.includes("--strict");
const BASE = process.env.COMPLIANCE_BASE;
const cfg = resolveConfig(loadProjectConfig());

function git(...args: string[]): string {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) {
    process.stderr.write(`git ${args.join(" ")} failed: ${r.stderr}\n`);
    process.exit(STRICT ? 1 : 0);
  }
  return r.stdout;
}

const diffArgs = BASE
  ? ["diff", "--unified=0", `${BASE}...HEAD`]
  : ["diff", "--unified=0", "--cached"];
const nameArgs = BASE
  ? ["diff", "--name-only", `${BASE}...HEAD`]
  : ["diff", "--name-only", "--cached"];

const changedFiles = git(...nameArgs).split("\n").filter(Boolean);
if (changedFiles.length === 0) process.exit(0);

const blocks = parseAddedByFile(git(...diffArgs));

const commitMsg = (() => {
  if (BASE) return git("log", `${BASE}..HEAD`, "--format=%B");
  try {
    return Bun.file(".git/COMMIT_EDITMSG").text() as unknown as string;
  } catch {
    return "";
  }
})();
const commitHasCitation = hasCitation(
  typeof commitMsg === "string" ? commitMsg : ""
);

interface Hit {
  path: string;
  reason: "path" | "keyword";
  matchedKeywords: string[];
  domain: string | null;
}
const hits: Hit[] = [];
for (const [path, added] of blocks) {
  const r = detect(path, added, undefined, cfg);
  if (!r.fired || r.hasCitation || commitHasCitation) continue;
  hits.push({
    path,
    reason: r.reason!,
    matchedKeywords: r.matchedKeywords,
    domain: r.domain,
  });
}

if (hits.length === 0) process.exit(0);

// Derive de-duplicated concern identities across all flagged changes, keeping
// the first context (domain + path hint) seen for each, so the gate's guidance
// is per concern rather than one blended query.
const concernContext = new Map<string, { domain: string | null; pathHint: string }>();
for (const h of hits) {
  for (const token of concernTokens(h)) {
    if (!concernContext.has(token)) {
      concernContext.set(token, { domain: h.domain, pathHint: basename(h.path) });
    }
  }
}
const MAX_RENDERED = 8;
const allConcerns = Array.from(concernContext.keys());
const rendered = allConcerns.slice(0, MAX_RENDERED);
const overflow = allConcerns.length - rendered.length;

const suggestionLines = await Promise.all(
  rendered.map((token) =>
    formatConcernLine(token, concernQuery(token, concernContext.get(token)!), "    ")
  )
);
if (overflow > 0) {
  suggestionLines.push(`    - (+${overflow} more — run controls_for_change)`);
}

const lines: string[] = [];
lines.push("[compliance-check] Security-touching changes without citation:");
for (const h of hits) {
  const det =
    h.reason === "path"
      ? "security path"
      : `keywords: ${h.matchedKeywords.join(", ")}`;
  lines.push(`  - ${h.path} (${det})`);
}
if (suggestionLines.length > 0) {
  lines.push("");
  lines.push("  Suggested controls:");
  lines.push(...suggestionLines);
}
lines.push("");
lines.push(
  '  Add "// Refs: NIST <id>" in the changed files OR "Refs: NIST <id>" to the commit message.'
);
lines.push("  Skip with: git commit --no-verify");

const out = lines.join("\n");
if (STRICT) {
  process.stderr.write(out + "\n");
  process.exit(1);
}
process.stdout.write(out + "\n");
process.exit(0);
