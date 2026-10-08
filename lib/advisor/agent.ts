// Minimal advisor loop: call Claude, run tools, repeat until it answers in text.
// Use from app/api/chat/route.ts. Add streaming once the loop works end to end.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { advisorTools, runAdvisorTool, type AdvisorSession, type Catalog } from "./tools";

const MODEL = "claude-sonnet-5-5";
const MAX_TOOL_ROUNDS = 12;

const SYSTEM_PROMPT = readFileSync(join(process.cwd(), "lib/advisor/system-prompt.md"), "utf8");

// Created on first use so pages that only need `jsonCatalog` don't construct a client.
let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic()); // reads ANTHROPIC_API_KEY

/**
 * Runs one user turn. `history` is the full Anthropic message list for the project
 * (persist it in the `messages` table); the new messages are appended in place.
 * Returns the assistant's final text for this turn.
 */
export async function advisorTurn(history: Anthropic.MessageParam[], catalog: Catalog, session: AdvisorSession): Promise<string> {
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 16000, // thinking is always on for this model and counts toward the limit
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      system: SYSTEM_PROMPT,
      tools: advisorTools,
      messages: history,
    });
    history.push({ role: "assistant", content: res.content });

    if (res.stop_reason === "refusal") {
      return "Sorry — I can't help with that request. Could you describe the rover you'd like to build?";
    }
    if (res.stop_reason !== "tool_use") {
      return res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      try {
        const out = await runAdvisorTool(block.name, block.input as Record<string, unknown>, catalog, session);
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
      } catch (err) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: String(err), is_error: true });
      }
    }
    history.push({ role: "user", content: results });
  }
  return "Sorry — I got stuck putting that build together. Could you rephrase or simplify the request?";
}

/** Catalog backed by the JSON files in /data — handy for local dev before Supabase is wired up. */
export const jsonCatalog: Catalog = {
  async parts() {
    return JSON.parse(readFileSync(join(process.cwd(), "data/parts.json"), "utf8"));
  },
  async referenceDesigns() {
    return JSON.parse(readFileSync(join(process.cwd(), "data/reference_designs.json"), "utf8"));
  },
};
