// Tool definitions + handlers for the advisor's Claude API tool-use loop.
// Handlers depend on a Catalog interface so they work with Supabase or the local JSON files.

import type Anthropic from "@anthropic-ai/sdk";
import { checkBuild } from "../compat/checkBuild";
import type { BuildItem, BuildReport, Part, Requirements, Slot } from "../compat/types";

export interface ReferenceDesign {
  id: string;
  name: string;
  url: string;
  summary: string;
  autonomy: Requirements["autonomy"];
  difficulty: string;
  approx_cost_usd: [number, number];
  best_for: string[];
  similar_part_ids: string[];
}

export interface Catalog {
  parts(): Promise<Part[]>;
  referenceDesigns(): Promise<ReferenceDesign[]>;
}

/** Side effects the UI cares about (persist + render). Implement per request in the API route. */
export interface AdvisorSession {
  saveRequirements(r: Requirements): Promise<void>;
  presentBuild(build: { items: BuildItem[]; summary: string; report: BuildReport }): Promise<void>;
}

const SLOTS: Slot[] = [
  "chassis", "drive_motor", "wheels", "caster", "motor_driver", "controller", "compute",
  "battery", "regulator", "lidar", "camera", "imu", "distance_sensor",
];

const requirementsSchema = {
  type: "object",
  properties: {
    autonomy: { type: "string", enum: ["remote_control", "obstacle_avoidance", "mapping_navigation"] },
    environment: { type: "string", enum: ["indoor_flat", "indoor_mixed", "outdoor"] },
    payload_kg: { type: "number", description: "Extra load the robot must carry, in kg" },
    budget_usd: { type: "number" },
    min_runtime_min: { type: "number" },
  },
  required: ["autonomy"],
} as const;

const itemsSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      part_id: { type: "string" },
      quantity: { type: "integer", minimum: 1, description: "Number of packs to buy (wheels come in pairs)" },
      reason: { type: "string", description: "One line on why this part fits the user's needs" },
    },
    required: ["part_id", "quantity"],
  },
} as const;

export const advisorTools: Anthropic.Tool[] = [
  {
    name: "save_requirements",
    description: "Record or update what the user needs. Call as soon as you know the autonomy level, and again when anything changes.",
    input_schema: { type: "object", properties: { requirements: requirementsSchema }, required: ["requirements"] },
  },
  {
    name: "search_parts",
    description: "Search the parts catalog for one slot. Returns compact part records with id, name, approx price, key specs and tags. Only parts returned here may be recommended.",
    input_schema: {
      type: "object",
      properties: {
        slot: { type: "string", enum: SLOTS },
        tags: { type: "array", items: { type: "string" }, description: "Optional: prefer parts with any of these tags (e.g. budget, ros2, beginner, recommended)" },
        max_price_usd: { type: "number" },
      },
      required: ["slot"],
    },
  },
  {
    name: "find_reference_designs",
    description: "Find open-source rover designs similar to what the user wants, to show as references.",
    input_schema: {
      type: "object",
      properties: {
        autonomy: requirementsSchema.properties.autonomy,
        max_cost_usd: { type: "number" },
      },
    },
  },
  {
    name: "check_build",
    description: "Run the deterministic compatibility checker on a candidate build. Returns errors (must fix), warnings (explain), info, and totals (price, mass, runtime, 5 V load).",
    input_schema: {
      type: "object",
      properties: { items: itemsSchema, requirements: requirementsSchema },
      required: ["items", "requirements"],
    },
  },
  {
    name: "present_build",
    description: "Show the build to the user as a cart. Rejected if check_build would report any error. Include a reason for every item.",
    input_schema: {
      type: "object",
      properties: {
        items: itemsSchema,
        requirements: requirementsSchema,
        summary: { type: "string", description: "2–3 sentence overview shown above the cart" },
      },
      required: ["items", "requirements", "summary"],
    },
  },
];

function compactPart(p: Part) {
  // Drop empty fields to keep tool results small.
  const compat = Object.fromEntries(Object.entries(p.compat).filter(([, v]) => v !== undefined));
  return { id: p.id, name: p.name, brand: p.brand, price_usd_approx: p.price_usd_approx, pack_size: p.pack_size, tags: p.tags, description: p.description, compat };
}

type Input = Record<string, any>;

export async function runAdvisorTool(name: string, input: Input, catalog: Catalog, session: AdvisorSession): Promise<unknown> {
  switch (name) {
    case "save_requirements": {
      await session.saveRequirements(input.requirements as Requirements);
      return { saved: true };
    }
    case "search_parts": {
      const all = await catalog.parts();
      let res = all.filter((p) => p.slot === input.slot);
      if (input.max_price_usd !== undefined) res = res.filter((p) => p.price_usd_approx <= input.max_price_usd);
      const tags: string[] = input.tags ?? [];
      if (tags.length) {
        const score = (p: Part) => p.tags.filter((t) => tags.includes(t)).length;
        res = [...res].sort((a, b) => score(b) - score(a) || a.price_usd_approx - b.price_usd_approx);
      } else {
        res = [...res].sort((a, b) => a.price_usd_approx - b.price_usd_approx);
      }
      return { slot: input.slot, count: res.length, parts: res.map(compactPart) };
    }
    case "find_reference_designs": {
      let res = await catalog.referenceDesigns();
      if (input.autonomy) {
        const rank = { remote_control: 0, obstacle_avoidance: 1, mapping_navigation: 2 } as const;
        res = res.filter((d) => rank[d.autonomy] >= rank[input.autonomy as keyof typeof rank]);
      }
      if (input.max_cost_usd !== undefined) res = res.filter((d) => d.approx_cost_usd[0] <= input.max_cost_usd);
      return { designs: res };
    }
    case "check_build": {
      const byId = Object.fromEntries((await catalog.parts()).map((p) => [p.id, p]));
      return checkBuild(input.items as BuildItem[], byId, input.requirements as Requirements);
    }
    case "present_build": {
      const byId = Object.fromEntries((await catalog.parts()).map((p) => [p.id, p]));
      const report = checkBuild(input.items as BuildItem[], byId, input.requirements as Requirements);
      if (!report.ok) {
        return { presented: false, reason: "Build has errors — fix them with check_build first.", report };
      }
      await session.presentBuild({ items: input.items, summary: input.summary, report });
      return { presented: true, totals: report.totals, warnings: report.issues.filter((i) => i.severity === "warning") };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}
