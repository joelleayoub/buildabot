// Custom carrier PCB: one board that replaces the loose jumper wires. It distributes battery and
// 5 V power, and gives every encoder and sensor a keyed JST plug wired to the right controller pin.
// Connectors are labelled by signal, so it doesn't depend on any module's exact pinout.
// Exports a KiCad netlist (import into the PCB editor) and a BOM.
import type { BuildItem, Part } from "../compat/types";
import { planPins, type PinPlan } from "./pins";

export interface BoardPin {
  n: number;
  net: string;
  label: string;
}

export interface BoardComponent {
  ref: string;
  value: string;
  /** What it's for, in plain words. */
  purpose: string;
  footprint: string;
  kind: "terminal" | "header" | "jst" | "cap" | "led" | "resistor";
  pins: BoardPin[];
  /** Board position of pin 1 and orientation, in mm. */
  x: number;
  y: number;
  vertical: boolean;
}

export interface CarrierBoard {
  width: number;
  height: number;
  components: BoardComponent[];
  nets: string[];
  notes: string[];
  plan: PinPlan;
}

const FP = {
  term: (n: number) => `TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-${n}-5.08_1x${String(n).padStart(2, "0")}_P5.08mm_Horizontal`,
  header: (n: number) => `Connector_PinHeader_2.54mm:PinHeader_1x${String(n).padStart(2, "0")}_P2.54mm_Vertical`,
  jst: (n: number) => `Connector_JST:JST_XH_B${n}B-XH-A_1x${String(n).padStart(2, "0")}_P2.50mm_Vertical`,
  cap: "Capacitor_THT:CP_Radial_D8.0mm_P3.50mm",
  led: "LED_THT:LED_D3.0mm",
  res: "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal",
};

export const PITCH: Record<BoardComponent["kind"], number> = { terminal: 5.08, header: 2.54, jst: 2.5, cap: 3.5, led: 2.54, resistor: 7.62 };

export function designCarrierBoard(items: BuildItem[], byId: Record<string, Part>): CarrierBoard | null {
  const plan = planPins(items, byId);
  if (!plan) return null;
  const parts = items.map((i) => byId[i.part_id]).filter(Boolean);
  const battery = parts.find((p) => p.slot === "battery");
  const regulator = parts.find((p) => p.slot === "regulator");
  const compute = parts.find((p) => p.slot === "compute");
  const sensor = (signal: string) => plan.rows.find((r) => r.signal === signal);
  const logic = plan.logicV === 3.3 ? "+3V3" : "+5V";
  const comps: BoardComponent[] = [];
  const notes: string[] = [];
  const add = (c: Omit<BoardComponent, "x" | "y" | "vertical">) => comps.push({ ...c, x: 0, y: 0, vertical: false });

  // ---- power ----
  add({ ref: "J1", value: "BATTERY IN", purpose: "Battery, through your on/off switch and fuse", footprint: FP.term(2), kind: "terminal", pins: [{ n: 1, net: "VBAT", label: "+" }, { n: 2, net: "GND", label: "-" }] });
  const vmax = battery?.compat.battery_max_v ?? 12.6;
  const capV = vmax <= 10 ? 16 : vmax <= 20 ? 25 : 35;
  add({ ref: "C1", value: `470uF ${capV}V`, purpose: "Smooths the voltage dips when the motors start", footprint: FP.cap, kind: "cap", pins: [{ n: 1, net: "VBAT", label: "+" }, { n: 2, net: "GND", label: "-" }] });
  add({ ref: "J2", value: "DRIVER POWER", purpose: "Battery power out to the motor driver's VM and GND terminals", footprint: FP.term(2), kind: "terminal", pins: [{ n: 1, net: "VBAT", label: "VM" }, { n: 2, net: "GND", label: "GND" }] });
  if (regulator) {
    add({ ref: "J3", value: "5V REGULATOR", purpose: `Wires to the ${regulator.name.split(" step")[0]}: battery in, 5 V out`, footprint: FP.header(3), kind: "header", pins: [{ n: 1, net: "VBAT", label: "VIN" }, { n: 2, net: "GND", label: "GND" }, { n: 3, net: "+5V", label: "5V" }] });
    add({ ref: "D1", value: "LED green", purpose: "Lights when the 5 V rail is on", footprint: FP.led, kind: "led", pins: [{ n: 1, net: "GND", label: "K" }, { n: 2, net: "LED_A", label: "A" }] });
    add({ ref: "R1", value: "1k", purpose: "Limits the LED current", footprint: FP.res, kind: "resistor", pins: [{ n: 1, net: "+5V", label: "" }, { n: 2, net: "LED_A", label: "" }] });
  } else {
    notes.push("There's no 5 V regulator in this build, so the 5 V pins on the board are fed from the controller's 5 V pin.");
  }
  if (compute && regulator && compute.compat.vin_min === undefined) {
    add({ ref: "J4", value: "COMPUTER 5V", purpose: `5 V out to the ${compute.name.split(" (")[0]} (USB-C power lead or its 5 V and GND pins)`, footprint: FP.term(2), kind: "terminal", pins: [{ n: 1, net: "+5V", label: "5V" }, { n: 2, net: "GND", label: "GND" }] });
  }

  // ---- controller header: every assigned signal plus power ----
  const sig = plan.rows.filter((r) => r.kind !== "uart");
  // 3V3 only comes onto the board when something runs from it (encoders, I2C sensors, TB6612 logic).
  const i2cParts = parts.filter((p) => (p.slot === "imu" || p.slot === "distance_sensor") && p.compat.interface === "i2c");
  const needs3v3 = plan.logicV === 3.3 && (!!sensor("ENC_L_A") || !!sensor("ENC_R_A") || i2cParts.length > 0 || plan.rows.some((r) => r.to.startsWith("TB6612")));
  const ctrlPins: BoardPin[] = [
    { n: 1, net: "GND", label: "GND" },
    { n: 2, net: "+5V", label: "5V" },
    ...(needs3v3 ? [{ n: 3, net: "+3V3", label: "3V3" }] : []),
  ];
  for (const r of sig) ctrlPins.push({ n: ctrlPins.length + 1, net: r.signal, label: `${r.signal} (${r.pin.split(" ")[0]})` });
  add({ ref: "J5", value: `TO ${plan.hostName.toUpperCase()}`, purpose: `Jumper wires to the ${plan.hostName}; each pin is labelled with its signal and the controller pin`, footprint: FP.header(ctrlPins.length), kind: "header", pins: ctrlPins });
  if (needs3v3) notes.push(`Pin 3V3 on J5 must be connected to the ${plan.hostName}'s 3V3 output: it powers the ${[sensor("ENC_L_A") && "encoders", i2cParts.length && "I2C sensors", plan.rows.some((r) => r.to.startsWith("TB6612")) && "motor driver logic"].filter(Boolean).join(" and ")} at the right voltage.`);

  // ---- driver signal header ----
  const drvRows = plan.rows.filter((r) => r.signal.startsWith("LEFT_") || r.signal.startsWith("RIGHT_"));
  if (drvRows.length) {
    const tb = drvRows.some((r) => r.to.startsWith("TB6612"));
    const pins: BoardPin[] = [{ n: 1, net: "GND", label: "GND" }, ...(tb ? [{ n: 2, net: logic, label: "VCC/STBY" }] : [])];
    for (const r of drvRows) pins.push({ n: pins.length + 1, net: r.signal, label: r.to.split(" ").pop()! });
    add({ ref: "J6", value: "MOTOR DRIVER", purpose: "Jumper wires to the motor driver's control pins", footprint: FP.header(pins.length), kind: "header", pins });
  }

  // ---- encoders ----
  for (const side of ["L", "R"] as const) {
    if (!sensor(`ENC_${side}_A`)) continue;
    add({
      ref: side === "L" ? "J7" : "J8",
      value: `${side === "L" ? "LEFT" : "RIGHT"} ENCODER`,
      purpose: `Plug for the ${side === "L" ? "left" : "right"} motor's encoder cable`,
      footprint: FP.jst(4),
      kind: "jst",
      pins: [{ n: 1, net: "GND", label: "GND" }, { n: 2, net: logic, label: "VCC" }, { n: 3, net: `ENC_${side}_A`, label: "A" }, { n: 4, net: `ENC_${side}_B`, label: "B" }],
    });
  }

  // ---- ultrasonic, with an on-board divider when the controller is 3.3 V ----
  if (sensor("SONAR_TRIG")) {
    const divide = plan.logicV === 3.3;
    add({
      ref: "J9",
      value: "ULTRASONIC",
      purpose: "Plug for the HC-SR04 distance sensor",
      footprint: FP.jst(4),
      kind: "jst",
      pins: [{ n: 1, net: "+5V", label: "VCC" }, { n: 2, net: "SONAR_TRIG", label: "TRIG" }, { n: 3, net: divide ? "ECHO_5V" : "SONAR_ECHO", label: "ECHO" }, { n: 4, net: "GND", label: "GND" }],
    });
    if (divide) {
      add({ ref: "R2", value: "1k", purpose: "Echo level shifter, top half (5 V to 3.3 V)", footprint: FP.res, kind: "resistor", pins: [{ n: 1, net: "ECHO_5V", label: "" }, { n: 2, net: "SONAR_ECHO", label: "" }] });
      add({ ref: "R3", value: "2k", purpose: "Echo level shifter, bottom half", footprint: FP.res, kind: "resistor", pins: [{ n: 1, net: "SONAR_ECHO", label: "" }, { n: 2, net: "GND", label: "" }] });
    }
  }

  // ---- I2C sensors: one plug per sensor on the shared bus ----
  i2cParts.forEach((p, k) => {
    add({
      ref: `J${10 + k}`,
      value: p.slot === "imu" ? "MOTION SENSOR" : "TOF SENSOR",
      purpose: `Plug for the ${p.name.split(" (")[0]} (I2C)`,
      footprint: FP.jst(4),
      kind: "jst",
      pins: [{ n: 1, net: "GND", label: "GND" }, { n: 2, net: logic, label: "VIN" }, { n: 3, net: "I2C_SDA", label: "SDA" }, { n: 4, net: "I2C_SCL", label: "SCL" }],
    });
  });

  // A power pin on J5 that nothing else on the board uses would be a dead end: drop it.
  const j5 = comps.find((c) => c.ref === "J5")!;
  const uses = (net: string) => comps.reduce((n, c) => n + c.pins.filter((p) => p.net === net).length, 0);
  j5.pins = j5.pins.filter((p) => !(p.net === "+5V" || p.net === "+3V3") || uses(p.net) > 1).map((p, i) => ({ ...p, n: i + 1 }));
  j5.footprint = FP.header(j5.pins.length);

  // ---- layout: power column on the left, headers in the middle, plugs on the right ----
  const len = (c: BoardComponent) => (c.pins.length - 1) * PITCH[c.kind];
  let y = 8;
  for (const c of comps.filter((c) => ["J1", "C1", "J2", "J3", "D1", "R1", "J4"].includes(c.ref))) {
    c.x = 8;
    c.y = y;
    y += c.kind === "terminal" ? 13 : c.kind === "cap" ? 12 : 9;
  }
  const leftH = y;
  const headers = comps.filter((c) => c.ref === "J5" || c.ref === "J6");
  headers.forEach((c, k) => {
    c.x = 42 + k * 24;
    c.y = 8;
    c.vertical = true;
  });
  const headH = Math.max(0, ...headers.map((c) => 8 + len(c) + 6));
  const plugs = comps.filter((c) => c.kind === "jst" || c.ref === "R2" || c.ref === "R3");
  let py = 8;
  const plugX = 42 + headers.length * 24 + 4;
  for (const c of plugs) {
    c.x = plugX;
    c.y = py;
    py += c.kind === "jst" ? 10 : 7;
  }
  const width = Math.round(plugX + 22);
  const height = Math.round(Math.max(leftH, headH, py) + 4);
  const nets = [...new Set(comps.flatMap((c) => c.pins.map((p) => p.net)))];
  notes.push("Mounting: add M3 holes in the corners in KiCad so it can sit on the chassis standoffs.");

  return { width, height, components: comps, nets, notes, plan };
}

/** Pin position on the board in mm, for previews. */
export function pinXY(c: BoardComponent, i: number): [number, number] {
  const d = i * PITCH[c.kind];
  return c.vertical ? [c.x, c.y + d] : [c.x + d, c.y];
}

function uuid(seed: string): string {
  let h = 2166136261;
  const hex: string[] = [];
  for (let k = 0; k < 4; k++) {
    for (const ch of seed + k) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    hex.push(h.toString(16).padStart(8, "0"));
  }
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** KiCad netlist (S-expression, version E). In KiCad's PCB editor: File, Import, Netlist. */
export function toKicadNetlist(b: CarrierBoard): string {
  const date = new Date().toISOString().slice(0, 10);
  const comps = b.components
    .map(
      (c) => `    (comp (ref ${q(c.ref)})
      (value ${q(c.value)})
      (footprint ${q(c.footprint)})
      (description ${q(c.purpose)})
      (libsource (lib "buildabot") (part ${q(c.kind)}) (description ${q(c.purpose)}))
      (sheetpath (names "/") (tstamps "/"))
      (tstamps ${q(uuid(c.ref))}))`,
    )
    .join("\n");
  const nets = b.nets
    .map((net, i) => {
      const nodes = b.components.flatMap((c) => c.pins.filter((p) => p.net === net).map((p) => `(node (ref ${q(c.ref)}) (pin ${q(String(p.n))}))`));
      return `    (net (code ${q(String(i + 1))}) (name ${q(net)})\n      ${nodes.join("\n      ")})`;
    })
    .join("\n");
  return `(export (version "E")
  (design
    (source "buildabot-carrier.kicad_sch")
    (date ${q(date)})
    (tool "buildabot")
    (sheet (number "1") (name "/") (tstamps "/")))
  (components
${comps})
  (nets
${nets}))
`;
}

export function toBomCsv(b: CarrierBoard): string {
  const rows = [["Ref", "Value", "Footprint", "Purpose"], ...b.components.map((c) => [c.ref, c.value, c.footprint, c.purpose])];
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";
}
