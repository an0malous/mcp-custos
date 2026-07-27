import type { NistData, NistControl } from "../types.js";
import { paginate } from "./_shared.js";

let data: NistData | null = null;

async function load(): Promise<NistData> {
  if (data) return data;
  const file = Bun.file(
    new URL("../data/nist-800-53.json", import.meta.url).pathname
  );
  data = (await file.json()) as NistData;
  return data;
}

function allControls(d: NistData): NistControl[] {
  return d.families.flatMap((f) => f.controls);
}

function allControlsWithEnhancements(d: NistData): NistControl[] {
  return d.families.flatMap((f) =>
    f.controls.flatMap((c) => [c, ...c.enhancements])
  );
}

/**
 * Withdrawn/incorporated entries ship in the OSCAL catalog with an empty
 * statement (180 of 1196 entries) and carry no guidance either — an empty
 * statement is the only marker the data provides.
 */
function isWithdrawn(c: NistControl): boolean {
  return c.statement.trim() === "";
}

function activeEnhancements(c: NistControl): NistControl[] {
  return c.enhancements.filter((e) => !isWithdrawn(e));
}

/**
 * Canonical form for lookups is the OSCAL dot form (IA-5.1); the citation
 * convention in code comments and hooks is the paren form (IA-5(1)).
 * Both are accepted on input; `cite_as` carries the citation form on output.
 */
export function normalizeNistId(id: string): string {
  return id
    .trim()
    .toUpperCase()
    .replace(/_/g, "-")
    .replace(/\((\d+)\)/g, ".$1");
}

export function citationForm(id: string): string {
  return id.replace(/\.(\d+)$/, "($1)");
}

function summarize(c: NistControl) {
  return {
    id: c.id,
    cite_as: citationForm(c.id),
    title: c.title,
    statement: c.statement,
    related_controls: c.related_controls,
    enhancement_count: activeEnhancements(c).length,
  };
}

function detailed(c: NistControl) {
  return {
    id: c.id,
    cite_as: citationForm(c.id),
    title: c.title,
    statement: c.statement,
    guidance: c.guidance,
    related_controls: c.related_controls,
    enhancements: activeEnhancements(c).map((e) => ({
      id: e.id,
      cite_as: citationForm(e.id),
      title: e.title,
      statement: e.statement,
      guidance: e.guidance,
    })),
  };
}

export async function lookupNistControl(
  controlId: string,
  detail: boolean = false
): Promise<object | null> {
  const d = await load();
  const normalized = normalizeNistId(controlId);
  const control = allControlsWithEnhancements(d).find(
    (c) => c.id === normalized
  );
  if (!control) return null;
  if (isWithdrawn(control)) {
    return {
      id: control.id,
      cite_as: citationForm(control.id),
      title: control.title,
      withdrawn: true,
      note: "This control has been withdrawn from NIST 800-53 Rev 5 (typically incorporated into another control). Do not cite it; search for the successor control instead.",
    };
  }
  return detail ? detailed(control) : summarize(control);
}

export async function searchNistControls(query: string, limit: number = 20) {
  const d = await load();
  const q = query.toLowerCase();
  const matches = allControlsWithEnhancements(d).filter(
    (c) =>
      !isWithdrawn(c) &&
      (c.title.toLowerCase().includes(q) ||
        c.statement.toLowerCase().includes(q) ||
        c.guidance.toLowerCase().includes(q))
  );
  return paginate(matches, limit, summarize);
}

export async function listNistFamily(
  familyId: string
): Promise<object[] | null> {
  const d = await load();
  const family = d.families.find(
    (f) => f.id === familyId.toUpperCase()
  );
  if (!family) return null;
  return family.controls.filter((c) => !isWithdrawn(c)).map(summarize);
}

export async function listNistFamilies() {
  const d = await load();
  return d.families.map((f) => ({
    id: f.id,
    name: f.name,
    control_count: f.controls.filter((c) => !isWithdrawn(c)).length,
  }));
}
