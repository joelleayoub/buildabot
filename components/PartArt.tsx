// Product-style illustrations per part, until real photos are added (set `image_url` on a part).
import type { Part } from "@/lib/compat/types";

const PCB: Record<string, string> = {
  arduino: "#00878f",
  rpi: "#2f8f3a",
  cytron: "#c4302b",
  pololu: "#1f6f3a",
  esp: "#1c1c1c",
  teensy: "#2a5d34",
  generic: "#2f5fb3",
  jetson: "#1a1a1a",
  adafruit: "#1b3f8f",
};

function pcbColor(p: Part) {
  const id = p.id;
  if (id.includes("arduino")) return PCB.arduino;
  if (id.includes("rpi") || id.includes("pico")) return PCB.rpi;
  if (id.includes("cytron")) return PCB.cytron;
  if (id.includes("pololu") || id.includes("vl53") || id.includes("tb6612")) return PCB.pololu;
  if (id.includes("esp32")) return PCB.esp;
  if (id.includes("teensy")) return PCB.teensy;
  if (id.includes("jetson")) return PCB.jetson;
  if (id.includes("bno")) return PCB.adafruit;
  return PCB.generic;
}

const Holes = ({ pts }: { pts: [number, number][] }) => (
  <>
    {pts.map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={2.6} fill="#e9ebee" stroke="#b7bcc4" strokeWidth={0.8} />
    ))}
  </>
);

const Pins = ({ x, y, n, gap = 5 }: { x: number; y: number; n: number; gap?: number }) => (
  <>
    {Array.from({ length: n }, (_, i) => (
      <rect key={i} x={x + i * gap} y={y} width={2.6} height={2.6} fill="#d8b04a" />
    ))}
  </>
);

function Board({ p, w = 96, h = 64, children }: { p: Part; w?: number; h?: number; children?: React.ReactNode }) {
  const x = 80 - w / 2;
  const y = 64 - h / 2;
  return (
    <g>
      <rect x={x + 3} y={y + 5} width={w} height={h} rx={5} fill="#000" opacity={0.12} />
      <rect x={x} y={y} width={w} height={h} rx={5} fill={pcbColor(p)} />
      <rect x={x} y={y} width={w} height={h} rx={5} fill="url(#sheen)" />
      <Holes pts={[[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]} />
      <g transform={`translate(${x},${y})`}>{children}</g>
    </g>
  );
}

function Art({ p }: { p: Part }) {
  const c = p.compat;
  switch (p.slot) {
    case "chassis": {
      const four = c.motor_mounts === 4;
      const acrylic = p.id.includes("acrylic");
      const plate = acrylic ? "#cfe3ea" : p.id.includes("plate") ? "#3a3d44" : "#25272c";
      return (
        <g>
          <ellipse cx={80} cy={100} rx={62} ry={8} fill="#000" opacity={0.1} />
          {(four ? [34, 126] : [34, 126]).map((x) => (
            <rect key={x} x={x - 9} y={66} width={18} height={30} rx={6} fill="#24262a" />
          ))}
          {four && [34, 126].map((x) => <rect key={"b" + x} x={x - 9} y={30} width={18} height={30} rx={6} fill="#24262a" />)}
          <rect x={30} y={34} width={100} height={60} rx={10} fill={plate} opacity={acrylic ? 0.85 : 1} stroke={acrylic ? "#9cc3cf" : "#4a4e57"} />
          <rect x={40} y={22} width={80} height={52} rx={9} fill={plate} opacity={acrylic ? 0.7 : 0.92} stroke={acrylic ? "#9cc3cf" : "#5a5f69"} />
          {[50, 62, 74, 86, 98, 110].map((x) => <circle key={x} cx={x} cy={48} r={2.2} fill={acrylic ? "#9cc3cf" : "#15171a"} />)}
          {[46, 114].flatMap((x) => [30, 66].map((y) => <rect key={x + "-" + y} x={x - 1.5} y={y} width={3} height={8} fill="#c9a24a" />))}
        </g>
      );
    }
    case "drive_motor": {
      if (c.motor_form_factor === "TT") {
        return (
          <g>
            <ellipse cx={80} cy={98} rx={50} ry={7} fill="#000" opacity={0.1} />
            <rect x={36} y={42} width={76} height={42} rx={6} fill="#f2c230" />
            <rect x={36} y={42} width={76} height={14} rx={6} fill="#f7d65e" />
            <circle cx={58} cy={63} r={6} fill="#e3ab12" />
            <rect x={112} y={52} width={14} height={22} rx={2} fill="#c9cdd3" />
            <rect x={70} y={30} width={10} height={14} fill="#f7f7f7" stroke="#d0d0d0" />
            {c.has_encoder && <rect x={20} y={48} width={16} height={30} rx={3} fill="#2f5fb3" />}
            <rect x={24} y={86} width={3} height={10} fill="#c0392b" />
            <rect x={30} y={86} width={3} height={10} fill="#222" />
          </g>
        );
      }
      const big = c.motor_form_factor === "37D";
      const r = big ? 26 : 20;
      return (
        <g>
          <ellipse cx={80} cy={100} rx={58} ry={7} fill="#000" opacity={0.1} />
          <rect x={24} y={64 - r} width={58} height={r * 2} rx={6} fill="#9aa1ab" />
          <rect x={24} y={64 - r} width={58} height={r * 0.7} rx={6} fill="#c3c8cf" />
          <rect x={82} y={64 - r + 2} width={36} height={r * 2 - 4} rx={4} fill="#d4a63a" />
          <rect x={82} y={64 - r + 2} width={36} height={8} rx={4} fill="#e6c26a" />
          <rect x={118} y={60} width={18} height={8} rx={2} fill="#d0d4da" />
          {c.has_encoder && <rect x={10} y={64 - r + 4} width={14} height={r * 2 - 8} rx={3} fill="#1f6f3a" />}
          {c.has_encoder && <Pins x={11} y={64 + r - 2} n={2} gap={6} />}
        </g>
      );
    }
    case "wheels": {
      const r = Math.min(40, (c.wheel_diameter_mm ?? 65) * 0.42);
      return (
        <g>
          <ellipse cx={80} cy={64 + r + 6} rx={r + 12} ry={6} fill="#000" opacity={0.12} />
          {[-1, 1].map((d) => (
            <g key={d} transform={`translate(${80 + d * (r * 0.55)},0)`}>
              <circle cx={0} cy={64} r={r} fill="#202226" />
              {Array.from({ length: 16 }, (_, i) => {
                const a = (i / 16) * Math.PI * 2;
                return <line key={i} x1={Math.cos(a) * (r - 2)} y1={64 + Math.sin(a) * (r - 2)} x2={Math.cos(a) * (r - 7)} y2={64 + Math.sin(a) * (r - 7)} stroke="#3a3d43" strokeWidth={2} />;
              })}
              <circle cx={0} cy={64} r={r * 0.55} fill={c.wheel_shaft === "TT" ? "#f2c230" : "#c8ccd2"} />
              <circle cx={0} cy={64} r={r * 0.18} fill="#5c616a" />
            </g>
          ))}
        </g>
      );
    }
    case "caster":
      return (
        <g>
          <ellipse cx={80} cy={96} rx={34} ry={6} fill="#000" opacity={0.12} />
          <rect x={52} y={40} width={56} height={14} rx={4} fill="#2b2d31" />
          <circle cx={66} cy={47} r={3} fill="#9aa0a8" />
          <circle cx={94} cy={47} r={3} fill="#9aa0a8" />
          <path d="M62 54 h36 l-6 18 h-24z" fill="#3b3e44" />
          <circle cx={80} cy={78} r={14} fill="#cfd3d9" />
          <circle cx={75} cy={73} r={4} fill="#fff" opacity={0.8} />
        </g>
      );
    case "motor_driver":
      return (
        <Board p={p} w={c.continuous_a_per_channel && c.continuous_a_per_channel >= 10 ? 104 : 88} h={c.continuous_a_per_channel && c.continuous_a_per_channel >= 10 ? 66 : 48}>
          {p.id.includes("l298") && <rect x={30} y={-14} width={28} height={26} rx={2} fill="#2b2d31" />}
          {p.id.includes("l298") &&
            Array.from({ length: 6 }, (_, i) => <rect key={i} x={32 + i * 4} y={-14} width={2} height={26} fill="#4a4d54" />)}
          <rect x={6} y={14} width={14} height={20} rx={2} fill="#2c6be0" />
          <rect x={c.continuous_a_per_channel && c.continuous_a_per_channel >= 10 ? 84 : 68} y={14} width={14} height={20} rx={2} fill="#2c6be0" />
          <rect x={36} y={16} width={16} height={12} rx={1} fill="#1a1a1a" />
          <Pins x={30} y={4} n={6} />
          {p.id.includes("cytron") && <circle cx={44} cy={38} r={3} fill="#fff" />}
        </Board>
      );
    case "controller":
      return (
        <Board p={p} w={p.id.includes("arduino") ? 100 : 92} h={p.id.includes("arduino") ? 70 : 38}>
          <rect x={p.id.includes("arduino") ? 40 : 34} y={p.id.includes("arduino") ? 26 : 10} width={18} height={18} rx={1} fill="#151515" />
          <Pins x={10} y={4} n={p.id.includes("arduino") ? 16 : 15} gap={p.id.includes("arduino") ? 5 : 5} />
          {!p.id.includes("arduino") && <Pins x={10} y={32} n={15} />}
          {p.id.includes("arduino") && <Pins x={22} y={62} n={12} />}
          <rect x={-6} y={p.id.includes("arduino") ? 10 : 12} width={12} height={12} rx={1} fill="#c8ccd2" />
          {p.id.includes("esp32") && <rect x={64} y={6} width={24} height={26} rx={1} fill="#c7cbd1" />}
        </Board>
      );
    case "compute": {
      const jetson = p.id.includes("jetson");
      const zero = p.id.includes("zero");
      return (
        <Board p={p} w={zero ? 96 : 104} h={zero ? 40 : 70}>
          {jetson ? (
            <>
              <rect x={20} y={10} width={64} height={46} rx={3} fill="#3a3d43" />
              {Array.from({ length: 12 }, (_, i) => <rect key={i} x={24 + i * 5} y={12} width={2} height={42} fill="#55595f" />)}
              <circle cx={52} cy={33} r={12} fill="#2a2c30" stroke="#55595f" />
            </>
          ) : (
            <>
              <rect x={zero ? 30 : 24} y={zero ? 10 : 20} width={20} height={20} rx={1} fill="#c9ccd1" />
              <Pins x={10} y={4} n={zero ? 16 : 18} />
              <Pins x={10} y={9} n={zero ? 16 : 18} />
              {!zero && (
                <>
                  <rect x={86} y={18} width={22} height={14} rx={1} fill="#c8ccd2" />
                  <rect x={86} y={36} width={22} height={14} rx={1} fill="#c8ccd2" />
                  <rect x={86} y={52} width={22} height={12} rx={1} fill="#c8ccd2" />
                  <rect x={60} y={24} width={18} height={14} rx={1} fill="#1b1b1b" />
                </>
              )}
            </>
          )}
        </Board>
      );
    }
    case "battery": {
      const chem = c.chemistry;
      if (chem === "NiMH") {
        return (
          <g>
            <ellipse cx={80} cy={98} rx={58} ry={7} fill="#000" opacity={0.1} />
            <rect x={24} y={36} width={112} height={56} rx={5} fill="#1d1e21" />
            {Array.from({ length: 6 }, (_, i) => (
              <g key={i}>
                <rect x={30 + i * 17.5} y={42} width={14} height={44} rx={6} fill="#3ea05a" />
                <rect x={30 + i * 17.5} y={42} width={14} height={8} rx={4} fill="#c8ccd2" />
              </g>
            ))}
            <path d="M136 50 q14 0 14 18" stroke="#c0392b" strokeWidth={3} fill="none" />
            <path d="M136 60 q10 0 10 14" stroke="#222" strokeWidth={3} fill="none" />
          </g>
        );
      }
      const wrap = chem === "LiPo" ? "#24262b" : "#2a5fb0";
      const label = chem === "LiPo" ? "#d9dce1" : "#f2f4f7";
      return (
        <g>
          <ellipse cx={80} cy={100} rx={60} ry={7} fill="#000" opacity={0.1} />
          <rect x={26} y={38} width={104} height={54} rx={8} fill={wrap} />
          <rect x={26} y={38} width={104} height={14} rx={8} fill="#fff" opacity={0.12} />
          <rect x={40} y={56} width={60} height={18} rx={3} fill={label} opacity={0.9} />
          <text x={70} y={69} textAnchor="middle" fontSize={11} fontWeight={700} fill={wrap} fontFamily="ui-sans-serif">{c.battery_nominal_v} V</text>
          <path d="M130 52 q16 0 16 22" stroke="#c0392b" strokeWidth={3.5} fill="none" />
          <path d="M130 62 q12 0 12 18" stroke="#1a1a1a" strokeWidth={3.5} fill="none" />
          {chem === "LiPo" && <path d="M120 92 q4 12 14 12" stroke="#f2f2f2" strokeWidth={2} fill="none" />}
        </g>
      );
    }
    case "regulator":
      return (
        <Board p={p} w={p.id.includes("pololu") ? 60 : 88} h={p.id.includes("pololu") ? 40 : 48}>
          <rect x={p.id.includes("pololu") ? 16 : 30} y={8} width={24} height={24} rx={4} fill="#2b2d31" />
          <circle cx={p.id.includes("pololu") ? 28 : 42} cy={20} r={7} fill="#55595f" />
          {!p.id.includes("pololu") && <rect x={64} y={10} width={12} height={12} rx={2} fill="#2c6be0" />}
          {!p.id.includes("pololu") && <circle cx={70} cy={16} r={2.5} fill="#d8b04a" />}
        </Board>
      );
    case "lidar": {
      const small = p.id.includes("ld19");
      const rx = small ? 30 : 40;
      return (
        <g>
          <ellipse cx={80} cy={100} rx={rx + 14} ry={7} fill="#000" opacity={0.12} />
          <rect x={80 - rx - 6} y={74} width={(rx + 6) * 2} height={20} rx={6} fill="#26282d" />
          <ellipse cx={80} cy={74} rx={rx} ry={10} fill="#3a3d43" />
          <rect x={80 - rx} y={50} width={rx * 2} height={24} fill={p.id.includes("a1") ? "#2a2c31" : "#1e2024"} />
          <ellipse cx={80} cy={50} rx={rx} ry={10} fill={p.id.includes("a1") ? "#4a4e56" : "#33363c"} />
          <rect x={80 - 10} y={56} width={20} height={10} rx={2} fill="#7a1f1f" opacity={0.9} />
        </g>
      );
    }
    case "camera":
      if (p.id.includes("oak") || p.id.includes("realsense")) {
        const rs = p.id.includes("realsense");
        return (
          <g>
            <ellipse cx={80} cy={96} rx={60} ry={6} fill="#000" opacity={0.12} />
            <rect x={20} y={46} width={120} height={36} rx={rs ? 6 : 10} fill={rs ? "#1d1f23" : "#2b2e34"} />
            {(rs ? [36, 62, 98, 124] : [38, 80, 122]).map((x, i) => (
              <g key={i}>
                <circle cx={x} cy={64} r={rs ? 7 : 9} fill="#0b0c0e" />
                <circle cx={x - 2} cy={62} r={2.5} fill="#5b6cff" opacity={0.6} />
              </g>
            ))}
            <rect x={70} y={82} width={20} height={12} fill="#3a3d43" />
          </g>
        );
      }
      return (
        <Board p={p} w={56} h={56}>
          <rect x={14} y={14} width={28} height={28} rx={3} fill="#1b1b1b" />
          <circle cx={28} cy={28} r={9} fill="#0b0c0e" />
          <circle cx={25} cy={25} r={2.5} fill="#5b6cff" opacity={0.7} />
          <rect x={18} y={48} width={20} height={14} fill="#e9d7a8" />
        </Board>
      );
    case "distance_sensor":
      if (c.interface === "gpio") {
        return (
          <Board p={p} w={104} h={46}>
            {[26, 78].map((x) => (
              <g key={x}>
                <circle cx={x} cy={23} r={17} fill="#c9cdd3" />
                <circle cx={x} cy={23} r={12} fill="#2b2d31" />
                {Array.from({ length: 4 }, (_, i) => <circle key={i} cx={x + (i % 2 ? 4 : -4)} cy={23 + (i < 2 ? -4 : 4)} r={1.4} fill="#555" />)}
              </g>
            ))}
            <rect x={46} y={6} width={12} height={8} fill="#c8ccd2" />
          </Board>
        );
      }
      return (
        <Board p={p} w={56} h={46}>
          <rect x={18} y={14} width={20} height={14} rx={2} fill="#151515" />
          <circle cx={24} cy={21} r={2.5} fill="#5b6cff" opacity={0.8} />
          <circle cx={32} cy={21} r={2.5} fill="#7a1f1f" />
          <Pins x={10} y={36} n={6} gap={6} />
        </Board>
      );
    case "imu":
      return (
        <Board p={p} w={60} h={48}>
          <rect x={20} y={14} width={20} height={18} rx={1} fill="#151515" />
          <Pins x={8} y={38} n={7} gap={6} />
          <text x={30} y={10} textAnchor="middle" fontSize={6} fill="#fff" opacity={0.7} fontFamily="ui-sans-serif">x y z</text>
        </Board>
      );
  }
}

export default function PartArt({ part, className }: { part: Part; className?: string }) {
  const img = (part as Part & { image_url?: string }).image_url;
  if (img) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={img} alt={part.name} className={`h-full w-full object-contain ${className ?? ""}`} />;
  }
  return (
    <svg viewBox="0 0 160 120" role="img" aria-label={part.name} className={className}>
      <defs>
        <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.18} />
          <stop offset="1" stopColor="#000" stopOpacity={0.08} />
        </linearGradient>
      </defs>
      <Art p={part} />
    </svg>
  );
}
