"use client";
// "Design a part": describe it (text-to-CAD) or pick a template, tune it, preview it, download the STL
// and find someone to print it.
import dynamic from "next/dynamic";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { buildPart, sizeOf, toSTL, volumeOf } from "@/lib/cad/geometry";
import { parseDescription } from "@/lib/cad/parse";
import { designWarnings, normalise, PRINT_ASSUMPTIONS, printEstimate, TEMPLATE_ORDER, TEMPLATES, type CustomPart, type PartDesign, type TemplateId } from "@/lib/cad/spec";
import PrintOptions from "./PrintOptions";
import { AdviceBox, Button } from "./ui";

const PartPreview = dynamic(() => import("./PartPreview"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-sm text-mute">Loading preview…</div> });

const EXAMPLES = ["A plate to mount a Raspberry Pi on the top deck", "A bracket for an HC-SR04 ultrasonic sensor", "A battery holder for a pack 105 x 34 x 18 mm", "Raise the lidar 5 cm above the top deck"];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "part";

export function downloadStl(design: PartDesign) {
  const buf = toSTL(buildPart(design));
  const url = URL.createObjectURL(new Blob([buf], { type: "model/stl" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(design.name)}.stl`;
  a.click();
  URL.revokeObjectURL(url);
  track("link_clicked", { part: `stl:${design.template}` });
}

export default function CadPanel({ initial, onSave, onDelete, onClose }: { initial: CustomPart | null; onSave: (p: CustomPart) => void; onDelete: (id: string) => void; onClose: () => void }) {
  const [design, setDesign] = useState<PartDesign>(initial?.design ?? { template: "plate", params: normalise("plate"), name: TEMPLATES.plate.name });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [tab, setTab] = useState<"design" | "print">("design");
  const deferred = useDeferredValue(design);

  // Keep the page behind the panel from scrolling.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const built = useMemo(() => {
    try {
      const g = buildPart(deferred);
      return { g, size: sizeOf(g), volume: volumeOf(g) };
    } catch (err) {
      console.error(err);
      return null;
    }
  }, [deferred]);

  const t = TEMPLATES[design.template];
  const warnings = designWarnings(design);
  const est = built ? printEstimate(built.volume) : null;
  const set = (key: string, value: number | string) => setDesign((d) => ({ ...d, params: normalise(d.template, { ...d.params, [key]: value }) }));
  const pickTemplate = (id: TemplateId) => setDesign({ template: id, params: normalise(id), name: TEMPLATES[id].name });

  const describe = async (prompt: string) => {
    const q = prompt.trim();
    if (!q) return;
    setBusy(true);
    setNotes([]);
    try {
      const res = await fetch("/api/cad", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: q }) });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.message), { status: res.status });
      setDesign(data.design);
      setNotes(data.notes ?? []);
    } catch {
      // The AI is off or failed: use the built-in parser so the feature still works.
      const r = parseDescription(q);
      setDesign({ template: r.template, params: r.params, name: r.name });
      setNotes([...r.understood, "Check the sizes below and adjust anything I guessed."]);
    } finally {
      setBusy(false);
      track("build_shown", { via: "text_to_cad" });
    }
  };

  const num = (n: (typeof t.numbers)[number]) => {
    // Hide inputs that don't apply to the current choices.
    const p = design.params;
    if (design.template === "plate" && (n.key === "custom_x" || n.key === "custom_y") && p.board !== "custom") return null;
    if (design.template === "plate" && (n.key === "board_hole" || n.key === "standoff") && p.board === "none") return null;
    if (design.template === "bracket" && n.key === "hole_d" && p.face !== "round") return null;
    if (design.template === "bracket" && n.key === "face_height" && p.face === "none") return null;
    if (design.template === "riser" && (n.key === "top_y" || n.key === "top_hole") && !(Number(p.top_x) > 0)) return null;
    return (
      <label key={n.key} className="block">
        <span className="flex items-baseline justify-between text-sm">
          <span className="font-medium">{n.label}</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              value={Number(p[n.key])}
              min={n.min}
              max={n.max}
              step={n.step}
              onChange={(e) => set(n.key, Number(e.target.value))}
              className="num w-20 rounded-lg border border-line px-2 py-1 text-right text-sm outline-none focus:border-ink"
            />
            <span className="text-mute">mm</span>
          </span>
        </span>
        <input type="range" min={n.min} max={n.max} step={n.step} value={Number(p[n.key])} onChange={(e) => set(n.key, Number(e.target.value))} className="mt-1 w-full accent-[var(--blue)]" />
        {n.help && <span className="block text-xs text-mute">{n.help}</span>}
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-paper" role="dialog" aria-modal="true" aria-label="Design a part">
      <div className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-stage-2" aria-label="Close">
              ✕
            </button>
            <input
              value={design.name}
              onChange={(e) => setDesign((d) => ({ ...d, name: e.target.value.slice(0, 60) }))}
              aria-label="Part name"
              className="min-w-0 rounded-lg px-2 py-1 text-lg font-bold outline-none hover:bg-stage-2 focus:bg-stage-2"
            />
          </div>
          <div className="flex items-center gap-2">
            {initial && (
              <button onClick={() => onDelete(initial.id)} className="hidden px-2 text-sm font-semibold text-mute hover:text-bad sm:block">
                Remove from bag
              </button>
            )}
            <Button variant="primary" onClick={() => onSave({ id: initial?.id ?? crypto.randomUUID(), design })} disabled={!built}>
              {initial ? "Save changes" : "Add to bag"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,1fr)]">
        <div className="min-w-0">
          <div className="relative h-[320px] overflow-hidden rounded-3xl bg-stage sm:h-[440px]">
            <PartPreview geometry={built?.g ?? null} size={built?.size ?? [50, 50, 10]} />
            {built && (
              <p className="num pointer-events-none absolute left-4 top-4 rounded-full bg-paper/85 px-3 py-1 text-sm font-semibold">
                {built.size.map((v) => Math.round(v)).join(" × ")} mm
              </p>
            )}
            <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-paper/80 px-3 py-1 text-xs text-mute">Each grid square is 10 mm</p>
          </div>

          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              describe(text);
            }}
          >
            <label htmlFor="cad-text" className="text-lg font-bold">
              Describe the part
            </label>
            <p className="text-sm text-mute">Say what it holds and roughly how big it is. I&apos;ll turn it into a printable design you can adjust.</p>
            <div className="mt-3 flex items-end gap-2 rounded-2xl border border-line p-2 focus-within:border-ink">
              <textarea
                id="cad-text"
                rows={2}
                maxLength={1000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    describe(text);
                  }
                }}
                placeholder="For example: a plate to hold an Arduino Uno, 90 x 70 mm"
                className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.95rem] outline-none"
              />
              <Button variant="primary" className="h-9 px-4" type="submit" disabled={busy || !text.trim()}>
                {busy ? "Designing…" : "Design it"}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setText(ex);
                    describe(ex);
                  }}
                  className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink"
                >
                  {ex}
                </button>
              ))}
            </div>
          </form>
          {notes.length > 0 && (
            <div className="mt-4">
              <AdviceBox>
                <ul className="space-y-1">
                  {notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </AdviceBox>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex rounded-full bg-stage-2 p-1 text-sm font-semibold" role="tablist">
            {(["design", "print"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 rounded-full px-4 py-2 ${tab === k ? "bg-paper shadow-sm" : "text-mute"}`}>
                {k === "design" ? "Shape and size" : "Get it printed"}
              </button>
            ))}
          </div>

          {tab === "design" ? (
            <div className="mt-5 space-y-5">
              <div>
                <p className="text-sm font-semibold">Type of part</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {TEMPLATE_ORDER.map((id) => (
                    <button
                      key={id}
                      onClick={() => pickTemplate(id)}
                      aria-pressed={design.template === id}
                      className={`rounded-2xl border p-3 text-left transition ${design.template === id ? "border-blue bg-blue-soft ring-1 ring-blue" : "border-line hover:border-ink"}`}
                    >
                      <span className="block text-sm font-semibold">{TEMPLATES[id].name}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-mute">{TEMPLATES[id].blurb}</span>
                    </button>
                  ))}
                </div>
              </div>
              {t.choices.map((c) => (
                <label key={c.key} className="block">
                  <span className="text-sm font-medium">{c.label}</span>
                  <select value={String(design.params[c.key])} onChange={(e) => set(c.key, e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm outline-none focus:border-ink">
                    {c.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {t.numbers.map(num)}
              {warnings.map((w) => (
                <p key={w} className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm">
                  <span className="font-semibold text-warn">Heads-up: </span>
                  {w}
                </p>
              ))}
            </div>
          ) : (
            <div className="mt-5">
              <h3 className="font-bold">Print it yourself</h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-mute">
                <li>Download the STL file below.</li>
                <li>
                  Open it in a free slicer for your printer:{" "}
                  <a className="font-semibold text-blue hover:underline" href="https://www.prusa3d.com/page/prusaslicer_424/" target="_blank" rel="noreferrer">
                    PrusaSlicer
                  </a>
                  ,{" "}
                  <a className="font-semibold text-blue hover:underline" href="https://ultimaker.com/software/ultimaker-cura/" target="_blank" rel="noreferrer">
                    UltiMaker Cura
                  </a>
                  ,{" "}
                  <a className="font-semibold text-blue hover:underline" href="https://bambulab.com/en/download/studio" target="_blank" rel="noreferrer">
                    Bambu Studio
                  </a>{" "}
                  or{" "}
                  <a className="font-semibold text-blue hover:underline" href="https://grid.space/kiri/" target="_blank" rel="noreferrer">
                    Kiri:Moto
                  </a>{" "}
                  in your browser.
                </li>
                <li>Pick your printer and PLA. The slicer writes the G-code, which is specific to your machine.</li>
              </ol>
              <h3 className="mt-6 font-bold">Have it printed for you</h3>
              <p className="mt-1 text-sm text-mute">Add your location to see makerspaces nearby and which services ship from closest to you.</p>
              <div className="mt-3">
                <PrintOptions onTrack={(id) => track("link_clicked", { part: `print:${id}` })} />
              </div>
            </div>
          )}

          <div className="mt-6 rounded-3xl bg-stage-2 p-5">
            {built && est ? (
              <dl className="num grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-mute">Plastic</dt>
                  <dd className="text-lg font-bold">~{Math.max(1, Math.round(est.grams))} g</dd>
                </div>
                <div>
                  <dt className="text-xs text-mute">Material cost</dt>
                  <dd className="text-lg font-bold">~${est.materialUsd < 1 ? est.materialUsd.toFixed(2) : est.materialUsd.toFixed(1)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-mute">Print time</dt>
                  <dd className="text-lg font-bold">~{est.hours < 1 ? `${Math.round(est.hours * 60)} min` : `${est.hours.toFixed(1)} h`}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-bad">This combination of sizes can&apos;t be built. Change a value and try again.</p>
            )}
            <p className="mt-2 text-xs text-mute">
              Rough figures for PLA at about {Math.round(PRINT_ASSUMPTIONS.fillFactor * 100)}% solid and ${PRINT_ASSUMPTIONS.usdPerKg}/kg filament. A print service will add its own fee and shipping.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="dark" disabled={!built} onClick={() => downloadStl(design)}>
                Download STL
              </Button>
              {tab === "design" && <Button onClick={() => setTab("print")}>Get it printed</Button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
