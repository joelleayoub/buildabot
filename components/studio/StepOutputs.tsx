"use client";
// Steps 5–7: wiring diagram, cart, build guide.
import { useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import PartArt from "@/components/PartArt";
import { PARTS_BY_ID, money, retailerName } from "@/lib/catalog";
import type { BuildItem, BuildReport } from "@/lib/compat/types";
import { type Answers, SLOT_LABELS, SLOT_ORDER, findUseCase } from "@/lib/flow";
import { BuildStats } from "@/components/BuildStats";
import { Guide } from "@/components/Guide";
import { buildGuide, guideToMarkdown } from "@/lib/quickGuide";
import { planWiring } from "@/lib/wiring";
import { KIND, WiringDiagram } from "./WiringDiagram";
import type { WireKind } from "@/lib/wiring";
import GuideStepper from "./GuideStepper";
import { Button, IssueList, StepHeading } from "./ui";
import { TEMPLATES, type CustomPart } from "@/lib/cad/spec";
import { downloadStl } from "./CadPanel";
import { PcbPanel, PinMapPanel } from "./Electronics";
import { ExtrasList, useExtras } from "./Extras";
import { extraLine, OrderPlan, partLine, ShopLinkButton, useOrderPlan } from "./OrderPlan";
import { countryName } from "@/lib/shops";

export function StepWiring({ items, onBack, onNext }: { items: BuildItem[]; onBack: () => void; onNext: () => void }) {
  const plan = useMemo(() => planWiring(items, PARTS_BY_ID), [items]);
  const name = (id: string) => plan.nodes.find((n) => n.id === id)?.label ?? id;
  const [tab, setTab] = useState<"wiring" | "pins" | "pcb">("wiring");
  const TABS = [
    { id: "wiring", label: "Wiring diagram" },
    { id: "pins", label: "Pin map and code" },
    { id: "pcb", label: "Custom PCB" },
  ] as const;
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14">
      <StepHeading kicker="Step 5 of 7" title="How it all connects">
        {plan.wires.length} connections, generated from the parts in your bag. Get the exact controller pins and starter code, or replace the jumper wires with your own circuit board.
      </StepHeading>
      <div className="mt-6 flex w-fit flex-wrap rounded-full bg-stage-2 p-1 text-sm font-semibold" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`rounded-full px-4 py-2 ${tab === t.id ? "bg-paper shadow-sm" : "text-mute hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "pins" && (
        <div className="mt-8">
          <PinMapPanel items={items} />
        </div>
      )}
      {tab === "pcb" && (
        <div className="mt-8">
          <PcbPanel items={items} />
        </div>
      )}
      {tab === "wiring" && (
      <>
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        {(Object.keys(KIND) as WireKind[]).map((k) => (
          <span key={k} className="flex items-center gap-2">
            <svg width="28" height="8" aria-hidden>
              <line x1="0" y1="4" x2="28" y2="4" stroke={KIND[k].color} strokeWidth="3" strokeDasharray={KIND[k].dash} />
            </svg>
            {KIND[k].label}
          </span>
        ))}
      </div>
      <div className="scrollbar-thin mt-4 overflow-x-auto rounded-3xl bg-stage-2 p-4 sm:p-6">
        <WiringDiagram nodes={plan.nodes} wires={plan.wires} />
      </div>
      <ul className="mt-6 space-y-2">
        {plan.notes.map((n) => (
          <li key={n} className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm">
            <span className="font-semibold text-warn">Safety: </span>
            {n}
          </li>
        ))}
      </ul>
      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-ink text-mute">
              <th className="w-10 py-2 font-medium">#</th>
              <th className="py-2 font-medium">Connection</th>
              <th className="py-2 font-medium">Pins</th>
            </tr>
          </thead>
          <tbody>
            {plan.wires.map((w) => (
              <tr key={w.n} className="border-b border-line align-top">
                <td className="num py-3 font-bold" style={{ color: KIND[w.kind].color }}>
                  {w.n}
                </td>
                <td className="py-3 pr-4">
                  <span className="font-semibold">{w.label}</span>
                  <span className="block text-mute">
                    {name(w.from)} to {name(w.to)}
                  </span>
                </td>
                <td className="py-3">
                  {w.pins}
                  {w.note && <span className="block text-warn">{w.note}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}
      <div className="mt-10 flex gap-3">
        <Button onClick={onBack}>Back</Button>
        <Button variant="dark" onClick={onNext}>
          Next: cart
        </Button>
      </div>
    </section>
  );
}

function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function StepCart({
  items,
  report,
  shareUrl,
  shareBusy,
  onShare,
  onStartOver,
  onRetailerClick,
  customParts,
  onDesign,
  onBack,
  onNext,
  onEdit,
}: {
  items: BuildItem[];
  report: BuildReport;
  shareUrl: string | null;
  shareBusy: boolean;
  onShare: () => void;
  onStartOver: () => void;
  onRetailerClick: (partId: string) => void;
  customParts: CustomPart[];
  onDesign: (part: CustomPart | null) => void;
  onBack: () => void;
  onNext: () => void;
  onEdit: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const extras = useExtras(items);
  const lines = SLOT_ORDER.flatMap((s) => items.filter((i) => PARTS_BY_ID[i.part_id]?.slot === s)).map((i) => ({ item: i, part: PARTS_BY_ID[i.part_id] }));
  const orderLines = useMemo(
    () => [...lines.map((l) => partLine(l.part, l.item.quantity)), ...extras.extras.filter((e) => extras.needed.has(e.item.id) && e.item.price_usd_approx > 0).map(extraLine)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, extras.extras, extras.needed],
  );
  const plan = useOrderPlan(orderLines);
  const planFor = (key: string) => plan.resolved.find((r) => r.key === key);
  const csv = () => {
    const rows = [["Part", "Slot", "Qty (packs)", "Approx unit price (USD)", "Approx line total (USD)", "Shop", "Where to buy", "Search for"]];
    for (const { item, part } of lines) {
      const r = planFor(part.id);
      rows.push([part.name, SLOT_LABELS[part.slot], String(item.quantity), String(part.price_usd_approx), String(part.price_usd_approx * item.quantity), r?.shopName ?? retailerName(part.buy_url), r?.link.url ?? part.buy_url, r && !r.link.direct ? r.link.term : ""]);
    }
    rows.push(["Parts total", "", "", "", String(report.totals.price_usd_approx), ""]);
    rows.push([]);
    rows.push(["Also needed", "Type", "Qty", "Approx unit price (USD)", "Still to buy?", "Shop", "Where to buy", "Search for"]);
    for (const e of extras.extras) {
      const r = planFor(e.item.id);
      rows.push([e.item.name, e.item.kind, String(e.qty), String(e.item.price_usd_approx), extras.needed.has(e.item.id) ? "yes" : "already have", r?.shopName ?? retailerName(e.item.buy_url), r?.link.url ?? e.item.buy_url, r && !r.link.direct ? r.link.term : ""]);
    }
    rows.push(["Supplies and tools to buy", "", "", "", String(extras.total), ""]);
    rows.push(["Everything", "", "", "", String(Math.round(report.totals.price_usd_approx + extras.total)), ""]);
    download("buildabot-parts.csv", rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
  };
  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", shareUrl);
    }
  };
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14">
      <StepHeading kicker="Step 6 of 7" title="Your bag">
        {lines.length} parts, plus the screws and tools to build it. Prices are estimates, so check each shop before you order.{" "}
        <a href="#order" className="font-semibold text-blue hover:underline">
          {plan.cc ? `Shops picked for ${countryName(plan.cc)}` : "Add your location to see shops that deliver to you"}
        </a>
      </StepHeading>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <ul className="divide-y divide-line border-y border-line">
          {lines.map(({ item, part }) => (
            <li key={part.id} className="flex items-center gap-4 py-4">
              <div className="w-24 shrink-0 rounded-xl bg-stage-2 p-1.5 sm:w-28">
                <PartArt part={part} className="aspect-[4/3] h-auto w-full" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-mute">{SLOT_LABELS[part.slot]}</p>
                <p className="font-semibold leading-snug">{part.name}</p>
                {planFor(part.id) ? (
                  <ShopLinkButton name={planFor(part.id)!.shopName} link={planFor(part.id)!.link} onClick={() => onRetailerClick(part.id)} />
                ) : (
                  <a href={part.buy_url} target="_blank" rel="noreferrer" onClick={() => onRetailerClick(part.id)} className="text-sm font-semibold text-blue hover:underline">
                    Find at {retailerName(part.buy_url)}
                  </a>
                )}
              </div>
              <div className="num text-right">
                <p className="font-bold">~{money(part.price_usd_approx * item.quantity)}</p>
                {item.quantity > 1 && (
                  <p className="text-xs text-mute">
                    {item.quantity} × {money(part.price_usd_approx)}
                  </p>
                )}
              </div>
            </li>
          ))}
          <li className="py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold">3D-printed parts</h2>
              <button onClick={() => onDesign(null)} className="text-sm font-semibold text-blue hover:underline">
                Design a part
              </button>
            </div>
            {customParts.length === 0 ? (
              <p className="mt-1 text-sm text-mute">Need a mount, bracket or battery tray that doesn&apos;t exist? Describe it and download a printable file.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {customParts.map((cp) => (
                  <li key={cp.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{cp.design.name}</p>
                      <p className="text-xs text-mute">{TEMPLATES[cp.design.template].name}, printed in PLA</p>
                    </div>
                    <div className="flex gap-2">
                      <Button className="h-9 px-4" onClick={() => downloadStl(cp.design)}>
                        Download STL
                      </Button>
                      <Button variant="ghost" className="h-9 px-3" onClick={() => onDesign(cp)}>
                        Edit or print
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </li>
          <li className="py-6">
            <ExtrasList
              {...extras}
              onLinkClick={(id) => onRetailerClick(`extra:${id}`)}
              renderLink={(id) => {
                const r = planFor(id);
                return r ? <ShopLinkButton name={r.shopName} link={r.link} onClick={() => onRetailerClick(`extra:${id}`)} /> : null;
              }}
            />
          </li>
          <li id="order" className="scroll-mt-24 py-6">
            <OrderPlan plan={plan} parts={lines.map((l) => l.part)} onLinkClick={(key) => onRetailerClick(key)} />
          </li>
        </ul>
        <aside className="h-fit rounded-3xl bg-stage-2 p-6 lg:sticky lg:top-24">
          <BuildStats items={items} byId={PARTS_BY_ID} report={report} />
          <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-mute">Parts</dt>
              <dd className="num">~{money(report.totals.price_usd_approx)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mute">Screws, wire and supplies</dt>
              <dd className="num">~{money(extras.supplies)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mute">Tools and charger (once)</dt>
              <dd className="num">~{money(extras.tools)}</dd>
            </div>
            <div className="flex justify-between text-base font-bold">
              <dt>Everything</dt>
              <dd className="num">~{money(report.totals.price_usd_approx + extras.total)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-xs text-mute">Shipping and tax not included.</p>
          <div className="mt-5 grid gap-2">
            <Button variant="dark" onClick={onNext}>
              Get the build guide
            </Button>
            <Button onClick={csv}>Download parts list</Button>
            {shareUrl ? (
              <div className="rounded-2xl border border-line bg-paper p-3">
                <p className="text-xs text-mute">Anyone with this link can see the build, but not change it.</p>
                <p className="mt-1 truncate text-sm font-medium">{shareUrl}</p>
                <div className="mt-2 flex gap-2">
                  <Button className="h-9 flex-1" onClick={copy}>
                    {copied ? "Link copied" : "Copy link"}
                  </Button>
                  <a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center px-3 text-sm font-semibold text-blue hover:underline">
                    Open
                  </a>
                </div>
              </div>
            ) : (
              <Button onClick={onShare} disabled={shareBusy}>
                {shareBusy ? "Creating link…" : "Share this build"}
              </Button>
            )}
            <Button variant="ghost" onClick={onEdit}>
              Change parts
            </Button>
          </div>
          {report.issues.some((i) => i.severity === "warning") && (
            <div className="mt-5">
              <IssueList issues={report.issues.filter((i) => i.severity === "warning")} />
            </div>
          )}
        </aside>
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <Button onClick={onBack}>Back</Button>
        <button onClick={onStartOver} className="text-sm font-semibold text-mute hover:text-ink">
          Start a new robot
        </button>
      </div>
    </section>
  );
}

export function StepGuide({
  items,
  answers,
  aiGuide,
  aiBusy,
  aiError,
  canUseAi,
  onWriteAiGuide,
  onBack,
}: {
  items: BuildItem[];
  answers: Answers;
  aiGuide: string | null;
  aiBusy: boolean;
  aiError: string | null;
  canUseAi: boolean;
  onWriteAiGuide: () => void;
  onBack: () => void;
}) {
  const sections = useMemo(() => buildGuide(items, PARTS_BY_ID, answers), [items, answers]);
  const [view, setView] = useState<"step" | "quick" | "ai">(aiGuide ? "ai" : "step");
  const title = `Build guide: ${findUseCase(answers.useCase)?.name ?? "your rover"}`;
  // Steps are numbered continuously across sections.
  const firstStep = sections.map((_, i) => 1 + sections.slice(0, i).reduce((sum, x) => sum + x.steps.length, 0));
  return (
    <section className={`mx-auto px-4 py-10 sm:px-6 sm:py-14 ${view === "step" ? "max-w-[1180px]" : "max-w-[900px]"}`}>
      <StepHeading kicker="Step 7 of 7" title="Build it, step by step">
        Written for your exact parts. Total time is about {answers.useCase === "map" || answers.useCase === "carry" || answers.useCase === "follow" ? "a weekend" : "an afternoon"}.
      </StepHeading>

      <div className="mt-6 flex flex-wrap items-center gap-2 print:hidden" role="tablist" aria-label="Guide version">
        <button role="tab" aria-selected={view === "step"} onClick={() => setView("step")} className={`h-10 rounded-full px-4 text-sm font-semibold ${view === "step" ? "bg-ink text-white" : "border border-line"}`}>
          Picture guide
        </button>
        <button role="tab" aria-selected={view === "quick"} onClick={() => setView("quick")} className={`h-10 rounded-full px-4 text-sm font-semibold ${view === "quick" ? "bg-ink text-white" : "border border-line"}`}>
          Checklist
        </button>
        <button
          role="tab"
          aria-selected={view === "ai"}
          onClick={() => {
            setView("ai");
            if (!aiGuide && !aiBusy) onWriteAiGuide();
          }}
          disabled={!canUseAi}
          className={`h-10 rounded-full px-4 text-sm font-semibold disabled:opacity-40 ${view === "ai" ? "bg-ink text-white" : "border border-line"}`}
        >
          Detailed guide by buildabot
        </button>
      </div>

      {view === "step" ? (
        <div className="mt-8">
          <GuideStepper sections={sections} items={items} />
        </div>
      ) : view === "quick" ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <Button onClick={() => (download("buildabot-checklist.md", guideToMarkdown(title, sections), "text/markdown"), track("guide_downloaded", { steps: sections.reduce((n, s) => n + s.steps.length, 0) }))}>Download checklist</Button>
            <Button variant="ghost" onClick={() => window.print()}>
              Print
            </Button>
          </div>
          <div className="mt-10 space-y-12">
            {sections.map((s, si) => (
              <div key={s.title}>
                <div className="flex items-baseline justify-between border-b border-ink pb-2">
                  <h2 className="text-2xl font-bold tracking-tight">{s.title}</h2>
                  <span className="text-sm text-mute">{s.time}</span>
                </div>
                <ol className="mt-4 space-y-5">
                  {s.steps.map((st, k) => {
                    const n = firstStep[si] + k;
                    return (
                      <li key={st.title} className="flex gap-4">
                        <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-full bg-stage text-sm font-bold">{n}</span>
                        <div>
                          <h3 className="font-semibold">{st.title.replace(/^\d+\.\s*/, "")}</h3>
                          <p className="mt-1 whitespace-pre-line leading-relaxed text-mute">{st.body}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-6">
          {aiBusy && <p className="rounded-2xl bg-stage-2 px-4 py-6 text-mute">buildabot is writing a detailed guide for your parts. This takes about a minute.</p>}
          {aiError && !aiBusy && (
            <div className="rounded-2xl bg-warn-soft px-4 py-3 text-sm">
              <p>{aiError}</p>
              <button className="mt-2 font-semibold text-blue" onClick={onWriteAiGuide}>
                Try again
              </button>
            </div>
          )}
          {aiGuide && !aiBusy && <Guide markdown={aiGuide} />}
        </div>
      )}

      <div className="mt-12 print:hidden">
        <Button onClick={onBack}>Back</Button>
      </div>
    </section>
  );
}
