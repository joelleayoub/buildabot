// Deterministic compatibility checker for wheeled rover builds.
// The advisor (LLM) must call this and fix every "error" before showing a build.
// Numbers are deliberately conservative rules of thumb for hobby rovers, not a simulation.

import type { BuildItem, BuildReport, Issue, Part, Requirements, Slot } from "./types";

const RUNNING_CURRENT_FRACTION = 0.45; // conservative running + acceleration current vs stall
const AVG_MOTOR_DUTY = 0.2; // average fraction of stall power used over a session
const REGULATOR_EFFICIENCY = 0.85;
const USABLE_BATTERY_FRACTION = 0.8;
const ROLLING_FACTOR = 0.3; // crude traction/acceleration factor for torque estimate
const TORQUE_MARGIN = 3; // stall torque should be ≥ 3× the estimated need

interface Line {
  part: Part;
  item: BuildItem;
  units: number;
}

export function checkBuild(
  items: BuildItem[],
  partsById: Record<string, Part>,
  requirements: Requirements = { autonomy: "remote_control" },
): BuildReport {
  const issues: Issue[] = [];
  const add = (i: Issue) => issues.push(i);

  // ---- resolve parts -------------------------------------------------------
  const lines: Line[] = [];
  for (const item of items) {
    const part = partsById[item.part_id];
    if (!part) {
      add({ severity: "error", code: "UNKNOWN_PART", message: `Part "${item.part_id}" is not in the catalog.`, part_ids: [item.part_id] });
      continue;
    }
    const qty = Math.max(1, Math.floor(item.quantity || 1));
    lines.push({ part, item: { ...item, quantity: qty }, units: qty * part.pack_size });
  }
  const bySlot = (slot: Slot) => lines.filter((l) => l.part.slot === slot);
  const one = (slot: Slot) => bySlot(slot)[0];
  const unitsOf = (slot: Slot) => bySlot(slot).reduce((n, l) => n + l.units, 0);

  const chassis = one("chassis");
  const motors = bySlot("drive_motor");
  const motor = motors[0];
  const motorUnits = unitsOf("drive_motor");
  const wheels = one("wheels");
  const driver = one("motor_driver");
  const controller = one("controller");
  const compute = one("compute");
  const battery = one("battery");
  const regulator = one("regulator");

  // ---- required slots ------------------------------------------------------
  const required: [Slot, string][] = [
    ["chassis", "a chassis"],
    ["drive_motor", "drive motors"],
    ["motor_driver", "a motor driver"],
    ["battery", "a battery"],
  ];
  for (const [slot, label] of required) {
    if (!one(slot)) add({ severity: "error", code: "MISSING_SLOT", message: `The build needs ${label}.`, fix: `Add a part in the "${slot}" slot.` });
  }
  if (!controller && !compute) {
    add({ severity: "error", code: "MISSING_BRAIN", message: "Nothing is controlling the motors.", fix: "Add a microcontroller (controller) and/or a computer (compute)." });
  }
  for (const slot of ["chassis", "battery", "controller", "compute", "regulator"] as Slot[]) {
    if (bySlot(slot).length > 1) add({ severity: "warning", code: "DUPLICATE_SLOT", message: `More than one ${slot} selected — usually only one is needed.`, part_ids: bySlot(slot).map((l) => l.part.id) });
  }
  if (new Set(motors.map((m) => m.part.id)).size > 1) {
    add({ severity: "warning", code: "MIXED_MOTORS", message: "Different motor models drive at different speeds, so the robot won't drive straight.", fix: "Use the same motor on every wheel." });
  }

  // ---- chassis ↔ motors ↔ wheels ------------------------------------------
  const cc = chassis?.part.compat;
  if (chassis && motor) {
    for (const m of motors) {
      if (m.part.compat.motor_form_factor !== cc?.motor_form_factor) {
        add({ severity: "error", code: "MOTOR_DOESNT_FIT", message: `${m.part.name} (${m.part.compat.motor_form_factor}) doesn't fit the ${cc?.motor_form_factor} mounts on ${chassis.part.name}.`, part_ids: [m.part.id, chassis.part.id], fix: `Pick ${cc?.motor_form_factor} motors or a chassis for ${m.part.compat.motor_form_factor} motors.` });
      }
    }
    const mounts = cc?.motor_mounts ?? 0;
    if (motorUnits < mounts) add({ severity: "error", code: "TOO_FEW_MOTORS", message: `The chassis has ${mounts} motor mounts but only ${motorUnits} motor(s) are in the build.`, fix: `Set motor quantity to ${mounts}.` });
    if (motorUnits > mounts) add({ severity: "warning", code: "TOO_MANY_MOTORS", message: `${motorUnits} motors for ${mounts} mounts — the extras won't fit.` });
  }

  const wheelUnits = unitsOf("wheels");
  if (chassis && !cc?.includes_wheels && !wheels) {
    add({ severity: "error", code: "MISSING_WHEELS", message: "This chassis doesn't come with wheels.", fix: "Add wheels that fit the motor shaft." });
  }
  if (wheels && motor) {
    if (wheels.part.compat.wheel_shaft !== motor.part.compat.shaft) {
      add({ severity: "error", code: "WHEEL_SHAFT_MISMATCH", message: `Wheels are for ${wheels.part.compat.wheel_shaft} shafts but the motors have ${motor.part.compat.shaft} shafts.`, part_ids: [wheels.part.id, motor.part.id] });
    }
    if (wheelUnits < motorUnits) add({ severity: "error", code: "TOO_FEW_WHEELS", message: `${wheelUnits} wheels for ${motorUnits} motors.`, fix: `Increase wheel quantity (they come in packs of ${wheels.part.pack_size}).` });
  }
  if (chassis && cc?.motor_mounts === 2 && !cc.includes_caster && !one("caster")) {
    add({ severity: "error", code: "MISSING_CASTER", message: "A two-wheel robot needs a caster or it will tip over.", fix: "Add a ball caster." });
  }

  // ---- motor driver ---------------------------------------------------------
  const bc = battery?.part.compat;
  const vNom = bc?.battery_nominal_v ?? 0;
  const vMax = bc?.battery_max_v ?? vNom;
  const stall = motor?.part.compat.stall_current_a ?? 0;

  if (driver && battery) {
    const dc = driver.part.compat;
    if (vMax > (dc.motor_v_max ?? Infinity)) {
      add({ severity: "error", code: "DRIVER_OVERVOLTAGE", message: `A full battery reaches ${vMax} V but ${driver.part.name} is rated to ${dc.motor_v_max} V — it can be destroyed.`, part_ids: [driver.part.id, battery.part.id], fix: "Use a lower-voltage battery or a driver rated higher." });
    }
    if (vNom < (dc.motor_v_min ?? 0)) {
      add({ severity: "error", code: "DRIVER_UNDERVOLTAGE", message: `${driver.part.name} needs at least ${dc.motor_v_min} V; the battery is ${vNom} V.`, part_ids: [driver.part.id, battery.part.id] });
    }
    if (dc.voltage_drop_v && motor) {
      const effective = vNom - dc.voltage_drop_v;
      if (effective < 0.8 * (motor.part.compat.nominal_v ?? 0)) {
        add({ severity: "warning", code: "DRIVER_VOLTAGE_DROP", message: `${driver.part.name} wastes about ${dc.voltage_drop_v} V as heat, so motors only see ~${effective.toFixed(1)} V and will be slow.`, part_ids: [driver.part.id], fix: "Use a MOSFET driver (e.g. TB6612FNG, Cytron)." });
      }
    }
  }
  if (driver && motor) {
    const dc = driver.part.compat;
    const channels = (dc.channels ?? 2) * driver.units;
    const motorsPerChannel = Math.ceil(motorUnits / channels);
    const runningLoad = stall * RUNNING_CURRENT_FRACTION * motorsPerChannel;
    const stallLoad = stall * motorsPerChannel;
    const cont = dc.continuous_a_per_channel ?? 0;
    if (cont < runningLoad) {
      add({ severity: "error", code: "DRIVER_TOO_WEAK", message: `Each driver channel must supply ~${runningLoad.toFixed(1)} A while driving and accelerating, but ${driver.part.name} handles ${cont} A.`, part_ids: [driver.part.id, motor.part.id], fix: "Pick a driver with higher continuous current." });
    } else if (cont < stallLoad) {
      add({ severity: "warning", code: "DRIVER_STALL_MARGIN", message: `If a wheel gets stuck, motors can pull ${stallLoad.toFixed(1)} A per channel — above the driver's ${cont} A rating. Normal driving is fine.`, part_ids: [driver.part.id], fix: "Accelerate gently in code (ramp PWM) or choose a stronger driver." });
    }
    if (motorsPerChannel > 1) {
      add({ severity: "info", code: "MOTORS_PAIRED", message: `${motorsPerChannel} motors share each driver channel (left side together, right side together). That's normal for skid-steer.` });
    }
  }

  // motor voltage vs battery
  if (motor && battery) {
    const ratio = vMax / (motor.part.compat.nominal_v ?? vMax);
    if (ratio > 1.5) {
      const duty = Math.round((100 * (motor.part.compat.nominal_v ?? 0)) / vMax);
      add({ severity: "warning", code: "MOTOR_OVERVOLTAGE", message: `The battery (${vMax} V full) is well above the motors' ${motor.part.compat.nominal_v} V rating — they'll run hot and wear fast.`, fix: `Cap PWM at ~${duty}% in firmware, or use a lower-voltage battery.` });
    } else if (vNom / (motor.part.compat.nominal_v ?? vNom) < 0.7) {
      add({ severity: "warning", code: "MOTOR_UNDERVOLTAGE", message: `The battery (${vNom} V) is well below the motors' ${motor.part.compat.nominal_v} V rating — the robot will be slow and weak.` });
    }
  }

  // logic levels: whoever drives the motor driver
  const motorHost = controller ?? compute;
  if (driver && motorHost) {
    const hostV = motorHost.part.compat.host_logic_v;
    const accepted = driver.part.compat.logic_v ?? [];
    if (hostV && accepted.length && !accepted.includes(hostV)) {
      add({ severity: "error", code: "LOGIC_LEVEL", message: `${motorHost.part.name} uses ${hostV} V signals but ${driver.part.name} expects ${accepted.join(" or ")} V.`, part_ids: [driver.part.id, motorHost.part.id], fix: "Add a level shifter or choose a compatible driver." });
    }
  }

  // ---- autonomy requirements ----------------------------------------------
  const lidar = one("lidar");
  const cameras = bySlot("camera");
  const depthCam = cameras.find((c) => c.part.tags.includes("depth"));
  if (requirements.autonomy === "mapping_navigation") {
    if (!compute) add({ severity: "error", code: "NAV_NEEDS_COMPUTE", message: "Mapping and autonomous navigation need a Linux computer running ROS 2.", fix: "Add a Raspberry Pi 5 or similar." });
    else if (!compute.part.compat.ros2) add({ severity: "error", code: "NAV_COMPUTE_TOO_WEAK", message: `${compute.part.name} can't comfortably run ROS 2 mapping and navigation.`, part_ids: [compute.part.id], fix: "Use a Raspberry Pi 5 (8 GB) or Jetson." });
    if (!lidar && !depthCam) add({ severity: "error", code: "NAV_NEEDS_RANGE_SENSOR", message: "To map a room the robot needs a lidar (or at least a depth camera).", fix: "Add a 2D lidar." });
    else if (!lidar) add({ severity: "warning", code: "NAV_NO_LIDAR", message: "Mapping with only a depth camera works but is less reliable than a 360° lidar for beginners." });
    if (lidar && !lidar.part.compat.ros2_driver) add({ severity: "warning", code: "NO_ROS2_DRIVER", message: `${lidar.part.name} has no well-known ROS 2 driver.` });
    if (motor && !motor.part.compat.has_encoder) add({ severity: "error", code: "NAV_NEEDS_ENCODERS", message: "Navigation needs wheel encoders so the robot knows how far it moved.", part_ids: [motor.part.id], fix: "Pick motors with encoders." });
    if (compute && !controller) add({ severity: "warning", code: "NAV_NO_MICROCONTROLLER", message: "Linux isn't real-time; reading encoders and driving motors directly from the computer is unreliable.", fix: "Add a microcontroller (Pico 2, ESP32, Teensy) for motor control." });
    if (!one("imu")) add({ severity: "info", code: "NAV_IMU_RECOMMENDED", message: "An IMU improves odometry when turning — cheap upgrade." });
  }
  if (requirements.autonomy === "obstacle_avoidance" && !lidar && cameras.length === 0 && !one("distance_sensor")) {
    add({ severity: "error", code: "AVOID_NEEDS_SENSOR", message: "Obstacle avoidance needs at least one distance sensor, camera or lidar." });
  }

  // ---- sensors / interfaces -----------------------------------------------
  const peripherals = lines.filter((l) => ["lidar", "camera", "imu", "distance_sensor"].includes(l.part.slot));
  const usbDevices = peripherals.filter((l) => l.part.compat.interface === "usb").reduce((n, l) => n + l.units, 0);
  if (usbDevices > 0) {
    if (!compute) add({ severity: "error", code: "USB_NEEDS_COMPUTE", message: "USB sensors (lidar/depth camera) need a computer with USB ports.", fix: "Add a Raspberry Pi or Jetson." });
    else if (usbDevices > (compute.part.compat.usb_ports ?? 0)) add({ severity: "warning", code: "USB_PORTS", message: `${usbDevices} USB devices but ${compute.part.name} has ${compute.part.compat.usb_ports} port(s).`, fix: "Add a powered USB hub." });
  }
  for (const p of peripherals) {
    const iface = p.part.compat.interface;
    const hosts = [controller, compute].filter(Boolean) as Line[];
    if (iface === "csi" && !compute?.part.compat.has_csi) add({ severity: "error", code: "CSI_NEEDS_PI", message: `${p.part.name} plugs into a camera (CSI) port — add a Raspberry Pi or Jetson.`, part_ids: [p.part.id] });
    if (iface === "i2c" && !hosts.some((h) => h.part.compat.has_i2c)) add({ severity: "error", code: "NO_I2C_HOST", message: `Nothing in the build can read ${p.part.name} (I2C).`, part_ids: [p.part.id] });
    if (iface === "uart" && !hosts.some((h) => h.part.compat.has_uart)) add({ severity: "error", code: "NO_UART_HOST", message: `Nothing in the build can read ${p.part.name} (UART).`, part_ids: [p.part.id] });
    if ((iface === "gpio" || iface === "uart") && p.part.compat.sensor_logic_v === 5) {
      const host = iface === "gpio" ? controller ?? compute : compute ?? controller;
      if (host?.part.compat.host_logic_v === 3.3) add({ severity: "warning", code: "SENSOR_5V_SIGNAL", message: `${p.part.name} outputs 5 V signals; ${host.part.name} pins are 3.3 V only.`, part_ids: [p.part.id, host.part.id], fix: "Add a simple voltage divider (two resistors) on the signal line." });
    }
  }

  // ---- power --------------------------------------------------------------
  let fiveTyp = 0;
  let fivePeak = 0;
  let batteryLoadW = 0;
  let onboardFiveCapacity = 0;
  for (const l of lines) {
    const c = l.part.compat;
    const vinPowered = c.vin_min !== undefined && battery !== undefined && vNom >= c.vin_min && vMax <= (c.vin_max ?? Infinity);
    if (c.vin_min !== undefined) {
      if (vinPowered) {
        batteryLoadW += (c.battery_load_w ?? 0) * l.units;
        onboardFiveCapacity += c.onboard_5v_out_a ?? 0;
      } else if (battery) {
        if (l.part.slot === "compute") {
          add({ severity: "error", code: "VIN_OUT_OF_RANGE", message: `${l.part.name} needs ${c.vin_min}–${c.vin_max} V input; the battery is ${vNom}–${vMax} V.`, part_ids: [l.part.id, battery.part.id], fix: "Use a battery in that range or a dedicated DC-DC converter for the computer." });
        } else {
          // board can still be powered from the 5 V rail via its 5V/USB pin
          fiveTyp += 0.1 * l.units;
          fivePeak += 0.2 * l.units;
        }
      }
    }
    if (c.five_v_load) {
      fiveTyp += c.five_v_load.typical_a * l.units;
      fivePeak += c.five_v_load.peak_a * l.units;
    }
  }

  if (fiveTyp > 0) {
    if (!regulator) {
      if (fivePeak <= onboardFiveCapacity) {
        add({ severity: "info", code: "ONBOARD_5V", message: "Small sensors can run from the controller's onboard 5 V pin." });
      } else {
        add({ severity: "error", code: "NO_5V_SUPPLY", message: `The electronics need a 5 V supply (~${fivePeak.toFixed(1)} A peak) and nothing provides it.`, fix: "Add a 5 V step-down regulator." });
      }
    } else if (battery) {
      const rc = regulator.part.compat;
      const emptyV = vNom * 0.9;
      if (vMax > (rc.input_v_max ?? Infinity)) add({ severity: "error", code: "REG_OVERVOLTAGE", message: `${regulator.part.name} accepts up to ${rc.input_v_max} V; a full battery is ${vMax} V.`, part_ids: [regulator.part.id] });
      if (emptyV < (rc.input_v_min ?? 0)) add({ severity: "error", code: "REG_UNDERVOLTAGE", message: `${regulator.part.name} needs at least ${rc.input_v_min} V input; the battery drops to ~${emptyV.toFixed(1)} V.`, part_ids: [regulator.part.id], fix: "Use a higher-voltage battery." });
      const out = rc.output_a ?? 0;
      if (out < fiveTyp) add({ severity: "error", code: "REG_TOO_WEAK", message: `5 V loads draw ~${fiveTyp.toFixed(1)} A but ${regulator.part.name} supplies ${out} A.`, part_ids: [regulator.part.id], fix: "Use a regulator rated for at least the peak current (e.g. 5 A)." });
      else if (out < fivePeak) add({ severity: "warning", code: "REG_PEAK_MARGIN", message: `Peak 5 V draw (~${fivePeak.toFixed(1)} A) exceeds ${regulator.part.name}'s ${out} A — the computer may reboot under load.`, part_ids: [regulator.part.id], fix: "Pick a regulator with more headroom." });
    }
  }

  const motorStallTotal = stall * motorUnits;
  const fiveBatteryA = vNom ? (fivePeak * 5) / (vNom * REGULATOR_EFFICIENCY) : 0;
  const otherBatteryA = vNom ? batteryLoadW / vNom : 0;
  if (battery) {
    const maxA = bc?.max_continuous_a ?? Infinity;
    const running = motorStallTotal * RUNNING_CURRENT_FRACTION + fiveBatteryA + otherBatteryA;
    const peak = motorStallTotal + fiveBatteryA + otherBatteryA;
    if (maxA < running) add({ severity: "error", code: "BATTERY_CURRENT", message: `The robot draws ~${running.toFixed(1)} A while driving; the battery is rated for ${maxA} A.`, part_ids: [battery.part.id] });
    else if (maxA < peak) add({ severity: "warning", code: "BATTERY_PEAK", message: `Worst case (wheels stuck) the robot could pull ~${peak.toFixed(1)} A — above the battery's ${maxA} A limit, so its protection may cut power.`, part_ids: [battery.part.id], fix: "Ramp motor speed in code, or use a battery with a higher current rating." });
    if (bc?.chemistry === "LiPo") add({ severity: "info", code: "LIPO_SAFETY", message: "LiPo batteries need a balance charger, a fireproof charging bag and a low-voltage alarm." });
  }

  // ---- mass, payload, torque ----------------------------------------------
  const massG = lines.reduce((g, l) => g + l.part.mass_g * l.item.quantity, 0);
  const payloadKg = (massG - (chassis ? chassis.part.mass_g : 0)) / 1000 + (requirements.payload_kg ?? 0);
  if (chassis && cc?.max_payload_kg !== undefined) {
    if (payloadKg > cc.max_payload_kg) add({ severity: "error", code: "OVER_PAYLOAD", message: `Load on the chassis is ~${payloadKg.toFixed(1)} kg but it's rated for ${cc.max_payload_kg} kg.`, part_ids: [chassis.part.id] });
    else if (payloadKg > 0.8 * cc.max_payload_kg) add({ severity: "warning", code: "NEAR_PAYLOAD", message: `Load (~${payloadKg.toFixed(1)} kg) is close to the chassis limit of ${cc.max_payload_kg} kg.` });
  }
  if (motor && motorUnits > 0) {
    const totalKg = massG / 1000 + (requirements.payload_kg ?? 0);
    const wheelDiaMm = wheels?.part.compat.wheel_diameter_mm ?? 65;
    const neededKgcm = (totalKg * (wheelDiaMm / 20) * ROLLING_FACTOR) / motorUnits;
    const have = motor.part.compat.stall_torque_kgcm ?? Infinity;
    if (have < neededKgcm * TORQUE_MARGIN) {
      add({ severity: "warning", code: "LOW_TORQUE", message: `The motors may struggle to move ~${totalKg.toFixed(1)} kg (need roughly ${(neededKgcm * TORQUE_MARGIN).toFixed(1)} kg·cm stall torque each, have ${have}).`, part_ids: [motor.part.id], fix: "Use stronger/higher-ratio motors, smaller wheels, or lighten the robot." });
    }
  }
  if (requirements.environment === "outdoor" && cc?.motor_form_factor === "TT") {
    add({ severity: "warning", code: "TT_OUTDOOR", message: "TT motors and plastic chassis struggle on grass, gravel and slopes.", fix: "Use 37D motors and larger wheels for outdoor use." });
  }

  // ---- runtime & price ------------------------------------------------------
  let runtime: number | null = null;
  if (battery && bc?.capacity_wh) {
    const motorV = Math.min(vNom, motor?.part.compat.nominal_v ?? vNom);
    const avgW = (fiveTyp * 5) / REGULATOR_EFFICIENCY + batteryLoadW + motorStallTotal * AVG_MOTOR_DUTY * motorV;
    if (avgW > 0) {
      runtime = Math.round(((bc.capacity_wh * USABLE_BATTERY_FRACTION) / avgW) * 60);
      const minRuntime = requirements.min_runtime_min ?? 20;
      if (runtime < minRuntime) add({ severity: "warning", code: "SHORT_RUNTIME", message: `Estimated runtime is ~${runtime} min (target ${minRuntime} min).`, fix: "Use a larger battery or lower-power electronics." });
    }
  }
  const price = lines.reduce((p, l) => p + l.part.price_usd_approx * l.item.quantity, 0);
  if (requirements.budget_usd !== undefined && price > requirements.budget_usd) {
    add({ severity: "warning", code: "OVER_BUDGET", message: `Approximate total ~$${Math.round(price)} is over the $${requirements.budget_usd} budget.` });
  }

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    totals: {
      price_usd_approx: Math.round(price * 100) / 100,
      mass_kg: Math.round(massG) / 1000,
      est_runtime_min: runtime,
      five_v_typical_a: Math.round(fiveTyp * 100) / 100,
      five_v_peak_a: Math.round(fivePeak * 100) / 100,
    },
  };
}
