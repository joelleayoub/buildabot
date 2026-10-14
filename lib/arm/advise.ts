// Deterministic arm sizing. Physics is deliberately simple and conservative: every gravity joint
// is checked with the arm stretched out flat (the worst case), and motors are only allowed to use
// part of their rated torque so they don't overheat holding a load.
import partsData from "@/data/arm_parts.json";
import designsData from "@/data/arm_designs.json";
import type { ArmDesign, ArmGeometry, ArmPart, ArmPlan, ArmTask, Family, FamilyPlan, JointSize, JointStatus, MachineOption, MachineType, Verdict } from "./types";

export const ARM_PARTS = partsData as ArmPart[];
export const ARM_DESIGNS = designsData as ArmDesign[];
export const ARM_PARTS_BY_ID: Record<string, ArmPart> = Object.fromEntries(ARM_PARTS.map((p) => [p.id, p]));

const G = 9.81;
/** Extra torque for speeding up, slowing down and friction, on top of holding the load still. */
export const DYNAMIC_FACTOR = 1.25;
/** Hobby and bus servos: hold at most half the stall torque, or they overheat. */
export const SERVO_USABLE = 0.5;
/** Steppers lose torque as they speed up; count on 60% of holding torque at arm speeds, and 85% gearbox efficiency. */
export const STEPPER_USABLE = 0.6;
const GEAR_EFFICIENCY = 0.85;

export const DEFAULT_TASK: ArmTask = {
  description: "",
  motion: "pick_place",
  object_g: 200,
  object: "rigid",
  reach_cm: 30,
  lift_cm: 10,
  precision_mm: 10,
  per_minute: 4,
  orientation: "none",
  flat_work: true,
  near_people: false,
  hours_per_day: 1,
};

export const MACHINE_NAMES: Record<MachineType, string> = {
  articulated: "Jointed arm",
  scara: "SCARA arm",
  gantry: "Gantry (XYZ frame)",
  delta: "Delta robot",
};

const MACHINE_NOUN: Record<MachineType, string> = { articulated: "jointed arm", scara: "SCARA arm", gantry: "gantry", delta: "delta robot" };

export const MACHINE_EXPLAIN: Record<MachineType, string> = {
  articulated: "Like a human arm: a turning base, a shoulder, an elbow and a wrist. Reaches over and around things and can tilt what it holds.",
  scara: "Two arm segments that swing flat over the table, plus an up and down axis. Fast and stiff for picking things off one surface and putting them on another.",
  gantry: "A rectangular frame with rails in X, Y and Z, like a 3D printer or a plotter. The most precise and the easiest to build, but it only covers the box inside its frame.",
  delta: "Three light arms hanging from a triangle above the work, joined at the tool. Very fast for picking light things, but hard to build and tune.",
};

const FAMILY_LABEL: Record<Family, string> = {
  pwm: "Hobby servos",
  feetech: "Bus servos (Feetech)",
  dynamixel: "Smart servos (Dynamixel)",
  stepper: "Steppers with gearboxes",
};

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------- machine type

export function rankMachines(t: ArmTask): MachineOption[] {
  const opts: MachineOption[] = [];
  const add = (type: MachineType, base: number, rules: [boolean, number, string][], dof: number) => {
    let score = base;
    const pros: string[] = [];
    const cons: string[] = [];
    for (const [when, pts, why] of rules) {
      if (!when) continue;
      score += pts;
      (pts > 0 ? pros : cons).push(why);
    }
    opts.push({ type, name: MACHINE_NAMES[type], score, dof, pros, cons });
  };
  const turn = t.orientation !== "none" ? 1 : 0;

  add("articulated", 50, [
    [t.orientation === "full", 40, "It can tilt and turn the object to any angle, which this task needs."],
    [t.orientation === "turn", 10, "A wrist joint can spin the object."],
    [!t.flat_work, 15, "It can reach up onto shelves and over obstacles."],
    [t.lift_cm > 20, 10, "It lifts high without a tall frame."],
    [t.motion === "pour" || t.motion === "assemble", 15, "Pouring and assembly need a wrist that moves like a hand."],
    [t.reach_cm > 60, -15, "Long home-built arms bend and wobble; the motors get big fast."],
    [t.precision_mm < 1, -15, "Every joint adds a little play, so sub-millimetre placing is hard."],
    [t.per_minute > 20, -10, "Hobby arm joints are slow over long moves."],
  ], t.orientation === "full" ? 6 : t.orientation === "turn" ? 5 : 4);

  add("scara", 40, [
    [t.flat_work, 25, "Everything happens on one surface, which is exactly what a SCARA covers."],
    [t.orientation !== "full", 10, "Picking straight down is all it needs."],
    [t.per_minute >= 10, 10, "Flat swings are quick, so it keeps up with many picks a minute."],
    [t.precision_mm <= 2, 10, "It is stiff in the vertical direction, so it places precisely."],
    [t.orientation === "full", -60, "It can't tilt objects, only spin them."],
    [!t.flat_work, -25, "It can't reach up onto shelves or over things."],
    [t.lift_cm > 25, -20, "Its up and down travel is short."],
  ], 4);

  add("gantry", 35, [
    [t.motion === "draw", 45, "Drawing, writing and laser work are what XYZ frames do best."],
    [t.motion === "inspect", 15, "Moving a camera over a grid is simple on a frame."],
    [t.precision_mm <= 1, 25, "Rails and belts give the best precision for the money."],
    [t.flat_work, 15, "It covers a flat working area evenly."],
    [t.reach_cm > 50, 10, "A big area just means longer rails, not stronger motors."],
    [true, 10, "It's the easiest to build: it's a 3D printer frame with a tool instead of a nozzle."],
    [t.orientation === "full", -60, "It can't tilt the tool."],
    [!t.flat_work, -30, "It only works inside its own frame."],
    [t.per_minute > 30, -10, "Moving the whole gantry is slower than a light arm."],
  ], 3 + turn);

  add("delta", 15, [
    [t.object_g <= 100, 15, "Its arms are light, which suits small objects."],
    [t.per_minute >= 30, 40, "Nothing beats a delta for many fast, light picks."],
    [t.flat_work, 10, "It works over one flat area."],
    [t.object_g > 300, -40, "It's built for light objects; heavier ones make it wobble."],
    [t.orientation === "full", -60, "It can't tilt objects."],
    [t.lift_cm > 10, -20, "Its up and down travel is small."],
    [true, -10, "Hard to build and calibrate for a first robot."],
  ], 3 + turn);

  return opts.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------- gripper and geometry

export function pickGripper(t: ArmTask): ArmPart {
  // Drawing, engraving and filming hold a tool, not an object.
  if (t.motion === "draw" || t.motion === "inspect") return ARM_PARTS_BY_ID["tool-holder-printed"];
  const grippers = ARM_PARTS.filter((p) => p.kind === "gripper" && p.grips!.length > 0);
  // Suction can't hold things that get tilted sideways.
  const right = grippers.filter((g) => g.grips!.includes(t.object) && (g.id !== "grip-suction" || t.orientation !== "full"));
  const pool = right.length ? right : grippers;
  const fits = pool.filter((g) => g.max_object_g! >= t.object_g * 1.2);
  if (fits.length) return fits.sort((a, b) => a.price_usd_approx - b.price_usd_approx || a.mass_g - b.mass_g)[0];
  return pool.sort((a, b) => b.max_object_g! - a.max_object_g!)[0];
}

export function armGeometry(t: ArmTask, gripper: ArmPart): ArmGeometry {
  const R = t.reach_cm / 100;
  const tool = gripper.length_cm! / 100 + 0.04;
  const base_h = Math.min(0.2, Math.max(0.07, 0.25 * R));
  // Far point on the table with the tool pointing down, and a high point at 70% reach.
  const far = Math.hypot(R, tool - base_h);
  const high = Math.hypot(0.7 * R, t.lift_cm / 100 + tool - base_h);
  const span = 1.08 * Math.max(far, high);
  return { base_h: round(base_h, 3), upper: round(0.52 * span, 3), fore: round(0.48 * span, 3), tool: round(tool, 3) };
}

// ---------------------------------------------------------------- joint sizing

const familyOf = (p: ArmPart): Family | null => {
  if (p.kind !== "motor") return null;
  if (p.family === "pwm") return "pwm";
  if (p.family === "stepper") return "stepper";
  return p.id.startsWith("dxl-") ? "dynamixel" : "feetech";
};

export function usableTorque(m: ArmPart): number {
  if (m.family === "stepper") {
    const t = m.holding_nm! * STEPPER_USABLE * m.ratio! * (m.ratio! > 1 ? GEAR_EFFICIENCY : 1);
    return m.gear_cap_nm ? Math.min(t, m.gear_cap_nm * 0.8) : t;
  }
  return m.stall_nm! * SERVO_USABLE;
}

const statusOf = (margin: number): JointStatus => (margin >= 1.2 ? "ok" : margin >= 1 ? "tight" : "over");

/** Cheapest motor of the family that is fast enough and has a comfortable margin, else a tight
 * one, else the strongest. */
function chooseMotor(family: Family, required: number, dps: number): { motor: ArmPart; usable: number } {
  const all = ARM_PARTS.filter((p) => familyOf(p) === family && (!p.machines || p.machines.includes("articulated"))).map((m) => ({ motor: m, usable: usableTorque(m) }));
  const fast = all.filter((x) => x.motor.max_dps! >= dps * 0.8);
  const motors = fast.some((x) => x.usable >= required) ? fast : all;
  const byPrice = [...motors].sort((a, b) => a.motor.price_usd_approx - b.motor.price_usd_approx || a.motor.mass_g - b.motor.mass_g);
  return byPrice.find((x) => x.usable >= required * 1.2) ?? byPrice.find((x) => x.usable >= required) ?? motors.sort((a, b) => b.usable - a.usable)[0];
}

interface Mass {
  kg: number;
  /** Horizontal distance from the shoulder axis with the arm stretched out (m). */
  x: number;
}

const torqueAbout = (masses: Mass[], at: number) => G * masses.filter((m) => m.x > at).reduce((s, m) => s + m.kg * (m.x - at), 0);

export function sizeFamily(t: ArmTask, family: Family, geo: ArmGeometry, gripper: ArmPart): FamilyPlan {
  const { upper: L1, fore: L2, tool: Lt } = geo;
  const dof = t.orientation === "full" ? 6 : t.orientation === "turn" ? 5 : 4;
  // Printed or aluminium links, heavier for the bigger stepper joints; plus brackets and bearings.
  const linkKgPerM = family === "stepper" ? 0.6 : family === "pwm" ? 0.25 : 0.3;
  const bracketKg = family === "stepper" ? 0.1 : 0.02;
  const toolOut = t.orientation === "none" ? 0 : Lt; // tool held sideways is the worst case for tilting tasks
  const tip = L1 + L2 + toolOut;
  const masses: Mass[] = [
    { kg: t.object_g / 1000, x: tip },
    { kg: gripper.mass_g / 1000, x: L1 + L2 + toolOut / 2 },
    { kg: linkKgPerM * Lt, x: L1 + L2 + toolOut / 2 },
    { kg: linkKgPerM * L2 + bracketKg, x: L1 + L2 / 2 },
    { kg: linkKgPerM * L1 + bracketKg, x: L1 / 2 },
  ];
  const joints: JointSize[] = [];
  const cycle = 60 / Math.max(0.1, t.per_minute);
  const moveS = Math.max(0.3, cycle / 4); // go there, down and up, come back, down and up
  const needed_dps = Math.round((2 * 90) / moveS);
  // Stepper arms mount the heavy motors close to the shoulder and drive the joints with belts,
  // so their weight barely loads the arm. Servos sit right on their joints.
  const belted = family === "stepper";
  const push = (name: string, role: string, axis: JointSize["axis"], required: number, x: number) => {
    const { motor, usable } = chooseMotor(family, required, needed_dps);
    const margin = usable / required;
    joints.push({ name, role, axis, required_nm: round(required), motor, usable_nm: round(usable), margin: round(margin), status: statusOf(margin) });
    masses.push({ kg: motor.mass_g / 1000 + bracketKg, x });
  };

  // Tip to base, so each motor's own weight counts on the joints behind it.
  if (dof >= 5) push("Wrist roll", "Spins the gripper", "roll", 0.15, belted ? L1 + 0.06 : L1 + L2 + 0.03);
  push("Wrist", "Tilts the gripper up and down", "pitch", Math.max(0.1, torqueAbout(masses, L1 + L2) * DYNAMIC_FACTOR), belted ? L1 + 0.04 : L1 + L2);
  if (dof >= 6) push("Forearm roll", "Twists the forearm so the wrist can face any way", "roll", Math.max(0.2, 0.25 * torqueAbout(masses, L1 + L2) * DYNAMIC_FACTOR), L1 + 0.05);
  push("Elbow", "Bends the arm in the middle", "pitch", torqueAbout(masses, L1) * DYNAMIC_FACTOR, belted ? 0.04 : L1);
  push("Shoulder", "Lifts the whole arm", "pitch", torqueAbout(masses, 0) * DYNAMIC_FACTOR, 0);

  // Base: no gravity on a vertical axis (a turntable bearing carries the weight), only inertia.
  const theta = Math.PI / 2;
  const alpha = (4 * theta) / (moveS * moveS);
  const inertia = masses.reduce((s, m) => s + m.kg * m.x * m.x, 0);
  push("Base", "Turns the whole arm left and right", "yaw", Math.max(0.15, inertia * alpha * DYNAMIC_FACTOR + 0.05), 0);
  joints.reverse(); // base first, for display

  // Repeatability at the tip: each joint's play times its distance to the tip.
  const reachTo: Record<string, number> = { Base: L1 + L2 + Lt, Shoulder: L1 + L2 + Lt, Elbow: L2 + Lt, Wrist: Lt, "Forearm roll": 0.02, "Wrist roll": 0.01 };
  const tip_error_mm = round(1000 * Math.sqrt(joints.reduce((s, j) => s + ((j.motor.backlash_deg! * Math.PI) / 180 * reachTo[j.name]) ** 2, 0)), 1);
  const slowest = Math.min(...joints.map((j) => j.motor.max_dps!));
  const speed_ok = slowest >= needed_dps * 0.8;

  // ---- parts list ----
  const parts: FamilyPlan["parts"] = [];
  const addPart = (id: string, qty: number, why: string) => {
    const part = ARM_PARTS_BY_ID[id];
    const existing = parts.find((x) => x.part.id === id);
    if (existing) existing.qty += qty;
    else parts.push({ part, qty, why });
  };
  for (const j of joints) {
    const existing = parts.find((x) => x.part.id === j.motor.id);
    if (existing) {
      existing.qty += 1;
      existing.why += `, ${j.name.toLowerCase()}`;
    } else parts.push({ part: j.motor, qty: 1, why: `Joint: ${j.name.toLowerCase()}` });
  }
  addPart(gripper.id, 1, "Holds the object");
  const n = joints.length;
  if (family === "pwm") {
    addPart("ctrl-pca9685", 1, "Drives all the servos");
    addPart("ctrl-esp32-arm", 1, "Runs the arm program");
    addPart("psu-6v-10a", 1, "Servo power");
  } else if (family === "feetech") {
    addPart("ctrl-bus-servo-board", 1, "Connects the servo bus to your computer");
    addPart("psu-12v-5a", 1, "Servo power");
  } else if (family === "dynamixel") {
    addPart("ctrl-u2d2", 1, "Connects the servos to your computer");
    addPart("psu-12v-5a", 1, "Servo power");
  } else {
    addPart("ctrl-teensy-arm", 1, "Sends step pulses to every joint");
    const n23 = joints.filter((j) => j.motor.id.includes("nema23")).length;
    if (n - n23) addPart("drv-tmc2209", n - n23, "One driver per NEMA 17");
    if (n23) addPart("drv-dm542", n23, "One driver per NEMA 23");
    addPart("sw-limit", n, "Lets each joint find its zero at power-on");
    addPart("psu-24v-10a", 1, "Motor power");
  }
  addPart("mech-lazy-susan", 1, "Carries the arm on the base");
  addPart("mech-estop", 1, "Cuts motor power instantly");
  const structure = 25 + 8 * n; // filament, bolts, bearings, wires: a rough allowance
  const cost_usd = Math.round(parts.reduce((s, p) => s + p.part.price_usd_approx * p.qty, 0) + structure);
  const mass_kg = round(masses.reduce((s, m) => s + m.kg, 0) - t.object_g / 1000, 2);

  const problems: string[] = [];
  for (const j of joints) if (j.status === "over") problems.push(`${j.name}: needs ${j.required_nm} N·m, the strongest motor here gives ${j.usable_nm} N·m.`);
  if (tip_error_mm > t.precision_mm) problems.push(`Placing accuracy is about ±${tip_error_mm} mm; the task needs ±${t.precision_mm} mm.`);
  if (!speed_ok) problems.push(`Too slow: the moves need about ${needed_dps}°/s and the slowest joint does ${slowest}°/s.`);
  return { family, label: FAMILY_LABEL[family], machine: "articulated", joints, tip_error_mm, speed_ok, needed_dps, parts, cost_usd, mass_kg, feasible: problems.length === 0, problems };
}

// ---------------------------------------------------------------- build or buy

function judge(t: ArmTask, chosen: FamilyPlan | null, top: MachineType): { verdict: Verdict; reasons: string[] } {
  const buy: string[] = [];
  const care: string[] = [];
  if (t.object_g > 2000) buy.push("Over 2 kg is more than home-built arms carry reliably.");
  if (t.reach_cm > 80) buy.push("Over 80 cm of reach makes a home-built arm bend and drift.");
  if (t.precision_mm < 0.2) buy.push("Placing within 0.2 mm needs industrial gearboxes and calibration.");
  if (t.near_people && t.hours_per_day >= 4) buy.push("Working next to people for hours needs an arm that senses collisions and stops (a cobot). Home-built arms don't.");
  if (!chosen && top !== "delta") buy.push("None of the motor options can do this task safely.");
  if (t.hours_per_day >= 8) (chosen?.family === "pwm" ? buy : care).push("All-day use wears out hobby gears; plan spare motors and regular checks.");
  if (t.near_people && t.hours_per_day < 4) care.push("People will be nearby: keep it slow, put the emergency stop within reach, and never lean into its reach while it runs.");
  if (chosen?.joints.some((j) => j.status === "tight")) care.push("Some joints are close to their limit. Keep the object at or under the weight you entered.");
  if (buy.length) return { verdict: "buy", reasons: [...buy, "A ready-made cobot or industrial arm (for example from Universal Robots, UFACTORY or igus) is the safer choice. Ask a supplier for a quote."] };
  if (care.length) return { verdict: "diy_with_care", reasons: care };
  return { verdict: "diy", reasons: ["Well within what a home-built machine can do."] };
}

// ---------------------------------------------------------------- SCARA and gantry

const PULLEY_R = 0.00637; // GT2 20-tooth pulley pitch radius (m)
const LEAD = 0.008; // T8 lead screw: 8 mm per turn
const SCREW_EFF = 0.3; // trapezoidal lead screw efficiency

function moveTime(t: ArmTask) {
  return Math.max(0.3, 60 / Math.max(0.1, t.per_minute) / 4);
}

/** Torque a belt axis needs to move `kg` across `dist` m in `secs` (triangular speed profile), with friction and margin. */
const beltTorque = (kg: number, dist: number, secs: number) => kg * ((4 * dist) / (secs * secs) + 0.1 * G) * DYNAMIC_FACTOR * PULLEY_R;
const beltDps = (dist: number, secs: number) => Math.round(((2 * dist) / secs / (2 * Math.PI * PULLEY_R)) * 360);
const screwTorque = (kg: number, dist: number, secs: number) => (kg * (G + (4 * dist) / (secs * secs)) * DYNAMIC_FACTOR * LEAD) / (2 * Math.PI * SCREW_EFF);
const screwDps = (dist: number, secs: number) => Math.round(((2 * dist) / secs / LEAD) * 360);

function machineJoint(name: string, role: string, axis: JointSize["axis"], required: number, motorId: string): JointSize {
  const motor = ARM_PARTS_BY_ID[motorId];
  const usable = usableTorque(motor);
  const margin = usable / required;
  return { name, role, axis, required_nm: round(required, 3), motor, usable_nm: round(usable), margin: round(margin), status: statusOf(margin) };
}

/** Above these, printed home-built frames bend and lose accuracy, whatever the motors can do. */
const MAX_PAYLOAD_G: Partial<Record<MachineType, number>> = { scara: 1000, gantry: 3000 };

function finishPlan(t: ArmTask, machine: MachineType, label: string, joints: JointSize[], needed_dps: number[], tip_error_mm: number, extras: [string, number, string][], massKg: number): FamilyPlan {
  const parts: FamilyPlan["parts"] = [];
  const add = (id: string, qty: number, why: string) => {
    const part = ARM_PARTS_BY_ID[id];
    const existing = parts.find((x) => x.part.id === id);
    if (existing) {
      existing.qty += qty;
      existing.why += `, ${why.toLowerCase()}`;
    } else parts.push({ part, qty, why });
  };
  for (const j of joints) add(j.motor.id, 1, `Axis: ${j.name.toLowerCase()}`);
  for (const [id, qty, why] of extras) add(id, qty, why);
  const cost_usd = Math.round(parts.reduce((s, p) => s + p.part.price_usd_approx * p.qty, 0) + 20);
  const slow = joints.map((j, i) => j.motor.max_dps! / Math.max(1, needed_dps[i]));
  const speed_ok = slow.every((r) => r >= 0.8);
  const problems: string[] = [];
  for (const j of joints) if (j.status === "over") problems.push(`${j.name}: needs ${j.required_nm} N·m, the motor gives ${j.usable_nm} N·m.`);
  if (tip_error_mm > t.precision_mm) problems.push(`Placing accuracy is about ±${tip_error_mm} mm; the task needs ±${t.precision_mm} mm.`);
  if (!speed_ok) problems.push(`Too fast for these motors: the moves need about ${Math.max(...needed_dps)}°/s at the motor.`);
  const maxG = MAX_PAYLOAD_G[machine];
  if (maxG && t.object_g > maxG) problems.push(`A home-built ${MACHINE_NOUN[machine]} bends under more than about ${maxG / 1000} kg.`);
  return { family: "stepper", label, machine, joints, tip_error_mm, speed_ok, needed_dps: Math.max(...needed_dps), parts, cost_usd, mass_kg: round(massKg, 2), feasible: problems.length === 0, problems };
}

/** XYZ gantry: belt-driven X and Y (two Y motors on wide frames), lead screw Z. */
export function sizeGantry(t: ArmTask): FamilyPlan {
  const tool = pickGripper(t);
  const side = Math.max(0.15, t.reach_cm / 100);
  // Each pick lifts a few centimetres; the full height is only for reaching the top of the work.
  const zTravel = Math.min(0.05, Math.max(0.02, t.lift_cm / 100 + 0.02));
  const secs = moveTime(t);
  const payload = (t.object_g + tool.mass_g) / 1000;
  const mz = payload + 0.15; // tool plate
  const mx = mz + 0.35 + 0.2 + 0.3; // Z motor, lead screw and carriage ride on X
  const my = mx + 0.6 * side + 0.35; // the X beam and its motor ride on Y
  const dualY = side > 0.35;
  const joints = [
    machineJoint("X axis", "Moves the tool left and right", "linear", beltTorque(mx, side, secs), "stepper-nema17"),
    machineJoint(dualY ? "Y axis (each of 2 motors)" : "Y axis", "Moves the whole beam back and forth", "linear", beltTorque(my, side, secs) / (dualY ? 2 : 1), "stepper-nema17"),
    machineJoint("Z axis", t.motion === "draw" ? "Lowers and lifts the pen or tool" : "Lowers and lifts the tool", "linear", screwTorque(mz, zTravel, secs), "stepper-nema17"),
  ];
  const dps = [beltDps(side, secs), beltDps(side, secs), screwDps(zTravel, secs)];
  if (t.orientation !== "none") {
    joints.push({ ...machineJoint("Tool turn", "Spins the tool", "roll", 0.1, "servo-mg996r") });
    dps.push(90);
  }
  const extras: [string, number, string][] = [
    [tool.id, 1, t.motion === "draw" || t.motion === "inspect" ? "Holds the pen, laser or camera" : "Holds the object"],
    ["mech-vslot-frame", 1, `Frame about ${Math.round(side * 100 + 15)} cm square`],
    ["mech-gt2-kit", 1, "Belts for X and Y"],
    ["mech-t8-leadscrew", 1, "Z axis"],
    ["ctrl-cnc-shield", 1, "Runs the motors (GRBL)"],
    ["psu-12v-5a", 1, "Motor power"],
    ["sw-limit", 3, "Lets each axis find its zero"],
    ["mech-estop", 1, "Cuts motor power instantly"],
  ];
  if (t.motion === "draw") extras.push(["servo-sg90", 1, "Optional pen lift instead of moving Z"]);
  const stepperMotors = joints.filter((j) => j.motor.family === "stepper").length + (dualY ? 1 : 0);
  if (dualY) extras.push(["stepper-nema17", 1, "Second Y motor"]);
  if (stepperMotors > 4) extras.push(["drv-tmc2209", stepperMotors - 4, "Drivers beyond the shield's four"]);
  return finishPlan(t, "gantry", "Gantry with NEMA 17 steppers", joints, dps, round(Math.hypot(0.1, 0.1), 2), extras, my + 2.5);
}

/** SCARA: two arm segments swinging flat on belt-reduced steppers, a lead screw Z, an optional wrist turn. */
export function sizeScara(t: ArmTask): FamilyPlan {
  const grip = pickGripper(t);
  const R = Math.max(0.12, t.reach_cm / 100) * 1.05;
  const L1 = R * 0.5;
  const L2 = R * 0.5;
  const secs = moveTime(t);
  const theta = Math.PI / 2;
  const alpha = (4 * theta) / (secs * secs);
  const tipKg = (t.object_g + grip.mass_g) / 1000 + (t.orientation !== "none" ? 0.07 : 0);
  const link = 0.35; // kg per metre of printed arm with its bearings
  const elbowKg = 0.4 + 0.12; // J2 motor and pulleys at the elbow
  const I2 = tipKg * L2 * L2 + (link * L2 * L2 * L2) / 3;
  const I1 = tipKg * R * R + elbowKg * L1 * L1 + (link * L1 * L1 * L1) / 3 + link * L2 * ((L1 + L2 / 2) ** 2);
  const armKg = tipKg + elbowKg + link * (L1 + L2) + 0.3;
  const zTravel = Math.min(0.05, Math.max(0.02, t.lift_cm / 100 + 0.02));
  const joints = [
    machineJoint("Shoulder (J1)", "Swings the whole arm across the table", "yaw", I1 * alpha * DYNAMIC_FACTOR + 0.1, "stepper-nema17-belt4"),
    machineJoint("Elbow (J2)", "Swings the outer arm", "yaw", I2 * alpha * DYNAMIC_FACTOR + 0.05, "stepper-nema17-belt4"),
    machineJoint("Z axis", "Lifts the arm up and down", "linear", screwTorque(armKg, zTravel, secs), "stepper-nema17"),
  ];
  const jdps = Math.round((2 * 90) / secs);
  const dps = [jdps, jdps, screwDps(zTravel, secs)];
  if (t.orientation !== "none") {
    joints.push(machineJoint("Wrist turn", "Spins the gripper", "roll", 0.1, "servo-mg996r"));
    dps.push(90);
  }
  const err = Math.hypot(((0.1 * Math.PI) / 180) * R, ((0.1 * Math.PI) / 180) * L2) * 1000 + 0.2;
  const extras: [string, number, string][] = [
    [grip.id, 1, "Holds the object"],
    ["mech-belt-reduction", 2, "4:1 belts for J1 and J2"],
    ["mech-thrust-bearings", 1, "J1 and J2"],
    ["mech-t8-leadscrew", 1, "Z axis"],
    ["ctrl-cnc-shield", 1, "Runs the motors"],
    ["psu-12v-5a", 1, "Motor power"],
    ["sw-limit", 3, "Lets each axis find its zero"],
    ["mech-estop", 1, "Cuts motor power instantly"],
  ];
  return finishPlan(t, "scara", "SCARA with NEMA 17 steppers", joints, dps, round(err, 1), extras, armKg + 1.5);
}

// ---------------------------------------------------------------- what would make it work

const feasibleWith = (t: ArmTask) => {
  const g = pickGripper(t);
  const geo = armGeometry(t, g);
  return (["pwm", "feetech", "dynamixel", "stepper"] as Family[]).some((f) => sizeFamily(t, f, geo, g).feasible);
};

/** Largest value in [lo, hi] for which `ok` holds, assuming it holds at lo and is monotonic. */
function search(lo: number, hi: number, ok: (v: number) => boolean, steps = 12): number | null {
  if (!ok(lo)) return null;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** When no home-built arm can do the task, say how much lighter, shorter or less precise it would need to be. */
export function whatWouldWork(t: ArmTask): string | null {
  const ideas: string[] = [];
  const g = search(10, t.object_g, (v) => feasibleWith({ ...t, object_g: v }));
  if (g !== null && g < t.object_g * 0.97) ideas.push(`objects up to about ${g >= 100 ? Math.floor(g / 50) * 50 : Math.floor(g / 10) * 10} g`);
  const r = search(10, t.reach_cm, (v) => feasibleWith({ ...t, reach_cm: v }));
  if (r !== null && r < t.reach_cm * 0.97) ideas.push(`a reach of about ${Math.floor(r)} cm`);
  if (t.precision_mm < 20 && feasibleWith({ ...t, precision_mm: 20 })) ideas.push("placing within ±20 mm (dropping into a bin)");
  if (t.per_minute > 2 && feasibleWith({ ...t, per_minute: 2 })) ideas.push("2 moves a minute");
  if (t.orientation === "full" && feasibleWith({ ...t, orientation: "turn" })) ideas.push("not tilting the object");
  return ideas.length ? `A home-built arm could do this with ${ideas.slice(0, 3).join(", or ")}.` : null;
}

/** Same idea as whatWouldWork, for a SCARA or a gantry. */
function whatWouldWorkFor(t: ArmTask, size: (t: ArmTask) => FamilyPlan, noun: string): string | null {
  const ok = (x: ArmTask) => size(x).feasible;
  const ideas: string[] = [];
  const g = search(5, t.object_g, (v) => ok({ ...t, object_g: v }));
  if (g !== null && g < t.object_g * 0.97) ideas.push(`objects up to about ${g >= 100 ? Math.floor(g / 50) * 50 : Math.floor(g / 5) * 5} g`);
  const pm = search(0.5, t.per_minute, (v) => ok({ ...t, per_minute: v }));
  if (pm !== null && pm < t.per_minute * 0.97) ideas.push(`about ${Math.max(1, Math.floor(pm))} moves a minute`);
  const r = search(10, t.reach_cm, (v) => ok({ ...t, reach_cm: v }));
  if (r !== null && r < t.reach_cm * 0.97) ideas.push(`a reach of about ${Math.floor(r)} cm`);
  if (t.precision_mm < 2 && ok({ ...t, precision_mm: 2 })) ideas.push("placing within ±2 mm");
  return ideas.length ? `A home-built ${noun} could do this with ${ideas.slice(0, 3).join(", or ")}.` : null;
}

// ---------------------------------------------------------------- plan

export function planArm(task: Partial<ArmTask>): ArmPlan {
  const t: ArmTask = { ...DEFAULT_TASK, ...task };
  const machines = rankMachines(t);
  const gripper = pickGripper(t);
  const geometry = armGeometry(t, gripper);
  const families = (["pwm", "feetech", "dynamixel", "stepper"] as Family[]).map((f) => sizeFamily(t, f, geometry, gripper));
  // Feasible first, cheapest first; then the ones with the fewest problems.
  families.sort((a, b) => Number(b.feasible) - Number(a.feasible) || (a.feasible ? a.cost_usd - b.cost_usd : a.problems.length - b.problems.length || a.cost_usd - b.cost_usd));
  const chosen = families.find((f) => f.feasible) ?? null;
  const top = machines[0].type;
  const machinePlan = top === "gantry" ? sizeGantry(t) : top === "scara" ? sizeScara(t) : null;
  const judged = judge(t, machinePlan ? (machinePlan.feasible ? machinePlan : null) : chosen, top);
  let verdict = judged.verdict;
  const reasons = judged.reasons;
  // Some jobs are hard because of the software, not the motors.
  if (/\b(fold|laundry|cloth|towel|shirt|knot|sew)\w*/.test(t.description.toLowerCase())) {
    if (verdict === "diy") reasons.length = 0;
    reasons.unshift("Handling cloth (folding, hanging) is still a research problem: it usually needs two arms, cameras and a lot of software. The arm below can move it, but start with something rigid.");
    if (verdict === "diy") verdict = "diy_with_care";
  }
  const fam = chosen?.family === "pwm" ? "pwm" : chosen?.family === "stepper" ? "stepper" : "bus";
  const designs = [...ARM_DESIGNS]
    .map((d) => ({ d, s: (d.type === top ? 20 : d.type === machines[1].type ? 8 : d.type === "articulated" ? 3 : 0) + (d.family === fam ? 4 : 0) + (d.light === t.object_g <= 300 ? 2 : 0) + (d.difficulty === "beginner" ? 1 : 0) }))
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.d);

  const notes: string[] = [];
  if (!chosen && top === "articulated") {
    const hint = whatWouldWork(t);
    if (hint) notes.unshift(hint);
  }
  if (machinePlan && !machinePlan.feasible) {
    const hint = whatWouldWorkFor(t, top === "gantry" ? sizeGantry : sizeScara, MACHINE_NOUN[top]);
    if (hint) notes.unshift(hint);
  }
  if (top === "delta") notes.push(`Detailed sizing for a ${MACHINE_NOUN[top]} is coming next; start from its reference design. The motor sizes below are for a jointed arm.`);
  if (gripper.max_object_g! < t.object_g) notes.push(`No gripper in the catalog is rated for ${t.object_g} g of this kind of object; the strongest one is shown.`);
  if (gripper.id === "grip-suction") notes.push("Suction needs flat, smooth, clean surfaces. Test it on your real objects first.");
  const d = t.description.toLowerCase();

  if (t.motion === "sort" || /\b(conveyor|pile|bin|random|anywhere|find|detect|recogni[sz]e|jenga|chess|strawberr|fruit|weed)\w*/.test(d))
    notes.push("This sizes the arm. Finding objects that aren't always in the same place (on a conveyor, in a pile, on a board) also needs a camera and vision software, such as OpenCV or a LeRobot policy.");
  notes.push("Torques assume the arm stretched out flat, the worst case. Motors are only counted at about half their rated torque so they stay cool.");
  return { task: t, machines, geometry, gripper, families, chosen, machinePlan, verdict, verdict_reasons: reasons, designs, notes };
}
