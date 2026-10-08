// Ready-made builds users can load into the cart without talking to the advisor.
// Both are covered by lib/sampleBuilds.test.ts — they must pass checkBuild with no errors.

import type { BuildItem, Requirements } from "./compat/types";

export interface SampleBuild {
  id: string;
  name: string;
  tagline: string;
  /** Matching entry in data/reference_designs.json. */
  reference_design_id: string;
  requirements: Requirements;
  items: BuildItem[];
}

export const SAMPLE_BUILDS: SampleBuild[] = [
  {
    id: "starter-avoider",
    name: "Starter obstacle avoider",
    tagline: "The classic first robot: drives around and turns away from walls.",
    reference_design_id: "ref-starter-avoider",
    requirements: { autonomy: "obstacle_avoidance", environment: "indoor_flat" },
    items: [
      { part_id: "chassis-2wd-tt-acrylic", quantity: 1, reason: "Cheapest base; wheels and caster are included." },
      { part_id: "motor-tt-basic", quantity: 2, reason: "Fit the chassis mounts; no encoders needed for simple avoidance." },
      { part_id: "driver-tb6612fng", quantity: 1, reason: "Efficient driver sized for small TT motors." },
      { part_id: "ctrl-arduino-uno-r4-minima", quantity: 1, reason: "Beginner board with the most tutorials; runs straight from the battery." },
      { part_id: "dist-hc-sr04", quantity: 1, reason: "Simple ultrasonic sensor to detect obstacles ahead." },
      { part_id: "batt-aa-nimh-6x", quantity: 1, reason: "Safe rechargeable AA cells — no special charger." },
    ],
  },
  {
    id: "mapping-rover",
    name: "Apartment mapping rover",
    tagline: "A ROS 2 rover that maps rooms with a lidar and drives itself.",
    reference_design_id: "ref-linorobot2",
    requirements: { autonomy: "mapping_navigation", environment: "indoor_flat" },
    items: [
      { part_id: "chassis-2wd-37d-plate", quantity: 1, reason: "Two-deck base with room for a lidar on top." },
      { part_id: "motor-jgb37-520-12v-encoder", quantity: 2, reason: "Strong low-cost motors with encoders for odometry." },
      { part_id: "wheels-100mm-6mm-hub", quantity: 1, reason: "Large wheels that roll over cables and rug edges." },
      { part_id: "caster-ball-metal", quantity: 1, reason: "Third contact point for a two-wheel robot." },
      { part_id: "driver-cytron-mdd10a", quantity: 1, reason: "Plenty of current headroom for 37D motors." },
      { part_id: "ctrl-teensy-41", quantity: 1, reason: "Real-time motor control and encoder reading via micro-ROS." },
      { part_id: "compute-rpi5-8gb", quantity: 1, reason: "Runs ROS 2 mapping and navigation." },
      { part_id: "lidar-rplidar-c1", quantity: 1, reason: "360° laser scanner for building the map." },
      { part_id: "imu-bno085", quantity: 1, reason: "Improves odometry when turning." },
      { part_id: "batt-3s-liion-18650-bms", quantity: 1, reason: "Protected 12 V pack with a simple charger." },
      { part_id: "reg-pololu-d36v50f5", quantity: 1, reason: "Solid 5 V supply for the Pi 5 and lidar." },
    ],
  },
];
