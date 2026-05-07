#!/usr/bin/env bun
/**
 * Claude Code PreToolUse hook for Edit/Write tools. Reads the hook payload
 * from stdin, runs compliance detection, and on a fresh hit prints a short
 * context injection to stdout for Claude to read.
 *
 * Wire up by adding a hook entry in `.claude/settings.json` (see
 * templates/.claude/settings.json in this repo).
 */
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { detect, loadProjectConfig, resolveConfig } from "./_compliance-detect.js";
import { controlsForChange } from "../src/tools/meta.js";

interface HookInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    old_string?: string;
    new_string?: string;
    content?: string;
  };
}

const stdin = await Bun.stdin.text();
let payload: HookInput;
try {
  payload = JSON.parse(stdin) as HookInput;
} catch {
  process.exit(0);
}

const tool = payload.tool_name;
if (tool !== "Edit" && tool !== "Write") process.exit(0);

const filePath = payload.tool_input?.file_path ?? "";
const newContent =
  payload.tool_input?.new_string ?? payload.tool_input?.content ?? "";
if (!filePath || !newContent) process.exit(0);

let existing = "";
if (existsSync(filePath)) {
  try {
    existing = await Bun.file(filePath).text();
  } catch {
    existing = "";
  }
}

const cfg = resolveConfig(loadProjectConfig(payload.cwd));
const result = detect(filePath, newContent, existing, cfg);
if (!result.fired) process.exit(0);
if (result.hasCitation) process.exit(0);

const sessionKey =
  payload.session_id ??
  createHash("sha1").update(payload.cwd ?? "").digest("hex").slice(0, 12);
const domain = result.domain ?? "keyword";
const flagPath = join(tmpdir(), `.compliance-${sessionKey}-${domain}.flag`);
if (existsSync(flagPath)) process.exit(0);

const description = [
  result.matchedPaths.join(" "),
  result.matchedKeywords.join(" "),
]
  .filter(Boolean)
  .join(" ")
  .trim();

let suggestions = "";
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
  suggestions = [nist && `NIST ${nist}`, asvs && `ASVS ${asvs}`]
    .filter(Boolean)
    .join("; ");
} catch {
  suggestions = "(run controls_for_change for full detail)";
}

const detected = [
  result.reason === "path" && `path: ${result.matchedPaths.join(", ")}`,
  result.matchedKeywords.length > 0 &&
    `keywords: ${result.matchedKeywords.slice(0, 4).join(", ")}`,
]
  .filter(Boolean)
  .join("; ");

const message = [
  `[compliance] ${filePath} edit detected.`,
  `Detected ${detected}.`,
  `Likely controls: ${suggestions}.`,
  `If already cited in this file or PR, ignore. Otherwise add a "// Refs: NIST <id>" line in the change.`,
].join("\n");

await Bun.write(flagPath, "");
console.log(message);
process.exit(0);
