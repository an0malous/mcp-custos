export const json = (v: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(v) }],
});

export const text = (s: string) => ({
  content: [{ type: "text" as const, text: s }],
});

export function paginate<T, U>(
  matches: T[],
  limit: number,
  map: (t: T) => U
): { total: number; returned: number; results: U[] } {
  return {
    total: matches.length,
    returned: Math.min(matches.length, limit),
    results: matches.slice(0, limit).map(map),
  };
}
