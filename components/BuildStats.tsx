import type { ReactNode } from "react";
import type { BuildItem, BuildReport, Part } from "@/lib/compat/types";
import { GROUP_LABELS, GROUP_ORDER, groupColor, SLOT_GROUP, type SlotGroup } from "@/lib/slots";

const icon = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
    {children}
  </svg>
);

const ICONS = {
  price: icon(
    <>
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="7.5" cy="8.5" r="1.2" />
    </>,
  ),
  weight: icon(
    <>
      <path d="M6 9h12l2 11H4z" />
      <circle cx="12" cy="6" r="3" />
    </>,
  ),
  runtime: icon(
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9 2h6" />
    </>,
  ),
};

function Stat({ kind, label, value, strong }: { kind: keyof typeof ICONS; label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
      <dt className="flex items-center gap-1.5 text-xs text-zinc-500">
        {ICONS[kind]}
        {label}
      </dt>
      <dd className={`mt-0.5 font-mono text-base ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

/** Total, weight and runtime tiles, plus where the money goes by part family. */
export function BuildStats({ items, byId, report }: { items: BuildItem[]; byId: Record<string, Part>; report: BuildReport }) {
  const spend = Object.fromEntries(GROUP_ORDER.map((g) => [g, 0])) as Record<SlotGroup, number>;
  for (const i of items) {
    const p = byId[i.part_id];
    if (p) spend[SLOT_GROUP[p.slot]] += p.price_usd_approx * i.quantity;
  }
  const total = report.totals.price_usd_approx;
  const groups = GROUP_ORDER.filter((g) => spend[g] > 0);

  return (
    <div>
      <dl className="grid grid-cols-3 gap-2">
        <Stat kind="price" label="Total" value={`~$${Math.round(total)}`} strong />
        <Stat kind="weight" label="Weight" value={`${report.totals.mass_kg.toFixed(1)} kg`} />
        <Stat kind="runtime" label="Runtime" value={report.totals.est_runtime_min === null ? "n/a" : `~${report.totals.est_runtime_min} min`} />
      </dl>

      {total > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-zinc-500">Where the money goes</p>
          <div className="mt-1.5 flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={groups.map((g) => `${GROUP_LABELS[g]} $${Math.round(spend[g])}`).join(", ")}>
            {groups.map((g) => (
              <span key={g} style={{ width: `${(spend[g] / total) * 100}%`, backgroundColor: groupColor(g) }} />
            ))}
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {groups.map((g) => (
              <li key={g} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: groupColor(g) }} />
                <span className="text-zinc-600 dark:text-zinc-400">{GROUP_LABELS[g]}</span>
                <span className="ml-auto font-mono">
                  ~${Math.round(spend[g])} <span className="text-zinc-500">({Math.round((spend[g] / total) * 100)}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-xs text-zinc-500">Prices are approximate. Confirm on the retailer page.</p>
    </div>
  );
}

const ISSUE_ICON = {
  ok: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  error: <path d="M12 8v5M12 16.5v.01M10.3 3.9L2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  warning: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5v.01" />
    </>
  ),
};

const ISSUE_STYLES = {
  ok: { box: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200", label: "" },
  error: { box: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200", label: "Must fix" },
  warning: { box: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200", label: "Heads-up" },
  info: { box: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300", label: "Note" },
};

function IssueRow({ kind, children }: { kind: keyof typeof ISSUE_STYLES; children: ReactNode }) {
  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${ISSUE_STYLES[kind].box}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0">
        {ISSUE_ICON[kind]}
      </svg>
      <div>
        {ISSUE_STYLES[kind].label && <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide">{ISSUE_STYLES[kind].label}</span>}
        {children}
      </div>
    </div>
  );
}

/** The checker's verdict: a green "works together" line, then errors, warnings and notes. */
export function BuildIssues({ report, showInfo = true }: { report: BuildReport; showInfo?: boolean }) {
  const order = { error: 0, warning: 1, info: 2 };
  const issues = report.issues.filter((i) => showInfo || i.severity !== "info").sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      {report.ok && <IssueRow kind="ok">These parts work together.</IssueRow>}
      {issues.map((issue, i) => (
        <IssueRow key={`${issue.code}-${i}`} kind={issue.severity}>
          {issue.message}
          {issue.fix && <span className="mt-0.5 block text-xs opacity-80">Fix: {issue.fix}</span>}
        </IssueRow>
      ))}
    </div>
  );
}
