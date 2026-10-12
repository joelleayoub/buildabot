"use client";
import { useEffect, useRef, useState } from "react";
import type { ReferenceDesign } from "@/lib/advisor/tools";
import { money } from "@/lib/catalog";
import { BotMark, Button } from "./ui";

export interface ChatMessage {
  role: "user" | "assistant" | "notice";
  text: string;
  designs?: ReferenceDesign[];
}

const SUGGESTIONS = ["Why did you pick this battery?", "Make it cheaper", "Can it climb a door threshold?", "What should I buy first?"];

export default function ChatDrawer({ open, onClose, messages, busy, onSend }: { open: boolean; onClose: () => void; messages: ChatMessage[]; busy: boolean; onSend: (text: string) => void }) {
  const [input, setInput] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy, open]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    onSend(t);
  };

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-ink/20 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={onClose} aria-hidden />
      <aside
        aria-label="Ask buildabot"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col bg-paper transition-transform duration-300 ${open ? "visible translate-x-0 shadow-[-20px_0_60px_-30px_rgba(21,23,28,0.35)]" : "invisible translate-x-full"}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-blue text-white">
              <BotMark className="h-5 w-5" />
            </span>
            <div>
              <p className="font-bold leading-tight">Ask buildabot</p>
              <p className="text-xs text-mute">Knows your build and every part in the catalog</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-stage-2" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {messages.length === 0 && (
            <div>
              <p className="text-[0.95rem] leading-relaxed text-mute">
                Describe the robot you want in your own words, ask about any part, or tell me what to change. I only suggest parts that work with the rest of your robot.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-3.5 py-2 text-sm hover:border-ink">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[0.95rem] leading-relaxed ${m.role === "user" ? "bg-ink text-white" : m.role === "notice" ? "bg-warn-soft text-ink" : "bg-stage-2"}`}
              >
                {m.text}
              </div>
              {m.designs && m.designs.length > 0 && (
                <ul className="mt-2 max-w-[88%] space-y-2">
                  {m.designs.map((d) => (
                    <li key={d.id} className="rounded-2xl border border-line p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue hover:underline">
                          {d.name}
                        </a>
                        <span className="num shrink-0 text-xs text-mute">
                          {money(d.approx_cost_usd[0])} to {money(d.approx_cost_usd[1])}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-snug text-mute">{d.summary}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {busy && <p className="text-sm text-mute">Checking parts…</p>}
          <div ref={end} />
        </div>

        <form
          className="border-t border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border border-line p-2 focus-within:border-ink">
            <textarea
              ref={inputRef}
              rows={1}
              maxLength={4000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask about your robot…"
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.95rem] outline-none"
              aria-label="Message"
            />
            <Button variant="primary" className="h-9 px-4" disabled={!input.trim() || busy} type="submit">
              Send
            </Button>
          </div>
        </form>
      </aside>
    </>
  );
}
