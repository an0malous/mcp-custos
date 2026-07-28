import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  detectPm,
  detectMode,
  buildModeConfig,
  substituteTokens,
  registerMcpServer,
} from "./init.js";

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "custos-init-test-"));
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function fixture(name: string): string {
  const d = join(root, name);
  mkdirSync(d, { recursive: true });
  return d;
}

describe("detectPm", () => {
  test.each([
    ["pnpm-lock.yaml", "pnpm"],
    ["bun.lock", "bun"],
    ["yarn.lock", "yarn"],
  ])("%s → %s", (lockfile, pm) => {
    const d = fixture(`pm-${pm}`);
    writeFileSync(join(d, lockfile), "");
    expect(detectPm(d)).toBe(pm);
  });

  test("no lockfile → npm", () => {
    expect(detectPm(fixture("pm-none"))).toBe("npm");
  });
});

describe("detectMode", () => {
  test("mcp-custos in devDependencies → local", () => {
    const d = fixture("mode-devdep");
    writeFileSync(
      join(d, "package.json"),
      JSON.stringify({ devDependencies: { "mcp-custos": "^0.4.1" } })
    );
    const r = detectMode(d);
    expect(r.mode).toBe("local");
    expect(r.reason).toContain("devDependencies");
  });

  test("local bin present → local", () => {
    const d = fixture("mode-bin");
    mkdirSync(join(d, "node_modules/.bin"), { recursive: true });
    writeFileSync(join(d, "node_modules/.bin/custos-precheck-edit"), "");
    expect(detectMode(d).mode).toBe("local");
  });

  test("neither → global", () => {
    const d = fixture("mode-bare");
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "x" }));
    expect(detectMode(d).mode).toBe("global");
  });
});

describe("buildModeConfig", () => {
  test("local/pnpm: node_modules bins, pnpm exec mcp entry, install hint", () => {
    const c = buildModeConfig("local", "pnpm");
    expect(c.tokens["{{PRECHECK_CMD}}"]).toContain(
      "node_modules/.bin/custos-precheck-edit"
    );
    expect(c.tokens["{{CHECK_RUN}}"]).toBe(
      "node_modules/.bin/custos-check-citations"
    );
    expect(c.tokens["{{CHECK_HINT}}"]).toContain("pnpm install");
    expect(c.mcpEntry).toEqual({ command: "pnpm", args: ["exec", "mcp-custos"] });
  });

  test("local/npm: npx runner", () => {
    expect(buildModeConfig("local", "npm").mcpEntry).toEqual({
      command: "npx",
      args: ["mcp-custos"],
    });
  });

  test("global: guarded bare commands, plain mcp entry", () => {
    const c = buildModeConfig("global", "npm");
    expect(c.tokens["{{PRECHECK_CMD}}"]).toContain(
      "command -v custos-precheck-edit"
    );
    expect(c.tokens["{{CHECK_RUN}}"]).toBe("custos-check-citations");
    expect(c.tokens["{{CHECK_HINT}}"]).toContain("npm i -g mcp-custos");
    expect(c.mcpEntry).toEqual({ command: "mcp-custos" });
  });

  test("substituteTokens leaves no tokens behind", () => {
    const c = buildModeConfig("local", "bun");
    const out = substituteTokens(
      "a {{PRECHECK_CMD}} b {{CHECK_GUARD}} c {{CHECK_RUN}} d {{CHECK_HINT}}",
      c.tokens
    );
    expect(out).not.toContain("{{");
  });
});

describe("registerMcpServer", () => {
  test("creates .mcp.json when absent", () => {
    const d = fixture("mcp-create");
    const msg = registerMcpServer(d, { command: "mcp-custos" });
    expect(msg).toContain("wrote");
    const doc = JSON.parse(readFileSync(join(d, ".mcp.json"), "utf8"));
    expect(doc.mcpServers.custos.command).toBe("mcp-custos");
  });

  test("merges into existing .mcp.json preserving other servers", () => {
    const d = fixture("mcp-merge");
    writeFileSync(
      join(d, ".mcp.json"),
      JSON.stringify({ mcpServers: { other: { command: "x" } } })
    );
    registerMcpServer(d, { command: "pnpm", args: ["exec", "mcp-custos"] });
    const doc = JSON.parse(readFileSync(join(d, ".mcp.json"), "utf8"));
    expect(doc.mcpServers.other.command).toBe("x");
    expect(doc.mcpServers.custos.args).toEqual(["exec", "mcp-custos"]);
  });

  test("existing custos entry left untouched", () => {
    const d = fixture("mcp-exists");
    writeFileSync(
      join(d, ".mcp.json"),
      JSON.stringify({ mcpServers: { custos: { command: "keep-me" } } })
    );
    const msg = registerMcpServer(d, { command: "mcp-custos" });
    expect(msg).toContain("left untouched");
    const doc = JSON.parse(readFileSync(join(d, ".mcp.json"), "utf8"));
    expect(doc.mcpServers.custos.command).toBe("keep-me");
  });
});

describe("e2e init runs", () => {
  function runInit(target: string, ...flags: string[]) {
    const r = Bun.spawnSync({
      cmd: [
        "bun",
        "run",
        new URL("./init.ts", import.meta.url).pathname,
        target,
        ...flags,
      ],
    });
    return r.stdout.toString() + r.stderr.toString();
  }

  test("local mode e2e: configs use project bins, .mcp.json matches pm", () => {
    const d = fixture("e2e-local");
    writeFileSync(join(d, "pnpm-lock.yaml"), "");
    writeFileSync(
      join(d, "package.json"),
      JSON.stringify({ devDependencies: { "mcp-custos": "^0.4.1" } })
    );
    const out = runInit(d);
    expect(out).toContain("mode: local");
    const settings = readFileSync(join(d, ".claude/settings.json"), "utf8");
    expect(settings).toContain("node_modules/.bin/custos-precheck-edit");
    expect(settings).not.toContain("{{");
    expect(() => JSON.parse(settings)).not.toThrow(); // substitution must keep valid JSON
    const pre = readFileSync(join(d, ".husky/pre-commit"), "utf8");
    expect(pre).toContain("node_modules/.bin/custos-check-citations");
    expect(pre).not.toContain("{{");
    const mcp = JSON.parse(readFileSync(join(d, ".mcp.json"), "utf8"));
    expect(mcp.mcpServers.custos.command).toBe("pnpm");
  });

  test("global mode e2e: configs use bare commands with guards", () => {
    const d = fixture("e2e-global");
    const out = runInit(d, "--skip-hooks=ci");
    expect(out).toContain("mode: global");
    const settings = readFileSync(join(d, ".claude/settings.json"), "utf8");
    expect(settings).toContain("command -v custos-precheck-edit");
    const mcp = JSON.parse(readFileSync(join(d, ".mcp.json"), "utf8"));
    expect(mcp.mcpServers.custos).toEqual({ command: "mcp-custos" });
    expect(existsSync(join(d, ".github/workflows/compliance-check.yml"))).toBe(
      false
    );
  });

  test("never overwrites existing files", () => {
    const d = fixture("e2e-noclobber");
    mkdirSync(join(d, ".claude"), { recursive: true });
    writeFileSync(join(d, ".claude/settings.json"), '{"mine": true}');
    const out = runInit(d, "--global");
    expect(out).toContain("exists");
    expect(readFileSync(join(d, ".claude/settings.json"), "utf8")).toBe(
      '{"mine": true}'
    );
  });
});
