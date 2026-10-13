// Side view of the sized arm, to scale: reaching its farthest target with the gripper pointing
// down. Joints are coloured by how much torque headroom their motor has.
import type { ArmGeometry, ArmTask, JointSize, JointStatus, MachineType } from "@/lib/arm/types";

const STATUS: Record<JointStatus, string> = { ok: "var(--ok)", tight: "var(--warn)", over: "var(--bad)" };

export function ArmDrawing({ geo, task, joints, selected, onSelect }: { geo: ArmGeometry; task: ArmTask; joints: JointSize[]; selected?: string; onSelect?: (name: string) => void }) {
  const W = 640;
  const H = 360;
  const ground = 312;
  const R = task.reach_cm / 100;
  const span = geo.upper + geo.fore;
  const s = Math.min((W - 260) / Math.max(R + 0.04, span * 0.8), (ground - 56) / (geo.base_h + span * 0.8));
  const bx = 150;
  const P = (x: number, y: number) => [bx + x * s, ground - y * s] as const;

  // Two-link inverse kinematics, elbow up, to the wrist point above the far target.
  const sh = [0, geo.base_h];
  const target = [R, geo.tool];
  let dx = target[0] - sh[0];
  let dy = target[1] - sh[1];
  let d = Math.hypot(dx, dy);
  const maxD = (geo.upper + geo.fore) * 0.999;
  if (d > maxD) {
    dx *= maxD / d;
    dy *= maxD / d;
    d = maxD;
  }
  const a = Math.atan2(dy, dx);
  const b = Math.acos(Math.min(1, (geo.upper ** 2 + d * d - geo.fore ** 2) / (2 * geo.upper * d)));
  const el = [sh[0] + geo.upper * Math.cos(a + b), sh[1] + geo.upper * Math.sin(a + b)];
  const wr = [sh[0] + dx, sh[1] + dy];
  const tip = [wr[0], wr[1] - geo.tool];

  const [sx, sy] = P(sh[0], sh[1]);
  const [ex, ey] = P(el[0], el[1]);
  const [wx, wy] = P(wr[0], wr[1]);
  const [tx, ty] = P(tip[0], tip[1]);
  const status = (n: string) => joints.find((j) => j.name === n)?.status ?? "ok";
  const rArc = span * s;
  const link = (x1: number, y1: number, x2: number, y2: number, w: number) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2b2f37" strokeWidth={w} strokeLinecap="round" />;
  const joint = (name: string, x: number, y: number, r: number, labelDx: number, labelDy: number) => {
    const j = joints.find((k) => k.name === name);
    if (!j) return null;
    const on = selected === name;
    return (
      <g key={name} onMouseEnter={() => onSelect?.(name)} className="cursor-pointer">
        <circle cx={x} cy={y} r={r + (on ? 4 : 0)} fill="#fff" stroke={STATUS[status(name)]} strokeWidth={on ? 5 : 4} />
        <circle cx={x} cy={y} r={r * 0.35} fill={STATUS[status(name)]} />
        <text x={x + labelDx} y={y + labelDy} fontSize={13} fontWeight={700} fill="var(--ink)" textAnchor={labelDx < 0 ? "end" : "start"}>
          {name}
        </text>
        <text x={x + labelDx} y={y + labelDy + 15} fontSize={11.5} fill="var(--mute)" textAnchor={labelDx < 0 ? "end" : "start"}>
          needs {j.required_nm} N·m
        </text>
      </g>
    );
  };
  const objSize = Math.max(10, Math.min(36, Math.cbrt(task.object_g) * 3.2));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Side view of the arm reaching ${task.reach_cm} cm`}>
      {/* reach envelope */}
      <path d={`M${sx},${sy} L${sx},${sy - rArc} A${rArc},${rArc} 0 0 1 ${sx + rArc},${sy} Z`} fill="var(--blue-soft)" fillOpacity={0.7} stroke="var(--blue)" strokeOpacity={0.35} strokeDasharray="5 5" />
      <line x1={20} y1={ground} x2={W - 20} y2={ground} stroke="#c9ced6" strokeWidth={2} />
      {/* reach dimension */}
      <g fontSize={12} fill="var(--mute)">
        <line x1={bx} y1={ground + 22} x2={tx} y2={ground + 22} stroke="var(--mute)" markerEnd="url(#ar)" markerStart="url(#ar)" />
        <text x={(bx + tx) / 2} y={ground + 40} textAnchor="middle">
          reach {task.reach_cm} cm
        </text>
      </g>
      <defs>
        <marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--mute)" />
        </marker>
      </defs>
      {/* base */}
      <rect x={bx - 34} y={ground - 14} width={68} height={14} rx={4} fill="#3a3f48" />
      <rect x={bx - 16} y={sy} width={32} height={ground - 14 - sy} fill="#4a505b" />
      {/* links */}
      {link(sx, sy, ex, ey, 16)}
      {link(ex, ey, wx, wy, 12)}
      {link(wx, wy, tx, ty + 10, 8)}
      {/* gripper and object */}
      <path d={`M${tx - 12},${ty + 10} L${tx - 12},${ty} M${tx + 12},${ty + 10} L${tx + 12},${ty} M${tx - 12},${ty + 10} L${tx + 12},${ty + 10}`} stroke="#2b2f37" strokeWidth={4} strokeLinecap="round" fill="none" />
      <rect x={tx - objSize / 2} y={ground - objSize} width={objSize} height={objSize} rx={3} fill="var(--blue)" />
      <text x={tx + objSize / 2 + 6} y={ground - 6} fontSize={12} fill="var(--mute)">
        {task.object_g} g
      </text>
      {/* joints */}
      {joint("Base", bx, ground - 7, 9, -46, 0)}
      {joint("Shoulder", sx, sy, 12, -26, -10)}
      {joint("Elbow", ex, ey, 11, 0, -26)}
      {joint("Wrist", wx, wy, 9, 18, -4)}
    </svg>
  );
}

/** Small line drawings of each machine type. */
export function MachineIcon({ type, className = "h-16 w-16" }: { type: MachineType; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {type === "articulated" && (
        <g {...common}>
          <path d="M14 56h24M26 56V46" />
          <path d="M26 46L20 26L44 18L50 30" />
          <circle cx="26" cy="46" r="3" />
          <circle cx="20" cy="26" r="3" />
          <circle cx="44" cy="18" r="3" />
          <path d="M46 32h8M46 32v5M54 32v5" />
        </g>
      )}
      {type === "scara" && (
        <g {...common}>
          <path d="M10 56h20M18 56V22" />
          <path d="M18 22h20l14 6" />
          <circle cx="18" cy="22" r="3" />
          <circle cx="38" cy="22" r="3" />
          <path d="M52 28v18M48 46h8" />
        </g>
      )}
      {type === "gantry" && (
        <g {...common}>
          <path d="M8 56V14h48v42" />
          <path d="M8 24h48" />
          <rect x="28" y="20" width="10" height="8" rx="1" />
          <path d="M33 28v16M29 44h8" />
          <path d="M4 56h56" />
        </g>
      )}
      {type === "delta" && (
        <g {...common}>
          <path d="M10 10h44L32 18z" />
          <path d="M14 10l10 26 8 12M50 10l-10 26-8 12M32 18v14l0 16" />
          <circle cx="32" cy="48" r="3" />
          <path d="M8 58h48" />
        </g>
      )}
    </svg>
  );
}
