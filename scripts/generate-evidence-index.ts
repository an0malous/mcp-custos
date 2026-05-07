#!/usr/bin/env bun
/**
 * Scans a target repo for `// Refs: NIST <id>` and `// Refs: ASVS V<x.y.z>`
 * citations, resolves NIST → ISO Annex A via the existing mappings, and
 * writes a COMPLIANCE.md grouped by ISO control id (audit-language headers).
 *
 * Usage:
 *   bun run scripts/generate-evidence-index.ts [target-repo-path] [--out=COMPLIANCE.md]
 *
 * Defaults: target = cwd, output = ./COMPLIANCE.md
 */
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { lookupNistControl } from "../src/tools/nist.js";
import {
  REF_LINE_RE,
  NIST_RE,
  ASVS_RE,
} from "../src/compliance-detect.js";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

const args = process.argv.slice(2);
const target = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
const outFlag = args.find((a) => a.startsWith("--out="));
const outPath = resolve(outFlag ? outFlag.split("=")[1] : "COMPLIANCE.md");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
]);

const TEXT_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".scala",
  ".cs", ".php", ".swift", ".m", ".cpp", ".cc", ".c", ".h",
  ".tf", ".hcl", ".yaml", ".yml", ".json", ".sh", ".bash",
  ".sql", ".graphql", ".proto",
]);

interface Hit {
  file: string;
  line: number;
  nist: string[];
  asvs: string[];
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile()) {
      if (st.size > MAX_FILE_BYTES) continue;
      const dot = entry.lastIndexOf(".");
      const ext = dot === -1 ? "" : entry.slice(dot);
      if (TEXT_EXTS.has(ext)) yield full;
    }
  }
}

const hits: Hit[] = [];
for (const file of walk(target)) {
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const matches = [...lines[i].matchAll(REF_LINE_RE)];
    if (matches.length === 0) continue;
    const nist: string[] = [];
    const asvs: string[] = [];
    for (const m of matches) {
      const body = m[1];
      for (const n of body.matchAll(NIST_RE)) nist.push(n[1]);
      for (const a of body.matchAll(ASVS_RE)) asvs.push(a[1]);
    }
    if (nist.length > 0 || asvs.length > 0) {
      hits.push({
        file: relative(target, file),
        line: i + 1,
        nist: Array.from(new Set(nist)),
        asvs: Array.from(new Set(asvs)),
      });
    }
  }
}

interface IsoData {
  categories: { controls: { id: string; title: string; nist: string[] }[] }[];
}
const isoFile = Bun.file(
  new URL("../src/data/iso-27001-controls.json", import.meta.url).pathname
);
const isoData = (await isoFile.json()) as IsoData;
const isoControls = isoData.categories.flatMap((c) => c.controls);

const nistToIso = new Map<string, { id: string; title: string }[]>();
for (const c of isoControls) {
  for (const n of c.nist ?? []) {
    const list = nistToIso.get(n) ?? [];
    list.push({ id: c.id, title: c.title });
    nistToIso.set(n, list);
  }
}

interface IsoRollup {
  iso: { id: string; title: string };
  hits: Hit[];
  nistControls: Set<string>;
}
const byIso = new Map<string, IsoRollup>();
const orphans: Hit[] = [];

for (const h of hits) {
  if (h.nist.length === 0) {
    orphans.push(h);
    continue;
  }
  const isos = new Set<string>();
  for (const n of h.nist) {
    const baseId = n.split(/[(.]/)[0];
    const matches = nistToIso.get(n) ?? nistToIso.get(baseId) ?? [];
    for (const iso of matches) {
      const key = iso.id;
      isos.add(key);
      if (!byIso.has(key)) {
        byIso.set(key, { iso, hits: [], nistControls: new Set() });
      }
      const r = byIso.get(key)!;
      r.hits.push(h);
      h.nist.forEach((c) => r.nistControls.add(c));
    }
  }
  if (isos.size === 0) orphans.push(h);
}

async function nistTitle(id: string): Promise<string> {
  const r = (await lookupNistControl(id, false)) as
    | { title?: string }
    | null;
  return r?.title ?? "";
}

const lines: string[] = [];
lines.push("# Compliance evidence index");
lines.push("");
lines.push(
  `Generated from \`// Refs:\` annotations in this repository. Each ISO 27001 Annex A control below points to the implementing NIST 800-53 controls and the file:line where the citation appears.`
);
lines.push("");
lines.push(
  `Total citations: ${hits.length}. Mapped to ISO Annex A: ${byIso.size}. Orphans (NIST refs with no ISO mapping): ${orphans.length}.`
);
lines.push("");

const sortedIso = Array.from(byIso.values()).sort((a, b) =>
  a.iso.id.localeCompare(b.iso.id, undefined, { numeric: true })
);
for (const r of sortedIso) {
  lines.push(`## ${r.iso.id} — ${r.iso.title}`);
  const nistList = Array.from(r.nistControls).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  const titled = await Promise.all(
    nistList.map(async (n) => {
      const t = await nistTitle(n);
      return t ? `${n} (${t})` : n;
    })
  );
  lines.push(`**Implementing NIST controls:** ${titled.join(", ")}`);
  lines.push("");
  lines.push("**Evidence:**");
  const seen = new Set<string>();
  for (const h of r.hits) {
    const key = `${h.file}:${h.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const refs = [
      ...h.nist.map((n) => `NIST ${n}`),
      ...h.asvs.map((a) => `ASVS ${a}`),
    ];
    lines.push(`- \`${h.file}:${h.line}\` — ${refs.join(", ")}`);
  }
  lines.push("");
}

if (orphans.length > 0) {
  lines.push(`## Citations with no ISO mapping`);
  lines.push("");
  lines.push(
    "These citations reference NIST controls that aren't currently mapped to an ISO Annex A control via OLIR — usually means the NIST control is granular (an enhancement) or covers an area outside ISO 27001 scope. Still valid evidence, just not audit-mapped."
  );
  lines.push("");
  for (const h of orphans) {
    const refs = [
      ...h.nist.map((n) => `NIST ${n}`),
      ...h.asvs.map((a) => `ASVS ${a}`),
    ];
    lines.push(`- \`${h.file}:${h.line}\` — ${refs.join(", ")}`);
  }
  lines.push("");
}

await Bun.write(outPath, lines.join("\n"));
console.log(`Wrote ${outPath} — ${hits.length} citations, ${byIso.size} ISO controls covered, ${orphans.length} orphans.`);
