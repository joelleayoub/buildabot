// Pin planning: which controller pin each signal in the build connects to.
// Pools only contain pins that are safe for that job on that board (PWM-capable for speed,
// interrupt-capable for encoders, the board's default I2C and UART pins).
import type { BuildItem, Part } from "../compat/types";

export type HostKind = "arduino_uno_r4" | "esp32" | "pico" | "teensy41" | "raspberry_pi";

interface HostProfile {
  name: string;
  logicV: 3.3 | 5;
  /** Pins that can output PWM, in order of preference. */
  pwm: string[];
  /** Plain digital pins for direction signals and triggers. */
  digital: string[];
  /** Interrupt-capable inputs for encoder channel A, then B. */
  encoder: string[];
  i2c: { sda: string; scl: string };
  uart: { tx: string; rx: string };
  /** How to describe a pin to a beginner (e.g. physical header position on a Pi). */
  describe?: (pin: string) => string;
}

// Raspberry Pi 40-pin header positions for the GPIOs we use.
const PI_HEADER: Record<string, number> = { GPIO2: 3, GPIO3: 5, GPIO5: 29, GPIO6: 31, GPIO12: 32, GPIO13: 33, GPIO14: 8, GPIO15: 10, GPIO16: 36, GPIO18: 12, GPIO19: 35, GPIO20: 38, GPIO21: 40, GPIO23: 16, GPIO24: 18, GPIO25: 22, GPIO26: 37, GPIO17: 11, GPIO27: 13, GPIO22: 15 };

export const HOSTS: Record<HostKind, HostProfile> = {
  arduino_uno_r4: {
    name: "Arduino UNO R4",
    logicV: 5,
    pwm: ["D5", "D6", "D9", "D10", "D11"],
    digital: ["D8", "D12", "D13", "A2", "A3", "A0", "A1"],
    encoder: ["D2", "D3", "D4", "D7"],
    i2c: { sda: "A4", scl: "A5" },
    uart: { tx: "D1", rx: "D0" },
  },
  esp32: {
    name: "ESP32 DevKitC",
    logicV: 3.3,
    // avoids flash pins 6 to 11, input-only 34 to 39 and boot-strapping pins for outputs
    pwm: ["GPIO25", "GPIO26", "GPIO27", "GPIO14"],
    // 16/17 are free when UART2 isn't used; 5 and 15 are strapping pins but fine as outputs after boot
    digital: ["GPIO13", "GPIO32", "GPIO33", "GPIO16", "GPIO17", "GPIO5", "GPIO15"],
    encoder: ["GPIO18", "GPIO19", "GPIO4", "GPIO23"],
    i2c: { sda: "GPIO21", scl: "GPIO22" },
    uart: { tx: "GPIO17", rx: "GPIO16" },
  },
  pico: {
    name: "Raspberry Pi Pico 2",
    logicV: 3.3,
    pwm: ["GP2", "GP3", "GP6", "GP7"],
    digital: ["GP8", "GP9", "GP14", "GP15", "GP16", "GP17"],
    encoder: ["GP10", "GP11", "GP12", "GP13"],
    i2c: { sda: "GP4", scl: "GP5" },
    uart: { tx: "GP0", rx: "GP1" },
  },
  teensy41: {
    name: "Teensy 4.1",
    logicV: 3.3,
    pwm: ["2", "3", "4", "5", "6", "7"],
    digital: ["8", "9", "10", "11", "20", "21"],
    encoder: ["14", "15", "16", "17"],
    i2c: { sda: "18", scl: "19" },
    uart: { tx: "1", rx: "0" },
  },
  raspberry_pi: {
    name: "Raspberry Pi",
    logicV: 3.3,
    pwm: ["GPIO12", "GPIO13", "GPIO18", "GPIO19"],
    digital: ["GPIO5", "GPIO6", "GPIO16", "GPIO20", "GPIO21", "GPIO26"],
    encoder: ["GPIO17", "GPIO27", "GPIO22", "GPIO23"],
    i2c: { sda: "GPIO2", scl: "GPIO3" },
    uart: { tx: "GPIO14", rx: "GPIO15" },
    describe: (pin) => (PI_HEADER[pin] ? `${pin} (header pin ${PI_HEADER[pin]})` : pin),
  },
};

export function hostKindOf(p: Part | undefined): HostKind | null {
  if (!p) return null;
  if (p.id.includes("arduino")) return "arduino_uno_r4";
  if (p.id.includes("esp32")) return "esp32";
  if (p.id.includes("pico")) return "pico";
  if (p.id.includes("teensy")) return "teensy41";
  // Jetson GPIO and PWM need device-tree setup, so motors should go through a microcontroller.
  if (p.id.includes("jetson")) return null;
  if (p.id.includes("rpi")) return "raspberry_pi";
  return null;
}

export type DriverStyle = "dual_pwm" | "pwm_dir" | "in_in_pwm";

export function driverStyleOf(p: Part | undefined): DriverStyle | null {
  if (!p) return null;
  if (p.id.includes("mdd10a")) return "pwm_dir"; // PWM1, DIR1, PWM2, DIR2
  if (p.id.includes("mdd3a")) return "dual_pwm"; // M1A, M1B, M2A, M2B, each PWM
  return "in_in_pwm"; // TB6612 (PWMx, xIN1, xIN2) and L298N (ENx, INx, INy)
}

export type SignalKind = "pwm" | "digital" | "encoder" | "i2c" | "uart";

export interface PinRow {
  /** Code-friendly name, used in the sketch and on the PCB silkscreen. */
  signal: string;
  /** What it does, in plain words. */
  label: string;
  pin: string;
  kind: SignalKind;
  /** Which part's pin it goes to, e.g. "Motor driver M1A". */
  to: string;
  note?: string;
}

export interface PinPlan {
  host: HostKind;
  hostName: string;
  hostPartId: string;
  logicV: 3.3 | 5;
  driverStyle: DriverStyle | null;
  rows: PinRow[];
  warnings: string[];
}

/** Plans pins on whichever board drives the motors (the microcontroller if there is one). */
export function planPins(items: BuildItem[], byId: Record<string, Part>): PinPlan | null {
  const parts = items.map((i) => byId[i.part_id]).filter(Boolean);
  const get = (slot: Part["slot"]) => parts.find((p) => p.slot === slot);
  const controller = get("controller");
  const compute = get("compute");
  const hostPart = controller ?? compute;
  const host = hostKindOf(hostPart);
  if (!host || !hostPart) return null;
  const h = HOSTS[host];
  const used = new Set<string>();
  const warnings: string[] = [];
  const take = (pool: string[], what: string) => {
    const pin = pool.find((p) => !used.has(p));
    if (!pin) {
      warnings.push(`Ran out of suitable pins for ${what} on the ${h.name}.`);
      return "?";
    }
    used.add(pin);
    return h.describe ? h.describe(pin) : pin;
  };
  const rows: PinRow[] = [];
  const add = (r: Omit<PinRow, "pin"> & { pool: string[] }) => rows.push({ signal: r.signal, label: r.label, kind: r.kind, to: r.to, note: r.note, pin: take(r.pool, r.label.toLowerCase()) });

  const driver = get("motor_driver");
  const style = driverStyleOf(driver);
  if (driver && style) {
    const dn = driver.id.includes("tb6612") ? "TB6612" : driver.id.includes("l298") ? "L298N" : "Cytron";
    if (style === "dual_pwm") {
      add({ signal: "LEFT_A", label: "Left motor forward speed", kind: "pwm", to: `${dn} M1A`, pool: h.pwm });
      add({ signal: "LEFT_B", label: "Left motor reverse speed", kind: "pwm", to: `${dn} M1B`, pool: h.pwm });
      add({ signal: "RIGHT_A", label: "Right motor forward speed", kind: "pwm", to: `${dn} M2A`, pool: h.pwm });
      add({ signal: "RIGHT_B", label: "Right motor reverse speed", kind: "pwm", to: `${dn} M2B`, pool: h.pwm });
    } else if (style === "pwm_dir") {
      add({ signal: "LEFT_PWM", label: "Left motor speed", kind: "pwm", to: `${dn} PWM1`, pool: h.pwm });
      add({ signal: "LEFT_DIR", label: "Left motor direction", kind: "digital", to: `${dn} DIR1`, pool: h.digital });
      add({ signal: "RIGHT_PWM", label: "Right motor speed", kind: "pwm", to: `${dn} PWM2`, pool: h.pwm });
      add({ signal: "RIGHT_DIR", label: "Right motor direction", kind: "digital", to: `${dn} DIR2`, pool: h.digital });
    } else {
      const en = dn === "L298N" ? ["ENA", "IN1", "IN2", "ENB", "IN3", "IN4"] : ["PWMA", "AIN1", "AIN2", "PWMB", "BIN1", "BIN2"];
      add({ signal: "LEFT_PWM", label: "Left motor speed", kind: "pwm", to: `${dn} ${en[0]}`, pool: h.pwm, note: dn === "L298N" ? "Remove the ENA jumper first." : undefined });
      add({ signal: "LEFT_IN1", label: "Left motor direction 1", kind: "digital", to: `${dn} ${en[1]}`, pool: h.digital });
      add({ signal: "LEFT_IN2", label: "Left motor direction 2", kind: "digital", to: `${dn} ${en[2]}`, pool: h.digital });
      add({ signal: "RIGHT_PWM", label: "Right motor speed", kind: "pwm", to: `${dn} ${en[3]}`, pool: h.pwm, note: dn === "L298N" ? "Remove the ENB jumper first." : undefined });
      add({ signal: "RIGHT_IN1", label: "Right motor direction 1", kind: "digital", to: `${dn} ${en[4]}`, pool: h.digital });
      add({ signal: "RIGHT_IN2", label: "Right motor direction 2", kind: "digital", to: `${dn} ${en[5]}`, pool: h.digital });
    }
    if (dn === "TB6612") warnings.push("Tie the TB6612's STBY pin to the logic supply (VCC) so the driver is always enabled.");
    if (h.logicV === 3.3 && dn === "L298N") warnings.push("The L298N reads 3.3 V signals reliably on most modules, but if a motor stutters, power its logic from 5 V.");
  }

  const motor = get("drive_motor");
  if (motor?.compat.has_encoder) {
    add({ signal: "ENC_L_A", label: "Left encoder A", kind: "encoder", to: "Left motor encoder A", pool: h.encoder });
    add({ signal: "ENC_R_A", label: "Right encoder A", kind: "encoder", to: "Right motor encoder A", pool: h.encoder });
    add({ signal: "ENC_L_B", label: "Left encoder B", kind: "encoder", to: "Left motor encoder B", pool: h.encoder });
    add({ signal: "ENC_R_B", label: "Right encoder B", kind: "encoder", to: "Right motor encoder B", pool: h.encoder });
  }

  const sensors = parts.filter((p) => p.slot === "distance_sensor" || p.slot === "imu" || (p.slot === "lidar" && p.compat.interface === "uart"));
  let i2cAdded = false;
  for (const s of sensors) {
    const iface = s.compat.interface;
    if (iface === "gpio") {
      add({ signal: "SONAR_TRIG", label: "Ultrasonic trigger", kind: "digital", to: `${s.name.split(" ")[0]} TRIG`, pool: h.digital });
      add({
        signal: "SONAR_ECHO",
        label: "Ultrasonic echo",
        kind: "digital",
        to: `${s.name.split(" ")[0]} ECHO`,
        pool: h.digital,
        note: h.logicV === 3.3 && s.compat.sensor_logic_v === 5 ? "ECHO is 5 V: add a 1 kΩ + 2 kΩ divider." : undefined,
      });
    } else if (iface === "i2c" && !i2cAdded) {
      i2cAdded = true;
      const names = sensors.filter((x) => x.compat.interface === "i2c").map((x) => x.name.split(" ").slice(0, 2).join(" "));
      rows.push({ signal: "I2C_SDA", label: "I2C data", kind: "i2c", pin: h.describe ? h.describe(h.i2c.sda) : h.i2c.sda, to: names.join(" + ") + " SDA" });
      rows.push({ signal: "I2C_SCL", label: "I2C clock", kind: "i2c", pin: h.describe ? h.describe(h.i2c.scl) : h.i2c.scl, to: names.join(" + ") + " SCL" });
      used.add(h.i2c.sda).add(h.i2c.scl);
    } else if (iface === "uart" && !controller) {
      rows.push({ signal: "LIDAR_RX", label: "Lidar data in", kind: "uart", pin: h.describe ? h.describe(h.uart.rx) : h.uart.rx, to: `${s.name.split(" (")[0]} TX` });
      used.add(h.uart.rx);
    }
  }

  return { host, hostName: h.name, hostPartId: hostPart.id, logicV: h.logicV, driverStyle: style, rows, warnings };
}
