"use client";
import Link from "next/link";
import { BotMark } from "./ui";

export const STEPS = ["Robot type", "Use case", "Start from", "Build", "Wiring", "Cart", "Guide"] as const;

export default function Header({ step, maxStep, onStep, bagCount, onChat }: { step: number; maxStep: number; onStep: (n: number) => void; bagCount: number; onChat: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
        <button onClick={() => onStep(0)} className="flex items-center gap-1.5 text-[1.35rem] font-bold tracking-[-0.03em]">
          <BotMark className="h-6 w-6 text-blue" />
          <span>
            buildabot<span className="text-blue">.</span>
          </span>
        </button>
        <nav aria-label="Steps" className="hidden flex-1 justify-center lg:flex">
          <ol className="flex items-center gap-1">
            {STEPS.map((s, i) => {
              const reachable = i <= maxStep;
              const active = i === step;
              return (
                <li key={s}>
                  <button
                    disabled={!reachable}
                    onClick={() => onStep(i)}
                    aria-current={active ? "step" : undefined}
                    className={`relative flex h-16 items-center gap-1.5 px-3 text-sm font-medium transition-colors ${active ? "text-ink" : reachable ? "text-mute hover:text-ink" : "text-faint"}`}
                  >
                    <span className={`num grid h-5 w-5 place-items-center rounded-full text-[0.7rem] ${i < step ? "bg-blue text-white" : active ? "bg-ink text-white" : "bg-stage text-mute"}`}>
                      {i < step ? "✓" : i + 1}
                    </span>
                    {s}
                    {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-ink" />}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <p className="flex-1 text-sm text-mute lg:hidden">
          <span className="hidden sm:inline">Step {step + 1} of {STEPS.length}: </span>
          <span className="font-semibold text-ink">{STEPS[step]}</span>
        </p>
        <div className="flex items-center gap-2">
          <Link href="/parts" className="hidden px-2 text-sm font-medium text-mute hover:text-ink xl:inline">
            Parts catalog
          </Link>
          <button onClick={onChat} className="hidden h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold hover:border-ink sm:flex">
            <span className="h-2 w-2 rounded-full bg-blue" />
            Ask buildabot
          </button>
          <button onClick={onChat} aria-label="Ask buildabot" className="grid h-10 w-10 place-items-center rounded-full border border-line sm:hidden">
            <BotMark className="h-5 w-5 text-blue" />
          </button>
          <button
            onClick={() => bagCount && onStep(5)}
            disabled={!bagCount}
            className="flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white disabled:bg-stage disabled:text-faint"
          >
            Bag <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-blue px-1.5 text-xs">{bagCount}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
