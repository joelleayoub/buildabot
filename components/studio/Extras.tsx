"use client";
// "Also needed": screws, wire, connectors, chargers and tools for this build, with a tick for
// each one the user still has to buy. Ticks are remembered in this browser.
import { useEffect, useMemo, useState } from "react";
import { money, retailerName } from "@/lib/catalog";
import type { BuildItem } from "@/lib/compat/types";
import { PARTS_BY_ID } from "@/lib/catalog";
import { defaultNeeded, type Extra, extrasFor, extrasTotal } from "@/lib/extras";
import { ToolIcon } from "@/components/ToolIcon";

const KEY = "buildabot.extras";

function loadChoices(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** The extras for a build and which ones the user still needs to buy. */
export function useExtras(items: BuildItem[]) {
  const extras = useMemo(() => extrasFor(items, PARTS_BY_ID), [items]);
  const [choices, setChoices] = useState<Record<string, boolean>>(loadChoices);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(choices));
    } catch {
      /* not remembered */
    }
  }, [choices]);
  const needed = useMemo(() => {
    const d = defaultNeeded(extras);
    for (const e of extras) {
      if (!(e.item.id in choices)) continue;
      if (choices[e.item.id]) d.add(e.item.id);
      else d.delete(e.item.id);
    }
    return d;
  }, [extras, choices]);
  const toggle = (id: string) => setChoices((c) => ({ ...c, [id]: !needed.has(id) }));
  const setAll = (need: boolean) => setChoices((c) => ({ ...c, ...Object.fromEntries(extras.map((e) => [e.item.id, need && !e.optional])) }));
  return { extras, needed, toggle, setAll, total: extrasTotal(extras, needed), supplies: extrasTotal(extras, needed, ["supply", "safety"]), tools: extrasTotal(extras, needed, ["tool"]) };
}

const GROUPS: { kind: Extra["item"]["kind"][]; title: string; blurb: string }[] = [
  { kind: ["supply", "safety"], title: "Screws, wire and supplies", blurb: "Small things the parts don't come with." },
  { kind: ["tool"], title: "Tools and charger", blurb: "Buy once, use for every build after this one." },
];

export function ExtrasList({ extras, needed, toggle, setAll, onLinkClick }: { extras: Extra[]; needed: Set<string>; toggle: (id: string) => void; setAll: (need: boolean) => void; onLinkClick?: (id: string) => void }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">Also needed to build it</h2>
        <div className="flex gap-3 text-sm font-semibold">
          <button onClick={() => setAll(false)} className="text-mute hover:text-ink">
            I have all of these
          </button>
          <button onClick={() => setAll(true)} className="text-blue hover:underline">
            I need everything
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-mute">Untick anything you already have; the total updates.</p>
      {GROUPS.map((g) => {
        const rows = extras.filter((e) => g.kind.includes(e.item.kind));
        if (!rows.length) return null;
        return (
          <div key={g.title} className="mt-5">
            <h3 className="text-sm font-semibold">
              {g.title} <span className="font-normal text-mute">· {g.blurb}</span>
            </h3>
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
              {rows.map((e) => {
                const need = needed.has(e.item.id);
                return (
                  <li key={e.item.id} className={`flex items-start gap-3 px-3.5 py-3 ${need ? "" : "bg-stage-2/60"}`}>
                    <input type="checkbox" checked={need} onChange={() => toggle(e.item.id)} aria-label={`Need to buy: ${e.item.name}`} className="mt-1 h-5 w-5 shrink-0 accent-[var(--blue)]" />
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${need ? "bg-blue-soft text-blue" : "bg-stage text-mute"}`}>
                      <ToolIcon icon={e.item.icon} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block font-semibold leading-snug ${need ? "" : "text-mute line-through decoration-1"}`}>
                        {e.qty > 1 ? `${e.qty} × ` : ""}
                        {e.item.name}
                        {e.optional && <span className="ml-2 rounded-full bg-stage px-2 py-0.5 align-middle text-[0.68rem] font-semibold text-mute no-underline">Optional</span>}
                        {e.item.kind === "safety" && <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 align-middle text-[0.68rem] font-semibold text-warn">Safety</span>}
                      </span>
                      <span className="block text-sm leading-snug text-mute">{e.why}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                      <span className="num text-sm font-bold">{e.item.price_usd_approx ? `~${money(e.item.price_usd_approx * e.qty)}` : "You likely have one"}</span>
                      {e.item.price_usd_approx > 0 && (
                        <a href={e.item.buy_url} target="_blank" rel="noreferrer" onClick={() => onLinkClick?.(e.item.id)} className="text-xs font-semibold text-blue hover:underline">
                          Find at {retailerName(e.item.buy_url)}
                        </a>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
