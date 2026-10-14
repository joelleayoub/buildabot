// Server-only store for analytics events and user feedback. Uses Supabase (tables `events` and
// `feedback` in supabase/schema.sql) when it is configured, otherwise keeps them in memory and
// logs them, so local runs and user tests without a database still work.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const EVENTS = ["started", "build_shown", "part_swapped", "guide_generated", "link_clicked", "feedback_sent", "guide_downloaded", "arm_plan_shown"] as const;
export type AnalyticsEvent = (typeof EVENTS)[number];

export interface EventRow {
  session: string;
  event: AnalyticsEvent;
  props: Record<string, string | number>;
  path: string;
}

export interface FeedbackRow {
  session: string;
  rating: number | null;
  goal: string;
  message: string;
  path: string;
  step: string;
}

let db: SupabaseClient | null | undefined;
const client = () => {
  if (db !== undefined) return db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  db = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return db;
};

/** Kept only when there is no database, so a local test session can still be read back. */
type Memory = { events: (EventRow & { at: string })[]; feedback: (FeedbackRow & { at: string })[] };
// On globalThis so every route and page in this server process sees the same data.
const g = globalThis as typeof globalThis & { __buildabotTelemetry?: Memory };
export const memory: Memory = (g.__buildabotTelemetry ??= { events: [], feedback: [] });

export async function recordEvent(row: EventRow): Promise<void> {
  const c = client();
  if (!c) {
    memory.events.push({ ...row, at: new Date().toISOString() });
    if (memory.events.length > 5000) memory.events.shift();
    return;
  }
  const { error } = await c.from("events").insert(row);
  if (error) throw new Error(`record event: ${error.message}`);
}

export async function recordFeedback(row: FeedbackRow): Promise<void> {
  const c = client();
  if (!c) {
    memory.feedback.push({ ...row, at: new Date().toISOString() });
    console.info("[feedback]", JSON.stringify(row));
    return;
  }
  const { error } = await c.from("feedback").insert(row);
  if (error) throw new Error(`record feedback: ${error.message}`);
}

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

export function parseEvent(body: unknown): EventRow | null {
  const b = body as Record<string, unknown> | null;
  if (!b || !EVENTS.includes(b.event as AnalyticsEvent)) return null;
  const props: Record<string, string | number> = {};
  if (b.props && typeof b.props === "object") {
    for (const [k, v] of Object.entries(b.props).slice(0, 12)) {
      if (typeof v === "number" && Number.isFinite(v)) props[k.slice(0, 40)] = v;
      else if (typeof v === "string") props[k.slice(0, 40)] = v.slice(0, 200);
    }
  }
  return { session: clip(b.session, 64) || "anon", event: b.event as AnalyticsEvent, props, path: clip(b.path, 200) };
}

export function parseFeedback(body: unknown): FeedbackRow | null {
  const b = body as Record<string, unknown> | null;
  if (!b) return null;
  const message = clip(b.message, 4000).trim();
  const rating = typeof b.rating === "number" && b.rating >= 1 && b.rating <= 5 ? Math.round(b.rating) : null;
  if (!message && rating === null) return null;
  return { session: clip(b.session, 64) || "anon", rating, goal: clip(b.goal, 500).trim(), message, path: clip(b.path, 200), step: clip(b.step, 60) };
}

export interface Summary {
  source: "supabase" | "memory";
  sessions: number;
  funnel: { event: AnalyticsEvent; sessions: number }[];
  links: { target: string; clicks: number }[];
  steps: { step: string; feedback: number }[];
  feedback: (FeedbackRow & { at: string })[];
  arm: { machine: string; verdict: string; count: number }[];
  days: number;
}

/** Everything the admin page shows, for the last `days` days. */
export async function summarise(days = 30): Promise<Summary> {
  const c = client();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  let events: (EventRow & { at: string })[];
  let feedback: (FeedbackRow & { at: string })[];
  if (c) {
    const [e, f] = await Promise.all([
      c.from("events").select("session, event, props, path, created_at").gte("created_at", since).order("id", { ascending: false }).limit(20000),
      c.from("feedback").select("session, rating, goal, message, path, step, created_at").gte("created_at", since).order("id", { ascending: false }).limit(500),
    ]);
    if (e.error) throw new Error(`read events: ${e.error.message}`);
    if (f.error) throw new Error(`read feedback: ${f.error.message}`);
    events = (e.data ?? []).map((r) => ({ ...(r as EventRow), at: (r as { created_at: string }).created_at }));
    feedback = (f.data ?? []).map((r) => ({ ...(r as FeedbackRow), at: (r as { created_at: string }).created_at }));
  } else {
    events = memory.events.filter((e) => e.at >= since);
    feedback = [...memory.feedback].reverse();
  }
  const sessionsFor = (ev: AnalyticsEvent) => new Set(events.filter((e) => e.event === ev).map((e) => e.session)).size;
  const order: AnalyticsEvent[] = ["started", "build_shown", "part_swapped", "link_clicked", "guide_downloaded", "guide_generated", "feedback_sent", "arm_plan_shown"];
  const links = new Map<string, number>();
  for (const e of events) if (e.event === "link_clicked") links.set(String(e.props.part ?? "?"), (links.get(String(e.props.part ?? "?")) ?? 0) + 1);
  const steps = new Map<string, number>();
  for (const f of feedback) steps.set(f.step || f.path || "?", (steps.get(f.step || f.path || "?") ?? 0) + 1);
  const arm = new Map<string, number>();
  for (const e of events) if (e.event === "arm_plan_shown") arm.set(`${e.props.machine}|${e.props.verdict}`, (arm.get(`${e.props.machine}|${e.props.verdict}`) ?? 0) + 1);
  return {
    source: c ? "supabase" : "memory",
    sessions: new Set(events.map((e) => e.session)).size,
    funnel: order.map((event) => ({ event, sessions: sessionsFor(event) })),
    links: [...links.entries()].map(([target, clicks]) => ({ target, clicks })).sort((a, b) => b.clicks - a.clicks).slice(0, 15),
    steps: [...steps.entries()].map(([step, n]) => ({ step, feedback: n })).sort((a, b) => b.feedback - a.feedback),
    feedback,
    arm: [...arm.entries()].map(([k, count]) => ({ machine: k.split("|")[0], verdict: k.split("|")[1], count })).sort((a, b) => b.count - a.count),
    days,
  };
}
