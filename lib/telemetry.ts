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
export const memory = { events: [] as (EventRow & { at: string })[], feedback: [] as (FeedbackRow & { at: string })[] };

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
