// Parametric 3D-printable parts. Pure data and validation: no three.js here, so the server
// (text-to-CAD route) and tests can use it. Geometry lives in ./geometry.ts. All sizes in mm.

export type TemplateId = "plate" | "bracket" | "tray" | "riser";

export type BoardPattern = "none" | "rpi" | "rpi_zero" | "arduino_uno" | "custom";
export type FaceCutout = "none" | "hcsr04" | "round";

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  help?: string;
}

export interface ChoiceDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface TemplateDef {
  id: TemplateId;
  name: string;
  blurb: string;
  numbers: ParamDef[];
  choices: ChoiceDef[];
  defaults: Record<string, number | string>;
}

const BOARD_OPTIONS: ChoiceDef = {
  key: "board",
  label: "Board to mount",
  options: [
    { value: "none", label: "None" },
    { value: "rpi", label: "Raspberry Pi 4 / 5" },
    { value: "rpi_zero", label: "Raspberry Pi Zero" },
    { value: "arduino_uno", label: "Arduino Uno" },
    { value: "custom", label: "Custom hole spacing" },
  ],
};

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  plate: {
    id: "plate",
    name: "Mounting plate",
    blurb: "A flat plate that bolts to the chassis, with holes and standoffs for a board.",
    numbers: [
      { key: "width", label: "Width", min: 20, max: 250, step: 1 },
      { key: "depth", label: "Depth", min: 20, max: 250, step: 1 },
      { key: "thickness", label: "Thickness", min: 1.6, max: 8, step: 0.2 },
      { key: "corner_hole", label: "Corner hole diameter", min: 0, max: 8, step: 0.1, help: "3.4 mm fits M3 screws. 0 for no corner holes." },
      { key: "standoff", label: "Standoff height", min: 0, max: 20, step: 0.5, help: "Raises the board so its solder joints clear the plate. 0 for none." },
      { key: "custom_x", label: "Custom spacing (long side)", min: 5, max: 200, step: 0.5 },
      { key: "custom_y", label: "Custom spacing (short side)", min: 5, max: 200, step: 0.5 },
      { key: "board_hole", label: "Board hole diameter", min: 1.5, max: 6, step: 0.1, help: "2.7 mm for M2.5, 3.2 mm for M3." },
    ],
    choices: [BOARD_OPTIONS],
    defaults: { width: 100, depth: 70, thickness: 3, corner_hole: 3.4, standoff: 6, board: "rpi", custom_x: 58, custom_y: 49, board_hole: 2.7 },
  },
  bracket: {
    id: "bracket",
    name: "Sensor bracket",
    blurb: "An L-shaped bracket that holds a sensor upright at the front of the robot.",
    numbers: [
      { key: "width", label: "Width", min: 15, max: 150, step: 1 },
      { key: "base_depth", label: "Base depth", min: 10, max: 80, step: 1 },
      { key: "height", label: "Height", min: 10, max: 120, step: 1 },
      { key: "thickness", label: "Thickness", min: 2, max: 8, step: 0.2 },
      { key: "base_hole", label: "Base screw holes", min: 0, max: 8, step: 0.1, help: "3.4 mm fits M3. 0 for none." },
      { key: "hole_d", label: "Round cutout diameter", min: 3, max: 60, step: 0.5 },
      { key: "face_height", label: "Cutout centre height", min: 5, max: 110, step: 0.5 },
    ],
    choices: [
      {
        key: "face",
        label: "Front cutout",
        options: [
          { value: "hcsr04", label: "HC-SR04 ultrasonic eyes" },
          { value: "round", label: "One round hole (camera, ToF sensor)" },
          { value: "none", label: "None" },
        ],
      },
    ],
    defaults: { width: 52, base_depth: 22, height: 34, thickness: 3, base_hole: 3.4, face: "hcsr04", hole_d: 12, face_height: 20 },
  },
  tray: {
    id: "tray",
    name: "Battery tray",
    blurb: "An open box that holds the battery in place, with slots for a hook-and-loop strap.",
    numbers: [
      { key: "inner_length", label: "Inside length", min: 20, max: 200, step: 1, help: "Measure your battery and add 1 to 2 mm." },
      { key: "inner_width", label: "Inside width", min: 15, max: 120, step: 1 },
      { key: "inner_height", label: "Wall height", min: 5, max: 80, step: 1 },
      { key: "wall", label: "Wall thickness", min: 1.2, max: 5, step: 0.2 },
      { key: "floor", label: "Floor thickness", min: 1.2, max: 5, step: 0.2 },
      { key: "base_hole", label: "Floor screw holes", min: 0, max: 8, step: 0.1, help: "3.4 mm fits M3. 0 for none." },
    ],
    choices: [
      {
        key: "strap",
        label: "Strap slots",
        options: [
          { value: "yes", label: "Yes, for a 20 mm strap" },
          { value: "no", label: "No" },
        ],
      },
    ],
    defaults: { inner_length: 108, inner_width: 36, inner_height: 15, wall: 2, floor: 2, base_hole: 3.4, strap: "yes" },
  },
  riser: {
    id: "riser",
    name: "Riser platform",
    blurb: "A small raised platform on four legs, for a lidar or camera that must see over everything else.",
    numbers: [
      { key: "width", label: "Top width", min: 25, max: 200, step: 1 },
      { key: "depth", label: "Top depth", min: 25, max: 200, step: 1 },
      { key: "thickness", label: "Top thickness", min: 2, max: 8, step: 0.2 },
      { key: "height", label: "Leg height", min: 5, max: 120, step: 1 },
      { key: "leg_d", label: "Leg diameter", min: 5, max: 16, step: 0.5 },
      { key: "screw_hole", label: "Screw hole in each leg", min: 0, max: 5, step: 0.1, help: "2.8 mm lets an M3 screw cut its own thread." },
      { key: "top_x", label: "Top hole spacing (long side)", min: 0, max: 190, step: 0.5, help: "0 for no holes in the top." },
      { key: "top_y", label: "Top hole spacing (short side)", min: 0, max: 190, step: 0.5 },
      { key: "top_hole", label: "Top hole diameter", min: 1.5, max: 8, step: 0.1 },
    ],
    choices: [],
    defaults: { width: 70, depth: 70, thickness: 3, height: 40, leg_d: 8, screw_hole: 2.8, top_x: 0, top_y: 0, top_hole: 2.7 },
  },
};

export const TEMPLATE_ORDER: TemplateId[] = ["plate", "bracket", "tray", "riser"];

/** Mounting hole patterns for boards in the catalog (mm, hole centres relative to the board centre). */
export const BOARD_HOLES: Record<Exclude<BoardPattern, "none" | "custom">, { name: string; holes: [number, number][]; holeD: number }> = {
  // 58 x 49 mm rectangle, M2.5 (Raspberry Pi mechanical drawings)
  rpi: { name: "Raspberry Pi 4 / 5", holes: [[-29, -24.5], [29, -24.5], [-29, 24.5], [29, 24.5]], holeD: 2.7 },
  // 58 x 23 mm rectangle, M2.5
  rpi_zero: { name: "Raspberry Pi Zero", holes: [[-29, -11.5], [29, -11.5], [-29, 11.5], [29, 11.5]], holeD: 2.7 },
  // Uno R3 / R4 holes at (13.97, 2.54), (15.24, 50.8), (66.04, 7.62), (66.04, 35.56) from the board's corner,
  // shifted so the pattern is centred. M3.
  arduino_uno: {
    name: "Arduino Uno",
    holes: [
      [13.97 - 40.005, 2.54 - 26.67],
      [15.24 - 40.005, 50.8 - 26.67],
      [66.04 - 40.005, 7.62 - 26.67],
      [66.04 - 40.005, 35.56 - 26.67],
    ],
    holeD: 3.2,
  },
};

/** HC-SR04: two 16 mm transducers about 26 mm apart. Check yours with calipers. */
export const HCSR04 = { spacing: 26, holeD: 16.6 };

export interface PartDesign {
  template: TemplateId;
  params: Record<string, number | string>;
  name: string;
}

/** Fills in defaults and clamps every number into its allowed range. */
export function normalise(template: TemplateId, params: Record<string, unknown> = {}): Record<string, number | string> {
  const t = TEMPLATES[template];
  const out: Record<string, number | string> = { ...t.defaults };
  for (const n of t.numbers) {
    const v = Number(params[n.key]);
    if (params[n.key] !== undefined && Number.isFinite(v)) out[n.key] = Math.min(n.max, Math.max(n.min, Math.round(v / n.step) * n.step));
    out[n.key] = Math.round(Number(out[n.key]) * 100) / 100;
  }
  for (const c of t.choices) {
    const v = params[c.key];
    if (typeof v === "string" && c.options.some((o) => o.value === v)) out[c.key] = v;
  }
  return out;
}

export const isTemplateId = (v: unknown): v is TemplateId => typeof v === "string" && v in TEMPLATES;

/** Problems that would make the part unprintable or not fit, in plain language. */
export function designWarnings(d: PartDesign): string[] {
  const p = d.params as Record<string, number> & Record<string, string>;
  const w: string[] = [];
  if (d.template === "plate") {
    const pattern = p.board === "custom" ? { holes: [[-p.custom_x / 2, -p.custom_y / 2], [p.custom_x / 2, p.custom_y / 2]] } : p.board !== "none" ? BOARD_HOLES[p.board as keyof typeof BOARD_HOLES] : null;
    if (pattern) {
      const maxX = Math.max(...pattern.holes.map((h) => Math.abs(h[0])));
      const maxY = Math.max(...pattern.holes.map((h) => Math.abs(h[1])));
      if (maxX * 2 + 8 > p.width || maxY * 2 + 8 > p.depth) w.push("The board's holes don't fit on a plate this size. Make the plate bigger.");
    }
  }
  if (d.template === "bracket") {
    if (p.face === "hcsr04" && p.width < HCSR04.spacing + HCSR04.holeD + 4) w.push("The bracket is too narrow for an HC-SR04. Make it at least 47 mm wide.");
    if (p.face !== "none" && p.face_height > p.height - 4) w.push("The cutout sits above the top of the bracket. Lower it or make the bracket taller.");
  }
  if (d.template === "riser" && p.top_x > 0 && (p.top_x + 6 > p.width || p.top_y + 6 > p.depth)) w.push("The top holes don't fit on the platform. Make the top bigger.");
  return w;
}

/** Rough printing figures for PLA. Clearly estimates, shown with their assumptions. */
export const PRINT_ASSUMPTIONS = {
  densityGPerCm3: 1.24, // PLA
  fillFactor: 0.6, // walls plus about 20% infill on small, chunky parts
  usdPerKg: 22, // typical PLA filament price
  gramsPerHour: 12, // standard 0.4 mm nozzle, normal quality
};

export function printEstimate(volumeMm3: number) {
  const a = PRINT_ASSUMPTIONS;
  const grams = (volumeMm3 / 1000) * a.densityGPerCm3 * a.fillFactor;
  return { grams, materialUsd: (grams / 1000) * a.usdPerKg, hours: Math.max(0.3, grams / a.gramsPerHour) };
}

/** A part the user designed, kept with the build. */
export interface CustomPart {
  id: string;
  design: PartDesign;
}
