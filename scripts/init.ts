#!/usr/bin/env bun
/**
 * Drops compliance hook templates into a target project and registers the
 * MCP server in its .mcp.json. Emits configs matching how mcp-custos is
 * installed there:
 *
 *   - local mode (package is a project dependency): configs invoke
 *     node_modules/.bin binaries and the .mcp.json entry uses the project's
 *     package-manager runner (pnpm exec / npx / yarn exec / bunx).
 *   - global mode (no local install): configs invoke the global custos-*
 *     commands.
 *
 * Mode is auto-detected (override with --local / --global). Existing files
 * are never overwritten.
 *
 * Usage:
 *   custos-init /path/to/target-project [--skip-hooks=husky,ci] [--local|--global]
 *   (from a checkout: bun run scripts/init.ts <target>)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(SCRIPT_DIR, "..", "templates");

export type Mode = "local" | "global";
export type Pm = "pnpm" | "bun" | "yarn" | "npm";

export function detectPm(targetDir: string): Pm {
  if (existsSync(join(targetDir, "pnpm-lock.yaml"))) return "pnpm";
  if (
    existsSync(join(targetDir, "bun.lock")) ||
    existsSync(join(targetDir, "bun.lockb"))
  )
    return "bun";
  if (existsSync(join(targetDir, "yarn.lock"))) return "yarn";
  return "npm";
}

export function detectMode(targetDir: string): { mode: Mode; reason: string } {
  if (existsSync(join(targetDir, "node_modules/.bin/custos-precheck-edit")))
    return {
      mode: "local",
      reason: "found node_modules/.bin/custos-precheck-edit",
    };
  const pkgPath = join(targetDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<
        string,
        Record<string, string>
      >;
      for (const block of [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
      ]) {
        if (pkg[block]?.["mcp-custos"])
          return { mode: "local", reason: `mcp-custos in ${block}` };
      }
    } catch {
      // unreadable package.json → fall through to global
    }
  }
  return { mode: "global", reason: "no local mcp-custos install detected" };
}

const PM_RUNNER: Record<Pm, { command: string; args?: string[] }> = {
  pnpm: { command: "pnpm", args: ["exec", "mcp-custos"] },
  npm: { command: "npx", args: ["mcp-custos"] },
  yarn: { command: "yarn", args: ["exec", "mcp-custos"] },
  bun: { command: "bunx", args: ["mcp-custos"] },
};

const PM_INSTALL: Record<Pm, string> = {
  pnpm: "pnpm install",
  npm: "npm install",
  yarn: "yarn install",
  bun: "bun install",
};

export interface ModeConfig {
  tokens: Record<string, string>;
  mcpEntry: { command: string; args?: string[] };
}

export function buildModeConfig(mode: Mode, pm: Pm): ModeConfig {
  if (mode === "local") {
    const bin = "node_modules/.bin/custos-check-citations";
    return {
      tokens: {
        "{{PRECHECK_CMD}}":
          '[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/custos-precheck-edit" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/custos-precheck-edit" || true',
        "{{CHECK_GUARD}}": `[ -x ${bin} ]`,
        "{{CHECK_RUN}}": bin,
        "{{CHECK_HINT}}": `run ${PM_INSTALL[pm]} (mcp-custos is a project dependency)`,
      },
      mcpEntry: PM_RUNNER[pm],
    };
  }
  return {
    tokens: {
      "{{PRECHECK_CMD}}":
        "command -v custos-precheck-edit >/dev/null 2>&1 && custos-precheck-edit || true",
      "{{CHECK_GUARD}}": "command -v custos-check-citations >/dev/null 2>&1",
      "{{CHECK_RUN}}": "custos-check-citations",
      "{{CHECK_HINT}}": "install globally: npm i -g mcp-custos",
    },
    mcpEntry: { command: "mcp-custos" },
  };
}

/**
 * Replace {{TOKEN}} markers. When the destination is a JSON file the values
 * are JSON-escaped (command strings contain quotes) so substitution can never
 * produce invalid JSON.
 */
export function substituteTokens(
  content: string,
  tokens: Record<string, string>,
  opts: { json?: boolean } = {}
): string {
  let out = content;
  for (const [token, value] of Object.entries(tokens)) {
    const v = opts.json ? JSON.stringify(value).slice(1, -1) : value;
    out = out.replaceAll(token, v);
  }
  return out;
}

/**
 * Add a `custos` server entry to targetDir/.mcp.json, creating the file if
 * needed and leaving an existing `custos` entry untouched. Returns a
 * human-readable outcome line.
 */
export function registerMcpServer(
  targetDir: string,
  entry: ModeConfig["mcpEntry"]
): string {
  const p = join(targetDir, ".mcp.json");
  let doc: { mcpServers?: Record<string, unknown> } = {};
  if (existsSync(p)) {
    try {
      doc = JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return `skip   .mcp.json — existing file is not valid JSON, add "custos" manually`;
    }
    if (doc.mcpServers && "custos" in doc.mcpServers)
      return "exists .mcp.json custos entry — left untouched";
  }
  doc.mcpServers = { ...(doc.mcpServers ?? {}), custos: entry };
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  return `wrote  ${p} (custos server entry)`;
}

// ---------------------------------------------------------------------------

if (import.meta.main) {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    console.error(
      "Usage: custos-init <target-project-path> [--skip-hooks=husky,ci] [--local|--global]"
    );
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

  let mode: Mode;
  let reason: string;
  if (args.includes("--local")) [mode, reason] = ["local", "--local flag"];
  else if (args.includes("--global"))
    [mode, reason] = ["global", "--global flag"];
  else ({ mode, reason } = detectMode(targetAbs));
  const pm = detectPm(targetAbs);
  const cfg = buildModeConfig(mode, pm);

  console.log(
    `mode: ${mode} (${reason})${mode === "local" ? `, package manager: ${pm}` : ""}`
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
    const content = substituteTokens(readFileSync(t.src, "utf8"), cfg.tokens, {
      json: t.dst.endsWith(".json"),
    });
    writeFileSync(t.dst, content);
    if (t.executable) chmodSync(t.dst, 0o755);
    console.log(`wrote  ${t.dst}`);
    copied += 1;
  }

  console.log(registerMcpServer(targetAbs, cfg.mcpEntry));

  console.log("");
  console.log(
    `Done (${mode} mode). Copied ${copied} template(s); ${skippedExisting} already existed.`
  );
  console.log("");
  if (copied > 0) {
    console.log("Next steps:");
    console.log(
      "  1. Review the copied files, especially .claude/settings.json"
    );
    if (mode === "local")
      console.log(
        `  2. Ensure teammates run \`${PM_INSTALL[pm]}\` after pulling`
      );
    else
      console.log(
        "  2. Ensure mcp-custos is installed globally (npm i -g mcp-custos)"
      );
    console.log(
      "  3. If using husky, ensure it's installed in your project (npx husky install)"
    );
  }
}
