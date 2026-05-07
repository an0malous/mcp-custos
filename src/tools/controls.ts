import { lookupNistControl } from "./nist.js";
import { paginate } from "./_shared.js";

interface IsoControl {
  id: string;
  title: string;
  nist: string[];
}

interface IsoCategory {
  id: string;
  name: string;
  controls: IsoControl[];
}

interface IsoData {
  standard: string;
  version: string;
  categories: IsoCategory[];
}

let data: IsoData | null = null;

async function load(): Promise<IsoData> {
  if (data) return data;
  const file = Bun.file(
    new URL("../data/iso-27001-controls.json", import.meta.url).pathname
  );
  data = (await file.json()) as IsoData;
  return data;
}

function allControls(d: IsoData): IsoControl[] {
  return d.categories.flatMap((cat) => cat.controls);
}

export async function lookupControl(controlId: string, detailed: boolean = false) {
  const d = await load();
  const normalized = controlId.toUpperCase().replace(/^A\.?/, "A.");
  const control = allControls(d).find((c) => c.id.toUpperCase() === normalized);
  if (!control) return null;

  const nistDetails = await Promise.all(
    control.nist.map((id) => lookupNistControl(id, detailed))
  );

  return {
    iso_control: { id: control.id, title: control.title },
    mapped_nist_controls: control.nist.map((id, i) => ({
      nist_id: id,
      ...(nistDetails[i] as object),
    })),
  };
}

export async function searchControls(query: string, limit: number = 20) {
  const d = await load();
  const q = query.toLowerCase();
  const matches = allControls(d).filter((c) => c.title.toLowerCase().includes(q));
  return paginate(matches, limit, (c) => ({
    id: c.id,
    title: c.title,
    nist_mappings: c.nist,
  }));
}

export async function listByCategory(categoryId: string) {
  const d = await load();
  const cat = d.categories.find(
    (c) => c.id.toLowerCase() === categoryId.toLowerCase()
  );
  if (!cat) return null;
  return cat.controls.map((c) => ({
    id: c.id,
    title: c.title,
    nist_mappings: c.nist,
  }));
}

export async function listCategories() {
  const d = await load();
  return d.categories.map((c) => ({
    id: c.id,
    name: c.name,
    controlCount: c.controls.length,
  }));
}
