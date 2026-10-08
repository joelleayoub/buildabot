// Second Claude call: turns a checked build into a markdown build guide.

import Anthropic from "@anthropic-ai/sdk";
import type { BuildItem, BuildReport, Part, Requirements } from "../compat/types";

const MODEL = "claude-sonnet-5-5";

const GUIDE_SYSTEM_PROMPT = `You write build guides for first-time robot builders.

You are given a rover build that has already passed a deterministic compatibility checker: the
parts (with specs), the user's requirements, and the checker's warnings and notes. Write a
practical guide in GitHub-flavoured markdown with exactly these sections, in this order:

# <short title for this rover>
One or two sentences on what it does.

## Parts and tools
- A table of the parts (name, quantity to buy, what it's for).
- A list of tools and consumables needed (screwdrivers, soldering iron only if actually needed,
  wire, connectors, zip ties, etc.).

## Before you start
Safety notes that apply to THIS build (battery chemistry, regulator setup, the checker's
warnings in plain language). Keep it short.

## Assembly
Numbered steps, mechanical first: chassis, motors, wheels, caster, then mounting electronics.

## Wiring
A table with columns: From | To | Wire / notes. Cover power (battery → driver, battery →
regulator → 5 V devices), motors, encoders if present, and every sensor. Then a short numbered
order in which to connect things, with power connected last.

## First boot
Numbered steps to power on safely and get the first sign of life (what to flash or install,
what to run, what you should see).

## Test checklist
A checkbox list (- [ ]) of things to verify, from "nothing gets hot" up to the robot doing its job.

Rules:
- Use only the parts listed. Never invent parts, part numbers, prices or links.
- Take voltages, currents and interfaces from the specs given; if a pin assignment or detail is
  not in the specs, say "check the board's pinout" rather than guessing a specific pin number.
- Explain each technical term in a few words the first time it appears.
- Be concrete and brief. No introduction before the title and no closing remarks.`;

export async function generateGuide(items: BuildItem[], partsById: Record<string, Part>, requirements: Requirements, report: BuildReport): Promise<string> {
  const parts = items.map((i) => {
    const p = partsById[i.part_id];
    return { name: p.name, slot: p.slot, brand: p.brand, packs_to_buy: i.quantity, units_per_pack: p.pack_size, description: p.description, specs: p.compat };
  });
  const notes = report.issues.map(({ severity, message, fix }) => ({ severity, message, fix }));

  const client = new Anthropic();
  const res = await client.messages
    .stream({
      model: MODEL,
      max_tokens: 32000,
      output_config: { effort: "medium" },
      system: GUIDE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Requirements:\n${JSON.stringify(requirements, null, 2)}\n\nParts:\n${JSON.stringify(parts, null, 2)}\n\nChecker notes:\n${JSON.stringify(notes, null, 2)}\n\nEstimated totals:\n${JSON.stringify(report.totals, null, 2)}`,
        },
      ],
    })
    .finalMessage();

  if (res.stop_reason === "refusal") throw new Error("Guide generation was refused.");
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
