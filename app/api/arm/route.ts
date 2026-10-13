// Task to arm requirements: Claude reads a plain description of the job and fills in the numbers
// the deterministic sizer needs (lib/arm/advise.ts). It never picks motors or decides feasibility.
// The client uses the offline parser (lib/arm/parse.ts) when this returns 503.
import Anthropic from "@anthropic-ai/sdk";
import type { ApiError } from "@/lib/advisor/api";
import { advisorConfigured, describeAdvisorError, NOT_CONFIGURED } from "@/lib/advisor/errors";
import { cleanTask } from "@/lib/arm/parse";

export const maxDuration = 60;

const MODEL = "claude-sonnet-5-5";
const MAX_CHARS = 1500;

const SYSTEM = `You help someone describe a task they want a robot arm to do, as numbers an engineering
tool can size motors from. Call describe_task exactly once.

Fill every field. When the description doesn't say, use a sensible estimate for the real objects
involved (a can of soda is about 350 g, an egg about 60 g, a chess piece about 20 g) and say what you
assumed in "assumptions". reach_cm is the farthest point the arm must reach from the centre of its
base. lift_cm is how high above the work surface it must lift or place. precision_mm is how close to
the target it must place things: about 20 for dropping into a bin, 5 for placing on a spot, 1 for
fitting into a slot. orientation is "none" if the gripper can always point straight down, "turn" if it
must also spin the object, "full" if it must tilt it (pouring, handing over, placing sideways).
flat_work is true when every pick and place is on one flat surface. near_people is true when people
work within reach of the arm. Do not recommend motors or say whether it is feasible; the tool does that.
Write assumptions as short plain sentences, without em dashes.`;

const TOOL: Anthropic.Tool = {
  name: "describe_task",
  description: "Return the task as numbers.",
  input_schema: {
    type: "object",
    properties: {
      motion: { type: "string", enum: ["pick_place", "sort", "draw", "inspect", "pour", "assemble"] },
      object_g: { type: "number", description: "Heaviest object, grams" },
      object: { type: "string", enum: ["rigid", "flat", "soft", "irregular"] },
      reach_cm: { type: "number" },
      lift_cm: { type: "number" },
      precision_mm: { type: "number" },
      per_minute: { type: "number", description: "Picks or moves per minute" },
      orientation: { type: "string", enum: ["none", "turn", "full"] },
      flat_work: { type: "boolean" },
      near_people: { type: "boolean" },
      hours_per_day: { type: "number" },
      assumptions: { type: "array", items: { type: "string" }, description: "1 to 4 short sentences" },
    },
    required: ["motion", "object_g", "object", "reach_cm", "lift_cm", "precision_mm", "per_minute", "orientation", "flat_work", "near_people", "hours_per_day", "assumptions"],
  },
};

let client: Anthropic | undefined;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";
  if (!text) return Response.json({ error: "bad_request", message: "Describe the task first." } satisfies ApiError, { status: 400 });
  if (!advisorConfigured()) return Response.json(NOT_CONFIGURED, { status: 503 });
  try {
    client ??= new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low" },
      system: SYSTEM,
      tools: [TOOL],
      messages: [{ role: "user", content: text }],
    });
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "describe_task");
    if (!call) return Response.json({ error: "no_task", message: "I couldn't read that as a task. Say what it picks up, how heavy it is and where it goes." } satisfies ApiError, { status: 422 });
    const input = call.input as Record<string, unknown>;
    const assumptions = Array.isArray(input.assumptions) ? input.assumptions.filter((n): n is string => typeof n === "string").slice(0, 4) : [];
    return Response.json({ task: { ...cleanTask(input), description: text }, assumptions });
  } catch (err) {
    console.error("arm task failed", err);
    const { status, body } = describeAdvisorError(err);
    return Response.json(body, { status });
  }
}
