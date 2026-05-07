import { paginate } from "./_shared.js";

interface NistCloudSource {
  id: string;
  title: string;
  publication: string;
  date: string;
  url: string;
}

interface NistCloudTopic {
  id: string;
  title: string;
  source: string;
  section: string;
  guidance: string;
  nist_controls: string[];
}

interface NistCloudData {
  sources: NistCloudSource[];
  topics: NistCloudTopic[];
}

let data: NistCloudData | null = null;

async function load(): Promise<NistCloudData> {
  if (data) return data;
  const file = Bun.file(
    new URL("../data/nist-cloud-guidance.json", import.meta.url).pathname
  );
  data = (await file.json()) as NistCloudData;
  return data;
}

export async function lookupNistCloudTopic(topicId: string) {
  const d = await load();
  const normalized = topicId.toUpperCase();
  const topic = d.topics.find((t) => t.id.toUpperCase() === normalized);
  return topic ?? null;
}

export async function searchNistCloudTopics(
  query: string,
  limit: number = 20
) {
  const d = await load();
  const q = query.toLowerCase();
  const matches = d.topics.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.guidance.toLowerCase().includes(q)
  );
  return paginate(matches, limit, (t) => ({
    id: t.id,
    title: t.title,
    source: t.source,
    nist_controls: t.nist_controls,
  }));
}

export async function listNistCloudBySource(sourceId: string) {
  const d = await load();
  const normalized = sourceId.toUpperCase().replace(/\s+/g, "");
  const topics = d.topics.filter(
    (t) => t.source.toUpperCase().replace(/\s+/g, "") === normalized
  );
  if (topics.length === 0) return null;
  return topics.map((t) => ({
    id: t.id,
    title: t.title,
    section: t.section,
    nist_controls: t.nist_controls,
  }));
}

export async function listNistCloudSources() {
  const d = await load();
  return d.sources.map((s) => ({
    id: s.id,
    title: s.title,
    publication: s.publication,
    date: s.date,
    topic_count: d.topics.filter((t) => t.source === s.id).length,
  }));
}

export async function resolveNistCloudRefs(refIds: string[]) {
  const d = await load();
  return refIds
    .map((id) => d.topics.find((t) => t.id === id))
    .filter((t): t is NistCloudTopic => t !== undefined);
}
