#!/usr/bin/env bun
/**
 * Drops compliance hook templates into a target project. Templates invoke
 * the package's installed bin names (custos-precheck-edit,
 * custos-check-citations), so they work wherever the package is installed —
 * globally via npm/bun, or from this checkout via `bun link`.
 *
 * Usage:
 *   custos-init /path/to/target-project [--skip-hooks=husky,ci]
 *   (from a checkout: bun run scripts/init.ts <target>)
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
  const content = readFileSync(t.src, "utf8");
  Bun.write(t.dst, content);
  if (t.executable) chmodSync(t.dst, 0o755);
  console.log(`wrote  ${t.dst}`);
  copied += 1;
}

console.log("");
console.log(`Done. Copied ${copied} template(s); ${skippedExisting} already existed.`);
console.log("");
if (copied > 0) {
  console.log("Next steps:");
  console.log("  1. Review the copied files, especially .claude/settings.json");
  console.log("  2. Ensure mcp-custos is installed globally (bun add -g mcp-custos)");
  console.log("  3. If using husky, ensure it's installed in your project (npx husky install)");
}
