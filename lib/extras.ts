// Everything else it takes to build the robot: screws, wire, connectors, chargers and tools.
// Worked out from the parts in the build (no AI), so the cart, the guide and the share page agree.
import extrasJson from "@/data/extras.json";
import type { BuildItem, Part } from "./compat/types";

export type ExtraKind = "supply" | "safety" | "tool";
export type ExtraIcon = "screws" | "wires" | "fuse" | "solder" | "ties" | "card" | "usb" | "fan" | "resistor" | "board" | "shield" | "charger" | "screwdriver" | "multimeter" | "pliers" | "hex" | "laptop";

export interface ExtraItem {
  id: string;
  kind: ExtraKind;
  icon: ExtraIcon;
  name: string;
  price_usd_approx: number;
  buy_url: string;
}

export interface Extra {
  item: ExtraItem;
  qty: number;
  /** Why this build needs it, in one short sentence. */
  why: string;
  /** Nice to have, not required to finish the build. */
  optional: boolean;
  /** Most people already own one (a computer), so it starts ticked. */
  likelyOwned: boolean;
}

export const EXTRAS = extrasJson as ExtraItem[];
export const EXTRAS_BY_ID: Record<string, ExtraItem> = Object.fromEntries(EXTRAS.map((e) => [e.id, e]));

const METAL_CHASSIS = ["chassis-4wd-tt-aluminum", "chassis-2wd-37d-plate", "chassis-4wd-25d-aluminum"];

/** True when the build has joints to solder: header pins, encoder or regulator leads, motor tabs. */
export function needsSoldering(parts: Part[]): boolean {
  const motor = parts.find((p) => p.slot === "drive_motor");
  return (
    parts.some((p) => p.slot === "regulator") ||
    !!motor?.compat.has_encoder ||
    parts.some((p) => ["imu", "distance_sensor"].includes(p.slot) && p.compat.interface === "i2c") ||
    parts.some((p) => p.id === "ctrl-pico-2")
  );
}

export function extrasFor(items: BuildItem[], byId: Record<string, Part>): Extra[] {
  const parts = items.map((i) => byId[i.part_id]).filter(Boolean);
  const get = (slot: Part["slot"]) => parts.find((p) => p.slot === slot);
  const battery = get("battery");
  const motor = get("drive_motor");
  const controller = get("controller");
  const compute = get("compute");
  const chassis = get("chassis");
  const wheels = get("wheels");
  const out: Extra[] = [];
  const add = (id: string, why: string, opts: { qty?: number; optional?: boolean; likelyOwned?: boolean } = {}) => {
    const item = EXTRAS_BY_ID[id];
    if (!item || out.some((e) => e.item.id === id)) return;
    out.push({ item, why, qty: opts.qty ?? 1, optional: !!opts.optional, likelyOwned: !!opts.likelyOwned });
  };

  // ---- supplies ----
  const boards = [controller, get("motor_driver"), get("regulator"), get("imu"), get("distance_sensor")].filter(Boolean).length;
  add("sup-standoffs-m3", `Mounts the ${boards} small boards on the chassis so nothing shorts against the chassis or each other.`);
  if (compute?.id.startsWith("compute-rpi")) add("sup-standoffs-m25", `The ${compute.name.split(" (")[0]} uses M2.5 holes, smaller than the rest.`);
  const pinSensors = parts.some((p) => ["imu", "distance_sensor"].includes(p.slot) || (p.slot === "lidar" && p.compat.interface === "uart"));
  if (controller || compute) add("sup-jumpers", `Connects the controller pins to the motor driver${pinSensors ? " and sensors" : ""}.`);
  add("sup-wire", "Battery, switch and motor power: jumper wires are too thin for motor current.");
  add("sup-switch", "Turns the robot on and off without unplugging the battery.");
  const smallMotors = motor?.compat.motor_form_factor === "TT";
  add("sup-fuse", `Protects the wiring if something shorts. Use a ${battery?.compat.chemistry === "NiMH" || smallMotors ? "5" : "10"} A fuse.`);
  if (battery && (battery.compat.chemistry === "LiPo" || battery.compat.chemistry === "Li-ion")) add("sup-xt60", "A proper plug for the battery, if its lead doesn't already fit your switch and fuse.", { optional: true });
  add("sup-mounting", "Holds the battery and wires in place so nothing rattles loose.");
  const solder = needsSoldering(parts);
  if (solder) add("sup-heatshrink", "Covers soldered joints so they can't short.");
  if (controller?.id === "ctrl-pico-2") add("sup-headers", "The Pico 2 comes without pins, unless you buy the Pico 2 H with them fitted.");
  const usbCables = (controller ? 1 : 0) + (controller && compute ? 1 : 0);
  if (usbCables) add("sup-usb", controller && compute ? "One to upload code from your computer, one from the robot's computer to the controller." : "Uploads code from your computer to the controller.", { qty: usbCables });
  if (compute?.id.startsWith("compute-rpi")) add("sup-microsd-32", "The Raspberry Pi runs from a microSD card.");
  if (compute?.id.includes("jetson")) add("sup-microsd-64", "The Jetson runs from a microSD card; 64 GB leaves room for ROS 2.");
  if (compute?.id === "compute-rpi5-8gb") add("sup-pi5-cooler", "The Pi 5 slows down when it gets hot; ROS 2 and mapping keep it busy.");
  const sonar = get("distance_sensor");
  const host = controller ?? compute;
  if (sonar?.compat.sensor_logic_v === 5 && host?.compat.host_logic_v === 3.3) add("sup-resistors", "A 1 kΩ and a 2 kΩ resistor bring the sensor's 5 V echo down to 3.3 V for the controller.");
  if (controller) add("sup-breadboard", "Handy for testing the sensor and motor driver before mounting them.", { optional: true });

  // ---- safety ----
  if (battery?.compat.chemistry === "LiPo") {
    add("safe-lipo-bag", "Charge LiPo batteries inside it, never unattended.");
    add("safe-lipo-alarm", "Beeps before the LiPo drains too low and gets damaged.");
  }

  // ---- charger ----
  if (battery?.compat.chemistry === "NiMH") add("chg-nimh", "Recharges the AA cells. Don't use one for alkaline batteries.");
  else if (battery?.compat.chemistry === "LiPo") add("chg-lipo", "LiPo packs must be charged with a balance charger.");
  else if (battery?.compat.chemistry === "Li-ion") add("chg-liion", `Pick one for a ${battery.compat.battery_max_v} V pack, if yours didn't come with a charger.`);

  // ---- tools ----
  add("tool-screwdrivers", "For the chassis, standoffs and screw terminals.");
  add("tool-multimeter", "Checks the 5 V supply and finds bad connections before anything gets damaged.");
  add("tool-stripper", "Cuts and strips the power wires.");
  if (solder) add("tool-soldering", "A few joints need soldering: header pins and power leads. A makerspace can help if you'd rather not.");
  if ((chassis && METAL_CHASSIS.includes(chassis.id)) || (wheels && wheels.compat.wheel_shaft !== "TT")) add("tool-hex", "Metal parts and wheel hubs use small hex screws.");
  add("tool-pliers", "Holds nuts and bends wire in tight spots.", { optional: true });
  if (controller || compute) add("tool-computer", "Uploads the code and sets up the robot.", { likelyOwned: true });
  return out;
}

/** What starts ticked as "need to buy": everything except optional extras and things most people own. */
export const defaultNeeded = (extras: Extra[], owned: string[] = []) => new Set(extras.filter((e) => !e.optional && !e.likelyOwned && !owned.includes(e.item.id)).map((e) => e.item.id));

export function extrasTotal(extras: Extra[], needed: Set<string>, kinds?: ExtraKind[]): number {
  return extras.filter((e) => needed.has(e.item.id) && (!kinds || kinds.includes(e.item.kind))).reduce((s, e) => s + e.item.price_usd_approx * e.qty, 0);
}
