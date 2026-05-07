import type { NistData } from "../types.js";

interface IsoData {
  categories: { controls: { id: string; nist: string[] }[] }[];
}
interface CloudData {
  sections: { controls: { id: string; nist_refs: string[] }[] }[];
}
interface NistCloudData {
  sources: { id: string; title: string }[];
  topics: { source: string; nist_controls: string[] }[];
}
interface SsdfData {
  groups: {
    practices: {
      tasks: { references: Record<string, string[]> }[];
    }[];
  }[];
}
interface AsvsData {
  Version: string;
  Requirements: { Items: { Items: { L: string }[] }[] }[];
}

async function loadJson<T>(name: string): Promise<T> {
  const f = Bun.file(new URL(`../data/${name}`, import.meta.url).pathname);
  return (await f.json()) as T;
}

export async function mappingInventory() {
  const [iso, nist, cloud, nistCloud, ssdf, asvs] = await Promise.all([
    loadJson<IsoData>("iso-27001-controls.json"),
    loadJson<NistData>("nist-800-53.json"),
    loadJson<CloudData>("iso-27017-controls.json"),
    loadJson<NistCloudData>("nist-cloud-guidance.json"),
    loadJson<SsdfData>("nist-ssdf.json"),
    loadJson<AsvsData>("owasp-asvs.json"),
  ]);

  const isoControls = iso.categories.flatMap((c) => c.controls);
  const isoNistPairs = isoControls.reduce(
    (s, c) => s + (c.nist?.length ?? 0),
    0
  );

  const nistControlCount = nist.families.reduce(
    (s, f) => s + f.controls.length,
    0
  );
  const nistEnhancementCount = nist.families.reduce(
    (s, f) => s + f.controls.reduce((x, c) => x + c.enhancements.length, 0),
    0
  );

  const cloudControls = cloud.sections.flatMap((s) => s.controls);
  const cloudRefs = cloudControls.reduce(
    (s, c) => s + (c.nist_refs?.length ?? 0),
    0
  );
  const ngcRefs = nistCloud.topics.reduce(
    (s, t) => s + (t.nist_controls?.length ?? 0),
    0
  );

  const ssdfTasks = ssdf.groups.flatMap((g) =>
    g.practices.flatMap((p) => p.tasks)
  );
  const ssdfFrameworks = new Map<string, number>();
  for (const t of ssdfTasks) {
    for (const [fw, ids] of Object.entries(t.references)) {
      ssdfFrameworks.set(fw, (ssdfFrameworks.get(fw) ?? 0) + ids.length);
    }
  }
  const ssdfRefTotal = Array.from(ssdfFrameworks.values()).reduce(
    (s, n) => s + n,
    0
  );

  const asvsByLevel: Record<string, number> = {};
  let asvsTotal = 0;
  for (const ch of asvs.Requirements) {
    for (const sec of ch.Items) {
      for (const r of sec.Items) {
        asvsByLevel[r.L] = (asvsByLevel[r.L] ?? 0) + 1;
        asvsTotal += 1;
      }
    }
  }

  return {
    frameworks: {
      iso_27001_2022: { control_count: isoControls.length },
      nist_800_53: {
        base_control_count: nistControlCount,
        enhancement_count: nistEnhancementCount,
        family_count: nist.families.length,
      },
      iso_27017: { control_count: cloudControls.length },
      nist_cloud_guidance: {
        topic_count: nistCloud.topics.length,
        sources: nistCloud.sources.map((s) => s.id),
      },
      nist_ssdf: {
        version: "1.1",
        task_count: ssdfTasks.length,
        external_framework_count: ssdfFrameworks.size,
      },
      owasp_asvs: {
        version: asvs.Version,
        requirement_count: asvsTotal,
        by_level: asvsByLevel,
      },
    },
    cross_mappings: {
      iso_27001_to_nist_800_53: isoNistPairs,
      iso_27017_to_nist_cloud_guidance: cloudRefs,
      nist_cloud_guidance_to_nist_800_53: ngcRefs,
      ssdf_to_external_frameworks: Object.fromEntries(
        Array.from(ssdfFrameworks.entries()).sort((a, b) => b[1] - a[1])
      ),
      ssdf_total_external_refs: ssdfRefTotal,
    },
    notes: {
      hub: "NIST 800-53 is the hub. ISO 27001, OWASP ASVS, and NIST SSDF all map to it.",
      audit_index: "ISO 27001 is the audit-side index — resolve to NIST 800-53 ids for implementation detail.",
    },
  };
}
