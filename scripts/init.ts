#!/usr/bin/env bun
/**
 * Drops compliance hook templates into a target project, replacing the
 * MCP_PATH placeholder with the absolute path to this checkout.
 *
 * Usage:
 *   bun run scripts/init.ts /path/to/target-project
 *   bun run scripts/init.ts /path/to/target-project --skip-hooks=husky,ci
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chmodSync } from "node:fs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const TEMPLATES_DIR = resolve(REPO_ROOT, "templates");

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
if (!target) {
  console.error("Usage: bun run scripts/init.ts <target-project-path> [--skip-hooks=...]");
  process.exit(1);
}
const targetAbs = resolve(target);
if (!existsSync(targetAbs)) {
  console.error(`Target does not exist: ${targetAbs}`);
  process.exit(1);
}

const skipFlag = args.find((a) => a.startsWith("--skip-hooks="));
const skipped = new Set(
  skipFlag ? skipFlag.split("=")[1].split(",").map((s) => s.trim()) : []
);

interface Template {
  name: "claude" | "husky" | "ci";
  src: string;
  dst: string;
  executable?: boolean;
}

const templates: Template[] = [
  {
    name: "claude",
    src: join(TEMPLATES_DIR, ".claude/settings.json"),
    dst: join(targetAbs, ".claude/settings.json"),
  },
  {
    name: "husky",
    src: join(TEMPLATES_DIR, ".husky/pre-commit"),
    dst: join(targetAbs, ".husky/pre-commit"),
    executable: true,
  },
  {
    name: "ci",
    src: join(TEMPLATES_DIR, ".github/workflows/compliance-check.yml"),
    dst: join(targetAbs, ".github/workflows/compliance-check.yml"),
  },
];

let copied = 0;
let skippedExisting = 0;

for (const t of templates) {
  if (skipped.has(t.name)) {
    console.log(`skip ${t.name} (--skip-hooks)`);
    continue;
  }
  if (existsSync(t.dst)) {
    console.log(`exists ${t.dst} — skipping (delete to re-init)`);
    skippedExisting += 1;
    continue;
  }
  mkdirSync(dirname(t.dst), { recursive: true });
  const content = readFileSync(t.src, "utf8").replaceAll(
    "/MCP_PATH",
    REPO_ROOT
  );
  Bun.write(t.dst, content);
  if (t.executable) chmodSync(t.dst, 0o755);
  console.log(`wrote  ${t.dst}`);
  copied += 1;
}

console.log("");
console.log(`Done. Copied ${copied} template(s); ${skippedExisting} already existed.`);
console.log(`MCP_PATH resolved to: ${REPO_ROOT}`);
console.log("");
if (copied > 0) {
  console.log("Next steps:");
  console.log("  1. Review the copied files, especially .claude/settings.json");
  console.log("  2. If using husky, ensure it's installed in your project (npx husky install)");
  console.log("  3. For CI, edit the workflow to point at your fork of this repo");
}
