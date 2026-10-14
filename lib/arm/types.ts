// Arm advisor: a task description in, a machine type, joint sizes and a parts list out.
// Everything here is deterministic. The AI only turns free text into an ArmTask and explains.

export type Motion = "pick_place" | "sort" | "draw" | "inspect" | "pour" | "assemble";
/** none: only position (tool points down). turn: also spin the object. full: tilt it at any angle. */
export type Orientation = "none" | "turn" | "full";
export type ObjectKind = "rigid" | "flat" | "soft" | "irregular";
export type MachineType = "articulated" | "scara" | "gantry" | "delta";

export interface ArmTask {
  description: string;
  motion: Motion;
  /** Heaviest object it has to carry, in grams. */
  object_g: number;
  object: ObjectKind;
  /** Farthest point from the centre of the base, in cm. */
  reach_cm: number;
  /** Highest it must lift above the table, in cm. */
  lift_cm: number;
  /** How close to the target it must place things, in mm. */
  precision_mm: number;
  /** Picks or moves per minute. */
  per_minute: number;
  orientation: Orientation;
  /** All the work happens on one flat surface (a table, a tray, a conveyor). */
  flat_work: boolean;
  near_people: boolean;
  hours_per_day: number;
}

export type Family = "pwm" | "feetech" | "dynamixel" | "stepper";

export interface ArmPart {
  id: string;
  kind: "motor" | "gripper" | "electronics" | "mechanical";
  family?: "pwm" | "bus" | "stepper" | "dynamixel";
  name: string;
  brand: string;
  description: string;
  price_usd_approx: number;
  mass_g: number;
  buy_url: string;
  // motors
  stall_nm?: number;
  holding_nm?: number;
  ratio?: number;
  gear_cap_nm?: number | null;
  volts?: number;
  backlash_deg?: number;
  max_dps?: number;
  // grippers
  max_object_g?: number;
  length_cm?: number;
  grips?: ObjectKind[];
  // electronics
  per_joint?: "nema17" | "nema23" | "all";
  /** Only offered for these machine types (a belt-reduced joint suits a SCARA, not a jointed arm). */
  machines?: MachineType[];
}

export interface ArmDesign {
  id: string;
  name: string;
  url: string;
  type: MachineType;
  dof: number;
  family: "pwm" | "bus" | "stepper";
  summary: string;
  best_for: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  light: boolean;
}

export interface MachineOption {
  type: MachineType;
  name: string;
  score: number;
  dof: number;
  /** Plain-language reasons this type fits, and reasons against it. */
  pros: string[];
  cons: string[];
}

export type JointStatus = "ok" | "tight" | "over";

export interface JointSize {
  name: string;
  /** What this joint does, for beginners. */
  role: string;
  axis: "yaw" | "pitch" | "roll" | "linear";
  /** Torque the joint needs, including the margin for speeding up and friction (N·m). */
  required_nm: number;
  motor: ArmPart;
  /** Torque the motor can hold without overheating (N·m). */
  usable_nm: number;
  /** usable / required */
  margin: number;
  status: JointStatus;
}

export interface FamilyPlan {
  family: Family;
  label: string;
  /** Which machine this sizes. */
  machine: MachineType;
  joints: JointSize[];
  /** Estimated repeatability at the tool tip, mm. */
  tip_error_mm: number;
  /** Fastest the slowest joint can turn, deg/s, vs what the task needs. */
  speed_ok: boolean;
  needed_dps: number;
  parts: { part: ArmPart; qty: number; why: string }[];
  cost_usd: number;
  mass_kg: number;
  feasible: boolean;
  problems: string[];
}

export interface ArmGeometry {
  /** Shoulder axis height above the table (m). */
  base_h: number;
  upper: number;
  fore: number;
  /** Wrist axis to tool tip (m). */
  tool: number;
}

export type Verdict = "diy" | "diy_with_care" | "buy";

export interface ArmPlan {
  task: ArmTask;
  machines: MachineOption[];
  geometry: ArmGeometry;
  gripper: ArmPart;
  /** Every family that was sized, best first. `chosen` is the first feasible one. */
  families: FamilyPlan[];
  chosen: FamilyPlan | null;
  /** Axis-by-axis sizing for the best-fit machine when it's a SCARA or a gantry. */
  machinePlan: FamilyPlan | null;
  verdict: Verdict;
  verdict_reasons: string[];
  designs: ArmDesign[];
  notes: string[];
}
