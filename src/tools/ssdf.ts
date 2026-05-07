import { paginate } from "./_shared.js";

type RefMap = Record<string, string[]>;

interface SsdfTask {
  id: string;
  text: string;
  references: RefMap;
}

interface SsdfPractice {
  id: string;
  title: string;
  text: string;
  references: RefMap;
  tasks: SsdfTask[];
}

interface SsdfGroup {
  id: string;
  name: string;
  description: string;
  practices: SsdfPractice[];
}

interface SsdfData {
  standard: string;
  name: string;
  version: string;
  last_modified: string;
  url: string;
  source: string;
  groups: SsdfGroup[];
}

let data: SsdfData | null = null;

async function load(): Promise<SsdfData> {
  if (data) return data;
  const file = Bun.file(
    new URL("../data/nist-ssdf.json", import.meta.url).pathname
  );
  data = (await file.json()) as SsdfData;
  return data;
}

function normalizeId(id: string): string {
  return id.trim().toUpperCase();
}

function normalizeNistId(id: string): string {
  return id.trim().toUpperCase().replace(/_/g, "-");
}

function allTasks(d: SsdfData) {
  return d.groups.flatMap((g) =>
    g.practices.flatMap((p) =>
      p.tasks.map((t) => ({
        ...t,
        practiceId: p.id,
        practiceTitle: p.title,
        groupId: g.id,
        groupName: g.name,
      }))
    )
  );
}

export async function lookupSsdf(rawId: string) {
  const d = await load();
  const id = normalizeId(rawId);

  const group = d.groups.find((g) => g.id === id);
  if (group) {
    return {
      kind: "group" as const,
      id: group.id,
      name: group.name,
      description: group.description,
      practices: group.practices.map((p) => ({
        id: p.id,
        title: p.title,
        task_count: p.tasks.length,
      })),
    };
  }

  for (const g of d.groups) {
    const practice = g.practices.find((p) => p.id === id);
    if (practice) {
      return {
        kind: "practice" as const,
        id: practice.id,
        title: practice.title,
        text: practice.text,
        group: g.id + " " + g.name,
        tasks: practice.tasks,
        references: practice.references,
      };
    }
  }

  for (const g of d.groups) {
    for (const p of g.practices) {
      const task = p.tasks.find((t) => t.id === id);
      if (task) {
        return {
          kind: "task" as const,
          id: task.id,
          text: task.text,
          practice: p.id + " " + p.title,
          group: g.id + " " + g.name,
          references: task.references,
        };
      }
    }
  }

  return null;
}

export async function searchSsdf(query: string, limit: number = 20) {
  const d = await load();
  const q = query.toLowerCase();
  const matches: Array<{
    id: string;
    text: string;
    kind: "practice" | "task";
    group: string;
    practice?: string;
    nist_controls?: string[];
  }> = [];

  for (const g of d.groups) {
    for (const p of g.practices) {
      if (
        p.text.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q)
      ) {
        matches.push({
          id: p.id,
          text: p.title + " — " + p.text,
          kind: "practice",
          group: g.id + " " + g.name,
          nist_controls: p.references["SP80053"] ?? [],
        });
      }
      for (const t of p.tasks) {
        if (t.text.toLowerCase().includes(q)) {
          matches.push({
            id: t.id,
            text: t.text,
            kind: "task",
            group: g.id + " " + g.name,
            practice: p.id,
            nist_controls: t.references["SP80053"] ?? [],
          });
        }
      }
    }
  }

  return paginate(matches, limit, (m) => m);
}

export async function listSsdfByGroup(rawId: string) {
  const d = await load();
  const id = normalizeId(rawId);
  const group = d.groups.find((g) => g.id === id);
  if (!group) return null;
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    practices: group.practices.map((p) => ({
      id: p.id,
      title: p.title,
      text: p.text,
      tasks: p.tasks.map((t) => ({
        id: t.id,
        text: t.text,
        nist_controls: t.references["SP80053"] ?? [],
      })),
    })),
  };
}

export async function listSsdfGroups() {
  const d = await load();
  return {
    standard: d.standard,
    name: d.name,
    version: d.version,
    groups: d.groups.map((g) => ({
      id: g.id,
      name: g.name,
      practice_count: g.practices.length,
      task_count: g.practices.reduce((s, p) => s + p.tasks.length, 0),
    })),
  };
}

export async function ssdfMapToNist(rawId: string) {
  const d = await load();
  const id = normalizeId(rawId);

  const group = d.groups.find((g) => g.id === id);
  if (group) {
    const tasks = group.practices.flatMap((p) =>
      p.tasks.map((t) => ({ id: t.id, nist: t.references["SP80053"] ?? [] }))
    );
    const aggregated = Array.from(
      new Set(tasks.flatMap((t) => t.nist))
    ).sort();
    return {
      kind: "group" as const,
      id: group.id,
      name: group.name,
      nist_controls: aggregated,
      by_task: tasks.filter((t) => t.nist.length > 0),
    };
  }

  for (const g of d.groups) {
    const practice = g.practices.find((p) => p.id === id);
    if (practice) {
      const taskRefs = practice.tasks.map((t) => ({
        id: t.id,
        nist: t.references["SP80053"] ?? [],
      }));
      const aggregated = Array.from(
        new Set([
          ...(practice.references["SP80053"] ?? []),
          ...taskRefs.flatMap((t) => t.nist),
        ])
      ).sort();
      return {
        kind: "practice" as const,
        id: practice.id,
        title: practice.title,
        nist_controls: aggregated,
        by_task: taskRefs.filter((t) => t.nist.length > 0),
      };
    }
  }

  for (const g of d.groups) {
    for (const p of g.practices) {
      const task = p.tasks.find((t) => t.id === id);
      if (task) {
        return {
          kind: "task" as const,
          id: task.id,
          text: task.text,
          practice: p.id,
          nist_controls: task.references["SP80053"] ?? [],
        };
      }
    }
  }

  return null;
}

export async function ssdfMapFromNist(rawId: string) {
  const d = await load();
  const target = normalizeNistId(rawId);

  const matchingTasks: Array<{
    id: string;
    text: string;
    practice: string;
    group: string;
  }> = [];
  for (const g of d.groups) {
    for (const p of g.practices) {
      for (const t of p.tasks) {
        const nist = t.references["SP80053"] ?? [];
        if (nist.some((c) => normalizeNistId(c) === target)) {
          matchingTasks.push({
            id: t.id,
            text: t.text,
            practice: p.id + " " + p.title,
            group: g.id + " " + g.name,
          });
        }
      }
    }
  }

  if (matchingTasks.length === 0) return null;
  return {
    nist_control: target,
    ssdf_task_count: matchingTasks.length,
    ssdf_tasks: matchingTasks,
  };
}

export async function ssdfExternalRefs(rawId: string) {
  const d = await load();
  const id = normalizeId(rawId);

  for (const g of d.groups) {
    for (const p of g.practices) {
      if (p.id === id) {
        return {
          kind: "practice" as const,
          id: p.id,
          title: p.title,
          references: p.references,
          frameworks: Object.keys(p.references).sort(),
        };
      }
      for (const t of p.tasks) {
        if (t.id === id) {
          return {
            kind: "task" as const,
            id: t.id,
            text: t.text,
            references: t.references,
            frameworks: Object.keys(t.references).sort(),
          };
        }
      }
    }
  }
  return null;
}
