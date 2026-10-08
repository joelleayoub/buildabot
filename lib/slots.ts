import type { Requirements, Slot } from "./compat/types";

export const SLOT_LABELS: Record<Slot, string> = {
  chassis: "Chassis",
  drive_motor: "Drive motors",
  wheels: "Wheels",
  caster: "Caster",
  motor_driver: "Motor driver",
  controller: "Controller",
  compute: "Compute",
  battery: "Battery",
  regulator: "Regulator",
  lidar: "Lidar",
  camera: "Camera",
  imu: "IMU",
  distance_sensor: "Distance sensor",
};

export const SLOT_ORDER = Object.keys(SLOT_LABELS) as Slot[];

export const AUTONOMY_LABELS: Record<Requirements["autonomy"], string> = {
  remote_control: "Drive by remote control",
  obstacle_avoidance: "Avoid obstacles on its own",
  mapping_navigation: "Map rooms and navigate on its own",
};
