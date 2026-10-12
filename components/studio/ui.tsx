"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Issue } from "@/lib/compat/types";

type Variant = "primary" | "dark" | "ghost" | "outline";
export function Button({ variant = "outline", className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-blue text-white hover:bg-blue-ink disabled:bg-faint",
    dark: "bg-ink text-white hover:bg-black disabled:bg-faint",
    ghost: "text-ink hover:bg-stage-2",
    outline: "border border-line bg-paper text-ink hover:border-ink",
  };
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function BotMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="5" fill="currentColor" />
      <circle cx="9" cy="12.5" r="1.8" fill="#fff" />
      <circle cx="15" cy="12.5" r="1.8" fill="#fff" />
      <rect x="11" y="2" width="2" height="4" rx="1" fill="currentColor" />
    </svg>
  );
}

export function AdviceBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-blue-soft px-4 py-3 text-[0.94rem] leading-snug text-ink">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue text-white">
        <BotMark className="h-4 w-4" />
      </span>
      <div>{children}</div>
    </div>
  );
}

const SEV = {
  error: { box: "bg-bad-soft text-bad", label: "Must fix" },
  warning: { box: "bg-warn-soft text-warn", label: "Heads-up" },
  info: { box: "bg-stage-2 text-mute", label: "Tip" },
};

export function IssueList({ issues, limit }: { issues: Issue[]; limit?: number }) {
  const sorted = [...issues].sort((a, b) => ["error", "warning", "info"].indexOf(a.severity) - ["error", "warning", "info"].indexOf(b.severity));
  const shown = limit ? sorted.slice(0, limit) : sorted;
  if (!shown.length) return null;
  return (
    <ul className="space-y-2">
      {shown.map((i, k) => (
        <li key={k} className={`rounded-xl px-3.5 py-2.5 text-sm leading-snug ${SEV[i.severity].box}`}>
          <span className="font-semibold">{SEV[i.severity].label}: </span>
          <span className="text-ink">{i.message}</span>
          {i.fix && <span className="block text-mute">{i.fix}</span>}
        </li>
      ))}
    </ul>
  );
}

export function FitBadge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ok ? "text-ok" : "text-bad"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-ok" : "bg-bad"}`} />
      {text}
    </span>
  );
}

export function StepHeading({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium text-blue">{kicker}</p>
      <h1 className="mt-1 text-[2rem] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[2.6rem]">{title}</h1>
      {children && <p className="mt-3 text-[1.05rem] leading-relaxed text-mute">{children}</p>}
    </div>
  );
}
