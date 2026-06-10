#!/usr/bin/env bun
/**
 * Claude Code PreToolUse hook for Edit/Write tools. On a fresh detection,
 * prints a short context injection to stdout for Claude to read. Always
 * exits 0 — never blocks edits.
 *
 * Wire up via templates/.claude/settings.json.
 */
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import {
  detect,
  loadProjectConfig,
  resolveConfig,
  formatSuggestedControls,
} from "../src/compliance-detect.js";
import {
  concernTokens,
  flagFileName,
  isSuppressed,
  resolveTtlMs,
  conciseLabel,
  concernQuery,
} from "../src/nudge-suppression.js";

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

// Everything past payload parsing is wrapped so any unexpected error
// (regex, fs, retrieval) fails open: log to stderr and still exit 0, never
// blocking the edit or surfacing an error to the hook caller.
try {
  const cfg = resolveConfig(loadProjectConfig(payload.cwd));
  const result = detect(filePath, newContent, existing, cfg);
  if (!result.fired || result.hasCitation) process.exit(0);

  const sessionKey =
    payload.session_id ??
    createHash("sha1").update(payload.cwd ?? "").digest("hex").slice(0, 12);

  // Suppression is keyed per concern (domain + each keyword), not per path
  // domain, so a later edit raising a *new* concern re-notifies instead of
  // being swallowed. Each concern's marker also expires after a window, so a
  // long session gets occasional reminders rather than permanent silence.
  const ttlMs = resolveTtlMs(process.env.COMPLIANCE_NUDGE_TTL_MS);
  const now = Date.now();

  const flagPathFor = (token: string) =>
    join(tmpdir(), flagFileName(sessionKey, token));

  const markerMtimeMs = (token: string): number | null => {
    try {
      return statSync(flagPathFor(token)).mtimeMs;
    } catch {
      return null; // missing/unreadable → treat as not suppressed
    }
  };

  // Surface only concerns that are new or whose prior nudge has expired.
  const tokens = concernTokens(result);
  const surfaced = tokens.filter(
    (t) => !isSuppressed(markerMtimeMs(t), now, ttlMs)
  );
  if (surfaced.length === 0) process.exit(0);

  // Per-concern suggestions, grouped so each surfaced concern is represented.
  // Capped to keep the message a glanceable nudge.
  const MAX_RENDERED = 5;
  const rendered = surfaced.slice(0, MAX_RENDERED);
  const overflow = surfaced.length - rendered.length;

  const pathHint = basename(filePath);
  const suggestionLines = await Promise.all(
    rendered.map(async (token) => {
      const label = conciseLabel(token);
      // Query with surrounding detection context so a bare keyword still
      // returns relevant controls rather than degrading to the fallback.
      const query = concernQuery(token, { domain: result.domain, pathHint });
      let detail = "";
      try {
        detail = await formatSuggestedControls(query, 2, 1);
      } catch {
        detail = "";
      }
      return `  - ${label} → ${detail || "(run controls_for_change for full detail)"}`;
    })
  );
  if (overflow > 0) {
    suggestionLines.push(`  - (+${overflow} more — run controls_for_change)`);
  }

  const message = [
    `[compliance] ${filePath} edit detected.`,
    `Detected concerns: ${surfaced.map(conciseLabel).join(", ")}.`,
    `Likely controls:`,
    ...suggestionLines,
    `If already cited in this file or PR, ignore. Otherwise add a "// Refs: NIST <id>" line in the change.`,
  ].join("\n");

  // Refresh a marker per surfaced concern (best-effort; failures don't block).
  for (const token of surfaced) {
    try {
      await Bun.write(flagPathFor(token), "");
    } catch {
      // ignore — suppression is best-effort, never blocks the edit
    }
  }

  console.log(message);
} catch (e) {
  process.stderr.write(
    `[compliance] unexpected error: ${e instanceof Error ? e.message : e}\n`
  );
}
process.exit(0);
