"use client";
// The whole build on paper: parts with pictures and shops, supplies and tools, the wiring diagram
// and table, the pin map, every step, and the code. Rendered into <body> and shown only when
// printing, so "Save as PDF" in the print dialog gives a clean document a beginner can open anywhere.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import PartArt from "@/components/PartArt";
import { money, PARTS_BY_ID } from "@/lib/catalog";
import type { BuildItem } from "@/lib/compat/types";
import { checkBuild } from "@/lib/compat/checkBuild";
import { generateFirmware, generatePhoneDrive } from "@/lib/electronics/firmware";
import { planPins } from "@/lib/electronics/pins";
import { type Answers, findUseCase, requirementsFrom, SLOT_LABELS, SLOT_ORDER } from "@/lib/flow";
import type { GuideSection } from "@/lib/quickGuide";
import { countryName } from "@/lib/shops";
import { planWiring } from "@/lib/wiring";
import { useExtras } from "./Extras";
import { extraLine, partLine, useOrderPlan } from "./OrderPlan";
import { WiringDiagram } from "./WiringDiagram";

const shortUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\?.*$/, (q) => (q.length > 40 ? q.slice(0, 40) + "…" : q));

function Doc({ items, answers, sections }: { items: BuildItem[]; answers: Answers; sections: GuideSection[] }) {
  const lines = SLOT_ORDER.flatMap((s) => items.filter((i) => PARTS_BY_ID[i.part_id]?.slot === s)).map((i) => ({ item: i, part: PARTS_BY_ID[i.part_id] }));
  const extras = useExtras(items, answers.owned);
  const orderLines = useMemo(
    () => [...lines.map((l) => partLine(l.part, l.item.quantity)), ...extras.extras.filter((e) => extras.needed.has(e.item.id) && e.item.price_usd_approx > 0).map(extraLine)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, extras.extras, extras.needed],
  );
  const plan = useOrderPlan(orderLines);
  const shop = (key: string) => plan.resolved.find((r) => r.key === key);
  const report = checkBuild(items, PARTS_BY_ID, requirementsFrom(answers));
  const wiring = planWiring(items, PARTS_BY_ID);
  const pins = planPins(items, PARTS_BY_ID);
  const fw = generateFirmware(items, PARTS_BY_ID);
  const phone = answers.useCase === "drive" ? generatePhoneDrive(items, PARTS_BY_ID) : null;
  const uc = findUseCase(answers.useCase);
  const nodeLabel = (id: string) => wiring.nodes.find((n) => n.id === id)?.label ?? id;
  let n = 0;

  return (
    <article className="print-doc text-[10.5pt] leading-snug text-black">
      <header className="flex items-end justify-between border-b-2 border-black pb-3">
        <div>
          <p className="text-[9pt] font-semibold uppercase tracking-wide">buildabot build guide</p>
          <h1 className="text-[22pt] font-bold leading-tight">{uc?.name ?? "Your rover"}</h1>
          <p>
            {lines.length} parts · parts about {money(report.totals.price_usd_approx)} · supplies and tools about {money(extras.total)}
            {plan.cc ? ` · shops picked for ${countryName(plan.cc)}` : ""}
          </p>
        </div>
        <p className="text-right text-[9pt]">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
      </header>

      <h2 className="mt-5 text-[14pt] font-bold">1. Parts to buy</h2>
      <table className="mt-2 w-full border-collapse">
        <tbody>
          {lines.map(({ item, part }) => {
            const r = shop(part.id);
            return (
              <tr key={part.id} className="avoid-break border-b border-neutral-300">
                <td className="w-[22mm] py-1.5 pr-2">
                  <div className="h-[15mm] w-[20mm]">
                    <PartArt part={part} />
                  </div>
                </td>
                <td className="py-1.5 pr-2">
                  <p className="text-[8.5pt] text-neutral-600">{SLOT_LABELS[part.slot]}</p>
                  <p className="font-semibold">
                    {item.quantity > 1 ? `${item.quantity} × ` : ""}
                    {part.name}
                  </p>
                  {r && (
                    <p className="text-[8.5pt] text-neutral-700">
                      {r.shopName}: {r.link.direct ? shortUrl(r.link.url) : `${shortUrl(r.link.url)}, search for "${r.link.term}"`}
                    </p>
                  )}
                </td>
                <td className="w-[18mm] py-1.5 text-right font-semibold">~{money(part.price_usd_approx * item.quantity)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 className="mt-5 text-[14pt] font-bold">2. Screws, supplies and tools</h2>
      <ul className="mt-2 columns-2 gap-6 text-[9.5pt]">
        {extras.extras.map((e) => (
          <li key={e.item.id} className="avoid-break mb-1">
            <span className="mr-1.5 inline-block h-[3.2mm] w-[3.2mm] border border-black align-[-0.5mm]">{extras.needed.has(e.item.id) || e.optional ? "" : "✓"}</span>
            {e.qty > 1 ? `${e.qty} × ` : ""}
            {e.item.name}
            {e.item.price_usd_approx ? ` (~${money(e.item.price_usd_approx * e.qty)})` : ""}
            {e.optional ? ", optional" : ""}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[8.5pt] text-neutral-600">Ticked: you said you already have it. Prices are estimates; check the shop.</p>

      <div className="page-break" />
      <h2 className="text-[14pt] font-bold">3. Wiring</h2>
      <div className="mt-2 border border-neutral-300 p-2">
        <WiringDiagram nodes={wiring.nodes} wires={wiring.wires} />
      </div>
      <table className="mt-3 w-full border-collapse text-[9pt]">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="w-[8mm] py-1">#</th>
            <th className="py-1">From</th>
            <th className="py-1">To</th>
            <th className="py-1">Connect</th>
          </tr>
        </thead>
        <tbody>
          {wiring.wires.map((w) => (
            <tr key={w.n} className="avoid-break border-b border-neutral-300 align-top">
              <td className="py-1 font-bold">{w.n}</td>
              <td className="py-1 pr-2">{nodeLabel(w.from)}</td>
              <td className="py-1 pr-2">{nodeLabel(w.to)}</td>
              <td className="py-1">
                {w.pins}
                {w.note && <span className="block text-neutral-600">{w.note}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {wiring.notes.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-[9pt]">
          {wiring.notes.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      {pins && (
        <>
          <h3 className="mt-4 text-[11pt] font-bold">Pin map for the {pins.hostName}</h3>
          <table className="mt-1 w-full border-collapse text-[9pt]">
            <tbody>
              {pins.rows.map((r) => (
                <tr key={r.signal} className="border-b border-neutral-300">
                  <td className="py-0.5 pr-2">{r.label}</td>
                  <td className="py-0.5 pr-2 font-semibold">{r.pin}</td>
                  <td className="py-0.5">{r.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="page-break" />
      <h2 className="text-[14pt] font-bold">4. Assembly steps</h2>
      {sections.map((s) => (
        <section key={s.title} className="mt-3">
          <h3 className="border-b border-black pb-0.5 text-[12pt] font-bold">
            {s.title} <span className="text-[9pt] font-normal text-neutral-600">· {s.time}</span>
          </h3>
          <ol className="mt-1.5 space-y-2">
            {s.steps.map((st) => {
              n++;
              const v = st.visual;
              const pics = v?.kind === "assembly" ? items.filter((i) => v.highlight.includes(PARTS_BY_ID[i.part_id]?.slot)).map((i) => PARTS_BY_ID[i.part_id]) : [];
              const wire = v?.kind === "wire" ? wiring.wires.find((w) => w.n === v.n) : undefined;
              return (
                <li key={`${s.title}-${st.title}`} className="avoid-break flex gap-3">
                  <span className="mt-0.5 inline-block h-[3.6mm] w-[3.6mm] shrink-0 border border-black" />
                  <span className="w-[6mm] shrink-0 font-bold">{n}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{st.title.replace(/^\d+\.\s*/, "")}</p>
                    <p className="whitespace-pre-line text-[9.5pt]">{st.body}</p>
                    {wire && <p className="mt-0.5 text-[9pt] font-semibold">Wire {wire.n}: {wire.pins}</p>}
                    {v?.kind === "code" && <p className="mt-0.5 text-[9pt]">The code ({v.filename}) is printed at the end of this guide.</p>}
                  </div>
                  {pics.length > 0 && (
                    <div className="flex shrink-0 gap-1">
                      {pics.slice(0, 2).map((p) => (
                        <div key={p.id} className="h-[14mm] w-[18mm]">
                          <PartArt part={p} />
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {report.issues.some((i) => i.severity === "warning") && (
        <>
          <h2 className="mt-5 text-[14pt] font-bold">5. Things to watch</h2>
          <ul className="mt-1 list-disc pl-5 text-[9.5pt]">
            {report.issues
              .filter((i) => i.severity === "warning")
              .map((i) => (
                <li key={i.code + i.message}>{i.message}</li>
              ))}
          </ul>
        </>
      )}

      {fw && (
        <>
          <div className="page-break" />
          <h2 className="text-[14pt] font-bold">Code: {fw.filename}</h2>
          <ol className="mt-1 list-decimal pl-5 text-[9.5pt]">
            {fw.howTo.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
          <pre className="mt-2 whitespace-pre-wrap break-words border border-neutral-300 p-2 font-mono text-[7.5pt] leading-[1.35]">{fw.code}</pre>
        </>
      )}
      {phone && (
        <>
          <div className="page-break" />
          <h2 className="text-[14pt] font-bold">Code: {phone.filename}</h2>
          <ol className="mt-1 list-decimal pl-5 text-[9.5pt]">
            {phone.howTo.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
          <pre className="mt-2 whitespace-pre-wrap break-words border border-neutral-300 p-2 font-mono text-[7pt] leading-[1.3]">{phone.code}</pre>
        </>
      )}
      <p className="mt-6 border-t border-neutral-300 pt-2 text-[8pt] text-neutral-600">Made with buildabot. Wire everything with the battery unplugged, and check red to + and black to − before the first power-on.</p>
    </article>
  );
}

/** Mounts the printable guide into <body> while the guide step is open. */
export function PrintableGuide(props: { items: BuildItem[]; answers: Answers; sections: GuideSection[] }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.id = "print-root";
    document.body.appendChild(el);
    const t = setTimeout(() => setRoot(el), 0);
    return () => {
      clearTimeout(t);
      el.remove();
    };
  }, []);
  return root ? createPortal(<Doc {...props} />, root) : null;
}
