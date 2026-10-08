// Run: npx tsx --test lib/compat/checkBuild.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkBuild } from "./checkBuild";
import type { BuildItem, Part } from "./types";

const parts: Part[] = JSON.parse(readFileSync(join(__dirname, "../../data/parts.json"), "utf8"));
const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
const codes = (r: ReturnType<typeof checkBuild>, sev?: string) =>
  r.issues.filter((i) => !sev || i.severity === sev).map((i) => i.code);

const starter: BuildItem[] = [
  { part_id: "chassis-2wd-tt-acrylic", quantity: 1 },
  { part_id: "motor-tt-basic", quantity: 2 },
  { part_id: "driver-tb6612fng", quantity: 1 },
  { part_id: "ctrl-arduino-uno-r4-minima", quantity: 1 },
  { part_id: "dist-hc-sr04", quantity: 1 },
  { part_id: "batt-aa-nimh-6x", quantity: 1 },
];

const mapper: BuildItem[] = [
  { part_id: "chassis-2wd-37d-plate", quantity: 1 },
  { part_id: "motor-jgb37-520-12v-encoder", quantity: 2 },
  { part_id: "wheels-100mm-6mm-hub", quantity: 1 },
  { part_id: "caster-ball-metal", quantity: 1 },
  { part_id: "driver-cytron-mdd10a", quantity: 1 },
  { part_id: "ctrl-teensy-41", quantity: 1 },
  { part_id: "compute-rpi5-8gb", quantity: 1 },
  { part_id: "lidar-rplidar-c1", quantity: 1 },
  { part_id: "imu-bno085", quantity: 1 },
  { part_id: "batt-3s-liion-18650-bms", quantity: 1 },
  { part_id: "reg-pololu-d36v50f5", quantity: 1 },
];

test("every part has the fields the checker relies on", () => {
  const ids = new Set<string>();
  for (const p of parts) {
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.buy_url.startsWith("https://"), p.id);
    assert.ok(p.price_usd_approx > 0 && p.mass_g > 0 && p.pack_size >= 1, p.id);
  }
});

test("reference designs only point at real parts", () => {
  const designs = JSON.parse(readFileSync(join(__dirname, "../../data/reference_designs.json"), "utf8"));
  for (const d of designs) for (const id of d.similar_part_ids) assert.ok(byId[id], `${d.id} -> ${id}`);
});

test("classic starter obstacle-avoider passes", () => {
  const r = checkBuild(starter, byId, { autonomy: "obstacle_avoidance" });
  assert.equal(r.ok, true, JSON.stringify(r.issues, null, 2));
  assert.ok(r.totals.price_usd_approx < 80);
});

test("linorobot2-style mapping rover passes", () => {
  const r = checkBuild(mapper, byId, { autonomy: "mapping_navigation" });
  assert.equal(r.ok, true, JSON.stringify(r.issues, null, 2));
  assert.ok((r.totals.est_runtime_min ?? 0) >= 30, `runtime ${r.totals.est_runtime_min}`);
});

test("TT motors don't fit a 37D chassis", () => {
  const b = mapper.map((i) => (i.part_id.startsWith("motor-") ? { part_id: "motor-tt-encoder", quantity: 2 } : i));
  assert.ok(codes(checkBuild(b, byId, { autonomy: "mapping_navigation" }), "error").includes("MOTOR_DOESNT_FIT"));
});

test("mapping without lidar, encoders or ROS-capable computer fails", () => {
  const r = checkBuild(starter, byId, { autonomy: "mapping_navigation" });
  const e = codes(r, "error");
  for (const c of ["NAV_NEEDS_COMPUTE", "NAV_NEEDS_RANGE_SENSOR", "NAV_NEEDS_ENCODERS"]) assert.ok(e.includes(c), c);
});

test("Pi 5 on a cheap LM2596 is flagged", () => {
  const b = mapper.map((i) => (i.part_id.startsWith("reg-") ? { part_id: "reg-lm2596-3a", quantity: 1 } : i));
  assert.ok(codes(checkBuild(b, byId, { autonomy: "mapping_navigation" })).some((c) => c.startsWith("REG_")));
});

test("weak driver on 37D motors fails", () => {
  const b = mapper.map((i) => (i.part_id.startsWith("driver-") ? { part_id: "driver-tb6612fng", quantity: 1 } : i));
  assert.ok(codes(checkBuild(b, byId, { autonomy: "mapping_navigation" }), "error").includes("DRIVER_TOO_WEAK"));
});

test("4S battery over-volts a TB6612", () => {
  const b = starter.map((i) => (i.part_id.startsWith("batt-") ? { part_id: "batt-4s-liion-5200-bms", quantity: 1 } : i));
  assert.ok(codes(checkBuild(b, byId, { autonomy: "obstacle_avoidance" }), "error").includes("DRIVER_OVERVOLTAGE"));
});

test("wrong wheel shaft and missing caster are caught", () => {
  const b = mapper
    .filter((i) => i.part_id !== "caster-ball-metal")
    .map((i) => (i.part_id.startsWith("wheels-") ? { part_id: "wheels-70mm-4mm-hub", quantity: 1 } : i));
  const e = codes(checkBuild(b, byId, { autonomy: "mapping_navigation" }), "error");
  assert.ok(e.includes("WHEEL_SHAFT_MISMATCH") && e.includes("MISSING_CASTER"));
});

test("HC-SR04 on a 3.3 V board warns about the 5 V echo pin", () => {
  const b = starter.map((i) => (i.part_id.startsWith("ctrl-") ? { part_id: "ctrl-esp32-devkitc", quantity: 1 } : i));
  b.push({ part_id: "reg-lm2596-3a", quantity: 1 });
  const r = checkBuild(b, byId, { autonomy: "obstacle_avoidance" });
  assert.ok(codes(r, "warning").includes("SENSOR_5V_SIGNAL"));
  assert.equal(r.ok, true, JSON.stringify(r.issues, null, 2));
});

test("unknown parts are rejected", () => {
  assert.ok(codes(checkBuild([{ part_id: "made-up-motor", quantity: 2 }], byId), "error").includes("UNKNOWN_PART"));
});
