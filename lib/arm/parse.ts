// Offline task parser: pulls weights, distances, speeds and the kind of job out of a plain
// description. The /api/arm route uses Claude for this when a key is set, and falls back here.
import type { ArmTask, Motion, ObjectKind, Orientation } from "./types";

const num = (s: string) => parseFloat(s.replace(",", "."));

function grams(text: string): number | undefined {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilo(?:gram)?s?|g|grams?|gr)\b/i);
  if (!m) return undefined;
  const v = num(m[1]);
  return /^k/i.test(m[2]) ? v * 1000 : v;
}

function cm(value: string, unit: string): number {
  const v = num(value);
  return /^mm/i.test(unit) ? v / 10 : /^m$|^met/i.test(unit) ? v * 100 : v;
}

/** Distances: the first one near "reach/away/far/within/radius", else the largest one mentioned. */
function reach(text: string): number | undefined {
  const near = text.match(/(?:reach|away|far|within|radius|across|wide|distance)\D{0,20}?(\d+(?:[.,]\d+)?)\s*(cm|mm|m|met(?:er|re)s?)\b/i) ?? text.match(/(\d+(?:[.,]\d+)?)\s*(cm|mm|m|met(?:er|re)s?)\s*(?:away|reach|radius|apart|from the base)/i);
  if (near) return cm(near[1], near[2]);
  const all = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(cm|m|met(?:er|re)s?)\b/gi)].map((m) => cm(m[1], m[2]));
  return all.length ? Math.max(...all) : undefined;
}

function lift(text: string): number | undefined {
  const m = text.match(/(?:lift|high|height|stack|shelf|up)\D{0,20}?(\d+(?:[.,]\d+)?)\s*(cm|mm|m)\b/i);
  return m ? cm(m[1], m[2]) : undefined;
}

function precision(text: string): number | undefined {
  const m = text.match(/(?:±|\+\/-|within|accura\w*|precis\w*|tolerance)\D{0,12}?(\d+(?:[.,]\d+)?)\s*mm/i) ?? text.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:accura\w*|precis\w*|tolerance)/i);
  return m ? num(m[1]) : undefined;
}

function perMinute(text: string): number | undefined {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:\w+\s){0,2}?(?:per|a|an|every|\/)\s*(minute|min|hour|hr|h|second|sec|s)\b/i);
  if (!m) return undefined;
  const v = num(m[1]);
  return /^h/i.test(m[2]) ? v / 60 : /^s/i.test(m[2]) ? v * 60 : v;
}

const has = (text: string, re: RegExp) => re.test(text);

export function parseTask(description: string): Partial<ArmTask> {
  const t = description.toLowerCase();
  const out: Partial<ArmTask> = { description };

  let motion: Motion = "pick_place";
  if (has(t, /\b(draw|drawing|write|writing|plot|sketch|laser|engrav|pen)\w*/)) motion = "draw";
  else if (has(t, /\b(pour|stir|cook|liquid|cup of|coffee|tea|drink|sauce)\w*/)) motion = "pour";
  else if (has(t, /\b(assembl|screw|insert|plug|solder|fit into)\w*/)) motion = "assemble";
  else if (has(t, /\b(inspect|camera|photo|scan|check|film|picture)\w*/)) motion = "inspect";
  else if (has(t, /\b(sort|separate|by colou?r|by size|recycl)\w*/)) motion = "sort";
  out.motion = motion;

  let object: ObjectKind = "rigid";
  if (has(t, /\b(fruit|egg|tomato|food|bread|soft|fragile|plant|flower|cake|strawberr|grape)\w*/)) object = "soft";
  else if (has(t, /\b(card|paper|sheet|tile|phone|book|envelope|letter|wafer|plate|panel|flat)\w*/)) object = "flat";
  else if (has(t, /\b(toy|tool|sock|cloth|laundry|irregular|odd|random|mixed|lego)\w*/)) object = "irregular";
  out.object = object;

  let orientation: Orientation = "none";
  if (motion === "pour" || has(t, /\b(tilt|angle|sideways|upside|flip|any direction|hand it|hand over)\w*/)) orientation = "full";
  else if (motion === "assemble" || has(t, /\b(rotate|turn|orient|face|align|spin)\w*/)) orientation = "turn";
  out.orientation = orientation;

  const g = grams(t);
  if (g !== undefined) out.object_g = Math.max(1, Math.round(g));
  const r = reach(t);
  if (r !== undefined) out.reach_cm = Math.min(200, Math.max(5, Math.round(r)));
  const l = lift(t);
  if (l !== undefined) out.lift_cm = Math.min(150, Math.max(0, Math.round(l)));
  const p = precision(t);
  if (p !== undefined) out.precision_mm = p;
  else if (motion === "draw" || motion === "assemble") out.precision_mm = 1;
  else if (has(t, /\b(bins?|baskets?|piles?|buckets?|drop|into (?:a |the )?box(?:es)?)\b/)) out.precision_mm = 20;
  const pm = perMinute(t);
  if (pm !== undefined) out.per_minute = Math.round(pm * 10) / 10;

  if (has(t, /\b(shelf|shelves|rack|stack|cupboard|above|over the)\b/)) {
    out.flat_work = false;
    out.lift_cm ??= 30;
  }
  if (has(t, /\b(near|next to|with|around|beside)\s+(me|people|us|colleagues|workers|kids|children|staff)\b|\b(kitchen|office|classroom|shop floor)\b/)) out.near_people = true;
  if (has(t, /\b(all day|24\/7|production|factory|shift|every day|daily|warehouse|line)\b/)) out.hours_per_day = 8;
  const hours = t.match(/(\d+)\s*hours?\s*(?:a|per)\s*day/);
  if (hours) out.hours_per_day = Math.min(24, parseInt(hours[1], 10));
  return out;
}

const MOTIONS: Motion[] = ["pick_place", "sort", "draw", "inspect", "pour", "assemble"];
const OBJECTS: ObjectKind[] = ["rigid", "flat", "soft", "irregular"];
const ORIENTS: Orientation[] = ["none", "turn", "full"];

/** Keeps only valid, in-range fields from untrusted input (the AI route or saved state). */
export function cleanTask(raw: unknown): Partial<ArmTask> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out: Partial<ArmTask> = {};
  const n = (k: keyof ArmTask, lo: number, hi: number) => {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) (out as Record<string, number>)[k] = Math.min(hi, Math.max(lo, v));
  };
  n("object_g", 1, 50000);
  n("reach_cm", 5, 300);
  n("lift_cm", 0, 200);
  n("precision_mm", 0.01, 100);
  n("per_minute", 0.05, 600);
  n("hours_per_day", 0, 24);
  if (MOTIONS.includes(r.motion as Motion)) out.motion = r.motion as Motion;
  if (OBJECTS.includes(r.object as ObjectKind)) out.object = r.object as ObjectKind;
  if (ORIENTS.includes(r.orientation as Orientation)) out.orientation = r.orientation as Orientation;
  if (typeof r.flat_work === "boolean") out.flat_work = r.flat_work;
  if (typeof r.near_people === "boolean") out.near_people = r.near_people;
  if (typeof r.description === "string") out.description = r.description.slice(0, 1000);
  return out;
}
