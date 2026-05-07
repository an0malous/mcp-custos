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

function summarize(c: NistControl) {
  return {
    id: c.id,
    title: c.title,
    statement: c.statement,
    related_controls: c.related_controls,
    enhancement_count: c.enhancements.length,
  };
}

function detailed(c: NistControl) {
  return {
    id: c.id,
    title: c.title,
    statement: c.statement,
    guidance: c.guidance,
    related_controls: c.related_controls,
    enhancements: c.enhancements.map((e) => ({
      id: e.id,
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
  const normalized = controlId.toUpperCase().replace(/_/g, "-");
  const control = allControlsWithEnhancements(d).find(
    (c) => c.id === normalized
  );
  if (!control) return null;
  return detail ? detailed(control) : summarize(control);
}

export async function searchNistControls(query: string, limit: number = 20) {
  const d = await load();
  const q = query.toLowerCase();
  const matches = allControlsWithEnhancements(d).filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.statement.toLowerCase().includes(q) ||
      c.guidance.toLowerCase().includes(q)
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
  return family.controls.map(summarize);
}

export async function listNistFamilies() {
  const d = await load();
  return d.families.map((f) => ({
    id: f.id,
    name: f.name,
    control_count: f.controls.length,
  }));
}
