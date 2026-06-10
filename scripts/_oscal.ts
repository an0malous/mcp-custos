/**
 * Shared OSCAL parsing primitives for NIST 800-53 and NIST SSDF catalogs.
 * Imported by update-sources.ts for the catalog refresh.
 */

export interface OscalPart {
  id?: string;
  name: string;
  prose?: string;
  parts?: OscalPart[];
}

export interface OscalLink {
  href: string;
  rel?: string;
  text?: string;
}

export interface OscalControl {
  id: string;
  class?: string;
  title: string;
  parts?: OscalPart[];
  links?: OscalLink[];
  controls?: OscalControl[];
}

export interface OscalGroup {
  id: string;
  title: string;
  parts?: OscalPart[];
  controls: OscalControl[];
}

export interface OscalResource {
  uuid: string;
  title: string;
}

export interface OscalCatalog {
  catalog: {
    metadata: { title?: string; version: string; "last-modified": string };
    groups: OscalGroup[];
    "back-matter"?: { resources?: OscalResource[] };
  };
}

export function extractProse(part: OscalPart): string {
  let text = part.prose ?? "";
  for (const sub of part.parts ?? []) {
    const nested = extractProse(sub);
    if (nested) text += "\n" + nested;
  }
  return text.trim();
}

export function cleanParamRefs(text: string): string {
  return text.replace(
    /\{\{\s*insert:\s*param,\s*[\w.-]+\s*\}\}/g,
    "[org-defined]"
  );
}

export function statementOf(c: { parts?: OscalPart[] }): string {
  const stmt = c.parts?.find((p) => p.name === "statement");
  return stmt ? extractProse(stmt) : "";
}

export interface ParsedNistControl {
  id: string;
  title: string;
  statement: string;
  guidance: string;
  related_controls: string[];
  enhancements: ParsedNistControl[];
}

export function parseNistControl(c: OscalControl): ParsedNistControl {
  const stmt = c.parts?.find((p) => p.name === "statement");
  const gd = c.parts?.find((p) => p.name === "guidance");
  return {
    id: c.id.toUpperCase(),
    title: c.title,
    statement: stmt ? cleanParamRefs(extractProse(stmt)) : "",
    guidance: gd ? cleanParamRefs(gd.prose ?? "") : "",
    related_controls:
      c.links
        ?.filter((l) => l.rel === "related")
        .map((l) => l.href.replace(/^#/, "").toUpperCase()) ?? [],
    enhancements: (c.controls ?? []).map(parseNistControl),
  };
}

/**
 * Resolve OSCAL `links` against a back-matter resource map and return
 * a framework -> [ids] reference dictionary. Used by SSDF cross-refs.
 */
export function parseExternalRefs(
  links: OscalLink[] | undefined,
  resourceTitleByUuid: Record<string, string>
): Record<string, string[]> {
  const refs: Record<string, string[]> = {};
  if (!links) return refs;
  for (const l of links) {
    if (!l.href?.startsWith("#") || !l.text) continue;
    const fw = resourceTitleByUuid[l.href.slice(1)];
    if (!fw) continue;
    const ids = l.text
      .split(/[,;]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length) refs[fw] = (refs[fw] ?? []).concat(ids);
  }
  return refs;
}

export function buildResourceTitleMap(
  catalog: OscalCatalog["catalog"]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of catalog["back-matter"]?.resources ?? []) {
    map[r.uuid] = r.title;
  }
  return map;
}
