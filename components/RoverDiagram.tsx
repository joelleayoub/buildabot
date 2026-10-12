import type { BuildItem, Part, Slot } from "@/lib/compat/types";
import { GROUP_LABELS, GROUP_ORDER, groupColor, SLOT_GROUP } from "@/lib/slots";

// Top-down sketch of the rover (front at the top) that fills in as parts are added.
// It shows which parts are in the build and roughly where they sit, not exact dimensions.

const ghost = { fill: "none", stroke: "currentColor", strokeOpacity: 0.3, strokeDasharray: "4 4", strokeWidth: 1.5 };

export function RoverDiagram({ items, byId }: { items: BuildItem[]; byId: Record<string, Part> }) {
  const lines = items.flatMap((i) => (byId[i.part_id] ? [{ part: byId[i.part_id], units: i.quantity * byId[i.part_id].pack_size }] : []));
  const first = (slot: Slot) => lines.find((l) => l.part.slot === slot)?.part;
  const units = (slot: Slot) => lines.filter((l) => l.part.slot === slot).reduce((n, l) => n + l.units, 0);

  const chassis = first("chassis");
  const motor = first("drive_motor");
  const fourWheel = (chassis?.compat.motor_mounts ?? units("drive_motor")) >= 4;
  const wheelsName = first("wheels")?.name ?? (chassis?.compat.includes_wheels ? "Wheels (included with chassis)" : undefined);
  const casterName = first("caster")?.name ?? (chassis?.compat.includes_caster ? "Caster (included with chassis)" : undefined);
  const empty = lines.length === 0;

  const style = (slot: Slot) => {
    const c = groupColor(SLOT_GROUP[slot]);
    return { fill: `color-mix(in srgb, ${c} 22%, var(--background))`, stroke: c, strokeWidth: 1.5 };
  };
  const label = (slot: Slot) => ({ fill: groupColor(SLOT_GROUP[slot]), fontSize: 8, fontWeight: 600, textAnchor: "middle" as const });

  const axles = fourWheel ? [64, 176] : [120];
  const sense = groupColor("sense");
  const lidar = first("lidar");
  const camera = first("camera");
  const distance = first("distance_sensor");
  const compute = first("compute");
  const controller = first("controller");
  const driver = first("motor_driver");
  const battery = first("battery");
  const regulator = first("regulator");
  const imu = first("imu");

  return (
    <figure className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <svg viewBox="0 0 320 232" role="img" aria-label={empty ? "Empty rover outline" : `Top-down sketch of the rover with ${lines.length} parts`} className="mx-auto h-auto w-full max-w-xs">
        <text x="12" y="16" fontSize="8" fill="currentColor" fillOpacity="0.45" fontWeight="600">
          FRONT ↑
        </text>

        {/* sensor fields of view, drawn under the body */}
        {camera && <polygon points="160,30 118,0 202,0" fill={sense} fillOpacity="0.14" />}
        {distance && (
          <g fill="none" stroke={sense} strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round">
            <path d="M118 16a14 14 0 0 1 20 0M204 16a14 14 0 0 0-20 0M122 9a22 22 0 0 1 12 0M198 9a22 22 0 0 0-12 0" />
          </g>
        )}

        {/* wheels and motors */}
        {axles.flatMap((y) =>
          [60, 236].map((x) => (
            <g key={`${x}-${y}`}>
              {wheelsName ? (
                <g>
                  <title>{wheelsName}</title>
                  <rect x={x} y={y - 24} width="24" height="48" rx="7" fill={groupColor("body")} />
                  {[-14, -5, 4, 13].map((d) => (
                    <line key={d} x1={x + 3} x2={x + 21} y1={y + d} y2={y + d} stroke="var(--background)" strokeOpacity="0.45" strokeWidth="2" />
                  ))}
                </g>
              ) : (
                <rect x={x} y={y - 24} width="24" height="48" rx="7" {...ghost} />
              )}
            </g>
          )),
        )}

        {/* chassis plate */}
        {chassis ? (
          <rect x="88" y="22" width="144" height="194" rx="16" {...style("chassis")} fill={`color-mix(in srgb, ${groupColor("body")} 8%, var(--background))`}>
            <title>{chassis.name}</title>
          </rect>
        ) : (
          <rect x="88" y="22" width="144" height="194" rx="16" {...ghost} />
        )}

        {axles.flatMap((y) =>
          [94, 196].map((x) =>
            motor ? (
              <rect key={`${x}-${y}`} x={x} y={y - 10} width="30" height="20" rx="4" {...style("drive_motor")}>
                <title>{motor.name}</title>
              </rect>
            ) : (
              <rect key={`${x}-${y}`} x={x} y={y - 10} width="30" height="20" rx="4" {...ghost} />
            ),
          ),
        )}

        {!fourWheel &&
          (casterName ? (
            <circle cx="160" cy="204" r="6" {...style("caster")}>
              <title>{casterName}</title>
            </circle>
          ) : (
            <circle cx="160" cy="204" r="6" {...ghost} />
          ))}

        {/* front sensors */}
        {camera && (
          <g>
            <title>{camera.name}</title>
            <rect x="148" y="26" width="24" height="14" rx="3" {...style("camera")} />
            <circle cx="160" cy="33" r="3.5" fill={sense} />
          </g>
        )}
        {distance && (
          <g>
            <title>{distance.name}</title>
            <circle cx="128" cy="33" r="5" {...style("distance_sensor")} />
            <circle cx="194" cy="33" r="5" {...style("distance_sensor")} />
          </g>
        )}

        {lidar && (
          <g>
            <title>{lidar.name}</title>
            <circle cx="160" cy="70" r="20" fill="none" stroke={sense} strokeOpacity="0.4" strokeDasharray="3 4" />
            <circle cx="160" cy="70" r="13" {...style("lidar")} />
            <g className="motion-safe:animate-[spin_5s_linear_infinite]" style={{ transformOrigin: "160px 70px" }}>
              <line x1="160" y1="70" x2="160" y2="50" stroke={sense} strokeWidth="2" strokeLinecap="round" />
            </g>
            <circle cx="160" cy="70" r="2.5" fill={sense} />
          </g>
        )}

        {/* electronics */}
        {compute ? (
          <g>
            <title>{compute.name}</title>
            <rect x="134" y="100" width="52" height="34" rx="4" {...style("compute")} />
            <text x="160" y="120" {...label("compute")}>
              COMPUTER
            </text>
          </g>
        ) : null}
        {controller && (
          <g>
            <title>{controller.name}</title>
            <rect x="132" y="140" width="26" height="16" rx="3" {...style("controller")} />
            <text x="145" y="151" {...label("controller")}>
              MCU
            </text>
          </g>
        )}
        {driver && (
          <g>
            <title>{driver.name}</title>
            <rect x="162" y="140" width="26" height="16" rx="3" {...style("motor_driver")} />
            <text x="175" y="151" {...label("motor_driver")}>
              DRV
            </text>
          </g>
        )}
        {imu && (
          <rect x="104" y="142" width="12" height="12" rx="2" {...style("imu")}>
            <title>{imu.name}</title>
          </rect>
        )}
        {regulator && (
          <g>
            <title>{regulator.name}</title>
            <rect x="198" y="140" width="22" height="16" rx="3" {...style("regulator")} />
            <text x="209" y="151" {...label("regulator")}>
              5V
            </text>
          </g>
        )}
        {battery ? (
          <g>
            <title>{battery.name}</title>
            <rect x="132" y="164" width="56" height="28" rx="5" {...style("battery")} />
            <text x="160" y="181" {...label("battery")}>
              BATTERY
            </text>
          </g>
        ) : (
          <rect x="132" y="164" width="56" height="28" rx="5" {...ghost} />
        )}

        {empty && (
          <text x="160" y="78" fontSize="11" fill="currentColor" fillOpacity="0.5" textAnchor="middle">
            Your rover appears here
          </text>
        )}
      </svg>
      <figcaption className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {GROUP_ORDER.map((g) => (
          <span key={g} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: groupColor(g) }} />
            {GROUP_LABELS[g]}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
