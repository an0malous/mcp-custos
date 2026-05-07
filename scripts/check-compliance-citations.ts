#!/usr/bin/env bun
/**
 * Pre-commit / CI hook. Scans the staged diff (or a base..HEAD diff if
 * COMPLIANCE_BASE is set) for security-touching changes that lack
 * a "Refs:" / "Compliance:" citation. Warns and suggests controls; never
 * blocks unless invoked with --strict.
 *
 * Wire as a husky/lefthook pre-commit, or run in CI via:
 *   COMPLIANCE_BASE=origin/main bun run scripts/check-compliance-citations.ts --strict
 */
import { spawnSync } from "node:child_process";
import {
  detect,
  hasCitation,
  loadProjectConfig,
  resolveConfig,
} from "./_compliance-detect.js";
import { controlsForChange } from "../src/tools/meta.js";

const cfg = resolveConfig(loadProjectConfig());

const STRICT = process.argv.includes("--strict");
const BASE = process.env.COMPLIANCE_BASE;

function git(...args: string[]): string {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) {
    process.stderr.write(`git ${args.join(" ")} failed: ${r.stderr}\n`);
    process.exit(0);
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

const diff = git(...diffArgs);

interface FileBlock {
  path: string;
  added: string;
}
const blocks: FileBlock[] = [];
let current: FileBlock | null = null;
for (const line of diff.split("\n")) {
  const m = line.match(/^\+\+\+ b\/(.+)$/);
  if (m) {
    current = { path: m[1], added: "" };
    blocks.push(current);
    continue;
  }
  if (current && line.startsWith("+") && !line.startsWith("+++")) {
    current.added += line.slice(1) + "\n";
  }
}

const commitMsg = (() => {
  if (BASE) {
    return git("log", `${BASE}..HEAD`, "--format=%B");
  }
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
}
const hits: Hit[] = [];
for (const b of blocks) {
  const r = detect(b.path, b.added, undefined, cfg);
  if (!r.fired) continue;
  if (r.hasCitation) continue;
  if (commitHasCitation) continue;
  hits.push({
    path: b.path,
    reason: r.reason!,
    matchedKeywords: r.matchedKeywords,
  });
}

if (hits.length === 0) process.exit(0);

const allKeywords = Array.from(
  new Set(hits.flatMap((h) => h.matchedKeywords))
);
const allPaths = hits.map((h) => h.path);
const description = [allPaths.join(" "), allKeywords.join(" ")]
  .filter(Boolean)
  .join(" ");

let suggestion = "";
try {
  const checklist = await controlsForChange(description, "2", 5);
  const nist = checklist.nist_800_53.results
    .slice(0, 3)
    .map((c: { id: string }) => c.id)
    .join(", ");
  const asvs = checklist.asvs.results
    .slice(0, 2)
    .map((c: { id: string }) => c.id)
    .join(", ");
  suggestion = [nist && `NIST ${nist}`, asvs && `ASVS ${asvs}`]
    .filter(Boolean)
    .join("; ");
} catch {
  /* no suggestions available */
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
if (suggestion) {
  lines.push("");
  lines.push(`  Suggested controls: ${suggestion}`);
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
