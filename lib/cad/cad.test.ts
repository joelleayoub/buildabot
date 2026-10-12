// Run: npx tsx --test lib/cad/cad.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPart, sizeOf, toSTL, volumeOf } from "./geometry";
import { parseDescription } from "./parse";
import { designWarnings, normalise, TEMPLATE_ORDER, TEMPLATES } from "./spec";

test("every template builds a closed, printable solid that sits on the bed", () => {
  for (const id of TEMPLATE_ORDER) {
    const g = buildPart({ template: id, params: normalise(id), name: TEMPLATES[id].name });
    const v = volumeOf(g);
    assert.ok(v > 500, `${id}: volume ${v}`);
    g.computeBoundingBox();
    assert.ok(Math.abs(g.boundingBox!.min.z) < 1e-6, `${id} should sit on z = 0`);
    const stl = toSTL(g);
    // binary STL: 80-byte header, uint32 count, 50 bytes per triangle
    assert.equal(stl.byteLength, 84 + 50 * new DataView(stl).getUint32(80, true));
  }
});

test("holes remove material: a plate with holes weighs less than a blank one", () => {
  const solid = volumeOf(buildPart({ template: "plate", params: normalise("plate", { board: "none", corner_hole: 0, standoff: 0 }), name: "" }));
  const holed = volumeOf(buildPart({ template: "plate", params: normalise("plate", { board: "none", corner_hole: 3.4, standoff: 0 }), name: "" }));
  const expected = 100 * 70 * 3; // minus a little for rounded corners
  assert.ok(solid < expected && solid > expected * 0.98, `solid ${solid}`);
  const fourHoles = 4 * Math.PI * 1.7 ** 2 * 3;
  assert.ok(Math.abs(solid - holed - fourHoles) < fourHoles * 0.05, `removed ${solid - holed}, expected about ${fourHoles}`);
});

test("plate size matches the parameters", () => {
  const [x, y, z] = sizeOf(buildPart({ template: "plate", params: normalise("plate", { width: 120, depth: 80, thickness: 4, standoff: 0 }), name: "" }));
  assert.ok(Math.abs(x - 120) < 0.01 && Math.abs(y - 80) < 0.01 && Math.abs(z - 4) < 0.01, `${x} ${y} ${z}`);
});

test("text descriptions map to the right template and sizes", () => {
  const pi = parseDescription("A mounting plate for a Raspberry Pi, 100 x 70 mm, 3mm thick");
  assert.equal(pi.template, "plate");
  assert.equal(pi.params.board, "rpi");
  assert.equal(pi.params.width, 100);
  assert.equal(pi.params.depth, 70);
  assert.equal(pi.params.thickness, 3);

  const us = parseDescription("bracket to hold an HC-SR04 ultrasonic sensor at the front");
  assert.equal(us.template, "bracket");
  assert.equal(us.params.face, "hcsr04");

  const batt = parseDescription("battery holder for a pack that is 105 x 34 x 18 mm");
  assert.equal(batt.template, "tray");
  // 1.5 mm clearance, rounded to the 1 mm slider step
  assert.equal(batt.params.inner_length, 107);
  assert.equal(batt.params.inner_width, 36);

  const lidar = parseDescription("raise the lidar 5 cm above the top deck");
  assert.equal(lidar.template, "riser");
  assert.equal(lidar.params.height, 50);
});

test("numbers outside the allowed range are clamped", () => {
  const p = normalise("plate", { width: 9999, thickness: -3 });
  assert.equal(p.width, 250);
  assert.equal(p.thickness, 1.6);
});

test("warnings catch parts that would not fit", () => {
  assert.ok(designWarnings({ template: "plate", params: normalise("plate", { width: 40, depth: 30, board: "rpi" }), name: "" }).length > 0);
  assert.ok(designWarnings({ template: "bracket", params: normalise("bracket", { width: 30, face: "hcsr04" }), name: "" }).length > 0);
  assert.equal(designWarnings({ template: "plate", params: normalise("plate"), name: "" }).length, 0);
});
