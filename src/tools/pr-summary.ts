import { spawnSync } from "node:child_process";
import { extractCitations } from "../compliance-detect.js";
import { parseAddedByFile, uniqSorted } from "../diff-utils.js";

// Large PR diffs overflow spawnSync's 1 MB default maxBuffer (ENOBUFS →
// status=null), which silently turned the summary into "no citations".
const GIT_MAX_BUFFER = 256 * 1024 * 1024;

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: GIT_MAX_BUFFER });
  if (r.error || r.status !== 0) return "";
  return r.stdout;
}

export interface PrSummary {
  base: string;
  files_with_citations: { path: string; refs: string[] }[];
  unique_nist: string[];
  unique_asvs: string[];
  citation_block: string;
}

export async function prComplianceSummary(
  cwd: string = process.cwd(),
  base: string = "origin/main"
): Promise<PrSummary> {
  const diff = git(cwd, "diff", "--unified=0", `${base}...HEAD`);
  if (!diff) {
    return {
      base,
      files_with_citations: [],
      unique_nist: [],
      unique_asvs: [],
      citation_block: "",
    };
  }

  const fileBlocks = parseAddedByFile(diff);
  const filesWithCitations: { path: string; refs: string[] }[] = [];
  const allNist: string[] = [];
  const allAsvs: string[] = [];

  for (const [path, added] of fileBlocks) {
    const { nist, asvs } = extractCitations(added);
    if (nist.length === 0 && asvs.length === 0) continue;
    allNist.push(...nist);
    allAsvs.push(...asvs);
    const refs = [
      ...nist.map((n) => `NIST ${n}`),
      ...asvs.map((a) => `ASVS ${a}`),
    ];
    filesWithCitations.push({ path, refs: uniqSorted(refs) });
  }

  const uniqueNist = uniqSorted(allNist);
  const uniqueAsvs = uniqSorted(allAsvs);

  const parts: string[] = [];
  if (uniqueNist.length) parts.push(`NIST ${uniqueNist.join(", ")}`);
  if (uniqueAsvs.length) parts.push(`ASVS ${uniqueAsvs.join(", ")}`);
  const citation_block = parts.length ? `Refs: ${parts.join(" · ")}` : "";

  return {
    base,
    files_with_citations: filesWithCitations,
    unique_nist: uniqueNist,
    unique_asvs: uniqueAsvs,
    citation_block,
  };
}
