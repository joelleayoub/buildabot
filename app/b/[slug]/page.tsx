import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Guide } from "@/components/Guide";
import { jsonCatalog } from "@/lib/advisor/agent";
import { projectStore } from "@/lib/advisor/store";
import { checkBuild } from "@/lib/compat/checkBuild";
import { AUTONOMY_LABELS, SLOT_LABELS, SLOT_ORDER } from "@/lib/slots";

export const metadata: Metadata = { title: "Shared build — BuildABot" };

async function SharedBuild({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shared = /^[\w-]{6,40}$/.test(slug) ? await projectStore().loadShared(slug) : null;
  if (!shared || shared.items.length === 0) notFound();

  const parts = await jsonCatalog.parts();
  const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
  const requirements = shared.requirements ?? { autonomy: "remote_control" as const };
  const report = checkBuild(shared.items, byId, requirements);
  const lines = shared.items.flatMap((item) => (byId[item.part_id] ? [{ item, part: byId[item.part_id] }] : []));
  const shown = report.issues.filter((i) => i.severity !== "info");

  return (
    <>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Goal: {AUTONOMY_LABELS[requirements.autonomy].toLowerCase()}. Prices are approximate — confirm on the retailer page.
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-2 rounded-lg bg-zinc-100 p-3 text-center dark:bg-zinc-900">
        <div>
          <dt className="text-xs text-zinc-500">Total</dt>
          <dd className="font-mono text-base font-semibold">~${Math.round(report.totals.price_usd_approx)}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Weight</dt>
          <dd className="font-mono text-base">{report.totals.mass_kg.toFixed(1)} kg</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Runtime</dt>
          <dd className="font-mono text-base">{report.totals.est_runtime_min === null ? "—" : `~${report.totals.est_runtime_min} min`}</dd>
        </div>
      </dl>

      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {SLOT_ORDER.flatMap((slot) =>
          lines
            .filter((l) => l.part.slot === slot)
            .map(({ item, part }, i) => (
              <li key={`${part.id}-${i}`} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
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
              </li>
            )),
        )}
      </ul>

      <div className="mt-6 flex flex-col gap-2">
        {report.ok && (
          <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            These parts work together.
          </p>
        )}
        {shown.map((issue, i) => (
          <p
            key={`${issue.code}-${i}`}
            className={`rounded-lg border px-3 py-2 text-sm ${
              issue.severity === "error"
                ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
            }`}
          >
            <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide">{issue.severity === "error" ? "Must fix" : "Heads-up"}</span>
            {issue.message}
          </p>
        ))}
      </div>

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
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Shared rover build</h1>
        <Link href="/" className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background">
          Build your own
        </Link>
      </div>
      <Suspense fallback={<p className="mt-6 animate-pulse text-sm text-zinc-500">Loading build…</p>}>
        <SharedBuild params={params} />
      </Suspense>
    </main>
  );
}
