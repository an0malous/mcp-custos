import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const SCRIPT = new URL("./check-compliance-citations.ts", import.meta.url)
  .pathname;

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "custos-citations-test-"));
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function sh(cwd: string, cmd: string, ...args: string[]) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${r.stderr}`);
  }
  return r.stdout;
}

function initRepo(name: string): string {
  const d = join(root, name);
  mkdirSync(d, { recursive: true });
  sh(d, "git", "init", "-q", "-b", "main");
  sh(d, "git", "config", "user.email", "test@example.com");
  sh(d, "git", "config", "user.name", "Test");
  return d;
}

function commitAll(d: string, msg: string) {
  sh(d, "git", "add", "-A");
  sh(d, "git", "commit", "-q", "-m", msg);
}

function runChecker(cwd: string, base: string, ...flags: string[]) {
  return spawnSync("bun", ["run", SCRIPT, ...flags], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, COMPLIANCE_BASE: base },
  });
}

describe("large diffs (spawnSync maxBuffer regression)", () => {
  test("a >1MB diff is fully evaluated instead of dying with ENOBUFS", () => {
    const d = initRepo("large-diff");
    writeFileSync(join(d, "README.md"), "base\n");
    commitAll(d, "base");

    // >2MB of added lines — over spawnSync's 1MB default maxBuffer — plus a
    // security-touching file without a citation, so we can tell the checker
    // actually reached the evaluation stage (it must flag it, not error out).
    const bigLine = "x".repeat(100);
    writeFileSync(
      join(d, "generated.txt"),
      Array.from({ length: 25_000 }, (_, i) => `line ${i} ${bigLine}`).join("\n")
    );
    mkdirSync(join(d, "src/auth"), { recursive: true });
    writeFileSync(
      join(d, "src/auth/login.ts"),
      'export function login(password: string) {\n  return password.length > 0;\n}\n'
    );
    commitAll(d, "add generated data and login");

    const r = runChecker(d, "main^", "--strict");
    expect(r.stderr).not.toContain("failed:");
    expect(r.stderr).toContain("[compliance-check]");
    expect(r.stderr).toContain("src/auth/login.ts");
    expect(r.status).toBe(1);
  });

  test("mass-delete commit passes: deletions need no citation", () => {
    const d = initRepo("mass-delete");
    // Enough content that the *deletion* diff alone would exceed 1MB without
    // --diff-filter=ACMR.
    const bigLine = "y".repeat(100);
    for (let f = 0; f < 8; f++) {
      writeFileSync(
        join(d, `doc-${f}.md`),
        Array.from({ length: 4_000 }, (_, i) => `row ${i} ${bigLine}`).join("\n")
      );
    }
    commitAll(d, "base with bulk docs");
    for (let f = 0; f < 8; f++) rmSync(join(d, `doc-${f}.md`));
    commitAll(d, "purge bulk docs");

    const r = runChecker(d, "main^", "--strict");
    expect(r.stderr).not.toContain("failed:");
    expect(r.status).toBe(0);
  });

  test("non-strict git failure is a loud skip, not a silent pass", () => {
    const d = initRepo("bad-base");
    writeFileSync(join(d, "README.md"), "base\n");
    commitAll(d, "base");

    const r = runChecker(d, "no-such-ref");
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("SKIPPED");
  });
});
