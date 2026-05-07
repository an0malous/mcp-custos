import { resolveNistCloudRefs } from "./nist-cloud.js";
import { paginate } from "./_shared.js";

interface CloudControl {
  id: string;
  title: string;
  nist_refs: string[];
}

interface CloudSection {
  id: string;
  name: string;
  controls: CloudControl[];
}

interface CloudData {
  standard: string;
  version: string;
  description: string;
  sections: CloudSection[];
}

let data: CloudData | null = null;

async function load(): Promise<CloudData> {
  if (data) return data;
  const file = Bun.file(
    new URL("../data/iso-27017-controls.json", import.meta.url).pathname
  );
  data = (await file.json()) as CloudData;
  return data;
}

function allControls(d: CloudData): CloudControl[] {
  return d.sections.flatMap((s) => s.controls);
}

export async function lookupCloudControl(controlId: string) {
  const d = await load();
  const normalized = controlId.toUpperCase().replace(/^CLD\.?/, "CLD.");
  const control = allControls(d).find(
    (c) => c.id.toUpperCase() === normalized
  );
  if (!control) return null;
  const guidance = await resolveNistCloudRefs(control.nist_refs);
  return {
    id: control.id,
    title: control.title,
    nist_cloud_guidance: guidance.map((g) => ({
      id: g.id,
      title: g.title,
      source: g.source,
      section: g.section,
      guidance: g.guidance,
      nist_controls: g.nist_controls,
    })),
  };
}

export async function searchCloudControls(query: string, limit: number = 20) {
  const d = await load();
  const q = query.toLowerCase();

  const guidanceData = await resolveNistCloudRefs(
    [...new Set(allControls(d).flatMap((c) => c.nist_refs))]
  );
  const guidanceMap = new Map(guidanceData.map((g) => [g.id, g]));

  const matches = allControls(d).filter((c) => {
    if (c.title.toLowerCase().includes(q)) return true;
    return c.nist_refs.some((ref) => {
      const g = guidanceMap.get(ref);
      return g && (g.title.toLowerCase().includes(q) || g.guidance.toLowerCase().includes(q));
    });
  });
  return paginate(matches, limit, (c) => ({
    id: c.id,
    title: c.title,
    nist_refs: c.nist_refs,
  }));
}

export async function listCloudSection(sectionId: string) {
  const d = await load();
  const section = d.sections.find((s) => s.id === sectionId);
  if (!section) return null;
  return section.controls.map((c) => ({
    id: c.id,
    title: c.title,
    nist_refs: c.nist_refs,
  }));
}

export async function listCloudSections() {
  const d = await load();
  return d.sections.map((s) => ({
    id: s.id,
    name: s.name,
    controlCount: s.controls.length,
  }));
}
