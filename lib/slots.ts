import type { Requirements, Slot } from "./compat/types";

export const SLOT_LABELS: Record<Slot, string> = {
  chassis: "Chassis",
  drive_motor: "Motors",
  wheels: "Wheels",
  caster: "Caster",
  motor_driver: "Motor driver",
  controller: "Controller",
  compute: "Computer",
  battery: "Battery",
  regulator: "5 V supply",
  lidar: "Lidar",
  camera: "Camera",
  imu: "Motion sensor",
  distance_sensor: "Distance sensor",
};

export const SLOT_ORDER = Object.keys(SLOT_LABELS) as Slot[];

export const AUTONOMY_LABELS: Record<Requirements["autonomy"], string> = {
  remote_control: "Drive by remote control",
  obstacle_avoidance: "Avoid obstacles on its own",
  mapping_navigation: "Map rooms and navigate on its own",
};

/** Four families of parts, each with its own colour (see the --g-* variables in globals.css). */
export type SlotGroup = "body" | "power" | "brain" | "sense";

export const GROUP_LABELS: Record<SlotGroup, string> = {
  body: "Body and drive",
  power: "Power",
  brain: "Brains",
  sense: "Sensors",
};

export const GROUP_ORDER = Object.keys(GROUP_LABELS) as SlotGroup[];

export const SLOT_GROUP: Record<Slot, SlotGroup> = {
  chassis: "body",
  drive_motor: "body",
  wheels: "body",
  caster: "body",
  motor_driver: "power",
  battery: "power",
  regulator: "power",
  controller: "brain",
  compute: "brain",
  lidar: "sense",
  camera: "sense",
  imu: "sense",
  distance_sensor: "sense",
};

export const groupColor = (group: SlotGroup) => `var(--g-${group})`;

/** One-line, beginner-friendly explanation of what each kind of part does. */
export const SLOT_EXPLAIN: Record<Slot, string> = {
  chassis: "The frame everything bolts onto.",
  drive_motor: "Turn the wheels. Motors with encoders also count how far each wheel turned.",
  wheels: "Grip the floor. Bigger wheels roll over cables and rug edges more easily.",
  caster: "A free-rolling ball that keeps a two-wheel robot level.",
  motor_driver: "Takes small signals from the controller and switches the big battery current to the motors.",
  controller: "A small microcontroller that runs your code in real time: motors, sensors and timing.",
  compute: "A small Linux computer for the heavy thinking: maps, cameras and navigation.",
  battery: "Stores the energy. Its voltage has to suit the motors and the driver.",
  regulator: "Turns the battery voltage into a steady 5 V for the electronics.",
  lidar: "Spins a laser to measure distances all around, so the robot can map the room.",
  camera: "The robot's eyes. Depth cameras also measure how far away things are.",
  imu: "Senses turning and tilting, like the motion sensor in your phone.",
  distance_sensor: "Measures the distance to whatever is in front, so the robot can stop in time.",
};

/** A slot label inside a sentence: "motor driver", but "5 V supply" keeps its capital V. */
export const slotNoun = (s: Slot) => SLOT_LABELS[s].replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
