// The guided flow: robot types, use cases and the questions that shape a build.
import type { Requirements, Slot } from "./compat/types";

export type RobotTypeId = "rover" | "arm" | "dog" | "humanoid";

export const ROBOT_TYPES: { id: RobotTypeId; name: string; blurb: string; available: boolean }[] = [
  { id: "rover", name: "Rover", blurb: "Wheels, a brain and sensors. The best first robot: cheap, stable and forgiving.", available: true },
  { id: "arm", name: "Robot arm", blurb: "Picks, places and draws. Servo or stepper joints on a fixed base.", available: false },
  { id: "dog", name: "Robot dog", blurb: "Four legs, twelve motors, a lot of balance code.", available: false },
  { id: "humanoid", name: "Humanoid", blurb: "A torso, a head and arms, on legs or on a wheeled base.", available: false },
];

export type UseCaseId = "drive" | "avoid" | "map" | "follow" | "carry";
export type Environment = NonNullable<Requirements["environment"]>;
export type Experience = "first" | "some" | "linux";

export interface UseCase {
  id: UseCaseId;
  name: string;
  blurb: string;
  autonomy: Requirements["autonomy"];
  payload_kg?: number;
  defaultBudget: number;
  /** Sensor slots this use case needs, with allowed part ids (first is preferred). */
  sensors: Partial<Record<Slot, string[]>>;
  needsCompute: boolean;
}

export const USE_CASES: UseCase[] = [
  {
    id: "drive", name: "Drive it from my phone",
    blurb: "A remote-controlled rover. The quickest way to learn motors, power and code.",
    autonomy: "remote_control", defaultBudget: 80, sensors: {}, needsCompute: false,
  },
  {
    id: "avoid", name: "Wander and avoid obstacles",
    blurb: "Drives around on its own and turns away before it bumps into things.",
    autonomy: "obstacle_avoidance", defaultBudget: 100,
    sensors: { distance_sensor: ["dist-hc-sr04", "dist-vl53l1x"] }, needsCompute: false,
  },
  {
    id: "map", name: "Map my home and drive to rooms",
    blurb: "Builds a floor plan with a laser scanner, then navigates to any spot you pick.",
    autonomy: "mapping_navigation", defaultBudget: 450,
    sensors: { lidar: ["lidar-rplidar-c1", "lidar-ld19", "lidar-rplidar-a1m8"], imu: ["imu-bno085"] }, needsCompute: true,
  },
  {
    id: "follow", name: "Follow me around",
    blurb: "Recognises people with a depth camera and keeps a set distance behind you.",
    autonomy: "obstacle_avoidance", defaultBudget: 450,
    sensors: { camera: ["cam-oak-d-lite"] }, needsCompute: true,
  },
  {
    id: "carry", name: "Carry things room to room",
    blurb: "Maps the home and delivers a load of up to 3 kg: snacks, tools, a tray.",
    autonomy: "mapping_navigation", payload_kg: 3, defaultBudget: 550,
    sensors: { lidar: ["lidar-rplidar-c1", "lidar-ld19", "lidar-rplidar-a1m8"], imu: ["imu-bno085"] }, needsCompute: true,
  },
];

export const ENVIRONMENTS: { id: Environment; name: string; advice: string }[] = [
  { id: "indoor_flat", name: "Flat floors", advice: "Flat floors suit two wheels and a caster: the simplest, most efficient layout." },
  { id: "indoor_mixed", name: "Rugs and door thresholds", advice: "Rug edges and thresholds catch small wheels, so I'll favour four-wheel drive or bigger wheels." },
  { id: "outdoor", name: "Outdoors", advice: "Grass and gravel need metal gearmotors, big wheels and no caster to snag." },
];

export const EXPERIENCE: { id: Experience; name: string; blurb: string }[] = [
  { id: "first", name: "This is my first robot", blurb: "Safer batteries, solder-free parts where possible, and lots of tutorials." },
  { id: "some", name: "I've done some electronics", blurb: "Arduino projects, a bit of soldering." },
  { id: "linux", name: "I'm comfortable with Linux", blurb: "Terminals, Python, maybe ROS." },
];

export interface Answers {
  robotType: RobotTypeId;
  useCase?: UseCaseId;
  environment: Environment;
  experience: Experience;
  budget?: number;
  /** Tools the user already has (see OWNED_TOOLS), so the cart doesn't count them. */
  owned?: string[];
}

/** The tools question: each choice matches extras by id, or by prefix for chargers. */
export const OWNED_TOOLS: { id: string; label: string; match: string[] }[] = [
  { id: "screwdrivers", label: "Small screwdrivers", match: ["tool-screwdrivers"] },
  { id: "multimeter", label: "Multimeter", match: ["tool-multimeter"] },
  { id: "stripper", label: "Wire stripper", match: ["tool-stripper"] },
  { id: "soldering", label: "Soldering iron", match: ["tool-soldering", "sup-heatshrink"] },
  { id: "hex", label: "Hex keys", match: ["tool-hex"] },
  { id: "pliers", label: "Pliers", match: ["tool-pliers"] },
  { id: "charger", label: "A battery charger", match: ["chg-"] },
  { id: "kit", label: "Jumper wires and screws", match: ["sup-jumpers", "sup-standoffs-m3", "sup-mounting"] },
];

/** Extra ids covered by the user's answer to the tools question. */
export function ownedExtraIds(owned: string[] | undefined, extraIds: string[]): string[] {
  const rules = OWNED_TOOLS.filter((t) => owned?.includes(t.id)).flatMap((t) => t.match);
  return extraIds.filter((id) => rules.some((m) => (m.endsWith("-") ? id.startsWith(m) : id === m)));
}

export const findUseCase = (id?: UseCaseId) => USE_CASES.find((u) => u.id === id);

export function requirementsFrom(a: Answers): Requirements {
  const uc = findUseCase(a.useCase) ?? USE_CASES[0];
  return {
    autonomy: uc.autonomy,
    environment: a.environment,
    payload_kg: uc.payload_kg,
    budget_usd: a.budget ?? uc.defaultBudget,
    min_runtime_min: uc.needsCompute ? 45 : 30,
  };
}

// Part labels and display order live in lib/slots.ts so every page uses the same names.
export { SLOT_LABELS, SLOT_ORDER } from "./slots";
