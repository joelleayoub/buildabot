// Shared types for parts, builds and compatibility results.

export type Slot =
  | "chassis"
  | "drive_motor"
  | "wheels"
  | "caster"
  | "motor_driver"
  | "controller" // microcontroller for real-time motor control
  | "compute" // Linux single-board computer for autonomy / ROS 2
  | "battery"
  | "regulator" // step-down converter for the 5 V rail
  | "lidar"
  | "camera"
  | "imu"
  | "distance_sensor";

export type Interface = "usb" | "uart" | "i2c" | "gpio" | "csi" | "pwm";

/** Load on the regulated 5 V rail. */
export interface FiveVoltLoad {
  typical_a: number;
  peak_a: number;
}

export interface PartCompat {
  // chassis
  motor_form_factor?: "TT" | "25D" | "37D";
  motor_mounts?: number;
  max_payload_kg?: number;
  includes_wheels?: boolean;
  includes_caster?: boolean;

  // drive motor
  nominal_v?: number;
  stall_current_a?: number;
  no_load_rpm?: number;
  stall_torque_kgcm?: number;
  has_encoder?: boolean;
  shaft?: "TT" | "4mm" | "6mm";

  // wheels
  wheel_shaft?: "TT" | "4mm" | "6mm";
  wheel_diameter_mm?: number;

  // motor driver
  motor_v_min?: number;
  motor_v_max?: number;
  continuous_a_per_channel?: number;
  channels?: number;
  logic_v?: number[]; // accepted logic levels, e.g. [3.3, 5]
  voltage_drop_v?: number; // e.g. L298N bipolar drop

  // battery
  battery_nominal_v?: number;
  battery_max_v?: number;
  capacity_wh?: number;
  max_continuous_a?: number;
  chemistry?: string;

  // regulator
  input_v_min?: number;
  input_v_max?: number;
  output_v?: number;
  output_a?: number;

  // anything powered directly from the battery (e.g. Jetson, Arduino VIN)
  vin_min?: number;
  vin_max?: number;
  onboard_5v_out_a?: number; // 5 V a VIN-powered board can supply to small sensors

  // controllers / compute
  host_logic_v?: number; // GPIO logic level of this board
  usb_ports?: number;
  has_i2c?: boolean;
  has_uart?: boolean;
  has_csi?: boolean;
  ros2?: boolean;

  // sensors / peripherals
  interface?: Interface;
  sensor_logic_v?: number; // signal level it outputs
  ros2_driver?: boolean;

  // power draw on the 5 V rail (compute, sensors, controllers powered via 5 V)
  five_v_load?: FiveVoltLoad;
  // power drawn directly from the battery (W), e.g. Jetson on VIN
  battery_load_w?: number;
}

export interface Part {
  id: string;
  name: string;
  slot: Slot;
  brand: string;
  description: string;
  price_usd_approx: number;
  pack_size: number; // units per purchase (e.g. wheels come in pairs)
  mass_g: number;
  buy_url: string; // retailer search link until verified product/affiliate links exist
  tags: string[];
  compat: PartCompat;
}

export interface BuildItem {
  part_id: string;
  quantity: number; // number of purchases (packs), not units
  reason?: string;
}

export interface Requirements {
  autonomy: "remote_control" | "obstacle_avoidance" | "mapping_navigation";
  environment?: "indoor_flat" | "indoor_mixed" | "outdoor";
  payload_kg?: number;
  budget_usd?: number;
  min_runtime_min?: number;
}

export type Severity = "error" | "warning" | "info";

export interface Issue {
  severity: Severity;
  code: string;
  message: string; // plain-language explanation for the user
  part_ids?: string[];
  fix?: string;
}

export interface BuildReport {
  ok: boolean; // no errors
  issues: Issue[];
  totals: {
    price_usd_approx: number;
    mass_kg: number;
    est_runtime_min: number | null;
    five_v_typical_a: number;
    five_v_peak_a: number;
  };
}
