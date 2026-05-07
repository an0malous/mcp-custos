/**
 * Verifies that src/data/iso-27001-controls.json matches the canonical
 * ISO/IEC 27002:2022 table of contents (which ISO 27001:2022 Annex A
 * references). The TOC snapshot is in src/data/iso-27002-2022-toc.json.
 *
 * Exits non-zero on any divergence; prints a diff summary either way.
 */

interface IsoControl {
  id: string;
  title: string;
}

const isoData = (await Bun.file("src/data/iso-27001-controls.json").json()) as {
  categories: { controls: IsoControl[] }[];
};
const tocSnap = (await Bun.file("src/data/iso-27002-2022-toc.json").json()) as {
  controls: IsoControl[];
};

const ours = new Map(
  isoData.categories.flatMap((c) => c.controls.map((x) => [x.id, x.title]))
);
const canonical = new Map(tocSnap.controls.map((x) => [x.id, x.title]));

const onlyInOurs: string[] = [];
const onlyInCanonical: string[] = [];
const titleMismatch: Array<{ id: string; ours: string; canonical: string }> =
  [];

for (const [id, title] of ours) {
  if (!canonical.has(id)) onlyInOurs.push(id);
  else if (canonical.get(id) !== title) {
    titleMismatch.push({ id, ours: title, canonical: canonical.get(id)! });
  }
}
for (const [id] of canonical) if (!ours.has(id)) onlyInCanonical.push(id);

const ok =
  onlyInOurs.length === 0 &&
  onlyInCanonical.length === 0 &&
  titleMismatch.length === 0;

console.log(`Our file:  ${ours.size} controls`);
console.log(`Canonical: ${canonical.size} controls`);

if (onlyInOurs.length) {
  console.log("\nOnly in our file (extra):");
  onlyInOurs.forEach((id) => console.log("  -", id, ours.get(id)));
}
if (onlyInCanonical.length) {
  console.log("\nOnly in canonical TOC (missing from ours):");
  onlyInCanonical.forEach((id) => console.log("  -", id, canonical.get(id)));
}
if (titleMismatch.length) {
  console.log("\nTitle mismatches:");
  titleMismatch.forEach((m) => {
    console.log(`  - ${m.id}`);
    console.log(`      ours:      ${m.ours}`);
    console.log(`      canonical: ${m.canonical}`);
  });
}

if (ok) {
  console.log("\nOK — all 93 controls match the ISO/IEC 27002:2022 TOC.");
  process.exit(0);
} else {
  console.log("\nFAIL — divergence from canonical TOC.");
  process.exit(1);
}
