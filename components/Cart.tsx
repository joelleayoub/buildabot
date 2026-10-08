"use client";

import { useMemo } from "react";
import { checkBuild } from "@/lib/compat/checkBuild";
import type { BuildItem, Issue, Part, Requirements, Slot } from "@/lib/compat/types";
import type { SampleBuild } from "@/lib/sampleBuilds";
import { AUTONOMY_LABELS, SLOT_LABELS, SLOT_ORDER } from "@/lib/slots";

const ISSUE_STYLES: Record<Issue["severity"], { box: string; label: string }> = {
  error: { box: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200", label: "Must fix" },
  warning: { box: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200", label: "Heads-up" },
  info: { box: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300", label: "Note" },
};

const selectClass =
  "w-full rounded-md border border-zinc-300 bg-background px-2 py-1.5 text-sm dark:border-zinc-700";

interface Props {
  parts: Part[];
  items: BuildItem[];
  requirements: Requirements;
  summary: string | null;
  samples: SampleBuild[];
  guideBusy: boolean;
  shareUrl: string | null;
  shareBusy: boolean;
  onItemsChange(items: BuildItem[], event: "swap" | "edit"): void;
  onRequirementsChange(r: Requirements): void;
  onLoadSample(sample: SampleBuild): void;
  onGenerateGuide(): void;
  onShare(): void;
  onNewBuild(): void;
  onRetailerClick(part: Part): void;
}

export function Cart({ parts, items, requirements, summary, samples, guideBusy, shareUrl, shareBusy, onItemsChange, onRequirementsChange, onLoadSample, onGenerateGuide, onShare, onNewBuild, onRetailerClick }: Props) {
  const byId = useMemo(() => Object.fromEntries(parts.map((p) => [p.id, p])), [parts]);
  const bySlot = useMemo(() => {
    const m = new Map<Slot, Part[]>();
    for (const p of [...parts].sort((a, b) => a.price_usd_approx - b.price_usd_approx)) m.set(p.slot, [...(m.get(p.slot) ?? []), p]);
    return m;
  }, [parts]);
  const report = useMemo(() => checkBuild(items, byId, requirements), [items, byId, requirements]);

  const flagged = (id: string, severity: Issue["severity"]) => report.issues.some((i) => i.severity === severity && i.part_ids?.includes(id));
  const replace = (index: number, part_id: string) =>
    onItemsChange(items.map((it, i) => (i === index ? { part_id, quantity: it.quantity } : it)), "swap");
  const setQuantity = (index: number, quantity: number) =>
    onItemsChange(items.map((it, i) => (i === index ? { ...it, quantity } : it)), "edit");
  const remove = (index: number) => onItemsChange(items.filter((_, i) => i !== index), "edit");
  const add = (part_id: string) => onItemsChange([...items, { part_id, quantity: 1 }], "edit");

  const empty = items.length === 0;
  const order = { error: 0, warning: 1, info: 2 };
  const issues = [...report.issues].sort((a, b) => order[a.severity] - order[b.severity]);
  const errorCount = issues.filter((i) => i.severity === "error").length;

  return (
    <section aria-label="Your build" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Your build</h2>
        {!empty && (
          <button type="button" onClick={onNewBuild} className="text-xs text-zinc-500 underline underline-offset-2">
            Start over
          </button>
        )}
      </div>

      {empty ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No parts yet. Describe your rover in the chat, or start from a ready-made build and change it:
          </p>
          <div className="mt-3 grid gap-2">
            {samples.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onLoadSample(s)}
                className="rounded-lg border border-zinc-200 p-3 text-left hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <span className="block text-sm font-medium">{s.name}</span>
                <span className="block text-xs text-zinc-600 dark:text-zinc-400">{s.tagline}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {summary && <p className="text-sm text-zinc-700 dark:text-zinc-300">{summary}</p>}

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-zinc-500">What should it do?</span>
            <select
              className={selectClass}
              value={requirements.autonomy}
              onChange={(e) => onRequirementsChange({ ...requirements, autonomy: e.target.value as Requirements["autonomy"] })}
            >
              {Object.entries(AUTONOMY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <ul className="flex flex-col gap-2">
            {SLOT_ORDER.map((slot) => {
              const lines = items.map((item, index) => ({ item, index, part: byId[item.part_id] })).filter((l) => l.part?.slot === slot);
              if (lines.length === 0) return null;
              return lines.map(({ item, index, part }) => (
                <li
                  key={`${part.id}-${index}`}
                  className={`rounded-lg border p-3 ${
                    flagged(part.id, "error")
                      ? "border-red-400 dark:border-red-800"
                      : flagged(part.id, "warning")
                        ? "border-amber-400 dark:border-amber-800"
                        : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{SLOT_LABELS[slot]}</span>
                    <span className="font-mono text-sm">~${part.price_usd_approx * item.quantity}</span>
                  </div>
                  <select aria-label={`${SLOT_LABELS[slot]} part`} className={`${selectClass} mt-1.5`} value={part.id} onChange={(e) => replace(index, e.target.value)}>
                    {(bySlot.get(slot) ?? []).map((alt) => (
                      <option key={alt.id} value={alt.id}>
                        {alt.name} — ~${alt.price_usd_approx}
                      </option>
                    ))}
                  </select>
                  {item.reason && <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">{item.reason}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <label className="flex items-center gap-1.5">
                      Qty
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={item.quantity}
                        onChange={(e) => setQuantity(index, Math.min(20, Math.max(1, Math.floor(Number(e.target.value)) || 1)))}
                        className="w-14 rounded-md border border-zinc-300 bg-background px-1.5 py-1 dark:border-zinc-700"
                      />
                      {part.pack_size > 1 && <span className="text-zinc-500">× pack of {part.pack_size}</span>}
                    </label>
                    <a href={part.buy_url} target="_blank" rel="noopener noreferrer" onClick={() => onRetailerClick(part)} className="underline underline-offset-2">
                      Find at retailer ↗
                    </a>
                    <button type="button" onClick={() => remove(index)} className="ml-auto text-zinc-500 underline underline-offset-2">
                      Remove
                    </button>
                  </div>
                </li>
              ));
            })}
          </ul>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Add a part</span>
            <select className={selectClass} value="" onChange={(e) => e.target.value && add(e.target.value)}>
              <option value="">Choose a part…</option>
              {SLOT_ORDER.map((slot) => (
                <optgroup key={slot} label={SLOT_LABELS[slot]}>
                  {(bySlot.get(slot) ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ~${p.price_usd_approx}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <dl className="grid grid-cols-3 gap-2 rounded-lg bg-zinc-100 p-3 text-center dark:bg-zinc-900">
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
          <p className="-mt-2 text-xs text-zinc-500">Prices are approximate — confirm on the retailer page.</p>

          <div aria-live="polite" className="flex flex-col gap-2">
            {errorCount === 0 && (
              <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                These parts work together.
              </p>
            )}
            {issues.map((issue, i) => (
              <div key={`${issue.code}-${i}`} className={`rounded-lg border px-3 py-2 text-sm ${ISSUE_STYLES[issue.severity].box}`}>
                <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide">{ISSUE_STYLES[issue.severity].label}</span>
                {issue.message}
                {issue.fix && <span className="mt-0.5 block text-xs opacity-80">Fix: {issue.fix}</span>}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onGenerateGuide}
            disabled={errorCount > 0 || guideBusy}
            className="h-11 rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
          >
            {guideBusy ? "Writing your guide…" : "Generate build guide"}
          </button>
          {errorCount > 0 && <p className="-mt-2 text-xs text-zinc-500">Fix the red items first to generate a guide.</p>}

          {shareUrl ? (
            <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <p className="text-xs text-zinc-500">Anyone with this link can view this build (read-only):</p>
              <div className="mt-1.5 flex items-center gap-2">
                <input readOnly value={shareUrl} aria-label="Share link" onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-background px-2 py-1.5 font-mono text-xs dark:border-zinc-700" />
                <button type="button" onClick={() => navigator.clipboard?.writeText(shareUrl)} className="h-8 shrink-0 rounded-full border border-zinc-300 px-3 text-xs dark:border-zinc-700">
                  Copy
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={onShare} disabled={shareBusy} className="h-11 rounded-full border border-zinc-300 px-5 text-sm font-medium disabled:opacity-40 dark:border-zinc-700">
              {shareBusy ? "Creating link…" : "Share this build"}
            </button>
          )}
          <p className="-mt-2 text-xs text-zinc-500">Your build is saved in this browser — come back any time.</p>
        </>
      )}
    </section>
  );
}
