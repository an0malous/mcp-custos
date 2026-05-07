import { spawnSync } from "node:child_process";

const REF_LINE_RE =
  /(?:\/\/|#|\/\*|\*)\s*(?:Refs|Compliance):\s*([^\n*]+)/gi;

const NIST_RE = /\bNIST\s+([A-Z]{2}-\d+(?:\(\d+\))?(?:\.\d+)?)/gi;
const ASVS_RE = /\bASVS\s+(V\d+(?:\.\d+){0,2})/gi;

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) return "";
  return r.stdout;
}

function uniqSorted(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
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

  const fileBlocks = new Map<string, string>();
  let currentFile: string | null = null;
  for (const line of diff.split("\n")) {
    const m = line.match(/^\+\+\+ b\/(.+)$/);
    if (m) {
      currentFile = m[1];
      if (!fileBlocks.has(currentFile)) fileBlocks.set(currentFile, "");
      continue;
    }
    if (currentFile && line.startsWith("+") && !line.startsWith("+++")) {
      fileBlocks.set(
        currentFile,
        fileBlocks.get(currentFile)! + line.slice(1) + "\n"
      );
    }
  }

  const filesWithCitations: { path: string; refs: string[] }[] = [];
  const allNist: string[] = [];
  const allAsvs: string[] = [];

  for (const [path, added] of fileBlocks) {
    const refs: string[] = [];
    const refLines = [...added.matchAll(REF_LINE_RE)];
    for (const refLine of refLines) {
      const body = refLine[1];
      for (const m of body.matchAll(NIST_RE)) {
        refs.push(`NIST ${m[1]}`);
        allNist.push(m[1]);
      }
      for (const m of body.matchAll(ASVS_RE)) {
        refs.push(`ASVS ${m[1]}`);
        allAsvs.push(m[1]);
      }
    }
    if (refs.length > 0) {
      filesWithCitations.push({ path, refs: uniqSorted(refs) });
    }
  }

  const uniqueNist = uniqSorted(allNist);
  const uniqueAsvs = uniqSorted(allAsvs);

  const citationBlock = (() => {
    if (uniqueNist.length === 0 && uniqueAsvs.length === 0) return "";
    const parts: string[] = [];
    if (uniqueNist.length)
      parts.push(`NIST ${uniqueNist.join(", ")}`);
    if (uniqueAsvs.length)
      parts.push(`ASVS ${uniqueAsvs.join(", ")}`);
    return `Refs: ${parts.join(" · ")}`;
  })();

  return {
    base,
    files_with_citations: filesWithCitations,
    unique_nist: uniqueNist,
    unique_asvs: uniqueAsvs,
    citation_block: citationBlock,
  };
}
