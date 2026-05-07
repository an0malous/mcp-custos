#!/usr/bin/env bun
/**
 * Claude Code PreToolUse hook for Edit/Write tools. On a fresh detection,
 * prints a short context injection to stdout for Claude to read. Always
 * exits 0 — never blocks edits.
 *
 * Wire up via templates/.claude/settings.json.
 */
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  detect,
  loadProjectConfig,
  resolveConfig,
  formatSuggestedControls,
} from "../src/compliance-detect.js";

const MAX_EXISTING_BYTES = 64 * 1024;

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

function bail(reason: string): never {
  process.stderr.write(`[compliance] skipped: ${reason}\n`);
  process.exit(0);
}

const stdin = await Bun.stdin.text();
let payload: HookInput;
try {
  payload = JSON.parse(stdin) as HookInput;
} catch (e) {
  bail(`unparseable hook payload (${e instanceof Error ? e.message : e})`);
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
    existing = await Bun.file(filePath).slice(0, MAX_EXISTING_BYTES).text();
  } catch (e) {
    process.stderr.write(
      `[compliance] read of ${filePath} failed: ${e instanceof Error ? e.message : e}\n`
    );
  }
}

const cfg = resolveConfig(loadProjectConfig(payload.cwd));
const result = detect(filePath, newContent, existing, cfg);
if (!result.fired || result.hasCitation) process.exit(0);

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

const suggestions =
  (await formatSuggestedControls(description, 3, 2)) ||
  "(run controls_for_change for full detail)";

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
