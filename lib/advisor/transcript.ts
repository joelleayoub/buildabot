// Helpers that read the stored Anthropic message history: what to show in the chat UI, which
// reference designs a turn looked up, and which cart contents the advisor last knew about.

import type Anthropic from "@anthropic-ai/sdk";
import type { BuildItem } from "../compat/types";
import type { ReferenceDesign } from "./tools";

export interface TranscriptMessage {
  role: "user" | "assistant";
  text: string;
  designs?: ReferenceDesign[];
}

const CART_NOTE = /^\[Cart update — the user edited the build in the UI\. It now contains: (\[.*?\])\]\n\n/;

/** Prefix for a user message, telling the advisor about parts the user swapped in the cart. */
export function cartNote(items: BuildItem[]): string {
  const cart = items.map(({ part_id, quantity }) => ({ part_id, quantity }));
  return `[Cart update — the user edited the build in the UI. It now contains: ${JSON.stringify(cart)}]\n\n`;
}

/** Reference designs the advisor looked up in the given messages. */
export function designsShown(messages: Anthropic.MessageParam[]): ReferenceDesign[] {
  const lookupIds = new Set<string>();
  const designs = new Map<string, ReferenceDesign>();
  for (const m of messages) {
    if (typeof m.content === "string") continue;
    for (const block of m.content) {
      if (block.type === "tool_use" && block.name === "find_reference_designs") lookupIds.add(block.id);
      if (block.type === "tool_result" && lookupIds.has(block.tool_use_id) && typeof block.content === "string" && !block.is_error) {
        for (const d of (JSON.parse(block.content).designs ?? []) as ReferenceDesign[]) designs.set(d.id, d);
      }
    }
  }
  return [...designs.values()].slice(0, 3);
}

/** Cart contents as of the advisor's last turn: its latest presented build, or a later user edit it was told about. */
export function advisorKnownItems(history: Anthropic.MessageParam[]): BuildItem[] {
  let known: BuildItem[] = [];
  const pending = new Map<string, BuildItem[]>();
  for (const m of history) {
    if (typeof m.content === "string") {
      const note = m.role === "user" ? CART_NOTE.exec(m.content) : null;
      if (note) known = JSON.parse(note[1]);
      continue;
    }
    for (const block of m.content) {
      if (block.type === "tool_use" && block.name === "present_build") pending.set(block.id, (block.input as { items: BuildItem[] }).items);
      if (block.type === "tool_result" && pending.has(block.tool_use_id) && typeof block.content === "string" && JSON.parse(block.content).presented) {
        known = pending.get(block.tool_use_id)!;
      }
    }
  }
  return known;
}

/** The conversation as the user saw it: their messages and the advisor's final text for each turn. */
export function transcript(history: Anthropic.MessageParam[]): TranscriptMessage[] {
  const out: TranscriptMessage[] = [];
  let turnStart = -1;
  const closeTurn = (end: number) => {
    if (turnStart < 0) return;
    const turn = history.slice(turnStart, end);
    const last = turn.findLast((m) => m.role === "assistant");
    const text =
      last && typeof last.content !== "string"
        ? last.content
            .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
            .map((b) => b.text)
            .join("\n")
        : ((last?.content as string | undefined) ?? "");
    if (text) out.push({ role: "assistant", text, designs: designsShown(turn) });
  };
  history.forEach((m, i) => {
    if (m.role === "user" && typeof m.content === "string") {
      closeTurn(i);
      out.push({ role: "user", text: m.content.replace(CART_NOTE, "") });
      turnStart = i;
    }
  });
  closeTurn(history.length);
  return out;
}
