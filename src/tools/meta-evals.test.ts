import { describe, expect, test } from "bun:test";
import { controlsForChange } from "./meta.js";

/**
 * Retrieval eval suite: realistic change descriptions with the control a
 * security engineer would expect in the top results. This is the regression
 * harness for ranking quality — tune the ranking until these pass; never
 * tune these to match the ranking.
 */
const TOP_N = 5;

/** id belongs to a control branch: the base control itself or an enhancement of it. */
function inBranch(id: string, base: string): boolean {
  return id === base || id.startsWith(`${base}.`);
}

const EVALS: Array<{
  change: string;
  expect_nist: string[]; // any of these control branches in the NIST top N
  expect_asvs_prefix?: string; // an ASVS id with this prefix in the ASVS top N
}> = [
  {
    change: "storing user passwords with bcrypt",
    expect_nist: ["IA-5"],
    expect_asvs_prefix: "V6.",
  },
  {
    change: "implement idle session timeout and logout",
    expect_nist: ["AC-12", "AC-11"],
  },
  {
    change: "encrypt customer data at rest in the database",
    expect_nist: ["SC-28"],
  },
  {
    change: "validate and sanitize uploaded CSV file input",
    expect_nist: ["SI-10"],
  },
  {
    change: "authorization checks for new admin endpoint",
    expect_nist: ["AC-3", "AC-6"],
  },
];

describe("controls_for_change retrieval evals", () => {
  for (const ev of EVALS) {
    test(`"${ev.change}" → NIST ${ev.expect_nist.join(" or ")} branch in top ${TOP_N}`, async () => {
      const r = await controlsForChange(ev.change, "2", TOP_N);
      const nistIds = r.nist_800_53.results.map((c) => c.id);
      expect(
        nistIds.some((id) => ev.expect_nist.some((base) => inBranch(id, base)))
      ).toBe(true);
      if (ev.expect_asvs_prefix) {
        const asvsIds = r.asvs.results.map((c) => c.id);
        expect(
          asvsIds.some((id) => id.startsWith(ev.expect_asvs_prefix!))
        ).toBe(true);
      }
    });
  }

  test("same query twice returns identical order (determinism)", async () => {
    const a = await controlsForChange("storing user passwords with bcrypt", "2", 10);
    const b = await controlsForChange("storing user passwords with bcrypt", "2", 10);
    expect(a.nist_800_53.results.map((c) => c.id)).toEqual(
      b.nist_800_53.results.map((c) => c.id)
    );
  });
});
