"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import PartArt from "@/components/PartArt";
import { PARTS, PARTS_BY_ID, money, partsInSlot } from "@/lib/catalog";
import type { BuildItem, BuildReport, Slot } from "@/lib/compat/types";
import { type Answers, ENVIRONMENTS, SLOT_LABELS, SLOT_ORDER, findUseCase } from "@/lib/flow";
import { trySwap } from "@/lib/swap";
import { TEMPLATES, type CustomPart } from "@/lib/cad/spec";
import { AdviceBox, Button, FitBadge, IssueList } from "./ui";

const RobotViewer = dynamic(() => import("@/components/RobotViewer"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-mute">Assembling your robot…</div>,
});

const REQUIRED: Slot[] = ["chassis", "drive_motor", "motor_driver", "battery"];
const OPTIONAL_ADDS: Slot[] = ["lidar", "camera", "distance_sensor", "imu"];

const SLOT_ADVICE: Partial<Record<Slot, string>> = {
  lidar: "A lidar spins a laser to measure the room in every direction. You need one to make a map.",
  camera: "A Pi camera streams video. A depth camera can also spot people and measure how far away they are.",
  distance_sensor: "A cheap way to stop before walls. Put one at the front, or two angled left and right.",
  imu: "A motion sensor tracks turns, which keeps maps straight and helps it drive in a line.",
};

export default function StepBuild({
  answers,
  items,
  report,
  selected,
  onSelect,
  onSwap,
  customParts,
  onDesign,
  onBack,
  onNext,
}: {
  answers: Answers;
  items: BuildItem[];
  report: BuildReport;
  selected: Slot;
  onSelect: (s: Slot) => void;
  onSwap: (slot: Slot, partId: string | null) => void;
  customParts: CustomPart[];
  onDesign: (part: CustomPart | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const uc = findUseCase(answers.useCase)!;
  const env = ENVIRONMENTS.find((e) => e.id === answers.environment)!;
  const slotOf = (i: BuildItem) => PARTS_BY_ID[i.part_id]?.slot;
  const inBuild = SLOT_ORDER.filter((s) => items.some((i) => slotOf(i) === s));
  const addable = OPTIONAL_ADDS.filter((s) => !inBuild.includes(s));
  const currentItem = items.find((i) => slotOf(i) === selected);
  const current = currentItem ? PARTS_BY_ID[currentItem.part_id] : undefined;

  const options = useMemo(() => {
    return partsInSlot(selected)
      .map((p) => {
        if (p.id === current?.id) return { part: p, current: true, ok: true, changed: [] as Slot[], why: "" };
        const r = trySwap(PARTS, answers, items, selected, p.id);
        const err = r.report.issues.find((i) => i.severity === "error");
        return { part: p, current: false, ok: r.report.ok, changed: r.changed, why: err?.message ?? "" };
      })
      .sort((a, b) => Number(b.current) - Number(a.current) || Number(b.ok) - Number(a.ok) || a.part.price_usd_approx - b.part.price_usd_approx);
  }, [selected, items, answers, current?.id]);

  const t = report.totals;
  const errors = report.issues.filter((i) => i.severity === "error");
  const advice = current ? currentItem?.reason : SLOT_ADVICE[selected];

  return (
    <section className="mx-auto max-w-[1440px] px-4 pb-28 pt-5 sm:px-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(380px,1fr)]">
        {/* stage */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-3xl bg-stage lg:sticky lg:top-[84px] lg:h-[calc(100dvh-180px)] lg:min-h-[560px]">
          <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
            <div>
              <p className="text-sm font-medium text-blue">Your robot</p>
              <h1 className="text-[1.9rem] font-bold leading-tight tracking-[-0.02em]">{uc.name}</h1>
              <p className="text-sm text-mute">Rover for {env.name.toLowerCase()}</p>
            </div>
            <dl className="num flex gap-6 text-right">
              <div>
                <dt className="text-xs text-mute">Total</dt>
                <dd className="text-lg font-bold">{money(t.price_usd_approx)}</dd>
              </div>
              <div>
                <dt className="text-xs text-mute">Weight</dt>
                <dd className="text-lg font-bold">{t.mass_kg.toFixed(1)} kg</dd>
              </div>
              <div>
                <dt className="text-xs text-mute">Runtime</dt>
                <dd className="text-lg font-bold">{t.est_runtime_min ? (t.est_runtime_min >= 90 ? `${(t.est_runtime_min / 60).toFixed(1)} h` : `${t.est_runtime_min} min`) : "–"}</dd>
              </div>
            </dl>
          </div>
          <div className="relative h-[320px] sm:h-[420px] lg:h-auto lg:min-h-0 lg:flex-1">
            <RobotViewer items={items} byId={PARTS_BY_ID} highlight={selected} onSelect={onSelect} />
            <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-paper/80 px-3 py-1 text-xs text-mute">Drag to look around. Point at a part to see what it is.</p>
          </div>
          <div className="scrollbar-thin flex gap-2 overflow-x-auto p-3 sm:p-4" role="tablist" aria-label="Parts on your robot">
            {inBuild.map((s) => {
              const it = items.find((i) => slotOf(i) === s)!;
              const p = PARTS_BY_ID[it.part_id];
              const active = s === selected;
              return (
                <button
                  key={s}
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelect(s)}
                  className={`w-[104px] shrink-0 rounded-2xl border-2 bg-paper p-2 text-left transition ${active ? "border-ink" : "border-transparent hover:border-line"}`}
                >
                  <div className="aspect-[4/3] rounded-lg bg-stage-2 p-1">
                    <PartArt part={p} className="h-full w-full" />
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between gap-1">
                    <span className="truncate text-xs font-semibold">{SLOT_LABELS[s]}</span>
                    <span className="num text-[0.7rem] text-mute">{money(p.price_usd_approx * it.quantity)}</span>
                  </div>
                </button>
              );
            })}
            {customParts.map((cp) => (
              <button key={cp.id} onClick={() => onDesign(cp)} className="w-[104px] shrink-0 rounded-2xl border-2 border-transparent bg-paper p-2 text-left transition hover:border-line" title={cp.design.name}>
                <div className="grid aspect-[4/3] place-items-center rounded-lg bg-blue-soft text-[0.7rem] font-semibold text-blue">3D print</div>
                <div className="mt-1.5 flex items-baseline justify-between gap-1">
                  <span className="truncate text-xs font-semibold">{cp.design.name || TEMPLATES[cp.design.template].name}</span>
                </div>
              </button>
            ))}
            <button
              onClick={() => onDesign(null)}
              className="grid w-[104px] shrink-0 place-items-center rounded-2xl border-2 border-dashed border-blue/40 p-2 text-center text-xs font-semibold text-blue transition hover:border-blue"
            >
              <span>
                <span className="block text-xl leading-none">+</span>
                Design a part
              </span>
            </button>
            {addable.map((s) => (
              <button
                key={s}
                onClick={() => onSelect(s)}
                className={`grid w-[104px] shrink-0 place-items-center rounded-2xl border-2 border-dashed p-2 text-center text-xs font-semibold transition ${selected === s ? "border-blue text-blue" : "border-line text-mute hover:border-mute"}`}
              >
                <span>
                  <span className="block text-xl leading-none">+</span>
                  {SLOT_LABELS[s]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* chooser */}
        <div className="flex min-w-0 flex-col">
          <p className="text-sm font-medium text-blue">Step 4 of 7</p>
          <h2 className="mt-1 text-[1.9rem] font-bold leading-tight tracking-[-0.02em]">{current ? `Choose your ${SLOT_LABELS[selected].toLowerCase()}` : `Add a ${SLOT_LABELS[selected].toLowerCase()}`}</h2>
          {advice && (
            <div className="mt-4">
              <AdviceBox>{advice}</AdviceBox>
            </div>
          )}
          <ul className="mt-4 space-y-3">
            {options.map(({ part: p, current: isCur, ok, changed, why }) => (
              <li key={p.id} className={`flex gap-4 rounded-3xl border p-3 transition ${isCur ? "border-ink ring-1 ring-ink" : "border-line"}`}>
                <div className="relative w-[124px] shrink-0 self-start rounded-2xl bg-stage-2 p-2 sm:w-[140px]">
                  {isCur && <span className="absolute left-2 top-2 z-10 rounded-full bg-blue px-2 py-0.5 text-[0.68rem] font-semibold text-white">On your bot</span>}
                  <PartArt part={p} className="aspect-[4/3] h-auto w-full" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="text-xs text-mute">
                    {p.brand}, {p.mass_g >= 1000 ? `${(p.mass_g / 1000).toFixed(1)} kg` : `${p.mass_g} g`}
                    {p.pack_size > 1 ? `, pack of ${p.pack_size}` : ""}
                  </p>
                  <h3 className="font-bold leading-snug">{p.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm leading-snug text-mute">{p.description}</p>
                  <div className="mt-2">
                    {isCur ? (
                      <FitBadge ok text="Fits with everything else" />
                    ) : ok ? (
                      <FitBadge ok text={changed.length ? `Fits if I also change: ${changed.map((c) => SLOT_LABELS[c].toLowerCase()).join(", ")}` : "Fits with everything else"} />
                    ) : (
                      <FitBadge ok={false} text={why || "Doesn't fit this build"} />
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
                    <span className="num text-lg font-bold">
                      ~{money(p.price_usd_approx)}
                      {quantityLabel(items, p.id, selected)}
                    </span>
                    {isCur ? (
                      !REQUIRED.includes(selected) && (
                        <Button className="h-9 px-4" onClick={() => onSwap(selected, null)}>
                          Remove
                        </Button>
                      )
                    ) : (
                      <Button variant={ok ? "primary" : "outline"} className="h-9 px-4" onClick={() => onSwap(selected, p.id)}>
                        {current ? "Swap in" : "Add to bot"}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold">Compatibility</h3>
            {report.ok && (
              <p className="mb-2 flex items-center gap-2 rounded-xl bg-ok-soft px-3.5 py-2.5 text-sm font-medium text-ok">
                <span className="h-2 w-2 rounded-full bg-ok" /> Everything fits together
              </p>
            )}
            <IssueList issues={report.issues} />
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="num">
            <p className="text-xs text-mute">Bag total</p>
            <p className="text-xl font-bold leading-tight">{money(t.price_usd_approx)}</p>
          </div>
          <div className="flex items-center gap-2">
            {errors.length > 0 && <span className="hidden text-sm text-bad sm:inline">Fix {errors.length} issue{errors.length > 1 ? "s" : ""} to continue</span>}
            <Button onClick={onBack}>Back</Button>
            <Button variant="dark" disabled={errors.length > 0} onClick={onNext}>
              Next: wiring
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function quantityLabel(items: BuildItem[], partId: string, slot: Slot) {
  const p = PARTS_BY_ID[partId];
  if (slot !== "drive_motor" && slot !== "wheels") return "";
  const chassis = items.map((i) => PARTS_BY_ID[i.part_id]).find((x) => x?.slot === "chassis");
  const mounts = chassis?.compat.motor_mounts ?? 2;
  const qty = slot === "drive_motor" ? mounts : Math.ceil(mounts / p.pack_size);
  return qty > 1 ? <span className="text-sm font-medium text-mute"> ×{qty}</span> : "";
}
