#!/usr/bin/env bun
/**
 * Refreshes all bundled data files from upstream and reports diffs.
 *
 * Sources fetched:
 *   - NIST 800-53 OSCAL catalog (usnistgov/oscal-content)
 *   - NIST SSDF v1.1 OSCAL catalog (usnistgov/oscal-content)
 *   - OWASP ASVS release JSON (OWASP/ASVS GitHub releases)
 *
 * Verifies (read-only):
 *   - ISO 27001 control titles against the snapshotted ISO 27002:2022 TOC
 *
 * Skipped (manually curated, no upstream auto-update):
 *   - ISO 27017 controls
 *   - NIST cloud guidance (extracted from PDFs)
 *   - CWE Top 25 (hand-curated mappings)
 *
 * Usage: bun run scripts/update-sources.ts
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const DATA_DIR = resolve(REPO_ROOT, "src/data");

interface SourceSpec {
  name: string;
  outPath: string;
  url?: string;
  parser?: () => Promise<{ summary: string }>;
  countSummary: (data: unknown) => string;
}

async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`);
  return r.json();
}

function fileBefore(path: string) {
  if (!existsSync(path)) return { exists: false, size: 0, countSummary: "" };
  return { exists: true, size: statSync(path).size, countSummary: "" };
}

async function fileAfter(path: string, countSummary: string) {
  return {
    exists: existsSync(path),
    size: existsSync(path) ? statSync(path).size : 0,
    countSummary,
  };
}

const NIST_80053_URL =
  "https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog-min.json";

const NIST_SSDF_URL =
  "https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-218/ver1/json/NIST_SP800-218_ver1_catalog-min.json";

const ASVS_LATEST_RELEASE =
  "https://api.github.com/repos/OWASP/ASVS/releases/latest";

interface OscalPart {
  id?: string;
  name: string;
  prose?: string;
  parts?: OscalPart[];
}
interface OscalControl {
  id: string;
  title: string;
  parts?: OscalPart[];
  controls?: OscalControl[];
  links?: { href: string; rel: string }[];
}
interface OscalGroup {
  id: string;
  title: string;
  controls: OscalControl[];
}

function extractProse(part: OscalPart): string {
  let t = part.prose || "";
  if (part.parts) for (const p of part.parts) t += "\n" + extractProse(p);
  return t.trim();
}
function cleanParamRefs(text: string): string {
  return text.replace(
    /\{\{\s*insert:\s*param,\s*[\w.-]+\s*\}\}/g,
    "[org-defined]"
  );
}
function parseNistControl(c: OscalControl): {
  id: string;
  title: string;
  statement: string;
  guidance: string;
  related_controls: string[];
  enhancements: ReturnType<typeof parseNistControl>[];
} {
  const stmt = c.parts?.find((p) => p.name === "statement");
  const gd = c.parts?.find((p) => p.name === "guidance");
  return {
    id: c.id.toUpperCase(),
    title: c.title,
    statement: stmt ? cleanParamRefs(extractProse(stmt)) : "",
    guidance: gd ? cleanParamRefs(gd.prose || "") : "",
    related_controls:
      c.links
        ?.filter((l) => l.rel === "related")
        .map((l) => l.href.replace(/^#/, "").toUpperCase()) ?? [],
    enhancements: (c.controls ?? []).map(parseNistControl),
  };
}

async function updateNist80053(): Promise<string> {
  const out = resolve(DATA_DIR, "nist-800-53.json");
  const before = fileBefore(out);
  const raw = (await fetchJson(NIST_80053_URL)) as {
    catalog: {
      metadata: { version: string; "last-modified": string };
      groups: OscalGroup[];
    };
  };
  const data = {
    standard: "NIST SP 800-53",
    version: raw.catalog.metadata.version,
    last_modified: raw.catalog.metadata["last-modified"],
    families: raw.catalog.groups.map((g) => ({
      id: g.id.toUpperCase(),
      name: g.title,
      controls: g.controls.map(parseNistControl),
    })),
  };
  await Bun.write(out, JSON.stringify(data, null, 2));
  const total = data.families.reduce((s, f) => s + f.controls.length, 0);
  const enh = data.families.reduce(
    (s, f) => s + f.controls.reduce((x, c) => x + c.enhancements.length, 0),
    0
  );
  const after = await fileAfter(
    out,
    `${total} controls + ${enh} enhancements (v${data.version})`
  );
  return `nist-800-53.json: ${after.countSummary}, ${
    before.size === 0 ? "new" : `${(after.size - before.size) / 1024 | 0}KB delta`
  }`;
}

const SSDF_GROUP_NAMES: Record<string, string> = {
  PO: "Prepare the Organization",
  PS: "Protect the Software",
  PW: "Produce Well-Secured Software",
  RV: "Respond to Vulnerabilities",
};

async function updateSsdf(): Promise<string> {
  const out = resolve(DATA_DIR, "nist-ssdf.json");
  const before = fileBefore(out);
  const raw = (await fetchJson(NIST_SSDF_URL)) as {
    catalog: {
      metadata: { version: string; "last-modified": string };
      groups: {
        id: string;
        title: string;
        parts?: OscalPart[];
        controls: OscalControl[];
      }[];
      "back-matter": { resources: { uuid: string; title: string }[] };
    };
  };
  const cat = raw.catalog;
  const titleByUuid: Record<string, string> = {};
  for (const r of cat["back-matter"].resources) titleByUuid[r.uuid] = r.title;

  const statement = (c: OscalControl): string =>
    c.parts?.find((p) => p.name === "statement")?.prose?.trim() ?? "";
  const parseRefs = (
    links?: { href: string; rel?: string; text?: string }[]
  ): Record<string, string[]> => {
    const refs: Record<string, string[]> = {};
    for (const l of links ?? []) {
      if (!l.href?.startsWith("#") || !l.text) continue;
      const fw = titleByUuid[l.href.slice(1)];
      if (!fw) continue;
      const ids = l.text
        .split(/[,;]\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length) refs[fw] = (refs[fw] ?? []).concat(ids);
    }
    return refs;
  };

  const data = {
    standard: "NIST SP 800-218",
    name: "Secure Software Development Framework (SSDF)",
    // SSDF document version (what users care about). cat.metadata.version
    // is the OSCAL serialization version, not the SSDF version.
    version: "1.1",
    oscal_version: cat.metadata.version,
    last_modified: cat.metadata["last-modified"],
    url: "https://csrc.nist.gov/pubs/sp/800/218/final",
    source: NIST_SSDF_URL,
    groups: cat.groups.map((g) => ({
      id: g.id,
      name: SSDF_GROUP_NAMES[g.id] ?? g.title,
      description: g.parts
        ? statement(g as unknown as OscalControl)
        : "",
      practices: g.controls.map((p) => ({
        id: p.id,
        title: p.title,
        text: statement(p),
        references: parseRefs(p.links),
        tasks: (p.controls ?? []).map((t) => ({
          id: t.id,
          text: statement(t),
          references: parseRefs(t.links),
        })),
      })),
    })),
  };
  await Bun.write(out, JSON.stringify(data, null, 2) + "\n");
  const tasks = data.groups.flatMap((g) =>
    g.practices.flatMap((p) => p.tasks)
  );
  const after = await fileAfter(
    out,
    `${data.groups.length} groups, ${data.groups.reduce((s, g) => s + g.practices.length, 0)} practices, ${tasks.length} tasks (v${data.version})`
  );
  return `nist-ssdf.json: ${after.countSummary}, ${
    before.size === 0 ? "new" : `${(after.size - before.size) / 1024 | 0}KB delta`
  }`;
}

async function updateAsvs(): Promise<string> {
  const out = resolve(DATA_DIR, "owasp-asvs.json");
  const before = fileBefore(out);
  const release = (await fetchJson(ASVS_LATEST_RELEASE)) as {
    name: string;
    assets: { name: string; browser_download_url: string }[];
  };
  const asset = release.assets.find(
    (a) => /_en\.json$/.test(a.name) && !/legacy|flat/i.test(a.name)
  );
  if (!asset) throw new Error("ASVS: could not locate the standard JSON asset");
  const r = await fetch(asset.browser_download_url);
  if (!r.ok) throw new Error(`ASVS asset fetch failed: ${r.status}`);
  const text = await r.text();
  await Bun.write(out, text);
  const data = JSON.parse(text) as {
    Version: string;
    Requirements: { Items: { Items: { L: string }[] }[] }[];
  };
  let total = 0;
  for (const ch of data.Requirements)
    for (const sec of ch.Items) total += sec.Items.length;
  const after = await fileAfter(
    out,
    `${total} requirements (v${data.Version})`
  );
  return `owasp-asvs.json: ${after.countSummary}, ${
    before.size === 0 ? "new" : `${(after.size - before.size) / 1024 | 0}KB delta`
  }`;
}

function runVerifyIso(): string {
  const r = spawnSync(
    "bun",
    ["run", resolve(SCRIPT_DIR, "verify-iso-controls.ts")],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }
  );
  if (r.status === 0) return "iso-27001-controls.json: verified against TOC";
  return `iso-27001-controls.json: VERIFY FAILED — ${r.stdout}\n${r.stderr}`;
}

const tasks: { name: string; run: () => Promise<string> | string }[] = [
  { name: "NIST 800-53 OSCAL", run: updateNist80053 },
  { name: "NIST SSDF OSCAL", run: updateSsdf },
  { name: "OWASP ASVS release", run: updateAsvs },
  { name: "ISO 27001 verify", run: runVerifyIso },
];

const results: { name: string; ok: boolean; message: string }[] = [];
for (const t of tasks) {
  console.log(`==> ${t.name}`);
  try {
    const msg = await t.run();
    console.log(`    ${msg}`);
    results.push({ name: t.name, ok: !msg.includes("FAILED"), message: msg });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`    FAILED: ${msg}`);
    results.push({ name: t.name, ok: false, message: msg });
  }
}

console.log("\nSummary:");
for (const r of results) {
  console.log(`  [${r.ok ? "ok" : "FAIL"}] ${r.name}: ${r.message}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(
  `\n${results.length - failed} of ${results.length} sources updated cleanly. ${
    failed > 0 ? `${failed} failed — investigate.` : ""
  }`
);
process.exit(failed > 0 ? 1 : 0);
