// Builds printable geometry for a part design with constructive solid geometry (real holes,
// unions, no overlapping shells), and exports binary STL. Z is up, units are mm, the part sits
// on Z = 0 so it is ready to slice.
import { BoxGeometry, BufferGeometry, CylinderGeometry, ExtrudeGeometry, Mesh, Shape } from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { ADDITION, Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import { BOARD_HOLES, HCSR04, type PartDesign } from "./spec";

const evaluator = new Evaluator();
evaluator.attributes = ["position", "normal"];
evaluator.useGroups = false;

const clean = (g: BufferGeometry) => {
  for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
  return g;
};

function brush(g: BufferGeometry, x = 0, y = 0, z = 0): Brush {
  const b = new Brush(clean(g));
  b.position.set(x, y, z);
  b.updateMatrixWorld();
  return b;
}

/** Box with its bottom face at z. */
const box = (w: number, d: number, h: number, x = 0, y = 0, z = 0) => brush(new BoxGeometry(w, d, h), x, y, z + h / 2);

/** Vertical cylinder (along Z) with its bottom at z. */
function cyl(dia: number, h: number, x = 0, y = 0, z = 0, seg = 40) {
  const g = new CylinderGeometry(dia / 2, dia / 2, h, seg);
  g.rotateX(Math.PI / 2);
  return brush(g, x, y, z + h / 2);
}

/** Cylinder along Y (through a vertical wall), centred at (x, y, z). */
function cylY(dia: number, len: number, x: number, y: number, z: number, seg = 48) {
  return brush(new CylinderGeometry(dia / 2, dia / 2, len, seg), x, y, z);
}

/** Rounded-rectangle slab with its bottom at z. */
function roundedSlab(w: number, d: number, h: number, r: number, z = 0) {
  const s = new Shape();
  const x0 = -w / 2;
  const y0 = -d / 2;
  r = Math.min(r, w / 2 - 0.01, d / 2 - 0.01);
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0);
  s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + d - r);
  s.quadraticCurveTo(x0 + w, y0 + d, x0 + w - r, y0 + d);
  s.lineTo(x0 + r, y0 + d);
  s.quadraticCurveTo(x0, y0 + d, x0, y0 + d - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  const g = new ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 8 });
  return brush(g, 0, 0, z);
}

const add = (a: Brush, b: Brush) => evaluator.evaluate(a, b, ADDITION);
const sub = (a: Brush, b: Brush) => evaluator.evaluate(a, b, SUBTRACTION);

function boardHoles(p: Record<string, number | string>): { holes: [number, number][]; d: number } | null {
  const board = p.board as string;
  if (board === "none") return null;
  if (board === "custom") {
    const x = Number(p.custom_x) / 2;
    const y = Number(p.custom_y) / 2;
    return { holes: [[-x, -y], [x, -y], [-x, y], [x, y]], d: Number(p.board_hole) };
  }
  const b = BOARD_HOLES[board as keyof typeof BOARD_HOLES];
  return { holes: b.holes, d: Number(p.board_hole) || b.holeD };
}

function plate(p: Record<string, number>, raw: Record<string, number | string>): Brush {
  const { width: w, depth: d, thickness: t } = p;
  let part = roundedSlab(w, d, t, 4);
  if (p.corner_hole > 0) {
    const inset = Math.max(p.corner_hole, 5);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) part = sub(part, cyl(p.corner_hole, t * 3, sx * (w / 2 - inset), sy * (d / 2 - inset), -t));
  }
  const bh = boardHoles(raw);
  if (bh) {
    for (const [x, y] of bh.holes) {
      if (p.standoff > 0) part = add(part, cyl(bh.d + 3.6, p.standoff, x, y, t - 0.01, 32));
      part = sub(part, cyl(bh.d, t + p.standoff + 2, x, y, -1, 24));
    }
  }
  return part;
}

function bracket(p: Record<string, number>, raw: Record<string, number | string>): Brush {
  const { width: w, base_depth: bd, height: h, thickness: t } = p;
  // Base lies along +Y from the wall; the wall faces -Y (forward).
  let part = add(box(w, bd, t, 0, bd / 2, 0), box(w, t, h, 0, t / 2, 0));
  // small gusset fillet for strength
  part = add(part, box(w * 0.2, Math.min(bd, h) * 0.35, Math.min(bd, h) * 0.35, 0, t + Math.min(bd, h) * 0.17, t - 0.01));
  if (p.base_hole > 0) {
    const off = Math.min(w / 2 - p.base_hole - 3, w * 0.32);
    for (const x of [-off, off]) part = sub(part, cyl(p.base_hole, t * 3, x, t + (bd - t) * 0.6, -t));
  }
  const zc = p.face_height;
  if (raw.face === "hcsr04") {
    for (const x of [-HCSR04.spacing / 2, HCSR04.spacing / 2]) part = sub(part, cylY(HCSR04.holeD, t * 4, x, t / 2, zc));
  } else if (raw.face === "round") {
    part = sub(part, cylY(p.hole_d, t * 4, 0, t / 2, zc));
  }
  return part;
}

function tray(p: Record<string, number>, raw: Record<string, number | string>): Brush {
  const { inner_length: L, inner_width: W, inner_height: H, wall, floor } = p;
  let part = roundedSlab(L + wall * 2, W + wall * 2, floor + H, 3);
  part = sub(part, box(L, W, H + 1, 0, 0, floor));
  if (raw.strap === "yes") {
    // two slots through the floor near the ends, for a 20 mm strap
    for (const x of [-L * 0.3, L * 0.3]) part = sub(part, box(4, Math.min(22, W - 4), floor * 3, x, 0, -floor));
  }
  if (p.base_hole > 0) for (const x of [-L * 0.12, L * 0.12]) part = sub(part, cyl(p.base_hole, floor * 3, x, 0, -floor));
  return part;
}

function riser(p: Record<string, number>): Brush {
  const { width: w, depth: d, thickness: t, height: h, leg_d } = p;
  const inset = leg_d / 2 + 2;
  const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => [sx * (w / 2 - inset), sy * (d / 2 - inset)] as const);
  // Printed upside down would be easier, but legs-down keeps the STL intuitive; it prints fine with the top as a bridge.
  let part = roundedSlab(w, d, t, 4, h);
  for (const [x, y] of legs) part = add(part, cyl(leg_d, h + 0.01, x, y, 0, 32));
  if (p.screw_hole > 0) for (const [x, y] of legs) part = sub(part, cyl(p.screw_hole, h * 0.6, x, y, -1, 20));
  if (p.top_x > 0 && p.top_y > 0) {
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) part = sub(part, cyl(p.top_hole, t * 3, (sx * p.top_x) / 2, (sy * p.top_y) / 2, h - t));
  }
  return part;
}

export function buildPart(design: PartDesign): BufferGeometry {
  const raw = design.params;
  const p = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)])) as Record<string, number>;
  const b = design.template === "plate" ? plate(p, raw) : design.template === "bracket" ? bracket(p, raw) : design.template === "tray" ? tray(p, raw) : riser(p);
  const g = b.geometry.clone();
  g.computeVertexNormals();
  g.computeBoundingBox();
  // Sit the part on the build plate.
  const minZ = g.boundingBox!.min.z;
  if (Math.abs(minZ) > 1e-6) g.translate(0, 0, -minZ);
  g.computeBoundingBox();
  return g;
}

/** Enclosed volume in mm³ (divergence theorem over the triangles). */
export function volumeOf(g: BufferGeometry): number {
  const pos = g.attributes.position;
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  let v = 0;
  for (let i = 0; i < n; i += 3) {
    const a = idx ? idx.getX(i) : i;
    const b = idx ? idx.getX(i + 1) : i + 1;
    const c = idx ? idx.getX(i + 2) : i + 2;
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
    const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
    const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return Math.abs(v);
}

export function sizeOf(g: BufferGeometry): [number, number, number] {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
}

/** Binary STL, ready for any slicer. */
export function toSTL(g: BufferGeometry): ArrayBuffer {
  const view = new STLExporter().parse(new Mesh(g), { binary: true }) as DataView;
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}
