// Offline text-to-CAD: turns a plain description into one of the part templates.
// Used when the AI advisor is off, and as a safety net when it is on.
import { normalise, TEMPLATES, type PartDesign, type TemplateId } from "./spec";

export interface ParseResult extends PartDesign {
  /** What was understood, in plain language, so the user can check it. */
  understood: string[];
}

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(w));

function pickTemplate(t: string): TemplateId {
  if (has(t, "tray", "battery", "box", "holder", "cradle")) return "tray";
  if (has(t, "riser", "tower", "raise", "platform", "lidar", "elevat", "leg")) return "riser";
  if (has(t, "bracket", "ultrasonic", "hc-sr04", "hcsr04", "sr04", "sensor mount", "camera mount", "upright", "l-shape", "l shape")) return "bracket";
  return "plate";
}

/** Numbers like "80x50", "80 x 50 x 20 mm", "8 cm", "3mm thick". Returns values in mm. */
function dims(t: string): number[] {
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:mm|cm)?\s*[x×\*by]+\s*(\d+(?:\.\d+)?)(?:\s*(?:mm|cm)?\s*[x×\*by]+\s*(\d+(?:\.\d+)?))?\s*(mm|cm)?/);
  if (!m) return [];
  const scale = m[4] === "cm" ? 10 : 1;
  return [m[1], m[2], m[3]].filter(Boolean).map((v) => Number(v) * scale);
}

function measure(t: string, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const before = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(mm|cm)?\\s*(?:${k})`));
    if (before) return Number(before[1]) * (before[2] === "cm" ? 10 : 1);
    const after = t.match(new RegExp(`(?:${k})\\s*(?:of|is|=|:)?\\s*(\\d+(?:\\.\\d+)?)\\s*(mm|cm)?`));
    if (after) return Number(after[1]) * (after[2] === "cm" ? 10 : 1);
  }
  return undefined;
}

export function parseDescription(text: string): ParseResult {
  const t = text.toLowerCase();
  const template = pickTemplate(t);
  const p: Record<string, unknown> = {};
  const understood: string[] = [`A ${TEMPLATES[template].name.toLowerCase()}.`];
  const d = dims(t);
  const thick = measure(t, "thick", "thickness");
  const tall = measure(t, "tall", "high", "height", "above", "up");

  if (template === "plate") {
    if (has(t, "raspberry pi zero", "pi zero")) p.board = "rpi_zero";
    else if (has(t, "raspberry", " pi", "rpi")) p.board = "rpi";
    else if (has(t, "arduino", "uno")) p.board = "arduino_uno";
    else if (has(t, "no holes", "blank", "plain")) p.board = "none";
    if (p.board) understood.push(`Holes for ${TEMPLATES.plate.choices[0].options.find((o) => o.value === p.board)!.label}.`);
    if (d.length >= 2) [p.width, p.depth] = [Math.max(d[0], d[1]), Math.min(d[0], d[1])];
    if (has(t, "no standoff", "flat")) p.standoff = 0;
  }
  if (template === "bracket") {
    if (has(t, "ultrasonic", "sr04", "sr-04")) p.face = "hcsr04";
    else if (has(t, "camera", "tof", "vl53", "round hole", "hole for")) p.face = "round";
    const hole = measure(t, "hole", "diameter");
    if (hole && p.face !== "hcsr04") [p.face, p.hole_d] = ["round", hole];
    if (d.length >= 2) [p.width, p.height] = [d[0], d[1]];
    if (d.length === 3) p.base_depth = d[2];
    if (p.face) understood.push(p.face === "hcsr04" ? "Two cutouts for HC-SR04 ultrasonic eyes." : "One round cutout in the front.");
  }
  if (template === "tray") {
    if (d.length >= 2) [p.inner_length, p.inner_width] = [Math.max(d[0], d[1]) + 1.5, Math.min(d[0], d[1]) + 1.5];
    if (d.length === 3) p.inner_height = Math.max(8, Math.round(d[2] * 0.7));
    if (d.length >= 2) understood.push("Sized for a battery that measures " + d.join(" x ") + " mm, with 1.5 mm of clearance.");
    if (has(t, "no strap", "without strap")) p.strap = "no";
  }
  if (template === "riser") {
    if (d.length >= 2) [p.width, p.depth] = [d[0], d[1]];
    if (has(t, "lidar")) understood.push("Raised so the lidar sees over the rest of the robot.");
  }
  if (thick) p.thickness = thick;
  if (tall) p[template === "tray" ? "inner_height" : "height"] = tall;
  if (thick) understood.push(`${thick} mm thick.`);
  if (tall) understood.push(`${tall} mm tall.`);

  const params = normalise(template, p);
  return { template, params, name: TEMPLATES[template].name, understood };
}
