// Text-to-CAD: Claude turns a plain description into one of the parametric part templates.
// The client falls back to the offline parser (lib/cad/parse.ts) when this returns 503.
import Anthropic from "@anthropic-ai/sdk";
import type { ApiError } from "@/lib/advisor/api";
import { advisorConfigured, describeAdvisorError, NOT_CONFIGURED } from "@/lib/advisor/errors";
import { designWarnings, isTemplateId, normalise, TEMPLATE_ORDER, TEMPLATES } from "@/lib/cad/spec";
import { checkLimit, limited } from "@/lib/rateLimit";

export const maxDuration = 60;

const MODEL = "claude-sonnet-5-5";
const MAX_CHARS = 1000;

const templateDocs = TEMPLATE_ORDER.map((id) => {
  const t = TEMPLATES[id];
  const nums = t.numbers.map((n) => `${n.key} (${n.label}, ${n.min} to ${n.max} mm${n.help ? `; ${n.help}` : ""})`).join("; ");
  const choices = t.choices.map((c) => `${c.key}: one of ${c.options.map((o) => `"${o.value}" (${o.label})`).join(", ")}`).join("; ");
  return `- "${id}" ${t.name}: ${t.blurb}\n  numbers: ${nums}${choices ? `\n  choices: ${choices}` : ""}\n  defaults: ${JSON.stringify(t.defaults)}`;
}).join("\n");

const SYSTEM = `You turn a robot builder's description of a 3D-printable part into a parametric design.
You can only make these templates (all sizes in mm):
${templateDocs}

Call design_part exactly once. Pick the closest template, fill in every number you can infer from
the description and leave the rest at the defaults. Use typical real dimensions when the user names
a known component (for example an HC-SR04 is 45 x 20 mm). If the request is something these
templates can't make (a gear, an enclosure with a lid, an organic shape), still pick the closest
template and say so plainly in "notes". Write notes in short plain sentences, without em dashes.`;

const TOOL: Anthropic.Tool = {
  name: "design_part",
  description: "Return the part design.",
  input_schema: {
    type: "object",
    properties: {
      template: { type: "string", enum: TEMPLATE_ORDER },
      name: { type: "string", description: "Short name for this part, e.g. 'Pi 5 mounting plate'" },
      params: { type: "object", description: "Template numbers and choices", additionalProperties: true },
      notes: { type: "array", items: { type: "string" }, description: "What you assumed or could not do, 1 to 4 short sentences" },
    },
    required: ["template", "name", "params", "notes"],
  },
};

let client: Anthropic | undefined;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";
  if (!text) return Response.json({ error: "bad_request", message: "Describe the part first." } satisfies ApiError, { status: 400 });
  if (!advisorConfigured()) return Response.json(NOT_CONFIGURED, { status: 503 });
  const limit = await checkLimit(req, "cad");
  if (!limit.ok) return limited(limit);
  try {
    client ??= new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "low" },
      system: SYSTEM,
      tools: [TOOL],
      messages: [{ role: "user", content: text }],
    });
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "design_part");
    const input = call?.input as { template?: unknown; name?: unknown; params?: Record<string, unknown>; notes?: unknown } | undefined;
    if (!input || !isTemplateId(input.template)) {
      return Response.json({ error: "no_design", message: "I couldn't turn that into a part. Try describing its size and what it holds." } satisfies ApiError, { status: 422 });
    }
    const design = {
      template: input.template,
      name: typeof input.name === "string" ? input.name.slice(0, 60) : TEMPLATES[input.template].name,
      params: normalise(input.template, input.params ?? {}),
    };
    const notes = Array.isArray(input.notes) ? input.notes.filter((n): n is string => typeof n === "string").slice(0, 4) : [];
    return Response.json({ design, notes, warnings: designWarnings(design) });
  } catch (err) {
    console.error("text-to-cad failed", err);
    const { status, body } = describeAdvisorError(err);
    return Response.json(body, { status });
  }
}
