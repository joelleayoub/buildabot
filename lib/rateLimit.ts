// Usage limits for the routes that spend Anthropic credit. Each visitor (a hash of their IP, never
// the IP itself) gets a number of calls per hour per route, and all visitors together get a daily
// cap. With Supabase configured the counts live in the `ai_usage` table, so they hold across
// serverless instances; without it they are kept in memory (fine for local runs).
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ApiError } from "./advisor/api";

export type LimitedRoute = "chat" | "guide" | "cad" | "arm";

/** Calls per visitor per hour. Override with AI_LIMIT_CHAT, AI_LIMIT_GUIDE, ... */
const PER_HOUR: Record<LimitedRoute, number> = { chat: 40, guide: 6, cad: 30, arm: 30 };
/** Calls per day for everyone together. Override with AI_DAILY_LIMIT. */
const DAILY = 1500;

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
const limitFor = (r: LimitedRoute) => num(process.env[`AI_LIMIT_${r.toUpperCase()}`], PER_HOUR[r]);
const dailyLimit = () => num(process.env.AI_DAILY_LIMIT, DAILY);

export function visitorOf(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return createHash("sha256")
    .update(`${process.env.RATE_LIMIT_SALT ?? "buildabot"}:${ip}`)
    .digest("hex")
    .slice(0, 24);
}

// ---- memory backend ----
const gl = globalThis as typeof globalThis & { __buildabotHits?: Map<string, number[]> };
const hits: Map<string, number[]> = (gl.__buildabotHits ??= new Map());
const HOUR = 3600_000;
const DAY = 24 * HOUR;
function memoryCheck(visitor: string, route: LimitedRoute, now: number): { hour: number; day: number } {
  const key = `${visitor}:${route}`;
  const mine = (hits.get(key) ?? []).filter((t) => now - t < HOUR);
  hits.set(key, mine);
  let day = 0;
  for (const [k, list] of hits) {
    const recent = list.filter((t) => now - t < DAY);
    if (recent.length !== list.length) hits.set(k, recent);
    day += recent.length;
  }
  return { hour: mine.length, day };
}
function memoryRecord(visitor: string, route: LimitedRoute, now: number) {
  const key = `${visitor}:${route}`;
  hits.set(key, [...(hits.get(key) ?? []), now]);
}

// ---- Supabase backend ----
let db: SupabaseClient | null | undefined;
const client = () => {
  if (db !== undefined) return db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  db = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return db;
};

export interface LimitResult {
  ok: boolean;
  /** Seconds until the visitor can try again, when blocked. */
  retryAfter?: number;
  body?: ApiError;
}

/** Checks the limits and, if allowed, counts this call. Never blocks because the counter itself failed. */
export async function checkLimit(req: Request, route: LimitedRoute, now = Date.now()): Promise<LimitResult> {
  const visitor = visitorOf(req);
  const c = client();
  let hour = 0;
  let day = 0;
  try {
    if (c) {
      const since = (ms: number) => new Date(now - ms).toISOString();
      const [mine, all] = await Promise.all([
        c.from("ai_usage").select("id", { count: "exact", head: true }).eq("visitor", visitor).eq("route", route).gte("created_at", since(HOUR)),
        c.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", since(DAY)),
      ]);
      hour = mine.count ?? 0;
      day = all.count ?? 0;
    } else ({ hour, day } = memoryCheck(visitor, route, now));
  } catch (err) {
    console.error("rate limit check failed", err);
    return { ok: true };
  }
  if (day >= dailyLimit()) {
    return { ok: false, retryAfter: 3600, body: { error: "daily_limit", message: "buildabot's AI helper has had a lot of visitors today and is resting. Everything else still works: the build, wiring, guide and shops. Please try the AI again tomorrow." } };
  }
  if (hour >= limitFor(route)) {
    return { ok: false, retryAfter: 900, body: { error: "rate_limited", message: "You've used the AI helper a lot in the last hour. Take a short break and try again in a few minutes; everything else still works." } };
  }
  try {
    if (c) await c.from("ai_usage").insert({ visitor, route });
    else memoryRecord(visitor, route, now);
  } catch (err) {
    console.error("rate limit record failed", err);
  }
  return { ok: true };
}

/** A 429 response for a blocked call. */
export const limited = (r: LimitResult) => Response.json(r.body, { status: 429, headers: { "retry-after": String(r.retryAfter ?? 600) } });

/** Test hook: forget all in-memory counts. */
export const resetMemoryLimits = () => hits.clear();
