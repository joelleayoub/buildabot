import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BuildIssues, BuildStats } from "@/components/BuildStats";
import { Guide } from "@/components/Guide";
import { defaultNeeded, extrasFor, extrasTotal } from "@/lib/extras";
import { RoverDiagram } from "@/components/RoverDiagram";
import { SlotBadge } from "@/components/SlotIcon";
import { jsonCatalog } from "@/lib/advisor/agent";
import { projectStore } from "@/lib/advisor/store";
import { checkBuild } from "@/lib/compat/checkBuild";
import { AUTONOMY_LABELS, SLOT_LABELS, SLOT_ORDER } from "@/lib/slots";

export const metadata: Metadata = { title: "Shared build | BuildABot" };

async function SharedBuild({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shared = /^[\w-]{6,40}$/.test(slug) ? await projectStore().loadShared(slug) : null;
  if (!shared || shared.items.length === 0) notFound();

  const parts = await jsonCatalog.parts();
  const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
  const requirements = shared.requirements ?? { autonomy: "remote_control" as const };
  const report = checkBuild(shared.items, byId, requirements);
  const extras = extrasFor(shared.items, byId);
  const lines = shared.items.flatMap((item) => (byId[item.part_id] ? [{ item, part: byId[item.part_id] }] : []));

  return (
    <>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Goal: {AUTONOMY_LABELS[requirements.autonomy].toLowerCase()}.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <RoverDiagram items={shared.items} byId={byId} />
        <div className="flex flex-col gap-4">
          <BuildStats items={shared.items} byId={byId} report={report} />
          <BuildIssues report={report} showInfo={false} />
        </div>
      </div>

      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {SLOT_ORDER.flatMap((slot) =>
          lines
            .filter((l) => l.part.slot === slot)
            .map(({ item, part }, i) => (
              <li key={`${part.id}-${i}`} className="flex gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <SlotBadge slot={slot} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{SLOT_LABELS[slot]}</span>
                    <span className="font-mono text-sm">~${part.price_usd_approx * item.quantity}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium">
                    {item.quantity > 1 ? `${item.quantity} × ` : ""}
                    {part.name}
                  </p>
                  {item.reason && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{item.reason}</p>}
                  <a href={part.buy_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs underline underline-offset-2">
                    Find at retailer ↗
                  </a>
                </div>
              </li>
            )),
        )}
      </ul>

      <h2 className="mt-10 text-lg font-semibold">Also needed to build it</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Screws, wire, a charger and tools. About ${extrasTotal(extras, defaultNeeded(extras))} if you have none of them.</p>
      <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {extras.map((e) => (
          <li key={e.item.id} className="flex justify-between gap-3 border-b border-zinc-100 py-1.5 dark:border-zinc-800">
            <span>
              {e.qty > 1 ? `${e.qty} × ` : ""}
              {e.item.name}
              {e.optional ? " (optional)" : ""}
            </span>
            <span className="shrink-0 font-mono">{e.item.price_usd_approx ? `~$${e.item.price_usd_approx * e.qty}` : "you likely have one"}</span>
          </li>
        ))}
      </ul>

      {shared.guide && (
        <div className="mt-8">
          <Guide markdown={shared.guide} />
        </div>
      )}
    </>
  );
}

export default function SharedBuildPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <>
    <SiteHeader />
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Shared rover build</h1>
        <Link href="/" className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-medium text-accent-fg">
          Build your own
        </Link>
      </div>
      <Suspense fallback={<p className="mt-6 animate-pulse text-sm text-zinc-500">Loading build…</p>}>
        <SharedBuild params={params} />
      </Suspense>
    </main>
    </>
  );
}
