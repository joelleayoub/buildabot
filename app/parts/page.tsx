import type { Metadata } from "next";
import { jsonCatalog } from "@/lib/advisor/agent";
import type { Part, Slot } from "@/lib/compat/types";
import { SLOT_LABELS, SLOT_ORDER } from "@/lib/slots";

export const metadata: Metadata = { title: "Parts catalog — BuildABot" };

function formatCompat(compat: Part["compat"]) {
  return Object.entries(compat)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
}

export default async function PartsPage() {
  const parts = await jsonCatalog.parts();
  const bySlot = new Map<Slot, Part[]>();
  for (const p of parts) {
    bySlot.set(p.slot, [...(bySlot.get(p.slot) ?? []), p]);
  }
  for (const list of bySlot.values()) {
    list.sort((a, b) => a.price_usd_approx - b.price_usd_approx);
  }
  const unknownSlots = [...bySlot.keys()].filter((s) => !SLOT_ORDER.includes(s));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Parts catalog</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {parts.length} parts across {bySlot.size} slots. Prices are approximate; links open a retailer search.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2 text-sm">
        {[...SLOT_ORDER, ...unknownSlots].map((slot) => (
          <a
            key={slot}
            href={`#${slot}`}
            className="rounded-full border border-zinc-200 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            {SLOT_LABELS[slot] ?? slot} <span className="text-zinc-500">{bySlot.get(slot)?.length ?? 0}</span>
          </a>
        ))}
      </nav>

      {[...SLOT_ORDER, ...unknownSlots].map((slot) => {
        const list = bySlot.get(slot) ?? [];
        return (
          <section key={slot} id={slot} className="mt-10 scroll-mt-6">
            <h2 className="text-xl font-semibold">
              {SLOT_LABELS[slot] ?? slot} <span className="text-sm font-normal text-zinc-500">({list.length})</span>
            </h2>
            {list.length === 0 ? (
              <p className="mt-3 text-sm text-red-600">No parts in this slot.</p>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {list.map((p) => (
                  <li key={p.id} className="flex flex-col rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-medium leading-snug">{p.name}</h3>
                      <span className="shrink-0 font-mono text-sm">~${p.price_usd_approx}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {p.brand} · {p.mass_g} g{p.pack_size > 1 ? ` · pack of ${p.pack_size}` : ""} ·{" "}
                      <code className="font-mono">{p.id}</code>
                    </p>
                    <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{p.description}</p>
                    {p.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.tags.map((t) => (
                          <span key={t} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <details className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                      <summary className="cursor-pointer select-none">Specs</summary>
                      <ul className="mt-1 font-mono">
                        {formatCompat(p.compat).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </details>
                    <a
                      href={p.buy_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 text-sm font-medium underline underline-offset-2"
                    >
                      Find at retailer ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </main>
  );
}
