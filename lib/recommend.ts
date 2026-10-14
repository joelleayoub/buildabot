// Deterministic recommender: answers → the best compatible build.
// Enumerates sensible combinations per slot, runs checkBuild on each, and scores the survivors.
import { checkBuild } from "./compat/checkBuild";
import type { BuildItem, BuildReport, Part, Requirements, Slot } from "./compat/types";
import { type Answers, type UseCase, requirementsFrom, findUseCase, USE_CASES } from "./flow";

export type Locks = Partial<Record<Slot, string>>;

export interface Recommendation {
  items: BuildItem[];
  report: BuildReport;
  requirements: Requirements;
}

const WARNING_COST: Record<string, number> = {
  OVER_BUDGET: 250,
  LOW_TORQUE: 130,
  SHORT_RUNTIME: 45,
  NEAR_PAYLOAD: 30,
  MOTOR_OVERVOLTAGE: 30,
  MOTOR_UNDERVOLTAGE: 40,
  TT_OUTDOOR: 120,
  REG_PEAK_MARGIN: 35,
  BATTERY_PEAK: 10,
  DRIVER_STALL_MARGIN: 6,
  DRIVER_VOLTAGE_DROP: 40,
  SENSOR_5V_SIGNAL: 8,
  NAV_NO_MICROCONTROLLER: 60,
  USB_PORTS: 20,
  NO_WIRELESS: 300,
};

function cartesian<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap((a) => list.map((x) => [...a, x])), [[]]);
}

export function quantityFor(part: Part, chassis: Part | undefined): number {
  const mounts = chassis?.compat.motor_mounts ?? 2;
  if (part.slot === "drive_motor") return mounts;
  if (part.slot === "wheels") return Math.ceil(mounts / part.pack_size);
  return 1;
}

/** Re-derive quantities and dependent slots (wheels, caster) after a chassis or motor change. */
export function normaliseBuild(items: BuildItem[], byId: Record<string, Part>): BuildItem[] {
  const chassis = items.map((i) => byId[i.part_id]).find((p) => p?.slot === "chassis");
  return items.map((i) => {
    const p = byId[i.part_id];
    return p ? { ...i, quantity: quantityFor(p, chassis) } : i;
  });
}

function score(report: BuildReport, items: BuildItem[], byId: Record<string, Part>, a: Answers, uc: UseCase): number {
  let s = report.totals.price_usd_approx;
  for (const i of report.issues) if (i.severity === "warning") s += WARNING_COST[i.code] ?? 15;
  const parts = items.map((i) => byId[i.part_id]);
  for (const p of parts) {
    if (p.tags.includes("recommended")) s -= 6;
    if (a.experience === "first" && p.compat.chemistry === "LiPo") s += 70;
    if (a.experience === "first" && p.tags.includes("legacy")) s += 15;
    if (!uc.needsCompute && uc.id === "drive" && p.slot === "controller" && p.tags.includes("wifi")) s -= 25;
  }
  const chassis = parts.find((p) => p.slot === "chassis");
  const wheelDia = parts.find((p) => p.slot === "wheels")?.compat.wheel_diameter_mm ?? 65;
  if (a.environment === "indoor_mixed" && chassis?.compat.motor_mounts === 2 && wheelDia < 90) s += 40;
  if (a.environment === "outdoor" && parts.some((p) => p.slot === "caster" || p.compat.includes_caster)) s += 60;
  if (a.environment === "outdoor" && wheelDia < 90) s += 40;
  // Encoders make even simple bots easier to drive straight; small nudge for avoid/drive.
  return s;
}

/**
 * Best build for the answers. With `allowErrors`, returns the least-bad plan even if nothing is
 * fully compatible, so the UI can show the real blocker (for example a chassis that can't carry the load).
 */
export function recommend(parts: Part[], answers: Answers, locks: Locks = {}, opts: { allowErrors?: boolean } = {}): Recommendation | null {
  const uc = findUseCase(answers.useCase) ?? USE_CASES[0];
  const requirements = requirementsFrom(answers);
  const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
  const inSlot = (slot: Slot) => {
    if (locks[slot] && byId[locks[slot]!]) return [byId[locks[slot]!]];
    return parts.filter((p) => p.slot === slot);
  };

  const chassisList = inSlot("chassis");
  const drivers = inSlot("motor_driver");
  const batteries = inSlot("battery");
  const controllers: (Part | null)[] = [...inSlot("controller"), ...(locks.controller ? [] : [null])];

  const regulators: (Part | null)[] = [...inSlot("regulator"), ...(locks.regulator ? [] : [null])];
  const sensorSlots = Object.keys(uc.sensors) as Slot[];
  const sensorChoices = sensorSlots.map((slot) =>
    locks[slot] ? [byId[locks[slot]!]] : uc.sensors[slot]!.map((id) => byId[id]).filter(Boolean),
  );
  // Extra locked sensors from a reference design that the use case doesn't need are kept as-is.
  const extraLocked = (["lidar", "camera", "imu", "distance_sensor"] as Slot[])
    .filter((s) => locks[s] && !sensorSlots.includes(s))
    .map((s) => byId[locks[s]!]);

  const lockedNeedsComputer = [...sensorChoices.flat(), ...extraLocked].some((p) => p && (p.compat.interface === "usb" || p.compat.interface === "csi"));
  const computes: (Part | null)[] = locks.compute
    ? inSlot("compute")
    : uc.needsCompute
      ? inSlot("compute").filter((p) => p.compat.ros2)
      : lockedNeedsComputer ? inSlot("compute") : [null];

  let best: { s: number; rec: Recommendation } | null = null;

  for (const chassis of chassisList) {
    const motors = inSlot("drive_motor").filter((m) => m.compat.motor_form_factor === chassis.compat.motor_form_factor);
    for (const motor of motors) {
      // Kit wheels are used unless the user picked other wheels on purpose.
      const wheelOptions: (Part | null)[] = chassis.compat.includes_wheels && !locks.wheels
        ? [null]
        : inSlot("wheels").filter((w) => w.compat.wheel_shaft === motor.compat.shaft);
      if (!wheelOptions.length) continue;
      const needsCaster = chassis.compat.motor_mounts === 2 && !chassis.compat.includes_caster;
      const caster = locks.caster && byId[locks.caster] ? byId[locks.caster] : needsCaster ? byId["caster-ball-metal"] : null;
      if (uc.autonomy === "mapping_navigation" && !motor.compat.has_encoder) continue;

      for (const combo of cartesian<Part | null>([wheelOptions, drivers, batteries, controllers, computes, regulators, ...sensorChoices])) {
        const chosen = [chassis, motor, caster, ...combo, ...extraLocked].filter(Boolean) as Part[];
        const items: BuildItem[] = chosen.map((p) => ({ part_id: p.id, quantity: quantityFor(p, chassis) }));
        const report = checkBuild(items, byId, requirements);
        if (!report.ok && !opts.allowErrors) continue;
        const s = score(report, items, byId, answers, uc) + report.issues.filter((i) => i.severity === "error").length * 10000;
        if (!best || s < best.s) best = { s, rec: { items, report, requirements } };
      }
    }
  }
  if (!best) return null;
  best.rec.items = best.rec.items.map((i) => ({ ...i, reason: reasonFor(byId[i.part_id], answers, uc) }));
  return best.rec;
}

/** Plain-language reason a part was picked, tied to the user's answers. */
export function reasonFor(p: Part, a: Answers, uc: UseCase): string {
  const c = p.compat;
  switch (p.slot) {
    case "chassis":
      if (a.environment === "outdoor") return "Stiff metal frame that copes with uneven ground.";
      if (c.motor_mounts === 4) return "Four driven wheels grip rug edges and thresholds.";
      if (c.motor_form_factor === "37D") return "Two decks: motors and battery below, computer and lidar on top.";
      return "Cheapest way to get rolling on flat floors; wheels and caster included.";
    case "drive_motor":
      if (c.has_encoder) return `Built-in encoders measure distance, so it ${uc.autonomy === "mapping_navigation" ? "knows where it is on the map" : "drives straight"}.`;
      return "Simple, cheap gearmotors. Plenty for a light indoor bot.";
    case "wheels":
      return `${c.wheel_diameter_mm} mm rubber wheels that fit the ${c.wheel_shaft} motor shafts.`;
    case "caster":
      return "Third point of contact so the two-wheel base doesn't tip.";
    case "motor_driver":
      return `Handles ${c.continuous_a_per_channel} A per motor with headroom, and runs cool.`;
    case "controller":
      if (uc.needsCompute) return "Handles motors and encoders in real time while the computer does the thinking.";
      if (p.tags.includes("wifi")) return "Built-in Wi-Fi and Bluetooth, so you can drive it from your phone.";
      return "Huge tutorial library; the easiest board to start coding on.";
    case "compute":
      return p.tags.includes("ai-vision") ? "GPU for running vision models on the robot." : "Runs ROS 2 for mapping and navigation.";
    case "battery":
      if (c.chemistry === "NiMH") return "Rechargeable AA cells: the safest option for a first build.";
      if (c.chemistry === "Li-ion") return "Protected Li-ion pack: long runtime and charges with a simple charger.";
      return "Light, high-current LiPo pack. Needs a balance charger.";
    case "regulator":
      return `Clean 5 V for the electronics, up to ${c.output_a} A.`;
    case "lidar":
      return "Spins 360° and measures distances to draw the map.";
    case "camera":
      return p.tags.includes("ai-vision") ? "Depth camera that recognises people on-board, no GPU needed." : "Lets you see what the robot sees.";
    case "distance_sensor":
      return p.compat.interface === "i2c" ? "Laser distance sensor; accurate up close and over edges." : "Classic ultrasonic eyes: spots walls and furniture up to 4 m away.";
    case "imu":
      return "Tracks turns precisely, which keeps the map from drifting.";
  }
}
