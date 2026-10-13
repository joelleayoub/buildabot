"use client";
// Arm advisor (preview): describe a task, check what was understood, and get the machine type,
// motor sizes per joint, a parts list and reference designs. Sizing is lib/arm/advise.ts; the AI
// only reads the description (/api/arm), with the offline parser as a fallback.
import Link from "next/link";
import { useMemo, useState } from "react";
import { MACHINE_EXPLAIN, planArm } from "@/lib/arm/advise";
import { cleanTask, parseTask } from "@/lib/arm/parse";
import type { ArmTask, Family, FamilyPlan, Motion, ObjectKind, Orientation } from "@/lib/arm/types";
import { track } from "@/lib/analytics";
import { retailerName } from "@/lib/catalog";
import { BotMark, Button } from "@/components/studio/ui";
import { ArmDrawing, MachineIcon } from "./ArmDrawing";

const KEY = "buildabot.arm";

const PRESETS = [
  "Sort coloured wooden blocks (about 20 g) from a tray into 3 bins, 25 cm away",
  "Move 350 g cans from a table onto a shelf 30 cm higher, 40 cm away",
  "Pour a 300 g cup of water into a bowl next to it",
  "Draw on A4 paper with a pen, accurate to 0.5 mm",
  "Pick 15 g sweets off a conveyor, 40 a minute",
  "Load a 2 kg metal part into a machine all day, next to workers",
];

const MOTIONS: { id: Motion; label: string }[] = [
  { id: "pick_place", label: "Pick and place" },
  { id: "sort", label: "Sort" },
  { id: "draw", label: "Draw or write" },
  { id: "inspect", label: "Move a camera" },
  { id: "pour", label: "Pour or stir" },
  { id: "assemble", label: "Assemble" },
];
const OBJECTS: { id: ObjectKind; label: string }[] = [
  { id: "rigid", label: "Rigid" },
  { id: "flat", label: "Flat and smooth" },
  { id: "soft", label: "Soft or fragile" },
  { id: "irregular", label: "Odd shapes" },
];
const ORIENTS: { id: Orientation; label: string; help: string }[] = [
  { id: "none", label: "Straight down", help: "The gripper always points down" },
  { id: "turn", label: "Spin it", help: "Also turn the object around" },
  { id: "full", label: "Tilt it", help: "Pour, hand over, place sideways" },
];
const PRECISION = [
  { mm: 20, label: "Drop in a bin" },
  { mm: 5, label: "On a spot" },
  { mm: 1, label: "Into a slot" },
  { mm: 0.2, label: "Very precise" },
];

interface Saved {
  text: string;
  task: Partial<ArmTask> | null;
  assumptions: string[];
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s && typeof s.text === "string") return { text: s.text, task: s.task ? cleanTask(s.task) : null, assumptions: Array.isArray(s.assumptions) ? s.assumptions : [] };
  } catch {
    /* start fresh */
  }
  return { text: "", task: null, assumptions: [] };
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* not remembered */
  }
}

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; help?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.id)}
          role="radio"
          aria-checked={value === o.id}
          title={o.help}
          onClick={() => onChange(o.id)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${value === o.id ? "bg-ink text-white" : "bg-stage-2 text-ink hover:bg-stage"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumberField({ label, unit, value, onChange, min, max, step, help }: { label: string; unit: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; help?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      {help && <span className="block text-xs text-mute">{help}</span>}
      <span className="mt-1.5 flex h-11 items-center rounded-xl border border-line bg-paper px-3 focus-within:border-ink">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          className="num w-full bg-transparent text-[0.95rem] outline-none"
        />
        <span className="ml-2 text-sm text-mute">{unit}</span>
      </span>
    </label>
  );
}

function Toggle({ label, help, value, onChange }: { label: string; help: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--blue)]" />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-mute">{help}</span>
      </span>
    </label>
  );
}

const money = (n: number) => `~$${Math.round(n).toLocaleString("en-US")}`;

function MarginBar({ margin, status }: { margin: number; status: string }) {
  const pct = Math.min(100, (margin / 2.5) * 100);
  const color = status === "ok" ? "bg-ok" : status === "tight" ? "bg-warn" : "bg-bad";
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-2 w-20 overflow-hidden rounded-full bg-stage">
        <span className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${pct}%` }} />
        <span className="absolute inset-y-0 w-px bg-ink/40" style={{ left: `${100 / 2.5}%` }} />
      </span>
      <span className="num text-xs text-mute">{margin.toFixed(1)}×</span>
    </span>
  );
}

function FamilyView({ plan, hover, setHover }: { plan: FamilyPlan; hover?: string; setHover: (n?: string) => void }) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="text-xs text-mute">
            <tr className="border-b border-ink">
              <th className="py-2 font-medium">Joint</th>
              <th className="py-2 font-medium">Needs</th>
              <th className="py-2 font-medium">Motor</th>
              <th className="py-2 font-medium">Gives</th>
              <th className="py-2 font-medium">Headroom</th>
            </tr>
          </thead>
          <tbody>
            {plan.joints.map((j) => (
              <tr key={j.name} onMouseEnter={() => setHover(j.name)} onMouseLeave={() => setHover(undefined)} className={`border-b border-line ${hover === j.name ? "bg-blue-soft/60" : ""}`}>
                <td className="py-2.5 pr-3">
                  <span className="font-semibold">{j.name}</span>
                  <span className="block text-xs text-mute">{j.role}</span>
                </td>
                <td className="num py-2.5 pr-3">{j.required_nm} N·m</td>
                <td className="py-2.5 pr-3">{j.motor.name}</td>
                <td className="num py-2.5 pr-3">{j.usable_nm} N·m</td>
                <td className="py-2.5">
                  <MarginBar margin={j.margin} status={j.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Parts", money(plan.cost_usd)],
          ["Arm weight", `${plan.mass_kg} kg`],
          ["Placing accuracy", `±${plan.tip_error_mm} mm`],
          ["Joint speed needed", `${plan.needed_dps}°/s`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-stage-2 px-4 py-3">
            <dt className="text-xs text-mute">{k}</dt>
            <dd className="num text-lg font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      {plan.problems.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {plan.problems.map((p) => (
            <li key={p} className="rounded-xl bg-bad-soft px-3.5 py-2 text-sm text-bad">
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ArmAdvisor() {
  const [saved] = useState(load);
  const [text, setText] = useState(saved.text);
  const [task, setTask] = useState<Partial<ArmTask> | null>(saved.task);
  const [assumptions, setAssumptions] = useState<string[]>(saved.assumptions);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<"ai" | "offline" | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [hover, setHover] = useState<string | undefined>();

  const plan = useMemo(() => (task ? planArm(task) : null), [task]);
  const shown = plan ? (plan.families.find((f) => f.family === family) ?? plan.chosen ?? plan.families[0]) : null;

  const update = (patch: Partial<ArmTask>) => {
    const next = { ...(task ?? {}), ...patch };
    setTask(next);
    save({ text, task: next, assumptions });
  };

  const run = async (desc: string) => {
    const d = desc.trim();
    if (!d) return;
    setText(d);
    setFamily(null);
    const offline = parseTask(d);
    setTask(offline);
    setAssumptions([]);
    setSource("offline");
    save({ text: d, task: offline, assumptions: [] });
    setBusy(true);
    try {
      const res = await fetch("/api/arm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: d }) });
      if (res.ok) {
        const data = await res.json();
        const ai = cleanTask(data.task);
        const notes: string[] = Array.isArray(data.assumptions) ? data.assumptions : [];
        setTask(ai);
        setAssumptions(notes);
        setSource("ai");
        save({ text: d, task: ai, assumptions: notes });
      }
    } catch {
      /* keep the offline reading */
    } finally {
      setBusy(false);
    }
    const p = planArm(offline);
    track("arm_plan_shown", { machine: p.machines[0].type, verdict: p.verdict });
  };

  const t = plan?.task;
  const verdictStyle = plan ? { diy: "bg-ok-soft text-ok", diy_with_care: "bg-warn-soft text-warn", buy: "bg-bad-soft text-bad" }[plan.verdict] : "";
  const verdictTitle = plan ? { diy: "You can build this", diy_with_care: "You can build this, carefully", buy: "Buy a ready-made arm for this" }[plan.verdict] : "";

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-1.5 text-[1.35rem] font-bold tracking-[-0.03em]">
            <BotMark className="h-6 w-6 text-blue" />
            <span>
              buildabot<span className="text-blue">.</span>
            </span>
          </Link>
          <span className="rounded-full bg-blue-soft px-2.5 py-1 text-xs font-semibold text-blue">Arm advisor preview</span>
          <nav className="ml-auto flex items-center gap-4 text-sm font-medium text-mute">
            <Link href="/" className="hover:text-ink">
              Build a rover
            </Link>
            <Link href="/parts" className="hidden hover:text-ink sm:inline">
              Parts catalog
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 pb-24 sm:px-6">
        <section className="grid gap-8 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div>
            <p className="text-sm font-medium text-blue">Robot arm advisor</p>
            <h1 className="mt-2 text-[2.4rem] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[3.2rem]">Describe the task. Get the right machine.</h1>
            <p className="mt-4 max-w-[620px] text-[1.05rem] leading-relaxed text-mute">
              Say what it picks up, how heavy it is, where it goes and how often. I&apos;ll tell you which kind of robot fits, how strong each joint has to be, which motors do it, and whether building one makes sense at all.
            </p>
          </div>
          <div className="rounded-3xl bg-stage p-4">
            <label htmlFor="arm-task" className="sr-only">
              Describe the task
            </label>
            <textarea
              id="arm-task"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && run(text)}
              rows={4}
              maxLength={1500}
              placeholder="e.g. Move 200 g boxes from a conveyor into a crate 35 cm away, 5 a minute"
              className="w-full resize-none rounded-2xl bg-paper p-4 text-[0.98rem] leading-relaxed outline-none placeholder:text-faint"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-mute">{busy ? "Reading your task…" : source === "offline" ? "Read without the AI advisor" : source === "ai" ? "Read by buildabot" : ""}</span>
              <Button variant="primary" onClick={() => run(text)} disabled={!text.trim() || busy}>
                Size it
              </Button>
            </div>
          </div>
        </section>

        <div className="-mt-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => run(p)} className="rounded-full border border-line px-3.5 py-1.5 text-left text-sm hover:border-ink">
              {p}
            </button>
          ))}
        </div>

        {!plan || !t ? (
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["articulated", "scara", "gantry", "delta"] as const).map((m) => (
              <div key={m} className="rounded-3xl bg-stage-2 p-5">
                <MachineIcon type={m} className="h-14 w-14 text-ink" />
                <p className="mt-3 font-bold">{{ articulated: "Jointed arm", scara: "SCARA arm", gantry: "Gantry", delta: "Delta robot" }[m]}</p>
                <p className="mt-1 text-sm leading-relaxed text-mute">{MACHINE_EXPLAIN[m]}</p>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* what I understood */}
            <section className="mt-12 rounded-3xl border border-line p-5 sm:p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-bold">What I understood</h2>
                <p className="text-sm text-mute">Change anything; the sizing updates instantly.</p>
              </div>
              {assumptions.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-mute">
                  {assumptions.map((a) => (
                    <li key={a}>• {a}</li>
                  ))}
                </ul>
              )}
              <div className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
                <div className="space-y-5">
                  <div>
                    <p className="mb-2 text-sm font-semibold">The job</p>
                    <Segmented label="The job" value={t.motion} options={MOTIONS} onChange={(motion) => update({ motion, ...(motion === "pour" ? { orientation: "full" } : {}) })} />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold">The object</p>
                    <Segmented label="The object" value={t.object} options={OBJECTS} onChange={(object) => update({ object })} />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold">How it holds it</p>
                    <Segmented label="How it holds it" value={t.orientation} options={ORIENTS} onChange={(orientation) => update({ orientation })} />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold">How precisely it places it</p>
                    <Segmented label="Precision" value={PRECISION.some((p) => p.mm === t.precision_mm) ? t.precision_mm : -1} options={[...PRECISION.map((p) => ({ id: p.mm, label: `${p.label} (±${p.mm} mm)` })), ...(PRECISION.some((p) => p.mm === t.precision_mm) ? [] : [{ id: -1, label: `±${t.precision_mm} mm` }])]} onChange={(mm) => mm > 0 && update({ precision_mm: mm })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 content-start gap-4">
                  <NumberField label="Heaviest object" unit="g" value={t.object_g} min={1} max={50000} step={10} onChange={(object_g) => update({ object_g })} />
                  <NumberField label="Reach" unit="cm" value={t.reach_cm} min={5} max={300} step={1} help="Farthest point from the base" onChange={(reach_cm) => update({ reach_cm })} />
                  <NumberField label="Lift height" unit="cm" value={t.lift_cm} min={0} max={200} step={1} help="Above the table" onChange={(lift_cm) => update({ lift_cm })} />
                  <NumberField label="Speed" unit="per min" value={t.per_minute} min={0.1} max={600} step={1} help="Picks or moves" onChange={(per_minute) => update({ per_minute })} />
                  <NumberField label="Use per day" unit="hours" value={t.hours_per_day} min={0} max={24} step={1} onChange={(hours_per_day) => update({ hours_per_day })} />
                  <div className="col-span-2 space-y-3 pt-1">
                    <Toggle label="All on one flat surface" help="A table, tray or conveyor; no shelves" value={t.flat_work} onChange={(flat_work) => update({ flat_work })} />
                    <Toggle label="People work within its reach" help="Changes the safety advice" value={t.near_people} onChange={(near_people) => update({ near_people })} />
                  </div>
                </div>
              </div>
            </section>

            {/* verdict */}
            <section className={`mt-6 rounded-3xl p-5 sm:p-7 ${verdictStyle}`}>
              <h2 className="text-xl font-bold">{verdictTitle}</h2>
              <ul className="mt-2 space-y-1 text-[0.95rem] text-ink">
                {plan.verdict_reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
                {plan.notes
                  .filter((n) => n.includes("could do this"))
                  .map((n) => (
                    <li key={n} className="font-semibold">
                      {n}
                    </li>
                  ))}
              </ul>
            </section>

            {/* machine types */}
            <section className="mt-12">
              <h2 className="text-2xl font-bold tracking-tight">Which kind of robot</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {plan.machines.map((m, i) => (
                  <div key={m.type} className={`flex flex-col rounded-3xl p-5 ${i === 0 ? "bg-ink text-white" : "bg-stage-2"}`}>
                    <div className="flex items-start justify-between">
                      <MachineIcon type={m.type} className={`h-14 w-14 ${i === 0 ? "text-white" : "text-ink"}`} />
                      {i === 0 && <span className="rounded-full bg-blue px-2.5 py-1 text-xs font-semibold">Best fit</span>}
                    </div>
                    <p className="mt-3 text-lg font-bold">{m.name}</p>
                    <p className={`text-sm ${i === 0 ? "text-white/70" : "text-mute"}`}>
                      {m.dof} motors{m.type !== "articulated" ? " plus a gripper" : " plus the gripper"}
                    </p>
                    <p className={`mt-2 text-sm leading-relaxed ${i === 0 ? "text-white/85" : "text-mute"}`}>{MACHINE_EXPLAIN[m.type]}</p>
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {m.pros.slice(0, 3).map((p) => (
                        <li key={p} className="flex gap-2">
                          <span className={i === 0 ? "text-[#8fe3b5]" : "text-ok"}>+</span>
                          {p}
                        </li>
                      ))}
                      {m.cons.slice(0, 2).map((p) => (
                        <li key={p} className="flex gap-2">
                          <span className={i === 0 ? "text-[#ffb4a8]" : "text-bad"}>−</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* joints */}
            <section className="mt-14">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">{plan.machines[0].type === "articulated" ? "Your arm, joint by joint" : "If you build a jointed arm instead"}</h2>
                  <p className="mt-1 max-w-[720px] text-mute">
                    Upper arm {Math.round(plan.geometry.upper * 100)} cm, forearm {Math.round(plan.geometry.fore * 100)} cm, gripper: {plan.gripper.name}. Point at a joint to see what it needs.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 rounded-full bg-stage-2 p-1" role="tablist" aria-label="Motor type">
                  {plan.families.map((f) => (
                    <button
                      key={f.family}
                      role="tab"
                      aria-selected={shown?.family === f.family}
                      onClick={() => setFamily(f.family)}
                      className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${shown?.family === f.family ? "bg-paper shadow-sm" : "text-mute hover:text-ink"}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${f.feasible ? "bg-ok" : "bg-bad"}`} />
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {shown && (
                <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                  <div className="min-w-0 rounded-3xl bg-stage-2 p-4">
                    <ArmDrawing geo={plan.geometry} task={t} joints={shown.joints} selected={hover} onSelect={setHover} />
                    <p className="px-2 pb-1 text-xs text-mute">
                      To scale, reaching its farthest target. Blue area: how far it can reach in front of the base. Green joints have headroom, amber are close to the limit, red can&apos;t hold the load.
                    </p>
                  </div>
                  <div className="min-w-0">
                    <FamilyView plan={shown} hover={hover} setHover={setHover} />
                  </div>
                </div>
              )}
            </section>

            {/* parts */}
            {shown && (
              <section className="mt-14">
                <div className="flex items-baseline justify-between border-b border-ink pb-2">
                  <h2 className="text-2xl font-bold tracking-tight">Parts list: {shown.label.toLowerCase()}</h2>
                  <span className="num text-lg font-bold">{money(shown.cost_usd)}</span>
                </div>
                <ul className="divide-y divide-line">
                  {shown.parts.map(({ part, qty, why }) => (
                    <li key={part.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                      <span className="num w-8 text-sm font-bold text-mute">{qty}×</span>
                      <span className="w-[calc(100%-3rem)] min-w-0 sm:w-auto sm:flex-1">
                        <span className="block font-semibold">{part.name}</span>
                        <span className="block text-sm text-mute">
                          {why}.{part.kind === "motor" || part.kind === "gripper" ? ` ${part.description}` : ""}
                        </span>
                      </span>
                      <span className="num ml-12 text-sm sm:ml-0 sm:w-16 sm:text-right">{money(part.price_usd_approx * qty)}</span>
                      <a href={part.buy_url} target="_blank" rel="noopener noreferrer" onClick={() => track("link_clicked", { part: `arm:${part.id}` })} className="text-sm font-semibold text-blue hover:underline sm:w-28 sm:text-right">
                        {retailerName(part.buy_url)} ↗
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-mute">Prices are approximate and include about {money(25 + 8 * shown.joints.length)} for filament, bolts, bearings and wire. Links open a retailer search.</p>
              </section>
            )}

            {/* references */}
            <section className="mt-14">
              <h2 className="text-2xl font-bold tracking-tight">Start from a proven design</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {plan.designs.map((d) => (
                  <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="group flex flex-col rounded-3xl border border-line p-5 hover:border-ink">
                    <div className="flex items-center justify-between">
                      <MachineIcon type={d.type} className="h-10 w-10 text-ink" />
                      <span className="rounded-full bg-stage-2 px-2.5 py-1 text-xs font-medium capitalize text-mute">{d.difficulty}</span>
                    </div>
                    <p className="mt-3 font-bold group-hover:text-blue">{d.name} ↗</p>
                    <p className="mt-1 text-sm leading-relaxed text-mute">{d.summary}</p>
                    <p className="mt-auto pt-3 text-xs text-mute">Good for: {d.best_for.join(", ")}</p>
                  </a>
                ))}
              </div>
            </section>

            <section className="mt-10 space-y-2 text-sm text-mute">
              {plan.notes
                .filter((n) => !n.includes("could do this"))
                .map((n) => (
                  <p key={n}>{n}</p>
                ))}
              <p>
                This is a first sizing to choose a direction, not a safety rating. Build and test with light objects first, and keep an emergency stop within reach.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
