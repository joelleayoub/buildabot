// Admin: how test users get on. Feedback, how far sessions get, which shops they click, and arm
// advisor tasks. Protected by ADMIN_KEY: open /admin?key=YOUR_KEY (bookmark it).
import type { Metadata } from "next";
import { Suspense } from "react";
import { timingSafeEqual } from "node:crypto";
import { summarise } from "@/lib/telemetry";

export const metadata: Metadata = { title: "Admin | buildabot", robots: { index: false, follow: false } };

const LABEL: Record<string, string> = {
  started: "Started a build",
  build_shown: "Got a build",
  part_swapped: "Swapped a part",
  link_clicked: "Clicked a shop link",
  guide_downloaded: "Downloaded the guide",
  guide_generated: "Asked for the AI guide",
  feedback_sent: "Sent feedback",
  arm_plan_shown: "Sized an arm",
};

function allowed(key: string | undefined): "ok" | "no_key" | "denied" {
  const want = process.env.ADMIN_KEY;
  if (!want) return process.env.NODE_ENV === "production" ? "no_key" : "ok";
  if (!key) return "denied";
  const a = Buffer.from(key);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "denied";
}

async function Dashboard({ searchParams }: { searchParams: Promise<{ key?: string; days?: string }> }) {
  const { key, days } = await searchParams;
  const access = allowed(key);
  if (access === "no_key") return <p className="mt-6">Set an ADMIN_KEY environment variable in Vercel, redeploy, then open /admin?key=YOUR_KEY.</p>;
  if (access === "denied") return <p className="mt-6">Add ?key=YOUR_KEY to the address to see this page.</p>;
  const d = Math.min(365, Math.max(1, Number(days) || 30));
  let s;
  try {
    s = await summarise(d);
  } catch (err) {
    return <p className="mt-6 text-bad">Couldn&apos;t read the data: {err instanceof Error ? err.message : "unknown error"}. Did you run the latest supabase/schema.sql?</p>;
  }
  const top = Math.max(1, ...s.funnel.map((f) => f.sessions));
  const avg = s.feedback.filter((f) => f.rating).reduce((sum, f, _, arr) => sum + (f.rating ?? 0) / arr.length, 0);
  return (
    <>
      <p className="mt-2 text-sm text-mute">
        Last {d} days · {s.sessions} visitors · data from {s.source === "supabase" ? "Supabase" : "this server's memory (resets on restart)"} ·{" "}
        {[7, 30, 90].map((n) => (
          <a key={n} href={`?${new URLSearchParams({ ...(key ? { key } : {}), days: String(n) })}`} className={`mr-2 font-semibold ${n === d ? "text-ink" : "text-blue"}`}>
            {n} days
          </a>
        ))}
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-bold">How far people get</h2>
        <ul className="mt-3 space-y-2">
          {s.funnel.map((f) => (
            <li key={f.event} className="grid grid-cols-[180px_1fr_48px] items-center gap-3 text-sm">
              <span>{LABEL[f.event]}</span>
              <span className="h-3 overflow-hidden rounded-full bg-stage">
                <span className="block h-full rounded-full bg-blue" style={{ width: `${(f.sessions / top) * 100}%` }} />
              </span>
              <span className="num text-right font-semibold">{f.sessions}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold">
          Feedback <span className="font-normal text-mute">· {s.feedback.length} messages{avg ? ` · average rating ${avg.toFixed(1)} of 5` : ""}</span>
        </h2>
        {s.steps.length > 0 && <p className="mt-1 text-sm text-mute">By step: {s.steps.map((x) => `${x.step} (${x.feedback})`).join(", ")}</p>}
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
          {s.feedback.length === 0 && <li className="p-4 text-sm text-mute">No feedback yet.</li>}
          {s.feedback.map((f, i) => (
            <li key={i} className="p-4 text-sm">
              <p className="text-xs text-mute">
                {new Date(f.at).toLocaleString("en-GB")} · {f.step || f.path} {f.rating ? `· ${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}` : ""} · visitor {f.session.slice(0, 6)}
              </p>
              {f.goal && <p className="mt-1 font-semibold">Trying to: {f.goal}</p>}
              {f.message && <p className="mt-1 whitespace-pre-wrap">{f.message}</p>}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="text-lg font-bold">Most-clicked links</h2>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {s.links.length === 0 && (
                <tr>
                  <td className="text-mute">No clicks yet.</td>
                </tr>
              )}
              {s.links.map((l) => (
                <tr key={l.target} className="border-b border-line">
                  <td className="py-1.5 pr-3">{l.target}</td>
                  <td className="num py-1.5 text-right font-semibold">{l.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2 className="text-lg font-bold">Arm advisor tasks</h2>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {s.arm.length === 0 && (
                <tr>
                  <td className="text-mute">None yet.</td>
                </tr>
              )}
              {s.arm.map((a) => (
                <tr key={a.machine + a.verdict} className="border-b border-line">
                  <td className="py-1.5 pr-3">{a.machine}</td>
                  <td className="py-1.5 pr-3 text-mute">{a.verdict}</td>
                  <td className="num py-1.5 text-right font-semibold">{a.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

export default function AdminPage(props: { searchParams: Promise<{ key?: string; days?: string }> }) {
  return (
    <main className="mx-auto w-full max-w-5xl bg-paper px-4 py-10 text-ink sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">buildabot admin</h1>
      <Suspense fallback={<p className="mt-6 text-mute">Loading…</p>}>
        <Dashboard {...props} />
      </Suspense>
    </main>
  );
}
