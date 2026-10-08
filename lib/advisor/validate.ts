// Validation for request bodies coming from the browser.

import type { BuildItem, Requirements } from "../compat/types";

const AUTONOMY: Requirements["autonomy"][] = ["remote_control", "obstacle_avoidance", "mapping_navigation"];
const ENVIRONMENT: NonNullable<Requirements["environment"]>[] = ["indoor_flat", "indoor_mixed", "outdoor"];

export const isProjectId = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function parseItems(raw: unknown): BuildItem[] | null {
  if (!Array.isArray(raw) || raw.length > 60) return null;
  const items: BuildItem[] = [];
  for (const i of raw) {
    if (typeof i?.part_id !== "string" || i.part_id.length > 80 || !Number.isInteger(i?.quantity) || i.quantity < 1 || i.quantity > 20) return null;
    const reason = typeof i.reason === "string" ? i.reason.slice(0, 300) : undefined;
    items.push({ part_id: i.part_id, quantity: i.quantity, ...(reason ? { reason } : {}) });
  }
  return items;
}

export function parseRequirements(raw: unknown): Requirements | null {
  const r = raw as Partial<Requirements> | null;
  if (!r || !AUTONOMY.includes(r.autonomy as Requirements["autonomy"])) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  return {
    autonomy: r.autonomy as Requirements["autonomy"],
    ...(ENVIRONMENT.includes(r.environment as NonNullable<Requirements["environment"]>) ? { environment: r.environment } : {}),
    ...(num(r.payload_kg) !== undefined ? { payload_kg: num(r.payload_kg) } : {}),
    ...(num(r.budget_usd) !== undefined ? { budget_usd: num(r.budget_usd) } : {}),
    ...(num(r.min_runtime_min) !== undefined ? { min_runtime_min: num(r.min_runtime_min) } : {}),
  };
}
