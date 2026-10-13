// Swapping a part: re-plan the parts that depend on it so the build stays compatible.
import { checkBuild } from "./compat/checkBuild";
import type { BuildItem, BuildReport, Part, Slot } from "./compat/types";
import { type Answers, requirementsFrom } from "./flow";
import { type Locks, normaliseBuild, reasonFor, recommend } from "./recommend";
import { findUseCase, USE_CASES } from "./flow";

/** Slots that may change automatically when the user changes the key slot. */
const DEPENDENTS: Partial<Record<Slot, Slot[]>> = {
  chassis: ["drive_motor", "wheels", "caster", "motor_driver", "battery", "regulator"],
  drive_motor: ["wheels", "motor_driver"],
  wheels: [],
  battery: ["regulator", "motor_driver"],
  compute: ["regulator", "controller"],
  controller: ["regulator"],
  motor_driver: [],
  lidar: ["compute", "regulator"],
  camera: ["compute", "regulator"],
  distance_sensor: ["regulator"],
  imu: [],
  regulator: [],
};

export interface SwapResult {
  items: BuildItem[];
  report: BuildReport;
  /** Other slots that changed to keep everything compatible. */
  changed: Slot[];
}

export function trySwap(parts: Part[], answers: Answers, current: BuildItem[], slot: Slot, partId: string | null): SwapResult {
  const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
  const requirements = requirementsFrom(answers);
  const uc = findUseCase(answers.useCase) ?? USE_CASES[0];
  const slotOf = (i: BuildItem) => byId[i.part_id]?.slot;

  if (partId === null) {
    const items = current.filter((i) => slotOf(i) !== slot);
    return { items, report: checkBuild(items, byId, requirements), changed: [] };
  }

  const free = new Set<Slot>([slot, ...(DEPENDENTS[slot] ?? [])]);
  const locks: Locks = {};
  for (const i of current) {
    const s = slotOf(i);
    if (s && !free.has(s)) locks[s] = i.part_id;
  }
  locks[slot] = partId;

  // A plan that quietly leaves out the part the user picked isn't an answer to their click.
  const keeps = (r: { items: BuildItem[] } | null) => !!r && r.items.some((i) => i.part_id === partId);
  const fitting = recommend(parts, answers, locks);
  const rec = keeps(fitting) ? fitting : null;
  const before = new Map(current.map((i) => [slotOf(i), i.part_id]));
  if (rec) {
    // Keep the user's reasons for untouched parts; explain the new ones.
    const items = rec.items.map((i) => {
      const old = current.find((c) => c.part_id === i.part_id);
      return { ...i, reason: old?.reason ?? reasonFor(byId[i.part_id], answers, uc) };
    });
    const changed = items
      .map((i) => slotOf(i)!)
      .filter((s) => s !== slot && before.get(s) !== items.find((i) => slotOf(i) === s)?.part_id);
    for (const [s] of before) if (s && s !== slot && !items.some((i) => slotOf(i) === s)) changed.push(s);
    return { items, report: rec.report, changed };
  }

  // No fully compatible plan: take the least-bad one, so the message names the real blocker.
  const closestPlan = recommend(parts, answers, locks, { allowErrors: true });
  const closest = keeps(closestPlan) ? closestPlan : null;
  if (closest) {
    const items = closest.items.map((i) => ({ ...i, reason: current.find((c) => c.part_id === i.part_id)?.reason ?? reasonFor(byId[i.part_id], answers, uc) }));
    const changed = items.map((i) => slotOf(i)!).filter((s) => s !== slot && before.get(s) !== items.find((i) => slotOf(i) === s)?.part_id);
    return { items, report: closest.report, changed };
  }

  // Nothing at all: apply the raw swap so the user sees why.
  const raw = normaliseBuild(
    [...current.filter((i) => slotOf(i) !== slot), { part_id: partId, quantity: 1, reason: reasonFor(byId[partId], answers, uc) }],
    byId,
  );
  return { items: raw, report: checkBuild(raw, byId, requirements), changed: [] };
}
