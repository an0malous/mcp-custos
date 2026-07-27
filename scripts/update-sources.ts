#!/usr/bin/env bun
/**
 * Refreshes all bundled data files from upstream and reports diffs.
 *
 * Sources fetched:
 *   - NIST 800-53 OSCAL catalog (usnistgov/oscal-content)
 *   - NIST SSDF v1.1 OSCAL catalog (usnistgov/oscal-content)
 *   - OWASP ASVS release JSON (OWASP/ASVS GitHub releases)
 *   - MITRE CWE cwec catalog (cwe.mitre.org zip; curated overlay merged
 *     from src/data/cwe-curated-overlay.json)
 *
 * Verifies (read-only):
 *   - ISO 27001 control titles against the snapshotted ISO 27002:2022 TOC
 *
 * Skipped (manually curated, no upstream auto-update):
 *   - ISO 27017 controls
 *   - NIST cloud guidance (extracted from PDFs)
 *
 * Usage: bun run scripts/update-sources.ts
 *
 * URLs are pinned to the `main` branch of the upstream repos. If NIST
 * rebrands, fix the consts below.
 */
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import {
  buildResourceTitleMap,
  parseExternalRefs,
  parseNistControl,
  statementOf,
  type OscalCatalog,
} from "./_oscal.js";
import { buildDataset, parseCwecXml, type CweCuratedOverlay } from "./_cwe.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const DATA_DIR = resolve(REPO_ROOT, "src/data");

const NIST_80053_URL =
  "https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog-min.json";
const NIST_SSDF_URL =
  "https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-218/ver1/json/NIST_SP800-218_ver1_catalog-min.json";
const ASVS_LATEST_RELEASE =
  "https://api.github.com/repos/OWASP/ASVS/releases/latest";
const CWE_ZIP_URL = "https://cwe.mitre.org/data/xml/cwec_latest.xml.zip";

const SSDF_GROUP_NAMES: Record<string, string> = {
  PO: "Prepare the Organization",
  PS: "Protect the Software",
  PW: "Produce Well-Secured Software",
  RV: "Respond to Vulnerabilities",
};

async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`);
  return r.json();
}

function sizeKbDelta(beforeBytes: number, afterPath: string): string {
  if (beforeBytes === 0) return "new";
  const after = existsSync(afterPath) ? statSync(afterPath).size : 0;
  return `${((after - beforeBytes) / 1024) | 0}KB delta`;
}

function priorSize(path: string): number {
  return existsSync(path) ? statSync(path).size : 0;
}

async function updateNist80053(): Promise<string> {
  const out = resolve(DATA_DIR, "nist-800-53.json");
  const before = priorSize(out);
  const raw = (await fetchJson(NIST_80053_URL)) as OscalCatalog;
  const cat = raw.catalog;
  const data = {
    standard: "NIST SP 800-53",
    version: cat.metadata.version,
    last_modified: cat.metadata["last-modified"],
    source: NIST_80053_URL,
    source_repo: "https://github.com/usnistgov/oscal-content",
    families: cat.groups.map((g) => ({
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
  return `nist-800-53.json: ${total} controls + ${enh} enhancements (v${data.version}), ${sizeKbDelta(before, out)}`;
}

async function updateSsdf(): Promise<string> {
  const out = resolve(DATA_DIR, "nist-ssdf.json");
  const before = priorSize(out);
  const raw = (await fetchJson(NIST_SSDF_URL)) as OscalCatalog;
  const cat = raw.catalog;
  const titleByUuid = buildResourceTitleMap(cat);

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
      description: statementOf(g),
      practices: g.controls.map((p) => ({
        id: p.id,
        title: p.title,
        text: statementOf(p),
        references: parseExternalRefs(p.links, titleByUuid),
        tasks: (p.controls ?? []).map((t) => ({
          id: t.id,
          text: statementOf(t),
          references: parseExternalRefs(t.links, titleByUuid),
        })),
      })),
    })),
  };
  await Bun.write(out, JSON.stringify(data, null, 2) + "\n");
  const tasks = data.groups.flatMap((g) =>
    g.practices.flatMap((p) => p.tasks)
  );
  return `nist-ssdf.json: ${data.groups.length} groups, ${data.groups.reduce((s, g) => s + g.practices.length, 0)} practices, ${tasks.length} tasks (v${data.version}), ${sizeKbDelta(before, out)}`;
}

async function updateAsvs(): Promise<string> {
  const out = resolve(DATA_DIR, "owasp-asvs.json");
  const before = priorSize(out);
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
  return `owasp-asvs.json: ${total} requirements (v${data.Version}), ${sizeKbDelta(before, out)}`;
}

async function updateCwe(): Promise<string> {
  const out = resolve(DATA_DIR, "cwe.json");
  const before = priorSize(out);
  const r = await fetch(CWE_ZIP_URL);
  if (!r.ok) throw new Error(`fetch ${CWE_ZIP_URL} failed: ${r.status}`);
  const unzipped = unzipSync(new Uint8Array(await r.arrayBuffer()));
  const xmlName = Object.keys(unzipped).find((n) => n.endsWith(".xml"));
  if (!xmlName) throw new Error("cwec zip contains no .xml member");
  const xml = new TextDecoder().decode(unzipped[xmlName]);
  const overlay = (await Bun.file(
    resolve(DATA_DIR, "cwe-curated-overlay.json")
  ).json()) as CweCuratedOverlay;
  const dataset = buildDataset(parseCwecXml(xml), overlay);
  await Bun.write(out, JSON.stringify(dataset, null, 2));
  return `cwe.json: ${dataset.weaknesses.length} weaknesses (cwec v${dataset.catalog_version}), ${sizeKbDelta(before, out)}`;
}

function runVerifyIso(): Promise<string> {
  return new Promise((res) => {
    const script = resolve(SCRIPT_DIR, "verify-iso-controls.ts");
    const child = spawn("bun", ["run", script], { cwd: REPO_ROOT });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("close", (code) => {
      res(
        code === 0
          ? "iso-27001-controls.json: verified against TOC"
          : `iso-27001-controls.json: VERIFY FAILED — ${stderr}`
      );
    });
  });
}

const tasks = [
  { name: "NIST 800-53 OSCAL", run: updateNist80053 },
  { name: "NIST SSDF OSCAL", run: updateSsdf },
  { name: "OWASP ASVS release", run: updateAsvs },
  { name: "MITRE CWE catalog", run: updateCwe },
  { name: "ISO 27001 verify", run: runVerifyIso },
];

console.log("Refreshing sources in parallel...");
const settled = await Promise.allSettled(tasks.map((t) => t.run()));

const results = settled.map((s, i) => {
  if (s.status === "fulfilled") {
    const ok = !s.value.includes("FAILED");
    return { name: tasks[i].name, ok, message: s.value };
  }
  const msg =
    s.reason instanceof Error ? s.reason.message : String(s.reason);
  return { name: tasks[i].name, ok: false, message: `FAILED: ${msg}` };
});

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
