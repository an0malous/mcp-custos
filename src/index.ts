import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  lookupControl,
  searchControls,
  listByCategory,
  listCategories,
} from "./tools/controls.js";
import {
  lookupNistControl,
  searchNistControls,
  listNistFamily,
  listNistFamilies,
} from "./tools/nist.js";
import {
  lookupCloudControl,
  searchCloudControls,
  listCloudSection,
  listCloudSections,
} from "./tools/cloud.js";
import {
  lookupNistCloudTopic,
  searchNistCloudTopics,
  listNistCloudBySource,
  listNistCloudSources,
} from "./tools/nist-cloud.js";
import {
  lookupAsvs,
  searchAsvs,
  listAsvsByChapter,
  listAsvsChapters,
} from "./tools/asvs.js";
import {
  lookupSsdf,
  searchSsdf,
  listSsdfByGroup,
  listSsdfGroups,
  ssdfMapToNist,
  ssdfMapFromNist,
  ssdfExternalRefs,
} from "./tools/ssdf.js";
import { controlsForChange } from "./tools/meta.js";
import { mappingInventory } from "./tools/inventory.js";
import { prComplianceSummary } from "./tools/pr-summary.js";
import {
  lookupCwe,
  searchCwe,
  listCweTop25,
  cweMapToControls,
} from "./tools/cwe.js";
import { json, text } from "./tools/_shared.js";

const server = new McpServer(
  {
    name: "mcp-security-compliance",
    version: "0.1.0",
  },
  {
    instructions: `Authoritative compliance and secure-development reference data: ISO 27001:2022, NIST SP 800-53 Rev 5, OWASP ASVS 5.0, NIST SSDF (SP 800-218), ISO 27017:2015, NIST cloud guidance (SP 800-144/210/146).

Two intended uses:

1. Build-time guardrail. Before implementing security-touching changes (auth, sessions, authorization, crypto, input handling, file I/O, logging, secrets, network/API exposure, data persistence), call \`controls_for_change\` with a one-line description. Address the surfaced ASVS L2 and NIST items; for top NIST hits, call \`nist_lookup_control\` with detailed=true for prescriptive guidance before implementing.

2. Audit traceability. Start from an ISO Annex A or NIST 800-53 control id and chain primitives to surface guidance, cross-references, and evidence.

Topology:
- NIST 800-53 is the hub. ISO 27001, OWASP ASVS, and NIST SSDF all map to it.
- ISO 27001 is the audit-side index — use it to *name* what an auditor cares about, then resolve to mapped NIST 800-53 ids for implementation detail.
- SSDF tasks reference NIST 800-53 plus 28 other frameworks (BSIMM, OWASP ASVS/SAMM, ISO 27034, PCI SSLC, EO 14028, NIST CSF, IEC 62443, …).

Composition pattern for "implement X to satisfy ISO Y":
  iso_lookup_control Y → mapped NIST ids → nist_lookup_control with detailed=true for each → implement to that spec → cite refs.

In code, cite NIST 800-53 (and ASVS where it adds detail). Never cite ISO IDs in source — they're too coarse to describe an implementation. Format: "// Refs: NIST IA-5(1), ASVS V6.2.5". Map to ISO at audit boundary via iso_lookup_control. Do not fabricate compliance claims — only cite controls you actually looked up.

Prompts available: compliance-check (workflow walk for a code change), audit-evidence (build evidence index for a control), secure-by-design-plan (architecture plan with controls preloaded).`,
  }
);


server.tool(
  "iso_lookup_control",
  "Look up an ISO 27001:2022 Annex A control by ID and get its mapped NIST 800-53 guidance. Summary by default, detailed=true for full NIST guidance.",
  {
    control_id: z.string().describe("Control ID, e.g. A.8.24"),
    detailed: z
      .boolean()
      .default(false)
      .describe("If true, return full NIST guidance text and enhancements"),
  },
  async ({ control_id, detailed }) => {
    const control = await lookupControl(control_id, detailed);
    if (!control) {
      return text(`Control ${control_id} not found.`);
    }
    return json(control);
  }
);

server.tool(
  "iso_search_controls",
  "Search ISO 27001:2022 Annex A controls by keyword",
  {
    query: z.string().describe("Search keyword or phrase"),
    limit: z
      .number()
      .int()
      .positive()
      .max(200)
      .default(20)
      .describe("Max results to return (default 20, max 200)"),
  },
  async ({ query, limit }) => {
    const results = await searchControls(query, limit);
    if (results.total === 0) {
      return text(`No controls matching "${query}".`);
    }
    return json(results);
  }
);

server.tool(
  "iso_list_controls_by_category",
  "List all controls in an ISO 27001:2022 Annex A category",
  { category_id: z.string().describe("Category ID: A.5, A.6, A.7, or A.8") },
  async ({ category_id }) => {
    const controls = await listByCategory(category_id);
    if (!controls) {
      return text(`Category ${category_id} not found.`);
    }
    const summary = controls
      .map((c: any) => `${c.id} - ${c.title} → NIST: ${c.nist_mappings.join(", ")}`)
      .join("\n");
    return text(summary);
  }
);

server.tool(
  "iso_list_categories",
  "List all ISO 27001:2022 Annex A categories with control counts",
  {},
  async () => {
    const categories = await listCategories();
    const summary = categories
      .map((c) => `${c.id} - ${c.name} (${c.controlCount} controls)`)
      .join("\n");
    return text(summary);
  }
);


server.tool(
  "nist_lookup_control",
  "Look up a NIST 800-53 control by ID. Returns summary by default, set detailed=true for full guidance and enhancements.",
  {
    control_id: z.string().describe("Control ID, e.g. AC-1, SC-8, IA-2"),
    detailed: z
      .boolean()
      .default(false)
      .describe("If true, return full guidance text and enhancements"),
  },
  async ({ control_id, detailed }) => {
    const control = await lookupNistControl(control_id, detailed);
    if (!control) {
      return text(`Control ${control_id} not found.`);
    }
    return json(control);
  }
);

server.tool(
  "nist_search_controls",
  "Search NIST 800-53 controls by keyword across titles, statements, and guidance",
  {
    query: z.string().describe("Search keyword or phrase"),
    limit: z
      .number()
      .int()
      .positive()
      .max(200)
      .default(20)
      .describe("Max results to return (default 20, max 200)"),
  },
  async ({ query, limit }) => {
    const results = await searchNistControls(query, limit);
    if (results.total === 0) {
      return text(`No controls matching "${query}".`);
    }
    return json(results);
  }
);

server.tool(
  "nist_list_family",
  "List all controls in a NIST 800-53 family (e.g. AC, SC, IA)",
  { family_id: z.string().describe("Family ID, e.g. AC, SC, IA, AU") },
  async ({ family_id }) => {
    const controls = await listNistFamily(family_id);
    if (!controls) {
      return text(`Family ${family_id} not found.`);
    }
    return json(controls);
  }
);

server.tool(
  "nist_list_families",
  "List all NIST 800-53 control families with control counts",
  {},
  async () => {
    const families = await listNistFamilies();
    const summary = families
      .map((f: any) => `${f.id} - ${f.name} (${f.control_count} controls)`)
      .join("\n");
    return text(summary);
  }
);


server.tool(
  "cloud_lookup_control",
  "Look up an ISO 27017:2015 cloud security control by ID. Returns the control with cloud-specific guidance.",
  {
    control_id: z.string().describe("Control ID, e.g. CLD.9.5.1 or 10.1.1"),
  },
  async ({ control_id }) => {
    const control = await lookupCloudControl(control_id);
    if (!control) {
      return text(`Control ${control_id} not found.`);
    }
    return json(control);
  }
);

server.tool(
  "cloud_search_controls",
  "Search ISO 27017:2015 cloud security controls by keyword across titles and guidance",
  {
    query: z.string().describe("Search keyword or phrase"),
    limit: z
      .number()
      .int()
      .positive()
      .max(200)
      .default(20)
      .describe("Max results to return (default 20, max 200)"),
  },
  async ({ query, limit }) => {
    const results = await searchCloudControls(query, limit);
    if (results.total === 0) {
      return text(`No controls matching "${query}".`);
    }
    return json(results);
  }
);

server.tool(
  "cloud_list_controls_by_section",
  "List all controls in an ISO 27017:2015 section",
  { section_id: z.string().describe("Section ID, e.g. 5, 6, 9, 12") },
  async ({ section_id }) => {
    const controls = await listCloudSection(section_id);
    if (!controls) {
      return text(`Section ${section_id} not found.`);
    }
    const summary = controls
      .map((c: any) => `${c.id} - ${c.title}`)
      .join("\n");
    return text(summary);
  }
);

server.tool(
  "cloud_list_sections",
  "List all ISO 27017:2015 sections with control counts",
  {},
  async () => {
    const sections = await listCloudSections();
    const summary = sections
      .map((s) => `${s.id} - ${s.name} (${s.controlCount} controls)`)
      .join("\n");
    return text(summary);
  }
);


server.tool(
  "nist_cloud_lookup_topic",
  "Look up a NIST cloud security guidance topic by ID (e.g. SP800-144.4.5, SP800-210.3.1). Returns guidance from NIST SP 800-144, 800-210, or 800-146 with mapped NIST 800-53 controls.",
  {
    topic_id: z
      .string()
      .describe("Topic ID, e.g. SP800-144.4.5, SP800-210.3.1, SP800-146.9"),
  },
  async ({ topic_id }) => {
    const topic = await lookupNistCloudTopic(topic_id);
    if (!topic) {
      return text(`Topic ${topic_id} not found.`);
    }
    return json(topic);
  }
);

server.tool(
  "nist_cloud_search",
  "Search NIST cloud security guidance (SP 800-144, 800-210, 800-146) by keyword across topic titles and guidance text",
  {
    query: z
      .string()
      .describe("Search keyword or phrase, e.g. 'multi-tenancy', 'encryption', 'hypervisor'"),
    limit: z
      .number()
      .int()
      .positive()
      .max(200)
      .default(20)
      .describe("Max results to return (default 20, max 200)"),
  },
  async ({ query, limit }) => {
    const results = await searchNistCloudTopics(query, limit);
    if (results.total === 0) {
      return text(`No NIST cloud guidance matching "${query}".`);
    }
    return json(results);
  }
);

server.tool(
  "nist_cloud_list_by_source",
  "List all cloud security guidance topics from a specific NIST publication",
  {
    source_id: z
      .string()
      .describe("Publication ID: SP800-144, SP800-210, or SP800-146"),
  },
  async ({ source_id }) => {
    const topics = await listNistCloudBySource(source_id);
    if (!topics) {
      return text(`No topics found for source ${source_id}.`);
    }
    const summary = topics
      .map(
        (t) =>
          `${t.id} - ${t.title} (§${t.section}) → NIST 800-53: ${t.nist_controls.join(", ")}`
      )
      .join("\n");
    return text(summary);
  }
);

server.tool(
  "nist_cloud_list_sources",
  "List all NIST cloud security publications available with topic counts",
  {},
  async () => {
    const sources = await listNistCloudSources();
    const summary = sources
      .map(
        (s) =>
          `${s.id} - ${s.title} (${s.date}, ${s.topic_count} topics)`
      )
      .join("\n");
    return text(summary);
  }
);


server.tool(
  "asvs_lookup",
  "Look up an OWASP ASVS 5.0 entry by ID. Accepts chapter (V11), section (V11.1), or requirement (V11.1.1). Returns the entry with its level (1/2/3) for requirements.",
  {
    id: z
      .string()
      .describe("ASVS ID, e.g. V11 (chapter), V11.1 (section), V11.1.1 (requirement)"),
  },
  async ({ id }) => {
    const result = await lookupAsvs(id);
    if (!result) {
      return text(`ASVS entry ${id} not found.`);
    }
    return json(result);
  }
);

server.tool(
  "asvs_search",
  "Search OWASP ASVS 5.0 requirements by keyword. Optional level filter (1, 2, or 3) to scope the result to a verification level.",
  {
    query: z.string().describe("Search keyword or phrase"),
    level: z
      .enum(["1", "2", "3"])
      .optional()
      .describe("Filter to ASVS level 1 (opportunistic), 2 (standard), or 3 (critical)"),
    limit: z
      .number()
      .int()
      .positive()
      .max(200)
      .default(20)
      .describe("Max results to return (default 20, max 200)"),
  },
  async ({ query, level, limit }) => {
    const results = await searchAsvs(query, level, limit);
    if (results.total === 0) {
      return text(`No ASVS requirements matching "${query}"${level ? " at level " + level : ""}.`);
    }
    return json(results);
  }
);

server.tool(
  "asvs_list_by_chapter",
  "List all ASVS requirements in a chapter (V1-V17), optionally filtered by level",
  {
    chapter_id: z.string().describe("Chapter ID, e.g. V11, V6, V8"),
    level: z
      .enum(["1", "2", "3"])
      .optional()
      .describe("Filter to ASVS level 1, 2, or 3"),
  },
  async ({ chapter_id, level }) => {
    const result = await listAsvsByChapter(chapter_id, level);
    if (!result) {
      return text(`Chapter ${chapter_id} not found.`);
    }
    return json(result);
  }
);

server.tool(
  "asvs_list_chapters",
  "List all OWASP ASVS chapters with section and requirement counts",
  {},
  async () => {
    const result = await listAsvsChapters();
    return json(result);
  }
);


server.tool(
  "ssdf_lookup",
  "Look up a NIST SSDF (SP 800-218) entry by ID. Accepts group (PO, PS, PW, RV), practice (PO.1), or task (PO.1.1).",
  {
    id: z
      .string()
      .describe("SSDF ID, e.g. PO (group), PO.1 (practice), PO.1.1 (task)"),
  },
  async ({ id }) => {
    const result = await lookupSsdf(id);
    if (!result) {
      return text(`SSDF entry ${id} not found.`);
    }
    return json(result);
  }
);

server.tool(
  "ssdf_search",
  "Search NIST SSDF practices and tasks by keyword",
  {
    query: z.string().describe("Search keyword or phrase"),
    limit: z
      .number()
      .int()
      .positive()
      .max(200)
      .default(20)
      .describe("Max results to return (default 20, max 200)"),
  },
  async ({ query, limit }) => {
    const results = await searchSsdf(query, limit);
    if (results.total === 0) {
      return text(`No SSDF entries matching "${query}".`);
    }
    return json(results);
  }
);

server.tool(
  "ssdf_list_by_group",
  "List all SSDF practices and tasks in a group (PO, PS, PW, RV)",
  { group_id: z.string().describe("Group ID: PO, PS, PW, or RV") },
  async ({ group_id }) => {
    const result = await listSsdfByGroup(group_id);
    if (!result) {
      return text(`Group ${group_id} not found.`);
    }
    return json(result);
  }
);

server.tool(
  "ssdf_list_groups",
  "List the four NIST SSDF groups with practice and task counts",
  {},
  async () => {
    const result = await listSsdfGroups();
    return json(result);
  }
);

server.tool(
  "ssdf_map_to_nist",
  "Get the NIST 800-53 controls mapped to an SSDF id (group, practice, or task). Mappings are official, sourced from the NIST OSCAL catalog. For groups and practices, aggregates across child tasks.",
  {
    id: z
      .string()
      .describe("SSDF id, e.g. PO (group), PO.1 (practice), PO.1.1 (task)"),
  },
  async ({ id }) => {
    const result = await ssdfMapToNist(id);
    if (!result) {
      return text(`SSDF entry ${id} not found.`);
    }
    return json(result);
  }
);

server.tool(
  "ssdf_map_from_nist",
  "Find all SSDF tasks that map to a given NIST 800-53 control. Useful for understanding which secure-development practices a NIST control supports.",
  {
    nist_id: z.string().describe("NIST 800-53 control id, e.g. SA-8, SR-3"),
  },
  async ({ nist_id }) => {
    const result = await ssdfMapFromNist(nist_id);
    if (!result) {
      return text(`No SSDF tasks reference NIST ${nist_id}.`);
    }
    return json(result);
  }
);

server.tool(
  "ssdf_external_refs",
  "Show all external framework cross-references for an SSDF practice or task — covers BSIMM, OWASP ASVS/SAMM, ISO 27034, PCI SSLC, EO 14028, NIST CSF, IEC 62443, and others (sourced from NIST OSCAL).",
  {
    id: z.string().describe("SSDF practice or task id, e.g. PO.1.1, PW.4.4"),
  },
  async ({ id }) => {
    const result = await ssdfExternalRefs(id);
    if (!result) {
      return text(`SSDF entry ${id} not found or has no refs.`);
    }
    return json(result);
  }
);


server.tool(
  "cwe_lookup",
  "Look up a CWE entry by ID (e.g. CWE-79). Returns name, OWASP Top 10 reference, and mapped ASVS chapters / NIST 800-53 families.",
  {
    id: z.string().describe("CWE ID, e.g. CWE-79, CWE-89, CWE-352"),
  },
  async ({ id }) => {
    const r = await lookupCwe(id);
    if (!r) return text(`CWE ${id} not found in the curated Top 25+ set.`);
    return json(r);
  }
);

server.tool(
  "cwe_search",
  "Search CWE entries by keyword across name, ID, and OWASP Top 10 category",
  {
    query: z.string().describe("Search keyword, e.g. 'injection', 'authorization', 'XSS'"),
    limit: z
      .number()
      .int()
      .positive()
      .max(200)
      .default(20)
      .describe("Max results (default 20, max 200)"),
  },
  async ({ query, limit }) => {
    const r = await searchCwe(query, limit);
    if (r.total === 0) return text(`No CWE entries matching "${query}".`);
    return json(r);
  }
);

server.tool(
  "cwe_list_top25",
  "List the CWE Top 25 Most Dangerous Software Weaknesses (2024) with control mappings",
  {},
  async () => json(await listCweTop25())
);

server.tool(
  "cwe_map_to_controls",
  "Bridge a CWE id (e.g. from a SAST/DAST/security-review finding) to the ASVS chapters and NIST 800-53 control families that mitigate it. Use this to translate scanner output into the compliance citation format used in code.",
  {
    id: z.string().describe("CWE ID, e.g. CWE-79, CWE-89, CWE-352"),
  },
  async ({ id }) => {
    const r = await cweMapToControls(id);
    if (!r) return text(`CWE ${id} not found in the curated Top 25+ set.`);
    return json(r);
  }
);

server.tool(
  "pr_compliance_summary",
  "Scan the current branch's diff against a base branch for compliance citations (// Refs: NIST | ASVS) and produce a summary suitable for the PR description. Returns per-file refs, unique NIST/ASVS IDs, and a one-line 'Refs:' citation block.",
  {
    base: z
      .string()
      .default("origin/main")
      .describe("Base ref to diff against (default: origin/main)"),
    cwd: z
      .string()
      .optional()
      .describe("Working directory of the target repo (default: server cwd)"),
  },
  async ({ base, cwd }) => json(await prComplianceSummary(cwd, base))
);

server.tool(
  "mapping_inventory",
  "Self-describe the data this server covers: framework versions, control counts, cross-mapping pair counts, and the 28 frameworks SSDF references. Useful as the first call in an unfamiliar session.",
  {},
  async () => json(await mappingInventory())
);

server.tool(
  "controls_for_change",
  "Build-time guardrail. Given a description of a code change (e.g. 'adding password reset flow', 'wiring TLS on API gateway'), returns a curated checklist drawn from OWASP ASVS, NIST SSDF, and NIST 800-53. Use this at the start of any security-touching change to surface the controls Claude should consider before implementing.",
  {
    description: z
      .string()
      .describe(
        "Plain-language description of the change, e.g. 'implementing OAuth login', 'adding file upload', 'configuring database encryption at rest'"
      ),
    asvs_level: z
      .enum(["1", "2", "3"])
      .default("2")
      .describe("ASVS verification level to apply (default 2 = standard)"),
    per_source_limit: z
      .number()
      .int()
      .positive()
      .max(50)
      .default(10)
      .describe("Max items to return per source (default 10)"),
  },
  async ({ description, asvs_level, per_source_limit }) => {
    const out = await controlsForChange(
      description,
      asvs_level,
      per_source_limit
    );
    return json(out);
  }
);


server.registerPrompt(
  "compliance-check",
  {
    title: "Compliance check for a code change",
    description:
      "Walks through a security-touching change against OWASP ASVS, NIST SSDF, and NIST 800-53. Use at the start of any change that touches authentication, sessions, authorization, cryptography, input handling, file I/O, logging, secrets, network/API, or data persistence.",
    argsSchema: {
      change: z
        .string()
        .describe(
          "What you're about to build or modify, e.g. 'adding password reset flow', 'wiring TLS on API gateway'"
        ),
      level: z
        .enum(["1", "2", "3"])
        .optional()
        .describe("ASVS verification level (default 2)"),
    },
  },
  ({ change, level }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `I'm about to: ${change}

Run the compliance-check workflow:

1. Call \`controls_for_change\` with description="${change}" and asvs_level="${level ?? "2"}".
2. For each top-ranked ASVS requirement, decide one of: (a) implement now, (b) already covered (cite where), (c) explicitly out of scope (say why).
3. For each top-ranked NIST 800-53 control, call \`nist_lookup_control\` with detailed=true on at most 3 of the most relevant ones to get prescriptive guidance before implementing.
4. For each SSDF task surfaced, note whether it's a one-time policy/process step (in which case flag it for documentation) or an in-code action (in which case address it).
5. Summarize the work plan as: "Refs: ASVS V<x.y.z>, NIST <ID>, SSDF <ID>" lines, then proceed to implement.

Be honest if a returned control isn't actually relevant to this change — note "skip: <reason>" rather than forcing a fit.`,
        },
      },
    ],
  })
);

server.registerPrompt(
  "audit-evidence",
  {
    title: "Gather audit evidence for a control",
    description:
      "Builds an evidence index for a specific ISO 27001 Annex A or NIST 800-53 control. Use when an auditor asks 'show me X' or when preparing for an audit and you want pointers ready.",
    argsSchema: {
      control_id: z
        .string()
        .describe(
          "Control ID, e.g. A.8.24 (ISO), SC-13 (NIST), V11.1.1 (ASVS), PO.1.1 (SSDF)"
        ),
    },
  },
  ({ control_id }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Build an audit evidence index for ${control_id}.

1. Resolve the control: try \`iso_lookup_control\`, \`nist_lookup_control\`, \`asvs_lookup\`, or \`ssdf_lookup\` as appropriate. For ISO controls also surface mapped NIST controls; for NIST controls use \`ssdf_map_from_nist\` to cross-reference; for SSDF use \`ssdf_external_refs\`.
2. State the *intent* of the control in one sentence (what an auditor is checking for).
3. Search this repository for evidence — code, IaC (Terraform/CloudFormation), config files, policy docs, tests, CI checks, runbooks. Use Grep and Read aggressively.
4. Produce a markdown evidence index in this shape:

   ### ${control_id} — <title>
   **Intent:** <one sentence>
   **Mapped controls:** <cross-refs from step 1>
   **Evidence:**
   - \`path/to/file.ext:LN\` — <what the auditor sees>
   - <repeat>
   **Gaps:**
   - <anything the control implies but you couldn't find evidence for>

5. Be honest about gaps. An empty evidence list with a clear gap note is more useful than padding.

Note: an auditor doesn't grep code line-by-line. Pointers should be artifact-level (config, policy, test result), not implementation detail. Pick at most 5 strong evidence items per control.`,
        },
      },
    ],
  })
);

server.registerPrompt(
  "secure-by-design-plan",
  {
    title: "Secure-by-design plan for a system",
    description:
      "Kick off a structured architecture plan with relevant controls preloaded. Use before designing anything that handles user data, authentication, secrets, or external network exposure.",
    argsSchema: {
      system: z
        .string()
        .describe(
          "System being designed, e.g. 'multi-tenant SaaS API with OAuth and Postgres', 'image upload service backed by S3'"
        ),
      level: z
        .enum(["1", "2", "3"])
        .optional()
        .describe("ASVS verification level target (default 2)"),
    },
  },
  ({ system, level }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Produce a secure-by-design plan for: ${system}

1. Call \`controls_for_change\` with description="${system}" and asvs_level="${level ?? "2"}" to surface relevant ASVS / SSDF / NIST controls.
2. Call \`ssdf_list_by_group\` for PO (Prepare Org) and PW (Produce Well-Secured Software) — these are the SDLC-side controls that should shape the plan.
3. Produce the plan in this structure (markdown):

   ## System: ${system}
   **ASVS target level:** ${level ?? "2"}

   ### Threat model (brief)
   - Trust boundaries, primary data flows, external dependencies
   - Top 3-5 attacker scenarios specific to this system

   ### Controls to design in
   For each: control id, what it means here, how we'll implement it, what evidence will exist.
   Group by: identity & access · data protection · network & comms · logging & monitoring · supply chain.

   ### Out-of-scope controls
   ASVS/NIST items the meta-search surfaced but that genuinely don't apply (with one-line reasons).

   ### Validation plan
   How we'll prove each control works (tests, scans, audit trail).

4. Be specific about the *implementation* — name the libraries, services, IAM mechanisms. A plan that says "use approved cryptography" is useless; "TLS 1.3 via cloud LB; AES-256-GCM at rest via KMS-managed key with annual rotation" is what we want.`,
        },
      },
    ],
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
