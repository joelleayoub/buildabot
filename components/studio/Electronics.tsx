"use client";
// Electronics customization: the pin map, starter code and the custom carrier PCB.
import { useMemo, useState } from "react";
import { PARTS_BY_ID } from "@/lib/catalog";
import type { BuildItem } from "@/lib/compat/types";
import { designCarrierBoard, pinXY, toBomCsv, toKicadNetlist, type BoardComponent, type CarrierBoard } from "@/lib/electronics/board";
import { generateFirmware } from "@/lib/electronics/firmware";
import { planPins } from "@/lib/electronics/pins";
import { Button } from "./ui";

export function download(filename: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CodeBlock({ code, filename }: { code: string; filename: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl bg-[#15171c] text-[#e8eaf0]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
        <span className="text-xs text-white/60">{filename}</span>
        <div className="flex gap-1">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                /* clipboard blocked */
              }
            }}
            className="rounded-full px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/10"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={() => download(filename, code)} className="rounded-full px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/10">
            Download
          </button>
        </div>
      </div>
      <pre className="scrollbar-thin max-h-[420px] overflow-auto p-4 text-[0.8rem] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Why there's no pin map: no brain at all, or a board this doesn't have pin data for yet. */
function NoHost({ items, what }: { items: BuildItem[]; what: string }) {
  const brain = items.map((i) => PARTS_BY_ID[i.part_id]).find((p) => p?.slot === "controller" || p?.slot === "compute");
  return (
    <p className="rounded-2xl bg-stage-2 p-5 text-mute">
      {brain
        ? `${what} are made for Arduino-type boards and the Raspberry Pi. For the ${brain.name.split(" (")[0]}, follow your reference design's own wiring and software, or add a microcontroller in the Build step.`
        : `Add a microcontroller or a Raspberry Pi in the Build step to get ${what.toLowerCase()}.`}
    </p>
  );
}

export function PinMapPanel({ items }: { items: BuildItem[] }) {
  const plan = useMemo(() => planPins(items, PARTS_BY_ID), [items]);
  const fw = useMemo(() => generateFirmware(items, PARTS_BY_ID), [items]);
  if (!plan) {
    return <NoHost items={items} what="Pin maps and starter code" />;
  }
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-bold">Pin map for the {plan.hostName}</h3>
        <p className="mt-1 text-sm text-mute">Each signal is on a pin that can do that job: speed on PWM pins, encoders on interrupt pins, sensors on the board&apos;s own I2C pins.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink text-mute">
                <th className="py-2 font-medium">Signal</th>
                <th className="py-2 font-medium">Controller pin</th>
                <th className="py-2 font-medium">Goes to</th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((r) => (
                <tr key={r.signal} className="border-b border-line align-top">
                  <td className="py-2.5 pr-4">
                    <span className="font-semibold">{r.label}</span>
                    <span className="block font-mono text-xs text-mute">{r.signal}</span>
                  </td>
                  <td className="num py-2.5 pr-4 font-semibold text-blue">{r.pin}</td>
                  <td className="py-2.5">
                    {r.to}
                    {r.note && <span className="block text-warn">{r.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plan.warnings.map((w) => (
          <p key={w} className="mt-2 rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm">
            {w}
          </p>
        ))}
      </div>
      {fw && (
        <div>
          <h3 className="text-lg font-bold">Starter code</h3>
          <p className="mt-1 text-sm text-mute">Written for these exact pins and this motor driver. It spins each wheel forward and back, then prints the sensor readings.</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-mute">
            {fw.howTo.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
          <div className="mt-4">
            <CodeBlock code={fw.code} filename={fw.filename} />
          </div>
        </div>
      )}
    </div>
  );
}

const NET_COLOR = (net: string) => (net === "GND" ? "#9aa1ab" : net === "VBAT" ? "#ff6b5e" : net.startsWith("+") ? "#ffb35c" : "#ffe27a");

function BoardPreview({ board, focus }: { board: CarrierBoard; focus: string | null }) {
  const S = 6;
  const pad = 4;
  const pos = (c: BoardComponent, i: number) => {
    const [x, y] = pinXY(c, i);
    return [x * S + pad * S, y * S + pad * S] as const;
  };
  // Ratsnest: join each net's pins in a chain, nearest first.
  const lines: { x1: number; y1: number; x2: number; y2: number; net: string }[] = [];
  for (const net of board.nets) {
    const pts = board.components.flatMap((c) => c.pins.map((p, i) => (p.net === net ? pos(c, i) : null)).filter(Boolean) as (readonly [number, number])[]);
    for (let i = 1; i < pts.length; i++) lines.push({ x1: pts[i - 1][0], y1: pts[i - 1][1], x2: pts[i][0], y2: pts[i][1], net });
  }
  const W = (board.width + pad * 2) * S;
  const H = (board.height + pad * 2) * S;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Carrier board layout preview">
      <rect x={pad * S - 8} y={pad * S - 8} width={board.width * S + 16} height={board.height * S + 16} rx={18} fill="#1d5e38" />
      {[[1, 1], [1, 0], [0, 1], [0, 0]].map(([a, b], i) => (
        <circle key={i} cx={pad * S + a * board.width * S + (a ? -10 : 10)} cy={pad * S + b * board.height * S + (b ? -10 : 10)} r={9} fill="#0f2f1c" stroke="#c9a24a" strokeWidth={3} />
      ))}
      {lines.map((l, i) => (
        <line key={i} {...l} stroke={NET_COLOR(l.net)} strokeWidth={focus && focus !== l.net ? 1 : 2} strokeOpacity={focus && focus !== l.net ? 0.25 : 0.85} strokeDasharray="5 4" />
      ))}
      {board.components.map((c) => {
        const first = pos(c, 0);
        const last = pos(c, c.pins.length - 1);
        const x0 = Math.min(first[0], last[0]);
        const y0 = Math.min(first[1], last[1]);
        const x1 = Math.max(first[0], last[0]);
        const y1 = Math.max(first[1], last[1]);
        const m = c.kind === "terminal" ? 18 : c.kind === "jst" ? 12 : c.kind === "cap" ? 0 : 9;
        const body =
          c.kind === "cap" ? (
            <circle cx={(x0 + x1) / 2} cy={(y0 + y1) / 2} r={26} fill="#1a1c20" stroke="#e8e8e8" strokeWidth={2} />
          ) : c.kind === "led" ? (
            <circle cx={(x0 + x1) / 2} cy={(y0 + y1) / 2} r={14} fill="#2fd16b" fillOpacity={0.8} stroke="#e8e8e8" strokeWidth={1.5} />
          ) : c.kind === "resistor" ? (
            <rect x={x0 + 8} y={y0 - 7} width={x1 - x0 - 16} height={14} rx={6} fill="#d9c49a" />
          ) : (
            <rect x={x0 - m} y={y0 - m} width={x1 - x0 + m * 2} height={y1 - y0 + m * 2} rx={c.kind === "jst" ? 3 : 4} fill={c.kind === "terminal" ? "#2a7de1" : c.kind === "jst" ? "#f2efe6" : "#121315"} />
          );
        return (
          <g key={c.ref}>
            {body}
            {c.pins.map((p, i) => {
              const [x, y] = pos(c, i);
              return <circle key={p.n} cx={x} cy={y} r={c.kind === "header" ? 4 : 5} fill="#e7c766" stroke={i === 0 ? "#fff" : "none"} strokeWidth={1.5} />;
            })}
            <text x={c.vertical ? x1 + 14 : x0 - m} y={c.vertical ? y0 - 16 : y0 - m - 6} fontSize={11} fontWeight={700} fill="#f4f4f4" fontFamily="ui-sans-serif">
              {c.vertical ? c.ref : `${c.ref} ${c.value}`}
            </text>
            {c.vertical &&
              c.pins.map((p, i) => {
                const [x, y] = pos(c, i);
                return (
                  <text key={p.n} x={x + 12} y={y + 3.5} fontSize={9} fill={focus === p.net ? "#ffe27a" : "#d7e6dc"} fontFamily="ui-monospace, monospace">
                    {p.label}
                  </text>
                );
              })}
          </g>
        );
      })}
    </svg>
  );
}

export function PcbPanel({ items }: { items: BuildItem[] }) {
  const board = useMemo(() => designCarrierBoard(items, PARTS_BY_ID), [items]);
  const [focus, setFocus] = useState<string | null>(null);
  if (!board) {
    return <NoHost items={items} what="Custom carrier boards" />;
  }
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue">Experimental</p>
        <h3 className="text-lg font-bold">Your custom carrier board</h3>
        <p className="mt-1 max-w-2xl text-sm text-mute">
          One {board.width} × {board.height} mm board that replaces the loose jumper wires. Battery and 5 V power are shared out on the board, and every encoder and sensor gets a keyed plug that only fits one way, already wired to the right controller pin.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,1fr)]">
        <div className="rounded-3xl bg-stage-2 p-4">
          <BoardPreview board={board} focus={focus} />
          <p className="mt-2 text-xs text-mute">Dashed lines show which pins connect. KiCad draws the copper tracks. Point at a connection on the right to highlight it.</p>
        </div>
        <ul className="scrollbar-thin max-h-[520px] space-y-2 overflow-auto pr-1">
          {board.components.map((c) => (
            <li key={c.ref} className="rounded-2xl border border-line px-3.5 py-2.5">
              <p className="text-sm font-semibold">
                {c.ref} {c.value}
              </p>
              <p className="text-xs text-mute">{c.purpose}</p>
              {c.pins.length > 2 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {c.pins.map((p) => (
                    <span key={p.n} onMouseEnter={() => setFocus(p.net)} onMouseLeave={() => setFocus(null)} className="cursor-default rounded-md bg-stage-2 px-1.5 py-0.5 font-mono text-[0.68rem] hover:bg-blue-soft">
                      {p.n}: {p.label || p.net}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      {board.notes.map((n) => (
        <p key={n} className="rounded-xl bg-stage-2 px-3.5 py-2.5 text-sm">
          {n}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="dark" onClick={() => download("buildabot-carrier.net", toKicadNetlist(board))}>
          Download KiCad netlist
        </Button>
        <Button onClick={() => download("buildabot-carrier-bom.csv", toBomCsv(board), "text/csv")}>Download parts list</Button>
      </div>
      <div>
        <h3 className="font-bold">Turn it into a real board</h3>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-mute">
          <li>
            Install{" "}
            <a className="font-semibold text-blue hover:underline" href="https://www.kicad.org/download/" target="_blank" rel="noreferrer">
              KiCad
            </a>{" "}
            (free) and create a new project.
          </li>
          <li>Open the PCB Editor, then File, Import, Netlist, and pick buildabot-carrier.net. The parts appear with their connections.</li>
          <li>
            Draw a {board.width} × {board.height} mm outline on the Edge.Cuts layer, arrange the parts like the preview, and add the corner M3 holes.
          </li>
          <li>
            Route the tracks by hand, or with the free{" "}
            <a className="font-semibold text-blue hover:underline" href="https://freerouting.org/" target="_blank" rel="noreferrer">
              Freerouting
            </a>{" "}
            autorouter. Use wider tracks (at least 1 mm) for battery and motor power.
          </li>
          <li>Run the design rules check, then File, Fabrication Outputs, and export the Gerber and drill files.</li>
          <li>
            Upload the zip to a board maker such as{" "}
            <a className="font-semibold text-blue hover:underline" href="https://jlcpcb.com/" target="_blank" rel="noreferrer">
              JLCPCB
            </a>{" "}
            or{" "}
            <a className="font-semibold text-blue hover:underline" href="https://www.pcbway.com/" target="_blank" rel="noreferrer">
              PCBWay
            </a>
            , and check every connection against the pin map before you order.
          </li>
        </ol>
      </div>
    </div>
  );
}
