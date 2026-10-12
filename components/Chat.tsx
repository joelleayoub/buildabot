"use client";

import { useEffect, useRef, useState } from "react";
import type { ReferenceDesign } from "@/lib/advisor/tools";
import type { Slot } from "@/lib/compat/types";
import { AUTONOMY_LABELS } from "@/lib/slots";
import { HeroRover, StepIcons } from "./Illustrations";
import { SlotBadge } from "./SlotIcon";

export interface ChatMessage {
  role: "user" | "assistant" | "notice";
  text: string;
  designs?: ReferenceDesign[];
}

const EXAMPLES: { text: string; slot: Slot }[] = [
  { text: "A rover that maps my apartment and follows me", slot: "lidar" },
  { text: "My first robot: something cheap that avoids walls", slot: "distance_sensor" },
  { text: "A robot that carries a drink from the kitchen to my desk", slot: "chassis" },
];

const STEPS = [
  { icon: StepIcons.describe, title: "Describe it", text: "Say what the robot should do, in your own words." },
  { icon: StepIcons.check, title: "Get a checked build", text: "Every parts list is tested for compatibility." },
  { icon: StepIcons.build, title: "Build it", text: "Buy the parts and follow a step-by-step guide." },
];

const DESIGN_ICON: Record<ReferenceDesign["autonomy"], Slot> = {
  remote_control: "controller",
  obstacle_avoidance: "distance_sensor",
  mapping_navigation: "lidar",
};

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  onSend(text: string): void;
}

export function Chat({ messages, busy, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    onSend(t);
    setDraft("");
  };

  return (
    <section aria-label="Advisor chat" className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div>
            <div className="overflow-hidden rounded-2xl bg-accent-soft px-5 pt-5">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">What robot do you want to build?</h1>
              <p className="mt-2 max-w-md text-sm text-zinc-700 dark:text-zinc-300">
                Describe it in your own words. The advisor asks a few questions, then puts together a parts list that is checked for compatibility.
              </p>
              <HeroRover className="mx-auto mt-2 h-auto w-full max-w-md" />
            </div>

            <ol className="mt-4 grid gap-3 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-3 sm:flex-col sm:gap-2">
                  {s.icon}
                  <div>
                    <p className="text-sm font-semibold">
                      {i + 1}. {s.title}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-5 text-xs font-medium text-zinc-500">Try one of these</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.text}
                  type="button"
                  onClick={() => submit(ex.text)}
                  className="flex items-start gap-2.5 rounded-xl border border-zinc-200 p-3 text-left text-sm transition-colors hover:border-accent hover:bg-accent-soft dark:border-zinc-800"
                >
                  <SlotBadge slot={ex.slot} size="sm" />
                  <span>{ex.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "notice" ? (
            <p key={i} role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {m.text}
            </p>
          ) : (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div className={m.role === "user" ? "max-w-[85%] rounded-2xl bg-accent px-4 py-2 text-sm text-accent-fg" : "max-w-[95%] text-sm leading-relaxed"}>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.designs && m.designs.length > 0 && (
                  <ul className="mt-3 grid gap-2">
                    {m.designs.map((d) => (
                      <li key={d.id} className="flex gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                        <SlotBadge slot={DESIGN_ICON[d.autonomy]} size="lg" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
                              {d.name} ↗
                            </a>
                            <span className="shrink-0 font-mono text-xs">
                              ~${d.approx_cost_usd[0]}–{d.approx_cost_usd[1]}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{d.summary}</p>
                          <p className="mt-2 flex flex-wrap gap-1 text-xs">
                            <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">{d.difficulty}</span>
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{AUTONOMY_LABELS[d.autonomy]}</span>
                            {d.best_for.map((b) => (
                              <span key={b} className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                {b}
                              </span>
                            ))}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ),
        )}

        {busy && (
          <p role="status" className="flex items-center gap-2 text-sm text-zinc-500">
            <span className="flex gap-1" aria-hidden="true">
              {[0, 150, 300].map((d) => (
                <span key={d} className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
            The advisor is thinking…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
        className="flex items-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(draft);
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="Describe your robot, or answer the advisor…"
          aria-label="Message"
          className="min-h-11 flex-1 resize-none rounded-xl border border-zinc-300 bg-background px-3 py-2 text-sm dark:border-zinc-700"
        />
        <button type="submit" disabled={busy || !draft.trim()} className="h-11 rounded-full bg-accent px-5 text-sm font-medium text-accent-fg disabled:opacity-40">
          Send
        </button>
      </form>
    </section>
  );
}
