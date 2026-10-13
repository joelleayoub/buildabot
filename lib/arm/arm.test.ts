// Run: npx tsx --test lib/arm/arm.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARM_DESIGNS, ARM_PARTS, DEFAULT_TASK, planArm, rankMachines, sizeFamily, armGeometry, pickGripper, usableTorque } from "./advise";
import { parseTask } from "./parse";
import type { ArmTask } from "./types";

const task = (t: Partial<ArmTask>): ArmTask => ({ ...DEFAULT_TASK, ...t });

test("machine type follows the task", () => {
  assert.equal(rankMachines(task({ motion: "pour", orientation: "full", object_g: 300 }))[0].type, "articulated");
  assert.equal(rankMachines(task({ motion: "draw", precision_mm: 0.5 }))[0].type, "gantry");
  assert.equal(rankMachines(task({ object_g: 30, per_minute: 60 }))[0].type !== "articulated", true);
  assert.equal(rankMachines(task({ flat_work: false, lift_cm: 30 }))[0].type, "articulated");
});

test("joints get stronger towards the base and chosen motors cover the load", () => {
  for (const object_g of [20, 150, 400])
    for (const reach_cm of [20, 35, 50]) {
      const t = task({ object_g, reach_cm });
      const g = pickGripper(t);
      const geo = armGeometry(t, g);
      for (const f of ["pwm", "feetech", "dynamixel", "stepper"] as const) {
        const plan = sizeFamily(t, f, geo, g);
        const req = (n: string) => plan.joints.find((j) => j.name === n)!.required_nm;
        assert.ok(req("Shoulder") >= req("Elbow") && req("Elbow") >= req("Wrist"), `${f} ${object_g} g ${reach_cm} cm`);
        for (const j of plan.joints) {
          assert.equal(j.usable_nm, Math.round(usableTorque(j.motor) * 100) / 100);
          if (j.status !== "over") assert.ok(j.usable_nm >= j.required_nm, `${j.name} ${j.motor.id}`);
        }
        if (plan.feasible) assert.ok(plan.tip_error_mm <= t.precision_mm);
      }
    }
});

test("heavier objects never need less torque", () => {
  const shoulder = (object_g: number) => {
    const t = task({ object_g, reach_cm: 40 });
    const g = pickGripper(t);
    return sizeFamily(t, "stepper", armGeometry(t, g), g).joints.find((j) => j.name === "Shoulder")!.required_nm;
  };
  assert.ok(shoulder(500) > shoulder(200) && shoulder(200) > shoulder(50));
});

test("small desk tasks are buildable, big ones point to a ready-made arm", () => {
  const small = planArm({ object_g: 50, reach_cm: 25, precision_mm: 20 });
  assert.ok(small.chosen);
  assert.notEqual(small.verdict, "buy");
  assert.equal(planArm({ object_g: 5000, reach_cm: 100 }).verdict, "buy");
  assert.equal(planArm({ object_g: 200, near_people: true, hours_per_day: 8 }).verdict, "buy");
  const pour = planArm({ object_g: 500, reach_cm: 40, orientation: "full", motion: "pour" });
  if (!pour.chosen) assert.match(pour.notes[0], /could do this with/);
});

test("gripper suits the object", () => {
  assert.equal(pickGripper(task({ object: "soft", object_g: 100 })).id, "grip-soft");
  assert.equal(pickGripper(task({ object: "flat", object_g: 300 })).grips!.includes("flat"), true);
  assert.notEqual(pickGripper(task({ object: "flat", orientation: "full", object_g: 100 })).id, "grip-suction");
  assert.ok(pickGripper(task({ object_g: 3000 })).max_object_g! >= 500, "falls back to the strongest gripper");
});

test("parts and designs are well formed", () => {
  const ids = new Set<string>();
  for (const p of ARM_PARTS) {
    assert.ok(!ids.has(p.id), p.id);
    ids.add(p.id);
    assert.ok(p.price_usd_approx > 0 && p.mass_g > 0 && /^https:\/\//.test(p.buy_url), p.id);
    if (p.kind === "motor") assert.ok((p.stall_nm ?? p.holding_nm)! > 0 && p.max_dps! > 0 && p.backlash_deg! > 0, p.id);
  }
  for (const d of ARM_DESIGNS) assert.ok(/^https:\/\//.test(d.url) && d.summary.length > 20, d.id);
  const plan = planArm({});
  for (const f of plan.families) for (const x of f.parts) assert.ok(ids.has(x.part.id) && x.qty > 0);
});

test("parser reads weights, distances, speeds and the kind of job", () => {
  const a = parseTask("Pick 250 g boxes from a conveyor and stack them on a shelf 40 cm away, about 6 per minute, next to people");
  assert.equal(a.object_g, 250);
  assert.equal(a.reach_cm, 40);
  assert.equal(a.per_minute, 6);
  assert.equal(a.flat_work, false);
  assert.equal(a.near_people, true);
  const b = parseTask("Sort 1.2 kg parts by colour into bins within 0.5 m");
  assert.equal(b.motion, "sort");
  assert.equal(b.object_g, 1200);
  assert.equal(b.reach_cm, 50);
  assert.equal(b.precision_mm, 20);
  const c = parseTask("Pour a cup of tea, 300 g");
  assert.equal(c.motion, "pour");
  assert.equal(c.orientation, "full");
  const d = parseTask("Draw on A4 paper with a pen, accuracy 0.3 mm");
  assert.equal(d.motion, "draw");
  assert.equal(d.precision_mm, 0.3);
  assert.equal(parseTask("pick strawberries, 120 picks an hour").per_minute, 2);
  assert.equal(parseTask("pick strawberries").object, "soft");
});
