"use client";
// "Feedback" tab on the right edge of every page, for user tests. Sends to /api/feedback.
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sessionId, track } from "@/lib/analytics";

const STEP_NAMES = ["Robot type", "Use case", "Start from", "Build", "Wiring", "Cart", "Guide"];

function currentStep(): string {
  try {
    const f = JSON.parse(localStorage.getItem("buildabot.flow") ?? "null");
    return typeof f?.step === "number" ? (STEP_NAMES[f.step] ?? "") : "";
  } catch {
    return "";
  }
}

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [goal, setGoal] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname?.startsWith("/dev")) return null;

  const send = async () => {
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session: sessionId(), rating, goal, message, path: location.pathname, step: location.pathname === "/" ? currentStep() : "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Couldn't send your feedback.");
      track("feedback_sent", { rating: rating ?? 0 });
      setState("sent");
      setMessage("");
      setGoal("");
      setRating(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your feedback.");
      setState("error");
    }
  };

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setState("idle");
        }}
        className="fixed right-0 top-1/2 z-40 origin-bottom-right -translate-y-1/2 -rotate-90 rounded-t-xl bg-ink px-3.5 py-2 text-xs font-semibold text-white shadow-lg print:hidden"
      >
        Feedback
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="fb-title" className="w-full max-w-[440px] rounded-3xl bg-paper p-6 shadow-2xl">
            {state === "sent" ? (
              <div className="text-center">
                <p id="fb-title" className="text-xl font-bold">Thank you!</p>
                <p className="mt-2 text-mute">That helps a lot. Keep going, and send more any time.</p>
                <button onClick={() => setOpen(false)} className="mt-6 h-11 rounded-full bg-ink px-6 text-sm font-semibold text-white">
                  Back to building
                </button>
              </div>
            ) : (
              <>
                <p id="fb-title" className="text-xl font-bold">How is it going?</p>
                <p className="mt-1 text-sm text-mute">Anything confusing, broken or missing. No account needed.</p>
                <div className="mt-5 flex gap-2" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={rating === n}
                      onClick={() => setRating(rating === n ? null : n)}
                      className={`num h-11 flex-1 rounded-xl text-sm font-bold ${rating === n ? "bg-blue text-white" : "bg-stage-2 hover:bg-stage"}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between text-xs text-mute">
                  <span>Frustrating</span>
                  <span>Great</span>
                </div>
                <label className="mt-5 block text-sm font-semibold" htmlFor="fb-goal">
                  What were you trying to do?
                </label>
                <input id="fb-goal" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={500} placeholder="e.g. swap the battery for a cheaper one" className="mt-1.5 h-11 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-ink" />
                <label className="mt-4 block text-sm font-semibold" htmlFor="fb-msg">
                  What happened?
                </label>
                <textarea ref={box} id="fb-msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} rows={4} className="mt-1.5 w-full rounded-xl border border-line p-3 text-sm outline-none focus:border-ink" />
                {state === "error" && <p className="mt-2 text-sm text-bad">{error}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button onClick={() => setOpen(false)} className="h-11 rounded-full border border-line px-5 text-sm font-semibold">
                    Cancel
                  </button>
                  <button onClick={send} disabled={state === "sending" || (!message.trim() && rating === null)} className="h-11 rounded-full bg-ink px-5 text-sm font-semibold text-white disabled:opacity-40">
                    {state === "sending" ? "Sending…" : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
