/**
 * Tiny helpers for git-diff parsing shared by hooks and the PR-summary tool.
 */

/**
 * Parse a unified-format git diff and return added-lines text per file.
 * Returns a Map keyed by post-image path with concatenated added lines
 * (without the leading `+`).
 */
export function parseAddedByFile(diff: string): Map<string, string> {
  const blocks = new Map<string, string>();
  let current: string | null = null;
  for (const line of diff.split("\n")) {
    const m = line.match(/^\+\+\+ b\/(.+)$/);
    if (m) {
      current = m[1];
      if (!blocks.has(current)) blocks.set(current, "");
      continue;
    }
    if (current && line.startsWith("+") && !line.startsWith("+++")) {
      blocks.set(current, (blocks.get(current) ?? "") + line.slice(1) + "\n");
    }
  }
  return blocks;
}

/**
 * Sort + dedupe with natural-numeric ordering (so AC-1, AC-2, AC-10 come out
 * in that order rather than AC-1, AC-10, AC-2).
 */
export function uniqSorted(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
}
