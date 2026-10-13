// Turns a build into a wiring plan: nodes (boards) and numbered connections.
import type { BuildItem, Part, Slot } from "./compat/types";
import { planPins } from "./electronics/pins";

export type WireKind = "power" | "ground" | "signal" | "data";

export interface WireNode {
  id: string;
  label: string;
  sub: string;
  slot: Slot | "motors_left" | "motors_right";
}

export interface Wire {
  n: number;
  from: string;
  to: string;
  kind: WireKind;
  label: string;
  pins: string;
  note?: string;
}

export interface WiringPlan {
  nodes: WireNode[];
  wires: Wire[];
  notes: string[];
}

export function planWiring(items: BuildItem[], byId: Record<string, Part>): WiringPlan {
  const parts = items.map((i) => ({ part: byId[i.part_id], qty: i.quantity })).filter((x) => x.part);
  const get = (slot: Slot) => parts.find((x) => x.part.slot === slot)?.part;
  const battery = get("battery");
  const driver = get("motor_driver");
  const motor = get("drive_motor");
  const motorCount = parts.filter((x) => x.part.slot === "drive_motor").reduce((n, x) => n + x.qty * x.part.pack_size, 0);
  const controller = get("controller");
  const compute = get("compute");
  const regulator = get("regulator");
  const sensors = parts.filter((x) => ["lidar", "camera", "imu", "distance_sensor"].includes(x.part.slot)).map((x) => x.part);

  const plan = planPins(items, byId);
  const pinOf = (signal: string) => plan?.rows.find((r) => r.signal === signal);
  /** "PWMA ← GPIO25, AIN1 ← GPIO13" for the given signals, when a pin plan exists. */
  const mapped = (signals: string[]) =>
    signals
      .map(pinOf)
      .filter(Boolean)
      .map((r) => `${r!.to.split(" ").pop()} ← ${r!.pin}`)
      .join(", ");
  const nodes: WireNode[] = [];
  const wires: Wire[] = [];
  const notes: string[] = [];
  const add = (w: Omit<Wire, "n">) => wires.push({ ...w, n: wires.length + 1 });
  const node = (p: Part | undefined, id: string) => {
    if (p) nodes.push({ id, label: p.name.replace(/\s*\(.*?\)\s*/g, " ").trim(), sub: p.brand, slot: p.slot });
  };

  node(battery, "battery");
  node(regulator, "regulator");
  node(driver, "driver");
  node(controller, "controller");
  node(compute, "compute");
  if (motor) {
    const perSide = Math.max(1, Math.floor(motorCount / 2));
    nodes.push({ id: "motors_left", label: perSide > 1 ? `Left motors ×${perSide}` : "Left motor", sub: motor.compat.has_encoder ? "with encoder" : "no encoder", slot: "motors_left" });
    nodes.push({ id: "motors_right", label: perSide > 1 ? `Right motors ×${perSide}` : "Right motor", sub: motor.compat.has_encoder ? "with encoder" : "no encoder", slot: "motors_right" });
  }
  sensors.forEach((s, i) => node(s, `sensor${i}`));

  // ---- power ----
  if (battery && driver) {
    add({ from: "battery", to: "driver", kind: "power", label: "Battery + to motor power", pins: "Battery + (red) → VM / B+ screw terminal", note: "Put an on/off switch and a fuse on this wire." });
    add({ from: "battery", to: "driver", kind: "ground", label: "Battery − to driver ground", pins: "Battery − (black) → GND / B− screw terminal" });
  }
  if (battery && regulator) {
    add({ from: "battery", to: "regulator", kind: "power", label: "Battery to 5 V supply input", pins: "Battery + → VIN, Battery − → GND" });
  }
  const vinBoards = [controller, compute].filter((b) => b && b.compat.vin_min !== undefined) as Part[];
  for (const b of vinBoards) {
    const id = b === controller ? "controller" : "compute";
    add({ from: "battery", to: id, kind: "power", label: `Battery to ${b.slot === "compute" ? "computer" : "controller"} input`, pins: b.slot === "compute" ? "Battery → DC barrel jack (check polarity)" : "Battery + → VIN, Battery − → GND" });
  }
  if (regulator && compute && compute.compat.vin_min === undefined) {
    add({ from: "regulator", to: "compute", kind: "power", label: "5 V to the computer", pins: "5V OUT → USB-C power (or 5V + GND GPIO pins)", note: "Set and measure 5.1 V before connecting the computer." });
  }
  if (regulator && controller && controller.compat.vin_min === undefined && !compute) {
    add({ from: "regulator", to: "controller", kind: "power", label: "5 V to the controller", pins: "5V OUT → 5V / VBUS pin, GND → GND" });
  }

  // ---- motors ----
  if (driver && motor) {
    add({ from: "driver", to: "motors_left", kind: "power", label: "Motor channel A", pins: "M1A / M1B → left motor leads" + (motorCount > 2 ? " (both left motors in parallel)" : "") });
    add({ from: "driver", to: "motors_right", kind: "power", label: "Motor channel B", pins: "M2A / M2B → right motor leads" + (motorCount > 2 ? " (both right motors in parallel)" : ""), note: "If a wheel spins backwards, swap its two motor leads." });
  }
  const motorHost = controller ? "controller" : compute ? "compute" : null;
  if (driver && motorHost) {
    const dual = driver.id.includes("cytron");
    const drvSignals = plan?.rows.filter((r) => r.signal.startsWith("LEFT_") || r.signal.startsWith("RIGHT_")).map((r) => r.signal) ?? [];
    const exact = mapped(drvSignals);
    add({
      from: motorHost,
      to: "driver",
      kind: "signal",
      label: "Speed and direction signals",
      pins: (exact || (dual ? "M1A, M1B, M2A, M2B ← 4 PWM pins" : "PWMA, AIN1, AIN2, PWMB, BIN1, BIN2 ← 6 GPIO pins")) + (driver.id.includes("tb6612") ? "; STBY and VCC → logic supply" : ""),
    });
    add({ from: motorHost, to: "driver", kind: "ground", label: "Shared ground", pins: "Controller GND → driver GND", note: "Every board must share ground or the signals won't work." });
  }
  if (motor?.compat.has_encoder && motorHost) {
    const v = plan?.logicV === 5 ? "5 V" : "3.3 V";
    const enc = (side: "L" | "R") => (pinOf(`ENC_${side}_A`) ? `A → ${pinOf(`ENC_${side}_A`)!.pin}, B → ${pinOf(`ENC_${side}_B`)!.pin}` : "Encoder A, B → 2 interrupt-capable pins");
    add({ from: "motors_left", to: motorHost, kind: "signal", label: "Left encoder", pins: `${enc("L")}; VCC → ${v}; GND` });
    add({ from: "motors_right", to: motorHost, kind: "signal", label: "Right encoder", pins: `${enc("R")}; VCC → ${v}; GND` });
  }
  if (controller && compute) {
    add({ from: "controller", to: "compute", kind: "data", label: "Controller to computer", pins: "USB cable (also powers the controller)" });
  }

  // ---- sensors ----
  sensors.forEach((s, i) => {
    const id = `sensor${i}`;
    const iface = s.compat.interface;
    const host = iface === "usb" || iface === "csi" ? "compute" : controller ? "controller" : "compute";
    if ((host === "compute" && !compute) || (host === "controller" && !controller)) {
      notes.push(`The ${s.name.split(" (")[0]} needs ${iface === "usb" || iface === "csi" ? "a computer" : "a controller"} to plug into. Add one in the Build step.`);
      return;
    }
    if (iface === "usb") add({ from: id, to: "compute", kind: "data", label: s.name.split(" (")[0], pins: "USB cable to a blue USB 3 port" });
    else if (iface === "csi") add({ from: id, to: "compute", kind: "data", label: s.name.split(" (")[0], pins: "Ribbon cable into the CAM/DISP port (contacts facing the board)" });
    else if (iface === "i2c")
      add({ from: id, to: host, kind: "data", label: s.name.split(" (")[0], pins: pinOf("I2C_SDA") ? `SDA → ${pinOf("I2C_SDA")!.pin}, SCL → ${pinOf("I2C_SCL")!.pin}; VIN → ${plan?.logicV === 5 ? "5 V" : "3.3 V"}; GND` : "SDA, SCL to the I2C pins; VIN → 3.3 V; GND" });
    else if (iface === "uart") add({ from: id, to: host, kind: "data", label: s.name.split(" (")[0], pins: "TX → RX, RX → TX; 5 V; GND (or use the bundled USB adapter)" });
    else if (iface === "gpio") {
      const hostPart = host === "controller" ? controller : compute;
      const divider = s.compat.sensor_logic_v === 5 && hostPart?.compat.host_logic_v === 3.3;
      add({ from: id, to: host, kind: "signal", label: s.name.split(" (")[0], pins: pinOf("SONAR_TRIG") ? `TRIG → ${pinOf("SONAR_TRIG")!.pin}, ECHO → ${pinOf("SONAR_ECHO")!.pin}; VCC → 5 V; GND` : "TRIG → any GPIO, ECHO → any GPIO; VCC → 5 V; GND", note: divider ? "ECHO is 5 V: add a 1 kΩ + 2 kΩ divider before the 3.3 V pin." : undefined });
    }
  });

  if (battery?.compat.chemistry === "LiPo") notes.push("Charge the LiPo only with a balance charger, inside a fireproof bag, and never unattended.");
  if (regulator && regulator.id !== "reg-pololu-d36v50f5") notes.push("Adjustable 5 V modules ship at a random voltage. Turn the screw until a multimeter reads 5.1 V before connecting anything.");
  notes.push("Wire everything with the battery unplugged. Double-check red to + and black to − before the first power-on.");

  return { nodes, wires, notes };
}
