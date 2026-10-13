"use client";
// Picture-led build guide: one step at a time, like a LEGO manual. Assembly steps show the robot
// with only the parts fitted so far (new ones glowing), wiring steps light up the exact wire,
// and coding steps show ready-to-run code.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import PartArt from "@/components/PartArt";
import { PARTS_BY_ID } from "@/lib/catalog";
import type { BuildItem } from "@/lib/compat/types";
import type { GuideSection, GuideStep } from "@/lib/quickGuide";
import { ToolIcon } from "@/components/ToolIcon";
import { SLOT_LABELS } from "@/lib/slots";
import { planWiring } from "@/lib/wiring";
import { CodeBlock } from "./Electronics";
import { KIND, WiringDiagram } from "./WiringDiagram";
import { Button } from "./ui";

const RobotViewer = dynamic(() => import("@/components/RobotViewer"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-sm text-mute">Loading 3D view…</div> });

interface Flat extends GuideStep {
  section: string;
  sectionIndex: number;
  time: string;
}

function Visual({ step, items }: { step: Flat; items: BuildItem[] }) {
  const v = step.visual;
  const wiring = useMemo(() => planWiring(items, PARTS_BY_ID), [items]);
  if (!v) return <div className="grid h-full place-items-center text-mute">No picture for this step.</div>;
  if (v.kind === "assembly") {
    const shown = items.filter((i) => v.show.includes(PARTS_BY_ID[i.part_id]?.slot));
    return (
      <div className="relative h-full">
        <RobotViewer items={shown} byId={PARTS_BY_ID} highlight={v.highlight} strong />
        {v.highlight.length > 0 && (
          <p className="pointer-events-none absolute left-4 top-4 rounded-full bg-paper/90 px-3 py-1.5 text-sm font-semibold shadow-sm">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-blue" />
            New: {v.highlight.map((s) => SLOT_LABELS[s]).join(", ")}
          </p>
        )}
      </div>
    );
  }
  if (v.kind === "wire") {
    const w = wiring.wires.find((x) => x.n === v.n);
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 p-3">
          <WiringDiagram nodes={wiring.nodes} wires={wiring.wires} highlight={v.n} zoom />
        </div>
        {w && (
          <p className="flex items-center gap-2.5 border-t border-line bg-paper/70 px-4 py-2.5 text-sm font-medium">
            <svg width="28" height="8" aria-hidden className="shrink-0">
              <line x1="2" y1="4" x2="26" y2="4" stroke={KIND[w.kind].color} strokeWidth="3" strokeDasharray={KIND[w.kind].dash} strokeLinecap="round" />
            </svg>
            <span className="shrink-0 text-mute">{KIND[w.kind].label}</span>
            <span>{w.pins}</span>
          </p>
        )}
      </div>
    );
  }
  if (v.kind === "code") {
    return (
      <div className="h-full overflow-auto p-3">
        <CodeBlock code={v.code} filename={v.filename} />
      </div>
    );
  }
  if (v.kind === "parts") {
    return (
      <div className="scrollbar-thin grid h-full auto-rows-min grid-cols-2 gap-3 overflow-auto p-4 sm:grid-cols-3 xl:grid-cols-4">
        {v.ids.map((id) => {
          const p = PARTS_BY_ID[id];
          const qty = items.find((i) => i.part_id === id)?.quantity ?? 1;
          return (
            <div key={id} className="rounded-2xl bg-paper p-2">
              <PartArt part={p} className="aspect-[4/3] h-auto w-full" />
              <p className="mt-1 line-clamp-2 text-xs font-semibold leading-snug">
                {qty > 1 ? `${qty} × ` : ""}
                {p.name}
              </p>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="grid h-full auto-rows-min grid-cols-1 gap-2 overflow-auto p-4 sm:grid-cols-2">
      {v.tools.map((t) => (
        <div key={t.name} className="flex items-center gap-3 rounded-2xl bg-paper p-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-soft text-blue">
            <ToolIcon icon={t.icon} />
          </span>
          <span className="text-sm leading-snug">{t.name}</span>
        </div>
      ))}
    </div>
  );
}

export default function GuideStepper({ sections, items }: { sections: GuideSection[]; items: BuildItem[] }) {
  const steps: Flat[] = useMemo(() => sections.flatMap((s, si) => s.steps.map((st) => ({ ...st, section: s.title, sectionIndex: si, time: s.time }))), [sections]);
  const key = "buildabot.guide." + items.map((i) => i.part_id).sort().join(",").length + "." + steps.length;
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<Set<number>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(key) ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const i = Math.min(idx, steps.length - 1);
  const step = steps[i];

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify([...done]));
    } catch {
      /* not remembered */
    }
  }, [done, key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") setIdx((n) => Math.min(steps.length - 1, n + 1));
      if (e.key === "ArrowLeft") setIdx((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length]);

  if (!step) return null;
  const toggle = () =>
    setDone((d) => {
      const n = new Set(d);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const next = () => {
    setDone((d) => new Set(d).add(i));
    setIdx(Math.min(steps.length - 1, i + 1));
  };

  return (
    <div>
      {/* progress across the sections */}
      <div className="flex gap-1.5" aria-label="Progress">
        {sections.map((s, si) => {
          const range = steps.map((st, k) => (st.sectionIndex === si ? k : -1)).filter((k) => k >= 0);
          const first = range[0];
          const fin = range.filter((k) => done.has(k)).length;
          return (
            <button key={s.title} onClick={() => setIdx(first)} className="group flex-1 text-left" style={{ flexGrow: range.length }}>
              <span className="block h-1.5 overflow-hidden rounded-full bg-stage">
                <span className="block h-full rounded-full bg-blue transition-all" style={{ width: `${(fin / range.length) * 100}%` }} />
              </span>
              <span className={`mt-1.5 hidden truncate text-xs sm:block ${step.sectionIndex === si ? "font-semibold text-ink" : "text-mute group-hover:text-ink"}`}>{s.title}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
        <div className="h-[340px] overflow-hidden rounded-3xl bg-stage sm:h-[460px]">
          <Visual step={step} items={items} />
        </div>
        <div className="flex flex-col">
          <p className="text-sm font-medium text-blue">
            Step {i + 1} of {steps.length}: {step.section}
          </p>
          <h2 className="mt-1 text-[1.7rem] font-bold leading-tight tracking-[-0.02em]">{step.title.replace(/^\d+\.\s*/, "")}</h2>
          <p className="mt-3 whitespace-pre-line text-[1.02rem] leading-relaxed text-mute">{step.body}</p>
          {step.parts && step.parts.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold">You&apos;ll need</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {step.parts.map((id) => (
                  <div key={id} className="w-[92px] rounded-xl bg-stage-2 p-1.5" title={PARTS_BY_ID[id].name}>
                    <PartArt part={PARTS_BY_ID[id]} className="aspect-[4/3] h-auto w-full" />
                    <p className="truncate text-[0.68rem] font-medium">{SLOT_LABELS[PARTS_BY_ID[id].slot]}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm font-medium">
            <input type="checkbox" checked={done.has(i)} onChange={toggle} className="h-5 w-5 accent-[var(--blue)]" />
            I&apos;ve done this step
          </label>
          <div className="mt-auto flex items-center gap-2 pt-6">
            <Button onClick={() => setIdx(Math.max(0, i - 1))} disabled={i === 0}>
              Back
            </Button>
            <Button variant="dark" onClick={next} disabled={i === steps.length - 1 && done.has(i)}>
              {i === steps.length - 1 ? "Finish" : "Next step"}
            </Button>
            <span className="num ml-auto text-sm text-mute">
              {done.size} of {steps.length} done
            </span>
          </div>
        </div>
      </div>

      <details className="mt-8 rounded-2xl border border-line">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">All steps</summary>
        <ol className="grid gap-1 px-2 pb-3 sm:grid-cols-2">
          {steps.map((st, k) => (
            <li key={k}>
              <button onClick={() => setIdx(k)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${k === i ? "bg-blue-soft" : "hover:bg-stage-2"}`}>
                <span className={`num grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${done.has(k) ? "bg-blue text-white" : "bg-stage"}`}>{done.has(k) ? "✓" : k + 1}</span>
                <span className="truncate">{st.title.replace(/^\d+\.\s*/, "")}</span>
              </button>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
