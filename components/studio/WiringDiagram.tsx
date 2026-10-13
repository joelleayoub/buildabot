"use client";
// Wiring diagram SVG: boards as boxes, numbered wires coloured by kind. Pass highlight to focus one wire.
import { SLOT_LABELS } from "@/lib/flow";
import type { Wire, WireKind, WireNode } from "@/lib/wiring";

export const KIND: Record<WireKind, { color: string; label: string; dash?: string }> = {
  power: { color: "#d2372c", label: "Power" },
  ground: { color: "#15171c", label: "Ground", dash: "6 4" },
  signal: { color: "#2a44f5", label: "Signal" },
  data: { color: "#0f8a7e", label: "Data / USB" },
};

const NW = 190;
const NH = 62;

function positions(nodes: WireNode[], wires: Wire[]): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  const has = (id: string) => nodes.some((n) => n.id === id);
  pos.battery = { x: 20, y: 430 };
  pos.regulator = { x: 20, y: 120 };
  pos.driver = { x: 290, y: 430 };
  pos.controller = { x: 290, y: has("compute") ? 270 : 220 };
  pos.compute = { x: 560, y: 60 };
  pos.motors_left = { x: 560, y: 390 };
  pos.motors_right = { x: 560, y: 480 };
  const sensors = nodes.filter((n) => n.id.startsWith("sensor"));
  // Sensors that plug into the computer go at the top, next to it; ones wired to the controller go
  // lower, so their wires pass under the computer's box instead of through it.
  const toCompute = (id: string) => wires.some((w) => (w.from === id && w.to === "compute") || (w.to === id && w.from === "compute"));
  [...sensors].sort((a, b) => Number(toCompute(b.id)) - Number(toCompute(a.id))).forEach((n, i) => (pos[n.id] = { x: 830, y: 40 + i * 96 }));
  return pos;
}

/** With zoom, the view closes in on the two boards the highlighted wire joins. */
export function WiringDiagram({ nodes, wires, highlight, zoom }: { nodes: WireNode[]; wires: Wire[]; highlight?: number; zoom?: boolean }) {
  const pos = positions(nodes, wires);
  const pairCount: Record<string, number> = {};
  let viewBox = "0 0 1040 570";
  const hw = zoom && highlight ? wires.find((w) => w.n === highlight) : undefined;
  if (hw && pos[hw.from] && pos[hw.to]) {
    const a = pos[hw.from];
    const b = pos[hw.to];
    const pad = 60;
    let x0 = Math.min(a.x, b.x) - pad;
    let y0 = Math.min(a.y, b.y) - pad;
    let w = Math.max(a.x, b.x) + NW + pad - x0;
    let h = Math.max(a.y, b.y) + NH + pad - y0;
    // keep roughly the panel's shape so the picture doesn't get too tall or too thin
    const ratio = 1.45;
    if (w / h < ratio) {
      const nw = h * ratio;
      x0 -= (nw - w) / 2;
      w = nw;
    } else {
      const nh = w / ratio;
      y0 -= (nh - h) / 2;
      h = nh;
    }
    viewBox = `${Math.round(x0)} ${Math.round(y0)} ${Math.round(w)} ${Math.round(h)}`;
  }
  return (
    <svg viewBox={viewBox} className={zoom ? "h-full w-full" : "h-auto w-full min-w-[760px]"} role="img" aria-label="Wiring diagram">
      {wires.map((w) => {
        const a = pos[w.from];
        const b = pos[w.to];
        if (!a || !b) return null;
        const key = [w.from, w.to].sort().join("-");
        const k = (pairCount[key] = (pairCount[key] ?? 0) + 1) - 1;
        const off = (k - 0.5) * 12;
        let x1, y1, x2, y2, d;
        if (Math.abs(a.x - b.x) < 10) {
          const down = b.y > a.y;
          x1 = a.x + NW / 2 + off;
          y1 = down ? a.y + NH : a.y;
          x2 = b.x + NW / 2 + off;
          y2 = down ? b.y : b.y + NH;
          d = `M${x1},${y1} L${x2},${y2}`;
        } else {
          const right = b.x > a.x;
          x1 = right ? a.x + NW : a.x;
          y1 = a.y + NH / 2 + off;
          x2 = right ? b.x : b.x + NW;
          y2 = b.y + NH / 2 + off;
          const mx = (x1 + x2) / 2;
          d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
        }
        const s = KIND[w.kind];
        // Stagger badges on parallel wires so numbers never overlap.
        const vertical = Math.abs(a.x - b.x) < 10;
        const lx = (x1 + x2) / 2 + (vertical ? (k % 2 ? 14 : -14) : 0);
        const ly = (y1 + y2) / 2 + (vertical ? 0 : k * 26 - 13 * Math.min(1, k));
        return (
          <g key={w.n} opacity={highlight && highlight !== w.n ? 0.15 : 1}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={highlight === w.n ? 5 : 2.6} strokeDasharray={s.dash} strokeLinecap="round" />
            <circle cx={lx} cy={ly} r={11} fill="#fff" stroke={s.color} strokeWidth={2} />
            <text x={lx} y={ly + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={s.color}>
              {w.n}
            </text>
          </g>
        );
      })}
      {nodes.map((n) => {
        const p = pos[n.id];
        if (!p) return null;
        const hw = highlight ? wires.find((w) => w.n === highlight) : undefined;
        const lit = !hw || hw.from === n.id || hw.to === n.id;
        return (
          <g key={n.id} transform={`translate(${p.x},${p.y})`} opacity={lit ? 1 : 0.35}>
            <rect width={NW} height={NH} rx={14} fill="#fff" stroke={hw && lit ? "#2a44f5" : "#d5d9df"} strokeWidth={hw && lit ? 2.5 : 1} />
            <text x={14} y={26} fontSize={13} fontWeight={700} fill="#15171c">
              {n.label.length > 26 ? n.label.slice(0, 25) + "…" : n.label}
            </text>
            <text x={14} y={45} fontSize={11.5} fill="#5d6472">
              {n.slot === "motors_left" || n.slot === "motors_right" ? n.sub : `${SLOT_LABELS[n.slot as keyof typeof SLOT_LABELS] ?? ""}, ${n.sub}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
