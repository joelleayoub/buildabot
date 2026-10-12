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
