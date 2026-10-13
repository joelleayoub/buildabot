"use client";
// The ordering side of the cart: pick a shop for each part (ranked for where the user is), see
// the order grouped by shop with a list to copy, official sellers for branded boards, and real
// shops nearby from OpenStreetMap. Links are shop searches or home pages, never guessed products.
import { useMemo, useState } from "react";
import { money } from "@/lib/catalog";
import type { Part } from "@/lib/compat/types";
import type { Extra } from "@/lib/extras";
import { type Carries, countryName, defaultShopFor, linkFor, originalShop, RETAILERS_BY_ID, searchTerm, shopsFor, shopsForPart, type ShopLink } from "@/lib/shops";
import { usePlace } from "@/lib/usePlace";
import { LocationBar } from "@/components/LocationBar";

const KEY = "buildabot.shops";

export interface OrderLine {
  key: string;
  name: string;
  qty: number;
  price: number;
  /** What it is, for picking shops: a catalog part, or a supply or tool. */
  buyable: Pick<Part, "name" | "brand" | "buy_url"> & { slot?: string };
  carries: Carries;
}

export const partLine = (part: Part, qty: number): OrderLine => ({ key: part.id, name: part.name, qty, price: part.price_usd_approx * qty, buyable: part, carries: "parts" });
export const extraLine = (e: Extra): OrderLine => ({
  key: e.item.id,
  name: e.item.name,
  qty: e.qty,
  price: e.item.price_usd_approx * e.qty,
  buyable: { name: e.item.name, brand: "Generic", buy_url: e.item.buy_url },
  carries: e.item.kind === "tool" ? "tools" : "supplies",
});

function loadChoices(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

interface Resolved extends OrderLine {
  shopId: string;
  shopName: string;
  link: ShopLink;
}

/** Per-line shop choice (the user's pick, or the best default for their country) and the link it gives. */
export function useOrderPlan(lines: OrderLine[]) {
  const { place } = usePlace();
  const cc = place?.country_code;
  const [choices, setChoices] = useState<Record<string, string>>(loadChoices);
  const choose = (key: string, shopId: string) =>
    setChoices((c) => {
      const next = { ...c, [key]: shopId };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* not remembered */
      }
      return next;
    });
  const resolved: Resolved[] = useMemo(
    () =>
      lines.map((l) => {
        const options = shopsForPart(l.buyable, cc, l.carries, 30);
        const picked = choices[l.key];
        const shopId = picked && (picked === "original" || options.some((o) => o.id === picked)) ? picked : defaultShopFor(l.buyable, cc, l.carries);
        if (shopId === "original" || !RETAILERS_BY_ID[shopId]) {
          const orig = originalShop(l.buyable.buy_url);
          return { ...l, shopId: "original", shopName: orig?.name ?? new URL(l.buyable.buy_url).hostname.replace(/^www\./, ""), link: { url: l.buyable.buy_url, direct: true, term: searchTerm(l.buyable.name, l.buyable.brand) } };
        }
        const r = RETAILERS_BY_ID[shopId];
        return { ...l, shopId, shopName: r.name, link: linkFor(r, searchTerm(l.buyable.name, l.buyable.brand)) };
      }),
    [lines, cc, choices],
  );
  return { resolved, choose, cc };
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("Copy this", text);
        }
      }}
      className="text-xs font-semibold text-blue hover:underline"
    >
      {done ? "Copied" : label}
    </button>
  );
}

/** "Search at X" or "Open X and search for: term". */
export function ShopLinkButton({ name, link, onClick }: { name: string; link: ShopLink; onClick?: () => void }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <a href={link.url} target="_blank" rel="noreferrer" onClick={onClick} className="text-sm font-semibold text-blue hover:underline">
        {link.direct ? `Find at ${name}` : `Open ${name}`}
      </a>
      {!link.direct && (
        <span className="text-xs text-mute">
          and search for “{link.term}” <CopyButton text={link.term} />
        </span>
      )}
    </span>
  );
}

export function ShopPicker({ line, current, cc, onChoose }: { line: OrderLine; current: string; cc?: string; onChoose: (shopId: string) => void }) {
  const options = shopsForPart(line.buyable, cc, line.carries, 12).filter((o) => o.kind !== "finder");
  const orig = originalShop(line.buyable.buy_url);
  return (
    <select
      aria-label={`Shop for ${line.name}`}
      value={current}
      onChange={(e) => onChoose(e.target.value)}
      className="h-8 max-w-[220px] rounded-full border border-line bg-paper px-2.5 text-xs font-medium text-ink"
    >
      {!options.some((o) => o.id === orig?.id) && <option value="original">{orig?.name ?? "Catalog link"} (catalog link)</option>}
      {(["local", "nearby", "worldwide"] as const).map((tier) => {
        const group = options.filter((o) => o.tier === tier);
        if (!group.length) return null;
        return (
          <optgroup key={tier} label={tier === "local" ? `In ${countryName(cc)}` : tier === "nearby" ? "Nearby, may deliver" : "Ships worldwide"}>
            {group.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

export function OrderPlan({ plan, parts, onLinkClick }: { plan: ReturnType<typeof useOrderPlan>; parts: Part[]; onLinkClick?: (key: string) => void }) {
  const { place, shops: nearbyShops } = usePlace();
  const cc = plan.cc;
  const groups = useMemo(() => {
    const m = new Map<string, Resolved[]>();
    for (const r of plan.resolved) m.set(r.shopName, [...(m.get(r.shopName) ?? []), r]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [plan.resolved]);
  const brands = new Set(parts.flatMap((p) => p.brand.split(" / ").map((b) => b.trim())));
  const finders = shopsFor(cc).filter((s) => s.kind === "finder" && s.brands.some((b) => brands.has(b)));
  const tiers = shopsFor(cc).filter((s) => s.kind !== "finder");
  const local = tiers.filter((s) => s.tier === "local");
  const nearby = tiers.filter((s) => s.tier === "nearby");
  const abroad = !!cc && local.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Plan your order</h2>
        <p className="mt-1 text-sm text-mute">
          {cc ? `Shops are picked for ${countryName(cc)}. Change any of them; your picks are remembered.` : "Add where you are to see shops that deliver to you and shops nearby."}
        </p>
        <div className="mt-3">
          <LocationBar why="To show shops that deliver to you, and electronics and hardware shops nearby." />
        </div>
      </div>

      {cc && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-stage-2 p-4">
            <p className="text-sm font-semibold">{local.length ? `Online shops in ${countryName(cc)}` : `No shop in ${countryName(cc)} in our list yet`}</p>
            {local.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {local.slice(0, 6).map((s) => (
                  <li key={s.id}>
                    <a href={s.home} target="_blank" rel="noreferrer" className="font-semibold text-blue hover:underline">
                      {s.name}
                    </a>
                    <span className="text-mute"> · {s.note}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-mute">Check the shops near you below, the official sellers, and shops abroad that ship to you.</p>
            )}
          </div>
          <div className="rounded-2xl bg-stage-2 p-4">
            {(() => {
              const list = (nearby.length ? nearby : tiers.filter((s) => s.tier === "worldwide")).slice(0, 5);
              const same = list.every((s) => s.label === list[0]?.label);
              return (
                <>
                  <p className="text-sm font-semibold">{nearby.length ? "Nearby, may deliver to you" : "Ships worldwide"}</p>
                  {same && list[0] && <p className="text-sm text-mute">{list[0].label}.</p>}
                  <ul className="mt-2 space-y-1 text-sm">
                    {list.map((s) => (
                      <li key={s.id}>
                        <a href={s.home} target="_blank" rel="noreferrer" className="font-semibold text-blue hover:underline">
                          {s.name}
                        </a>
                        <span className="text-mute"> · {same ? s.note : s.label}</span>
                      </li>
                    ))}
                  </ul>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold">Your order by shop</h3>
        <div className="mt-2 space-y-3">
          {groups.map(([shop, rows]) => {
            const subtotal = rows.reduce((s, r) => s + r.price, 0);
            const list = rows.map((r) => `${r.qty > 1 ? `${r.qty} x ` : ""}${r.name}: ${r.link.direct ? r.link.url : `search "${r.link.term}" at ${r.link.url}`}`).join("\n");
            return (
              <div key={shop} className="rounded-2xl border border-line">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
                  <p className="font-semibold">
                    {shop} <span className="font-normal text-mute">· {rows.length} item{rows.length > 1 ? "s" : ""}</span>
                  </p>
                  <span className="flex items-baseline gap-3">
                    <span className="num text-sm font-bold">~{money(subtotal)}</span>
                    <CopyButton text={`${shop}\n${list}`} label="Copy list" />
                  </span>
                </div>
                <ul className="divide-y divide-line">
                  {rows.map((r) => (
                    <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
                      <span className="min-w-0 basis-full text-sm sm:flex-1 sm:basis-auto">
                        {r.qty > 1 ? `${r.qty} × ` : ""}
                        {r.name}
                      </span>
                      <ShopPicker line={r} current={r.shopId} cc={cc} onChoose={(id) => plan.choose(r.key, id)} />
                      <ShopLinkButton name={r.shopName} link={r.link} onClick={() => onLinkClick?.(r.key)} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-mute">
          Prices are the catalog&apos;s estimates, not the shop&apos;s. {abroad || nearby.length ? "Ordering from another country can add courier fees and import duty, and takes longer; ask the shop before you pay." : "Check stock and delivery time on each shop before you pay."}
        </p>
      </div>

      {finders.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Official sellers</h3>
          <p className="text-sm text-mute">Branded boards are often copied. These lists name the shops in each country that sell the real thing.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {finders.map((f) => (
              <li key={f.id}>
                <a href={f.home} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-full border border-line px-3.5 text-sm font-semibold hover:border-ink">
                  {f.name} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {place && !place.approx && (
        <div>
          <h3 className="text-sm font-semibold">Shops near {place.name.split(",")[0]}</h3>
          <p className="text-sm text-mute">From OpenStreetMap. Electronics shops may have boards and sensors; hardware shops have screws, wire, switches and tools. Call ahead to check stock.</p>
          {nearbyShops === null ? (
            <p className="mt-2 text-sm text-mute">Looking…</p>
          ) : nearbyShops.length === 0 ? (
            <p className="mt-2 text-sm text-mute">No shops are mapped within 25 km yet. Try a bigger city nearby, or ask at a makerspace.</p>
          ) : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {nearbyShops.slice(0, 8).map((s) => (
                <li key={s.osm} className="rounded-2xl border border-line px-3.5 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <a href={s.website ?? s.osm} target="_blank" rel="noreferrer" className="font-semibold text-blue hover:underline">
                      {s.name}
                    </a>
                    <span className="num shrink-0 text-xs text-mute">{s.km < 10 ? s.km.toFixed(1) : Math.round(s.km)} km</span>
                  </div>
                  <p className="text-xs text-mute">
                    {s.kind} ·{" "}
                    <a href={s.osm} target="_blank" rel="noreferrer" className="hover:underline">
                      map and opening hours
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
