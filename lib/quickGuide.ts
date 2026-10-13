// Generates a step-by-step build guide from a build. Deterministic, so it always matches the cart.
import type { BuildItem, Part, Slot } from "./compat/types";
import { type Answers, findUseCase } from "./flow";
import { generateFirmware } from "./electronics/firmware";
import { planWiring } from "./wiring";

export type ToolIcon = "screwdriver" | "multimeter" | "wires" | "ties" | "solder" | "charger" | "fuse";

/** What the guide shows next to a step. */
export type GuideVisual =
  | { kind: "assembly"; show: Slot[]; highlight: Slot[] }
  | { kind: "wire"; n: number }
  | { kind: "code"; filename: string; language: "cpp" | "python"; code: string }
  | { kind: "parts"; ids: string[] }
  | { kind: "tools"; tools: { name: string; icon: ToolIcon }[] };

export interface GuideStep {
  title: string;
  body: string;
  visual?: GuideVisual;
  /** Parts handled in this step, shown as thumbnails. */
  parts?: string[];
}
export interface GuideSection {
  title: string;
  time: string;
  steps: GuideStep[];
}

export function buildGuide(items: BuildItem[], byId: Record<string, Part>, answers: Answers): GuideSection[] {
  const parts = items.map((i) => byId[i.part_id]).filter(Boolean);
  const get = (s: Slot) => parts.find((p) => p.slot === s);
  const chassis = get("chassis");
  const motor = get("drive_motor");
  const battery = get("battery");
  const controller = get("controller");
  const compute = get("compute");
  const regulator = get("regulator");
  const lidar = get("lidar");
  const camera = get("camera");
  const distance = get("distance_sensor");
  const imu = get("imu");
  const uc = findUseCase(answers.useCase);
  const usesRos = !!compute?.compat.ros2 && uc?.needsCompute;
  const solder = parts.some((p) => ["imu", "distance_sensor"].includes(p.slot) && p.compat.interface === "i2c") || !!motor?.compat.has_encoder || !!regulator;

  const toolList: { name: string; icon: ToolIcon }[] = [
    { name: "Small Phillips and flat screwdrivers", icon: "screwdriver" },
    { name: "Multimeter (any cheap one) for checking voltages", icon: "multimeter" },
    { name: "Jumper wires (male–female and female–female), and 18–20 AWG wire for power", icon: "wires" },
    { name: "Zip ties or double-sided foam tape", icon: "ties" },
    { name: solder ? "Soldering iron and solder, for header pins and power leads" : "No soldering needed if you buy boards with headers already fitted", icon: "solder" },
    {
      name: battery?.compat.chemistry === "LiPo" ? "LiPo balance charger, fireproof charging bag and a low-voltage alarm" : battery?.compat.chemistry === "Li-ion" ? `A ${battery.compat.battery_max_v} V Li-ion charger matching the pack` : "AA NiMH charger",
      icon: "charger",
    },
    { name: "An inline fuse (5–10 A) and a rocker switch for the battery lead", icon: "fuse" },
  ];
  const tools = toolList.map((t) => t.name);
  const idOf = (...slots: Slot[]) => parts.filter((p) => slots.includes(p.slot)).map((p) => p.id);
  // Cumulative assembly: each step shows everything fitted so far.
  const shown: Slot[] = [];
  const fit = (...slots: Slot[]): GuideVisual => {
    const present = slots.filter((s) => get(s));
    shown.push(...present);
    return { kind: "assembly", show: [...shown], highlight: present };
  };

  const sections: GuideSection[] = [];
  sections.push({
    title: "Before you start",
    time: "15 min",
    steps: [
      { title: "Check the box", body: `Lay out every part from your bag and tick it off against the cart. You should have ${parts.length} different parts.`, visual: { kind: "parts", ids: parts.map((p) => p.id) } },
      { title: "Gather your tools", body: tools.map((t) => `• ${t}`).join("\n"), visual: { kind: "tools", tools: toolList } },
      { title: "Charge the battery", body: `Start charging the ${battery?.name ?? "battery"} now so it's ready for the first drive.`, visual: { kind: "parts", ids: idOf("battery") }, parts: idOf("battery") },
    ],
  });

  const mech: GuideStep[] = [];
  if (chassis) mech.push({ title: "Assemble the frame", body: `Follow the ${chassis.name} instructions for the lower deck. Leave the top deck off for now so you can reach the wiring.`, visual: fit("chassis"), parts: idOf("chassis") });
  if (motor) mech.push({ title: "Mount the motors", body: `Bolt the ${chassis?.compat.motor_mounts ?? 2} motors into their brackets with the shafts pointing outwards.${motor.compat.has_encoder ? " Keep the encoder cables free; you'll route them up to the controller later." : ""} Solder short leads to TT motor tabs if they don't have wires.`, visual: fit("drive_motor"), parts: idOf("drive_motor") });
  mech.push({ title: "Fit the wheels", body: `Push the wheels onto the shafts and tighten any set screws. Spin each wheel by hand: it should turn without rubbing the frame.${get("caster") || chassis?.compat.includes_caster ? " Screw the caster to the rear so the robot sits level." : ""}`, visual: fit("wheels", "caster"), parts: idOf("wheels", "caster") });
  mech.push({ title: "Place the battery low and central", body: `Strap the ${battery?.name ?? "battery"} to the lower deck between the wheels with Velcro. A low, central battery keeps the robot from tipping.`, visual: fit("battery"), parts: idOf("battery") });
  sections.push({ title: "Build the base", time: "45 min", steps: mech });

  const wiring = planWiring(items, byId);
  sections.push({
    title: "Wire it up",
    time: "1 h",
    steps: [
      {
        title: "Mount the boards",
        body: `Fix the motor driver to the lower deck${controller ? `, and the ${controller.name} ` : ""}${compute ? `and the ${compute.name} on the top deck` : " where you can reach its USB port"}. Use nylon standoffs so no board touches metal.`,
        visual: fit("motor_driver", "regulator", "controller", "compute"),
        parts: idOf("motor_driver", "regulator", "controller", "compute"),
      },
      ...(lidar || camera || distance || imu
        ? [
            {
              title: "Mount the sensors",
              body: [lidar && "Put the lidar on the top deck, centred and higher than everything else, so nothing blocks its view.", camera && "Fix the camera at the front, facing forward and level.", distance && "Mount the distance sensor at the front, facing straight ahead.", imu && "Stick the motion sensor flat, near the middle of the robot, away from the motors."].filter(Boolean).join(" "),
              visual: fit("lidar", "camera", "distance_sensor", "imu"),
              parts: idOf("lidar", "camera", "distance_sensor", "imu"),
            },
          ]
        : []),
      ...wiring.wires.map((w) => ({ title: `${w.n}. ${w.label}`, body: w.pins + (w.note ? `\n${w.note}` : ""), visual: { kind: "wire", n: w.n } as GuideVisual })),
      { title: "Check before power", body: "With the battery still unplugged, use the multimeter's continuity mode to check there's no short between + and −. Then plug in the battery with the switch off.", visual: { kind: "assembly", show: [...shown], highlight: [] } as GuideVisual },
      ...(regulator ? [{ title: "Set the 5 V rail", body: "Switch on. Measure the 5 V output: it should read 5.0–5.2 V. Only then connect the controller and computer.", visual: { kind: "assembly", show: [...shown], highlight: ["regulator"] } as GuideVisual, parts: idOf("regulator") }] : []),
    ],
  });

  const soft: GuideStep[] = [];
  if (controller) {
    const isArduino = controller.id.includes("arduino");
    const isEsp = controller.id.includes("esp32");
    soft.push({
      title: `Program the ${controller.name}`,
      body: usesRos
        ? `Install PlatformIO in VS Code and flash the linorobot2 firmware for your board (github.com/linorobot/linorobot2_hardware). Set the motor pins, encoder counts per revolution and wheel diameter in the config file.`
        : isArduino
          ? "Install the Arduino IDE, select 'Arduino UNO R4 Minima', and upload the Blink example to check the board works."
          : isEsp
            ? "Install the Arduino IDE, add the ESP32 board package, and upload the Blink example."
            : "Install the Arduino IDE with the Raspberry Pi Pico board package (or use MicroPython), then upload Blink.",
    });
  }
  const fw = generateFirmware(items, byId);
  if (fw) {
    soft.push({
      title: usesRos ? "Test the motors first" : "Make the wheels turn",
      body: `${fw.howTo.join(" ")} Each wheel spins forward, then backward. If one side runs backwards, swap that motor's two leads.${usesRos ? " Once this works, flash linorobot2 using the same pins." : ""}`,
      visual: { kind: "code", filename: fw.filename, language: fw.language, code: fw.code },
    });
  }
  if (compute) {
    soft.push({
      title: `Set up the ${compute.name}`,
      body: compute.id.includes("jetson")
        ? "Flash JetPack with NVIDIA SDK Manager, then install ROS 2 following NVIDIA's Isaac ROS guide."
        : `Flash Ubuntu Server 24.04 to a microSD card with Raspberry Pi Imager. Enable SSH and Wi-Fi in the imager settings so you can work without a screen.${usesRos ? " Then install ROS 2 Jazzy." : ""}`,
    });
  }
  if (usesRos) {
    soft.push({ title: "Install linorobot2", body: "Clone github.com/linorobot/linorobot2 into your ROS 2 workspace and run its install script with your base type (2wd or 4wd) and sensor names. It sets up the micro-ROS agent, sensors and Nav2." });
    if (lidar) soft.push({ title: "Check the lidar", body: `Plug in the ${lidar.name}, launch the lidar driver, and open RViz on your laptop. You should see the room's walls as dots around the robot.` });
  }
  if (camera?.id === "cam-oak-d-lite") soft.push({ title: "Run person detection", body: "Install the depthai-ros package and launch its spatial detection example. It reports each person's position in 3D, which you'll use to follow them." });
  if (distance && !compute) soft.push({ title: "Read the distance sensor", body: `Use the ${distance.compat.interface === "i2c" ? "Pololu VL53L1X" : "NewPing"} library and print the distance to the serial monitor. Wave your hand in front: the number should change.` });
  if (imu) soft.push({ title: "Read the motion sensor", body: "Install the Adafruit BNO08x library and print the heading. Rotate the robot by hand: the heading should follow." });
  const all: Slot[] = [...new Set(parts.map((p) => p.slot))];
  const lit = (...slots: Slot[]): GuideVisual => ({ kind: "assembly", show: all, highlight: slots });
  if (!controller && !compute) {
    soft.push({ title: "Add a controller first", body: "This build has no controller or computer, so nothing can run code yet. Go back to the Build step and add one: the guide then fills in the wiring and software for it.", visual: lit() });
  }
  for (const st of soft) {
    if (st.visual) continue;
    const t = st.title.toLowerCase();
    st.visual = t.includes("lidar") ? lit("lidar") : t.includes("person") ? lit("camera") : t.includes("distance") ? lit("distance_sensor") : t.includes("motion") ? lit("imu") : t.includes(compute?.name.toLowerCase() ?? "@") || t.includes("linorobot") ? lit("compute") : lit("controller");
  }
  sections.push({ title: "Bring it to life", time: usesRos ? "3–4 h" : "1 h", steps: soft });

  const first: GuideStep[] = [];
  switch (uc?.id) {
    case "drive":
      first.push({ title: "Drive from your phone", body: controller?.tags.includes("wifi") ? "Use a Bluetooth gamepad library (e.g. Bluepad32) or host a small web page on the ESP32 with four buttons. Start slow: cap speed at 50%." : "Add a Bluetooth module or drive over USB from your laptop to start." });
      break;
    case "avoid":
      first.push({ title: "Avoid obstacles", body: "Loop: read the distance; if it's under 25 cm, stop, reverse for half a second and turn; otherwise drive forward. Tune the distance and turn time on your floor." });
      break;
    case "map":
    case "carry":
      first.push({ title: "Make your first map", body: "Launch linorobot2's SLAM mode and drive slowly around each room with the keyboard teleop. Save the map when the walls look closed." });
      first.push({ title: "Send it somewhere", body: "Launch navigation with your saved map, set the robot's start pose in RViz, and click a goal. It should plan a path and drive there, avoiding furniture." });
      if (uc?.id === "carry") first.push({ title: "Add the tray", body: "Fix a tray or box to the top deck, centred over the wheels, and test with half the load first. Lower max speed and acceleration in the Nav2 config when loaded." });
      break;
    case "follow":
      first.push({ title: "Follow a person", body: "Take the nearest detected person's position and steer to keep them centred at about 1 m. Stop if they're closer than 0.6 m. Test in an open space first." });
      break;
  }
  first.push({ title: "Share your build", body: "Post a photo and your parts list (the Share button on the Cart step) so others can copy it, or so you can ask for help." });
  for (const st of first) st.visual ??= lit();
  sections.push({ title: "First mission", time: "30 min", steps: first });
  return sections;
}

export function guideToMarkdown(title: string, sections: GuideSection[]): string {
  let md = `# ${title}\n\n`;
  for (const s of sections) {
    md += `## ${s.title} (${s.time})\n\n`;
    for (const st of s.steps) {
      md += `### ${st.title}\n\n${st.body}\n\n`;
      if (st.visual?.kind === "code") md += "```" + st.visual.language + "\n" + st.visual.code + "\n```\n\n";
    }
  }
  return md;
}
