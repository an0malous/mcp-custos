// Shared MITRE cwec XML parsing for update-sources.ts. Pure functions —
// callers supply the XML string and overlay object; no I/O here so the
// transform is testable offline against scripts/fixtures/cwec-sample.xml.
//
// The cwec schema wraps prose in xhtml (p/div/br/i/b) with mixed text/element
// content, so parsing uses fast-xml-parser's preserveOrder mode and the
// helpers below flatten prose back to plain text verbatim (whitespace
// normalization only — no synthesized or paraphrased guidance).

import { XMLParser } from "fast-xml-parser";

export interface CweMitigation {
  phase?: string;
  strategy?: string;
  description: string;
}

export interface CweExample {
  language?: string;
  body: string;
}

export interface CweDetectionMethod {
  method: string;
  description: string;
  effectiveness?: string;
}

export interface CweRelation {
  nature: string;
  id: string;
}

export interface CweObservedExample {
  cve: string;
  description: string;
  link?: string;
}

export interface CweWeakness {
  id: string;
  name: string;
  abstraction: string;
  status: string;
  description: string;
  extended_description?: string;
  potential_mitigations: CweMitigation[];
  demonstrative_examples: CweExample[];
  detection_methods: CweDetectionMethod[];
  related_cwes: CweRelation[];
  observed_examples: CweObservedExample[];
  // Curated overlay fields (project curation, not MITRE):
  rank_2024?: number;
  owasp_top10?: string;
  asvs_chapters?: string[];
  nist_families?: string[];
}

export interface CweCuratedOverlay {
  note: string;
  weaknesses: Array<{
    id: string;
    rank_2024?: number;
    owasp_top10?: string;
    asvs_chapters: string[];
    nist_families: string[];
  }>;
}

export interface CweDataset {
  source: string;
  url: string;
  catalog_version: string;
  note: string;
  weaknesses: CweWeakness[];
}

// ---------------------------------------------------------------------------
// preserveOrder tree helpers. Node shape: { [tag]: Node[], ":@"?: attrs } or
// { "#text": string }.
type OrderedNode = Record<string, unknown>;

function tagOf(node: OrderedNode): string | null {
  return Object.keys(node).find((k) => k !== ":@") ?? null;
}

function childrenOf(node: OrderedNode): OrderedNode[] {
  const tag = tagOf(node);
  if (!tag) return [];
  const v = node[tag];
  return Array.isArray(v) ? (v as OrderedNode[]) : [];
}

function attrsOf(node: OrderedNode): Record<string, string> {
  return (node[":@"] as Record<string, string>) ?? {};
}

/** Direct children with the given tag name. */
function kids(node: OrderedNode, tag: string): OrderedNode[] {
  return childrenOf(node).filter((c) => tagOf(c) === tag);
}

function firstKid(node: OrderedNode, tag: string): OrderedNode | undefined {
  return kids(node, tag)[0];
}

/**
 * Flatten a prose node (mixed xhtml) to plain text. Block elements (p, div,
 * li) become newline-separated paragraphs; <xhtml:br/> becomes a newline;
 * inline markup (i, b, tt) contributes its text.
 */
export function proseOf(node: OrderedNode | undefined): string {
  if (!node) return "";
  const parts: string[] = [];
  const walk = (n: OrderedNode) => {
    const tag = tagOf(n);
    if (tag === "#text") {
      parts.push(String(n["#text"]));
      return;
    }
    if (tag === "xhtml:br") {
      parts.push("\n");
      return;
    }
    const block =
      tag === "xhtml:p" || tag === "xhtml:div" || tag === "xhtml:li";
    if (block && parts.length && parts[parts.length - 1] !== "\n\n")
      parts.push("\n\n");
    for (const c of childrenOf(n)) walk(c);
    if (block) parts.push("\n\n");
  };
  for (const c of childrenOf(node)) walk(c);
  return parts
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Section extractors

function parseMitigations(w: OrderedNode): CweMitigation[] {
  const container = firstKid(w, "Potential_Mitigations");
  if (!container) return [];
  return kids(container, "Mitigation")
    .map((m) => ({
      phase:
        kids(m, "Phase")
          .map((p) => proseOf(p))
          .join(", ") || undefined,
      strategy: proseOf(firstKid(m, "Strategy")) || undefined,
      description: proseOf(firstKid(m, "Description")),
    }))
    .filter((m) => m.description.length > 0);
}

function parseExamples(w: OrderedNode): CweExample[] {
  const container = firstKid(w, "Demonstrative_Examples");
  if (!container) return [];
  return kids(container, "Demonstrative_Example").map((ex) => {
    let language: string | undefined;
    const parts: string[] = [];
    for (const child of childrenOf(ex)) {
      const tag = tagOf(child);
      if (tag === "Intro_Text" || tag === "Body_Text") {
        const t = proseOf(child);
        if (t) parts.push(t);
      } else if (tag === "Example_Code") {
        const a = attrsOf(child);
        language ??= a.Language;
        const label = [a.Nature, a.Language].filter(Boolean).join(", ");
        const code = proseOf(child);
        if (code) parts.push(`[${label || "Code"}]\n${code}`);
      }
    }
    return { language, body: parts.join("\n\n") };
  });
}

function parseDetectionMethods(w: OrderedNode): CweDetectionMethod[] {
  const container = firstKid(w, "Detection_Methods");
  if (!container) return [];
  return kids(container, "Detection_Method")
    .map((d) => ({
      method: proseOf(firstKid(d, "Method")),
      description: proseOf(firstKid(d, "Description")),
      effectiveness: proseOf(firstKid(d, "Effectiveness")) || undefined,
    }))
    .filter((d) => d.method.length > 0);
}

function parseRelations(w: OrderedNode): CweRelation[] {
  const container = firstKid(w, "Related_Weaknesses");
  if (!container) return [];
  const seen = new Set<string>();
  const out: CweRelation[] = [];
  for (const r of kids(container, "Related_Weakness")) {
    const a = attrsOf(r);
    if (!a.Nature || !a.CWE_ID) continue;
    const key = `${a.Nature}:${a.CWE_ID}`;
    if (seen.has(key)) continue; // same relation repeats across views
    seen.add(key);
    out.push({ nature: a.Nature, id: `CWE-${a.CWE_ID}` });
  }
  return out;
}

function parseObservedExamples(w: OrderedNode): CweObservedExample[] {
  const container = firstKid(w, "Observed_Examples");
  if (!container) return [];
  return kids(container, "Observed_Example")
    .map((o) => ({
      cve: proseOf(firstKid(o, "Reference")),
      description: proseOf(firstKid(o, "Description")),
      link: proseOf(firstKid(o, "Link")) || undefined,
    }))
    .filter((o) => o.cve.length > 0);
}

// ---------------------------------------------------------------------------

export function parseCwecXml(xml: string): {
  catalogVersion: string;
  weaknesses: CweWeakness[];
} {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    preserveOrder: true,
    trimValues: false,
  });
  const tree = parser.parse(xml) as OrderedNode[];
  const catalog = tree.find((n) => tagOf(n) === "Weakness_Catalog");
  if (!catalog) throw new Error("cwec XML: no Weakness_Catalog root element");
  const catalogVersion = attrsOf(catalog).Version;
  if (!catalogVersion)
    throw new Error("cwec XML: Weakness_Catalog has no Version attribute");

  const weaknessContainer = firstKid(catalog, "Weaknesses");
  if (!weaknessContainer)
    throw new Error("cwec XML: no Weaknesses container element");

  const weaknesses: CweWeakness[] = [];
  for (const w of kids(weaknessContainer, "Weakness")) {
    const a = attrsOf(w);
    if (a.Status === "Deprecated") continue;
    weaknesses.push({
      id: `CWE-${a.ID}`,
      name: a.Name,
      abstraction: a.Abstraction,
      status: a.Status,
      description: proseOf(firstKid(w, "Description")),
      extended_description:
        proseOf(firstKid(w, "Extended_Description")) || undefined,
      potential_mitigations: parseMitigations(w),
      demonstrative_examples: parseExamples(w),
      detection_methods: parseDetectionMethods(w),
      related_cwes: parseRelations(w),
      observed_examples: parseObservedExamples(w),
    });
  }
  return { catalogVersion, weaknesses };
}

export function buildDataset(
  parsed: { catalogVersion: string; weaknesses: CweWeakness[] },
  overlay: CweCuratedOverlay
): CweDataset {
  const byId = new Map(parsed.weaknesses.map((w) => [w.id, w]));
  for (const cur of overlay.weaknesses) {
    const target = byId.get(cur.id);
    if (!target) {
      // Never drop curation silently — keep a minimal entry from overlay data.
      process.stderr.write(
        `[cwe] curated id ${cur.id} not in catalog v${parsed.catalogVersion}; keeping overlay-only entry\n`
      );
      byId.set(cur.id, {
        id: cur.id,
        name: "(not in current MITRE catalog)",
        abstraction: "",
        status: "OverlayOnly",
        description: "",
        potential_mitigations: [],
        demonstrative_examples: [],
        detection_methods: [],
        related_cwes: [],
        observed_examples: [],
        rank_2024: cur.rank_2024,
        owasp_top10: cur.owasp_top10,
        asvs_chapters: cur.asvs_chapters,
        nist_families: cur.nist_families,
      });
      continue;
    }
    target.rank_2024 = cur.rank_2024;
    target.owasp_top10 = cur.owasp_top10;
    target.asvs_chapters = cur.asvs_chapters;
    target.nist_families = cur.nist_families;
  }
  return {
    source: `MITRE CWE (cwec) v${parsed.catalogVersion}`,
    url: "https://cwe.mitre.org/data/xml/cwec_latest.xml.zip",
    catalog_version: parsed.catalogVersion,
    note: "All guidance text (descriptions, mitigations, examples, detection methods, relations, observed examples) is verbatim from the official MITRE cwec catalog. rank_2024, owasp_top10, asvs_chapters, and nist_families are project-curated overlay fields, not from an official crosswalk.",
    weaknesses: Array.from(byId.values()),
  };
}
