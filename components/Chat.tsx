"use client";

import { useEffect, useRef, useState } from "react";
import type { ReferenceDesign } from "@/lib/advisor/tools";

export interface ChatMessage {
  role: "user" | "assistant" | "notice";
  text: string;
  designs?: ReferenceDesign[];
}

const EXAMPLES = [
  "A rover that maps my apartment and follows me",
  "My first robot — something cheap that avoids walls",
  "A robot that carries a drink from the kitchen to my desk",
];

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
            <h1 className="text-2xl font-semibold tracking-tight">What robot do you want to build?</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Describe it in your own words. The advisor asks a few questions, then puts together a parts list that is checked for compatibility.
            </p>
            <div className="mt-4 flex flex-col items-start gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => submit(ex)}
                  className="rounded-full border border-zinc-200 px-3 py-1.5 text-left text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  {ex}
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
              <div className={m.role === "user" ? "max-w-[85%] rounded-2xl bg-zinc-100 px-4 py-2 text-sm dark:bg-zinc-800" : "max-w-[95%] text-sm leading-relaxed"}>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.designs && m.designs.length > 0 && (
                  <ul className="mt-3 grid gap-2">
                    {m.designs.map((d) => (
                      <li key={d.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                        <div className="flex items-baseline justify-between gap-3">
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
                            {d.name} ↗
                          </a>
                          <span className="shrink-0 font-mono text-xs">
                            ~${d.approx_cost_usd[0]}–{d.approx_cost_usd[1]}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{d.summary}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {d.difficulty} · good for {d.best_for.join(", ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ),
        )}

        {busy && (
          <p role="status" className="animate-pulse text-sm text-zinc-500">
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
        <button type="submit" disabled={busy || !draft.trim()} className="h-11 rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-40">
          Send
        </button>
      </form>
    </section>
  );
}
