"use client";
// Live 3D model of the rover, assembled from the parts in the build. 1 unit = 10 cm.
// Hover a part to see what it is; click it to choose a different one.
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Bounds, Center, ContactShadows, Environment, Lightformer, OrbitControls, RoundedBox } from "@react-three/drei";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CatmullRomCurve3, LatheGeometry, Vector2, Vector3, type Group } from "three";
import type { BuildItem, Part, Slot } from "@/lib/compat/types";
import { SLOT_EXPLAIN, SLOT_LABELS } from "@/lib/slots";

const BLUE = "#2a44f5";

/** Which slot is selected or hovered, so every material in that part can glow. */
const HighlightCtx = createContext<{ selected?: Slot | Slot[]; hovered?: Slot; strong?: boolean }>({});
const isSelected = (sel: Slot | Slot[] | undefined, slot: Slot) => (Array.isArray(sel) ? sel.includes(slot) : sel === slot);
const SlotCtx = createContext<Slot | null>(null);

type MatProps = { color: string; metal?: number; rough?: number; opacity?: number; glow?: boolean };
function Mat({ color, metal = 0.1, rough = 0.55, opacity, glow = true }: MatProps) {
  const { selected, hovered, strong } = useContext(HighlightCtx);
  const slot = useContext(SlotCtx);
  const intensity = !glow || !slot ? 0 : slot === hovered ? 0.32 : isSelected(selected, slot) ? (strong ? 0.42 : 0.16) : 0;
  return (
    <meshStandardMaterial
      color={color}
      metalness={metal}
      roughness={rough}
      emissive={intensity ? BLUE : "#000"}
      emissiveIntensity={intensity}
      transparent={opacity !== undefined}
      opacity={opacity ?? 1}
    />
  );
}

/** Wraps a part so it reports hover and click for its slot. */
function Pick({ slot, onHover, onPick, children }: { slot: Slot; onHover: (s: Slot | null) => void; onPick: (s: Slot) => void; children: ReactNode }) {
  return (
    <SlotCtx.Provider value={slot}>
      <group
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover(slot);
        }}
        onPointerOut={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover(null);
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onPick(slot);
        }}
      >
        {children}
      </group>
    </SlotCtx.Provider>
  );
}

interface Layout {
  L: number;
  W: number;
  r: number;
  ww: number;
  deck1: number;
  deck2: number;
  mounts: number;
  plate: string;
  acrylic: boolean;
}

function layoutFor(chassis?: Part, wheels?: Part): Layout {
  const id = chassis?.id ?? "";
  const dia = wheels?.compat.wheel_diameter_mm ?? 65;
  const r = dia / 200;
  const mounts = chassis?.compat.motor_mounts ?? 2;
  const base =
    {
      "chassis-2wd-tt-acrylic": { L: 2.2, W: 1.35, gap: 0.42, plate: "#bfe0ea", acrylic: true },
      "chassis-4wd-tt-aluminum": { L: 2.6, W: 1.45, gap: 0.42, plate: "#25272c", acrylic: false },
      "chassis-2wd-37d-plate": { L: 3.0, W: 2.3, gap: 0.62, plate: "#3b3f47", acrylic: false },
      "chassis-4wd-25d-aluminum": { L: 2.6, W: 1.8, gap: 0.5, plate: "#2c2f35", acrylic: false },
    }[id] ?? { L: 2.2, W: 1.35, gap: 0.42, plate: "#bfe0ea", acrylic: true };
  const deck1 = r + 0.12;
  return { L: base.L, W: base.W, r, ww: dia >= 90 ? 0.42 : 0.27, deck1, deck2: deck1 + base.gap, mounts, plate: base.plate, acrylic: base.acrylic };
}

function Deck({ lay, y, w, l }: { lay: Layout; y: number; w: number; l: number }) {
  const { selected, hovered, strong } = useContext(HighlightCtx);
  const glow = hovered === "chassis" ? 0.25 : isSelected(selected, "chassis") ? (strong ? 0.3 : 0.12) : 0;
  return (
    <group position={[0, y, 0]}>
      <RoundedBox args={[l, 0.035, w]} radius={0.015} smoothness={2} castShadow receiveShadow>
        {lay.acrylic ? (
          <meshPhysicalMaterial color={lay.plate} roughness={0.08} transmission={0.7} thickness={0.04} ior={1.49} transparent opacity={0.8} emissive={glow ? BLUE : "#000"} emissiveIntensity={glow} />
        ) : (
          <meshStandardMaterial color={lay.plate} metalness={0.7} roughness={0.38} emissive={glow ? BLUE : "#000"} emissiveIntensity={glow} />
        )}
      </RoundedBox>
      {/* slotted mounting holes along the deck, as on real chassis plates */}
      {Array.from({ length: Math.floor(l / 0.18) - 1 }, (_, i) => -l / 2 + 0.18 * (i + 1)).flatMap((x) =>
        [-w * 0.33, 0, w * 0.33].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.019, z]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.022, 12]} />
            <meshStandardMaterial color={lay.acrylic ? "#8fb6c3" : "#111214"} roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Rounded rubber tyre with tread blocks, plus a hub with spokes. */
function Wheel({ pos, lay, hub }: { pos: [number, number, number]; lay: Layout; hub: string }) {
  const tyre = useMemo(() => {
    const r = lay.r;
    const hw = lay.ww / 2;
    const pts: Vector2[] = [];
    const inner = r * 0.62;
    pts.push(new Vector2(inner, -hw));
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI;
      pts.push(new Vector2(r - 0.03 + Math.cos(a) * 0.03, Math.sin(a) * hw));
    }
    pts.push(new Vector2(inner, hw));
    return new LatheGeometry(pts, 48);
  }, [lay.r, lay.ww]);
  const treads = 22;
  const out = pos[2] > 0 ? 1 : -1;
  return (
    <group position={pos} rotation={[Math.PI / 2, 0, 0]}>
      <mesh geometry={tyre} castShadow>
        <Mat color="#1b1c1f" rough={0.92} />
      </mesh>
      {Array.from({ length: treads }, (_, i) => {
        const a = (i / treads) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * (lay.r - 0.004), 0, Math.sin(a) * (lay.r - 0.004)]} rotation={[0, -a, 0]} castShadow>
            <boxGeometry args={[0.022, lay.ww * 0.8, 0.045]} />
            <Mat color="#151618" rough={0.95} />
          </mesh>
        );
      })}
      <mesh>
        <cylinderGeometry args={[lay.r * 0.62, lay.r * 0.62, lay.ww * 0.7, 32]} />
        <Mat color={hub} metal={hub === "#f2c230" ? 0.05 : 0.8} rough={hub === "#f2c230" ? 0.5 : 0.3} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[0, (out * lay.ww) / 2.6, 0]} rotation={[0, (i / 5) * Math.PI * 2, 0]}>
          <boxGeometry args={[lay.r * 1.1, 0.02, 0.05]} />
          <Mat color={hub === "#f2c230" ? "#e3ab12" : "#9aa0a8"} metal={0.4} rough={0.4} />
        </mesh>
      ))}
      <mesh position={[0, (out * lay.ww) / 2.4, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.04, 16]} />
        <Mat color="#2a2c30" metal={0.6} rough={0.3} />
      </mesh>
    </group>
  );
}

function Motor({ pos, part, side }: { pos: [number, number, number]; part: Part; side: number }) {
  if (part.compat.motor_form_factor === "TT") {
    return (
      <group position={pos}>
        <mesh castShadow>
          <boxGeometry args={[0.65, 0.22, 0.37]} />
          <Mat color="#f2c230" rough={0.5} />
        </mesh>
        <mesh position={[-0.12, 0, -side * 0.26]} rotation-x={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.2, 24]} />
          <Mat color="#c9cdd3" metal={0.9} rough={0.25} />
        </mesh>
        {part.compat.has_encoder && (
          <mesh position={[-0.12, 0, -side * 0.37]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.11, 0.11, 0.015, 24]} />
            <Mat color="#1f6f3a" rough={0.6} />
          </mesh>
        )}
      </group>
    );
  }
  const big = part.compat.motor_form_factor === "37D";
  const R = big ? 0.185 : 0.125;
  return (
    <group position={pos} rotation-x={Math.PI / 2}>
      <mesh position={[0, side * 0.2, 0]} castShadow>
        <cylinderGeometry args={[R, R, 0.42, 32]} />
        <Mat color="#d4a63a" metal={0.85} rough={0.3} />
      </mesh>
      <mesh position={[0, -side * 0.18, 0]} castShadow>
        <cylinderGeometry args={[R * 0.97, R * 0.97, 0.5, 32]} />
        <Mat color="#aeb4bc" metal={0.9} rough={0.22} />
      </mesh>
      {part.compat.has_encoder && (
        <mesh position={[0, -side * 0.45, 0]}>
          <cylinderGeometry args={[R * 1.05, R * 1.05, 0.03, 32]} />
          <Mat color="#1f6f3a" rough={0.6} />
        </mesh>
      )}
    </group>
  );
}

function Board({ size, pos, color, rot = 0, pins = true, children }: { size: [number, number]; pos: [number, number, number]; color: string; rot?: number; pins?: boolean; children?: ReactNode }) {
  const rows = pins ? Math.max(4, Math.floor(size[0] / 0.025)) : 0;
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh castShadow position={[0, 0.06, 0]}>
        <boxGeometry args={[size[0], 0.016, size[1]]} />
        <Mat color={color} rough={0.55} />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b], i) => (
        <group key={i} position={[(a * size[0]) / 2.3, 0, (b * size[1]) / 2.3]}>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.016, 0.016, 0.06, 6]} />
            <Mat color="#c9a24a" metal={0.9} rough={0.3} glow={false} />
          </mesh>
          <mesh position={[0, 0.072, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.008, 12]} />
            <Mat color="#cfd3d9" metal={0.95} rough={0.2} glow={false} />
          </mesh>
        </group>
      ))}
      {/* header pins along one edge */}
      {Array.from({ length: rows }, (_, i) => (
        <mesh key={i} position={[-size[0] / 2 + 0.03 + i * 0.025, 0.085, -size[1] / 2 + 0.035]}>
          <boxGeometry args={[0.012, 0.035, 0.03]} />
          <meshStandardMaterial color="#d8b04a" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
      <group position={[0, 0.068, 0]}>{children}</group>
    </group>
  );
}

const Chip = ({ s, p, c = "#141414" }: { s: [number, number, number]; p: [number, number, number]; c?: string }) => (
  <mesh position={[p[0], p[1] + s[1] / 2, p[2]]} castShadow>
    <boxGeometry args={s} />
    <Mat color={c} metal={c === "#c9ccd1" ? 0.85 : 0.1} rough={c === "#c9ccd1" ? 0.25 : 0.45} />
  </mesh>
);

function Lidar({ pos, part }: { pos: [number, number, number]; part: Part }) {
  const top = useRef<Group>(null);
  useFrame((_, dt) => {
    if (top.current) top.current.rotation.y += dt * 2.2;
  });
  const small = part.id.includes("ld19");
  const R = small ? 0.2 : 0.3;
  return (
    <group position={pos}>
      <RoundedBox args={[R * 2.4, 0.12, R * 2.1]} radius={0.03} position={[0, 0.06, 0]} castShadow>
        <Mat color="#232529" rough={0.5} />
      </RoundedBox>
      <group ref={top} position={[0, 0.12, 0]}>
        <mesh castShadow position={[0, 0.12, 0]}>
          <cylinderGeometry args={[R, R * 1.02, 0.22, 48]} />
          <Mat color={part.id.includes("a1") ? "#3f434b" : "#1d1f23"} metal={0.3} rough={0.3} />
        </mesh>
        <mesh position={[R - 0.005, 0.12, 0]}>
          <boxGeometry args={[0.03, 0.08, 0.16]} />
          <meshStandardMaterial color="#300808" emissive="#ff2a2a" emissiveIntensity={0.7} roughness={0.1} />
        </mesh>
      </group>
    </group>
  );
}

/** A cable from a to b, sagging or arching through the given control points. */
function Wire({ pts, color, r = 0.011 }: { pts: [number, number, number][]; color: string; r?: number }) {
  const curve = useMemo(() => new CatmullRomCurve3(pts.map((p) => new Vector3(...p))), [pts]);
  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, 48, r, 8, false]} />
      <meshStandardMaterial color={color} roughness={0.55} />
    </mesh>
  );
}

function Rover({ items, byId, onHover, onPick, only }: { items: BuildItem[]; byId: Record<string, Part>; onHover: (s: Slot | null) => void; onPick: (s: Slot) => void; only?: Slot }) {
  const get = (s: Slot) => items.map((i) => byId[i.part_id]).find((p) => p?.slot === s);
  const chassis = get("chassis");
  const wheels = get("wheels");
  const motor = get("drive_motor");
  const lay = useMemo(() => layoutFor(chassis, wheels), [chassis, wheels]);
  const battery = get("battery");
  const driver = get("motor_driver");
  const controller = get("controller");
  const compute = get("compute");
  const regulator = get("regulator");
  const lidar = get("lidar");
  const camera = get("camera");
  const distance = get("distance_sensor");
  const imu = get("imu");
  const caster = get("caster") || chassis?.compat.includes_caster;
  const P = (slot: Slot, node: ReactNode) =>
    only && only !== slot ? null : (
    <Pick slot={slot} onHover={onHover} onPick={onPick}>
      {node}
    </Pick>
  );

  const zW = lay.W / 2 + lay.ww / 2 + 0.04;
  const wheelX = only ? [lay.L * 0.18] : lay.mounts === 4 ? [lay.L * 0.32, -lay.L * 0.32] : [lay.L * 0.18];
  const sides = only ? [1] : [1, -1];
  const hub = motor?.compat.motor_form_factor === "TT" || !wheels || wheels.compat.wheel_shaft === "TT" ? "#f2c230" : "#c5c9cf";
  const top = lay.deck2 + 0.02;
  const low = lay.deck1 + 0.02;

  // Where things sit, so wires can join them.
  const bigBatt = (battery?.compat.capacity_wh ?? 15) > 50;
  const nimh = battery?.compat.chemistry === "NiMH";
  const bSize: [number, number, number] = bigBatt ? [1.0, 0.3, 0.75] : nimh ? [0.85, 0.2, 0.6] : [0.9, 0.22, 0.45];
  const bPos: [number, number, number] = [-0.05, low + bSize[1] / 2, 0];
  const dPos: [number, number, number] = [lay.L * 0.33, low, 0];
  const rPos: [number, number, number] = [-lay.L * 0.36, low, lay.W * 0.28];
  const cPos: [number, number, number] = [lidar ? -lay.L * 0.2 : 0, top, 0];
  const ctlPos: [number, number, number] = compute ? [-lay.L * 0.36, low, -lay.W * 0.26] : [0, top, 0];
  const lPos: [number, number, number] = [lay.L * 0.12, top, 0];
  const motorZ = motor?.compat.motor_form_factor === "TT" ? lay.W / 2 - 0.2 : lay.W / 2 - 0.45;
  const bTop = bPos[1] + bSize[1] / 2;
  const edge = lay.W * 0.47;

  return (
    <group>
      {P(
        "chassis",
        <>
          <Deck lay={lay} y={lay.deck1} w={lay.W} l={lay.L} />
          <Deck lay={lay} y={lay.deck2} w={lay.W * 0.92} l={lay.L * 0.86} />
          {[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b], i) => (
            <mesh key={i} position={[a * lay.L * 0.38, (lay.deck1 + lay.deck2) / 2, b * lay.W * 0.38]} castShadow>
              <cylinderGeometry args={[0.028, 0.028, lay.deck2 - lay.deck1, 6]} />
              <Mat color="#c9a24a" metal={0.9} rough={0.3} />
            </mesh>
          ))}
        </>,
      )}

      {wheelX.flatMap((x) =>
        sides.map((side) => (
          <group key={`${x}${side}`}>
            {motor && P("drive_motor", <Motor part={motor} side={side} pos={[x, lay.r, side * motorZ]} />)}
            {P("wheels", <Wheel pos={[x, lay.r, side * zW]} lay={lay} hub={hub} />)}
          </group>
        )),
      )}

      {caster &&
        (!only || only === "caster") &&
        P(
          get("caster") ? "caster" : "chassis",
          <group position={[-lay.L * 0.4, 0, 0]}>
            <mesh position={[0, 0.11, 0]} castShadow>
              <sphereGeometry args={[0.11, 32, 16]} />
              <Mat color="#d6d9de" metal={1} rough={0.12} />
            </mesh>
            {/* housing that cups the ball, then a post up to the deck */}
            <mesh position={[0, 0.17, 0]}>
              <cylinderGeometry args={[0.12, 0.135, 0.1, 28]} />
              <Mat color="#2a2c30" metal={0.3} rough={0.5} />
            </mesh>
            <mesh position={[0, 0.225, 0]}>
              <boxGeometry args={[0.36, 0.02, 0.14]} />
              <Mat color="#2a2c30" metal={0.3} rough={0.5} />
            </mesh>
            {[-0.13, 0.13].map((x) => (
              <mesh key={x} position={[x, 0.238, 0]}>
                <cylinderGeometry args={[0.018, 0.018, 0.01, 12]} />
                <Mat color="#cfd3d9" metal={0.95} rough={0.2} glow={false} />
              </mesh>
            ))}
            {!only && lay.deck1 > 0.25 && (
              <mesh position={[0, (lay.deck1 + 0.24) / 2, 0]}>
                <cylinderGeometry args={[0.025, 0.025, lay.deck1 - 0.24, 10]} />
                <Mat color="#c9a24a" metal={0.9} rough={0.3} />
              </mesh>
            )}
          </group>,
        )}

      {battery &&
        P(
          "battery",
          <group position={bPos}>
            <RoundedBox args={bSize} radius={0.04} smoothness={3} castShadow>
              <Mat color={nimh ? "#1d1e21" : battery.compat.chemistry === "LiPo" ? "#26282d" : "#2a5fb0"} rough={0.4} />
            </RoundedBox>
            {!nimh && (
              <mesh position={[0, 0, bSize[2] / 2 + 0.001]}>
                <planeGeometry args={[bSize[0] * 0.6, bSize[1] * 0.5]} />
                <meshStandardMaterial color="#e9ecf0" roughness={0.6} />
              </mesh>
            )}
            {nimh &&
              Array.from({ length: 6 }, (_, i) => (
                <mesh key={i} position={[-0.35 + i * 0.14, bSize[1] / 2 + 0.01, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <cylinderGeometry args={[0.065, 0.065, 0.5, 20]} />
                  <Mat color="#3ea05a" rough={0.35} />
                </mesh>
              ))}
          </group>,
        )}

      {driver &&
        P(
          "motor_driver",
          <Board size={driver.compat.continuous_a_per_channel! >= 10 ? [0.55, 0.42] : [0.42, 0.3]} pos={dPos} color={driver.id.includes("cytron") || driver.id.includes("l298") ? "#c4302b" : "#1f6f3a"}>
            <Chip s={[0.1, 0.08, 0.14]} p={[-0.12, 0, 0.02]} c="#2c6be0" />
            <Chip s={[0.1, 0.08, 0.14]} p={[0.12, 0, 0.02]} c="#2c6be0" />
            <Chip s={[0.08, 0.02, 0.08]} p={[0, 0, 0.04]} />
            {driver.id.includes("l298") && <Chip s={[0.16, 0.16, 0.04]} p={[0.04, 0, -0.08]} c="#2b2d31" />}
          </Board>,
        )}

      {regulator &&
        P(
          "regulator",
          <Board size={[0.28, 0.2]} pos={rPos} pins={false} color={regulator.id.includes("pololu") ? "#1f6f3a" : "#2f5fb3"}>
            <Chip s={[0.11, 0.07, 0.11]} p={[0, 0, 0]} c="#2b2d31" />
            {!regulator.id.includes("pololu") && <Chip s={[0.04, 0.05, 0.04]} p={[0.09, 0, 0.05]} c="#2c6be0" />}
          </Board>,
        )}

      {distance &&
        P(
          "distance_sensor",
          <group position={[lay.L / 2 - 0.02, lay.deck1 + 0.18, 0]} rotation={[0, 0, Math.PI / 2]}>
            <mesh castShadow>
              <boxGeometry args={[0.2, 0.016, distance.compat.interface === "gpio" ? 0.45 : 0.14]} />
              <Mat color={distance.compat.interface === "gpio" ? "#2f5fb3" : "#1f6f3a"} />
            </mesh>
            {distance.compat.interface !== "gpio" && (
              <>
                {/* laser module with its two little windows, plus header pins along the bottom */}
                <mesh position={[0.02, -0.018, 0]}>
                  <boxGeometry args={[0.05, 0.02, 0.07]} />
                  <meshStandardMaterial color="#111214" roughness={0.3} />
                </mesh>
                {[-0.015, 0.015].map((z) => (
                  <mesh key={z} position={[0.02, -0.029, z]} rotation-x={Math.PI}>
                    <circleGeometry args={[0.008, 16]} />
                    <meshStandardMaterial color={z < 0 ? "#3d57f7" : "#601010"} roughness={0.1} />
                  </mesh>
                ))}
                {Array.from({ length: 6 }, (_, i) => (
                  <mesh key={i} position={[-0.085, -0.015, -0.05 + i * 0.02]}>
                    <boxGeometry args={[0.012, 0.03, 0.012]} />
                    <meshStandardMaterial color="#d8b04a" metalness={0.9} roughness={0.3} />
                  </mesh>
                ))}
              </>
            )}
            {distance.compat.interface === "gpio" &&
              [-0.12, 0.12].map((z) => (
                <group key={z} position={[0, -0.06, z]}>
                  <mesh>
                    <cylinderGeometry args={[0.08, 0.08, 0.12, 32]} />
                    <Mat color="#c9cdd3" metal={0.95} rough={0.25} />
                  </mesh>
                  <mesh position={[0, -0.061, 0]}>
                    <cylinderGeometry args={[0.065, 0.065, 0.002, 32]} />
                    <meshStandardMaterial color="#2b2d31" roughness={0.9} />
                  </mesh>
                </group>
              ))}
          </group>,
        )}

      {compute &&
        P(
          "compute",
          <Board size={compute.id.includes("zero") ? [0.65, 0.3] : compute.id.includes("jetson") ? [1.0, 0.9] : [0.85, 0.56]} pos={cPos} color={compute.id.includes("jetson") ? "#1a1a1a" : "#2f8f3a"}>
            {compute.id.includes("jetson") ? (
              <>
                <Chip s={[0.6, 0.16, 0.55]} p={[0, 0, 0]} c="#3a3d43" />
                {Array.from({ length: 10 }, (_, i) => (
                  <Chip key={i} s={[0.02, 0.04, 0.5]} p={[-0.25 + i * 0.055, 0.16, 0]} c="#55595f" />
                ))}
              </>
            ) : (
              <>
                <Chip s={[0.16, 0.02, 0.16]} p={[-0.12, 0, 0.04]} c="#c9ccd1" />
                <Chip s={[0.1, 0.012, 0.1]} p={[0.06, 0, 0.06]} />
                {!compute.id.includes("zero") && (
                  <>
                    <Chip s={[0.17, 0.14, 0.13]} p={[0.34, 0, -0.17]} c="#c9ccd1" />
                    <Chip s={[0.17, 0.14, 0.13]} p={[0.34, 0, -0.01]} c="#c9ccd1" />
                    <Chip s={[0.17, 0.12, 0.14]} p={[0.34, 0, 0.16]} c="#c9ccd1" />
                  </>
                )}
              </>
            )}
          </Board>,
        )}

      {controller &&
        P(
          "controller",
          <Board size={controller.id.includes("arduino") ? [0.69, 0.53] : [0.52, 0.2]} pos={ctlPos} rot={compute ? Math.PI / 2 : 0} color={controller.id.includes("arduino") ? "#00878f" : controller.id.includes("esp32") ? "#1c1c1c" : "#2f8f3a"}>
            <Chip s={[0.12, 0.015, 0.12]} p={[0, 0, 0.02]} />
            <Chip s={[0.08, 0.05, 0.06]} p={[-0.2, 0, 0]} c="#c9ccd1" />
            {controller.id.includes("esp32") && <Chip s={[0.18, 0.025, 0.15]} p={[0.15, 0, 0.02]} c="#c9ccd1" />}
          </Board>,
        )}

      {lidar && P("lidar", <Lidar part={lidar} pos={lPos} />)}

      {camera &&
        P(
          "camera",
          camera.id.includes("oak") || camera.id.includes("realsense") ? (
            <group position={[lay.L * 0.4, top + 0.2, 0]}>
              <RoundedBox args={[0.22, 0.25, 0.92]} radius={0.05} smoothness={3} castShadow>
                <Mat color="#2b2e34" metal={0.5} rough={0.3} />
              </RoundedBox>
              {[-0.3, 0, 0.3].map((z) => (
                <mesh key={z} position={[0.115, 0, z]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.06, 0.06, 0.02, 24]} />
                  <meshPhysicalMaterial color="#05060a" metalness={0.2} roughness={0.05} clearcoat={1} />
                </mesh>
              ))}
              <mesh position={[0, -0.18, 0]}>
                <boxGeometry args={[0.08, 0.12, 0.08]} />
                <Mat color="#3a3d43" />
              </mesh>
            </group>
          ) : (
            <group position={[lay.L * 0.42, top + 0.16, 0]} rotation={[0, 0, Math.PI / 2]}>
              <mesh castShadow>
                <boxGeometry args={[0.25, 0.016, 0.24]} />
                <Mat color="#2f8f3a" />
              </mesh>
              <mesh position={[0, -0.04, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.06, 24]} />
                <meshPhysicalMaterial color="#05060a" roughness={0.05} clearcoat={1} />
              </mesh>
            </group>
          ),
        )}

      {imu &&
        P(
          "imu",
          <Board size={[0.22, 0.18]} pos={[compute ? -lay.L * 0.2 : lay.L * 0.25, top, lay.W * 0.32]} pins={false} color="#1b3f8f">
            <Chip s={[0.07, 0.015, 0.07]} p={[0, 0, 0]} />
          </Board>,
        )}

      {/* wiring: red is power, black is ground, blue is signal */}
      {!only && (
        <>
      {battery && driver && (
        <>
          <Wire color="#c62f25" pts={[[bPos[0] + bSize[0] / 2 - 0.05, bTop, 0.08], [bPos[0] + bSize[0] / 2 + 0.15, bTop + 0.08, 0.1], [dPos[0] - 0.2, low + 0.12, 0.08]]} />
          <Wire color="#1a1b1e" pts={[[bPos[0] + bSize[0] / 2 - 0.05, bTop, -0.06], [bPos[0] + bSize[0] / 2 + 0.15, bTop + 0.06, -0.08], [dPos[0] - 0.2, low + 0.12, -0.06]]} />
        </>
      )}
      {driver &&
        motor &&
        wheelX.flatMap((x) =>
          [1, -1].map((side) => (
            <Wire
              key={`m${x}${side}`}
              color={side > 0 ? "#c62f25" : "#1a1b1e"}
              r={0.009}
              pts={[[dPos[0] + 0.15 * Math.sign(x - dPos[0] || 1), low + 0.1, side * 0.12], [(dPos[0] + x) / 2, low + 0.08, side * motorZ * 0.6], [x, lay.r + 0.13, side * (motorZ - 0.1)]]}
            />
          )),
        )}
      {battery && regulator && <Wire color="#c62f25" r={0.009} pts={[[bPos[0] - bSize[0] / 2 + 0.05, bTop, 0.1], [rPos[0] + 0.1, low + 0.15, rPos[2] - 0.1], [rPos[0], low + 0.1, rPos[2]]]} />}
      {regulator && compute && (
        <Wire color="#c62f25" r={0.01} pts={[[rPos[0], low + 0.1, rPos[2] + 0.08], [rPos[0] - 0.05, (low + top) / 2, edge], [cPos[0] - 0.2, top + 0.15, edge * 0.7], [cPos[0] - 0.2, top + 0.09, 0.15]]} />
      )}
      {controller && compute && (
        <Wire color="#202226" r={0.02} pts={[[ctlPos[0], low + 0.12, ctlPos[2] - 0.1], [ctlPos[0] + 0.05, (low + top) / 2, -edge], [cPos[0] + 0.25, top + 0.2, -edge * 0.6], [cPos[0] + 0.34, top + 0.14, -0.17]]} />
      )}
      {controller && driver && (
        <Wire color="#2a44f5" r={0.007} pts={[[ctlPos[0] + 0.1, (compute ? low : top) + 0.1, ctlPos[2]], [(ctlPos[0] + dPos[0]) / 2, low + 0.2, -0.25], [dPos[0] - 0.05, low + 0.1, -0.12]]} />
      )}
      {lidar && compute && <Wire color="#202226" r={0.015} pts={[[lPos[0] - 0.2, top + 0.05, 0.15], [(lPos[0] + cPos[0]) / 2, top + 0.18, 0.28], [cPos[0] + 0.34, top + 0.14, 0.16]]} />}
        </>
      )}
    </group>
  );
}

/** One part on its own in a studio, used to render product images (see scripts/render-part-shots.mjs). */
export function ProductShot({ part }: { part: Part }) {
  // Give lone parts sensible neighbours: wheels need a motor shaft size, motors a chassis type.
  const items: BuildItem[] = [{ part_id: part.id, quantity: 1 }];
  const byId: Record<string, Part> = { [part.id]: part };
  const noop = () => {};
  return (
    <Canvas shadows="percentage" dpr={2} camera={{ position: [3.2, 2.1, 3.4], fov: 28 }} gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}>
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 7, 3]} intensity={1.7} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} />
      <directionalLight position={[-4, 3, -3]} intensity={0.4} color="#dfe5ff" />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2.4} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={1.3} position={[-5, 2, 1]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.9} position={[5, 2, -2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} color="#dfe5ff" />
        <Lightformer form="ring" intensity={0.6} position={[0, 1, 6]} scale={3} />
      </Environment>
      <HighlightCtx.Provider value={{}}>
        <Bounds fit clip margin={1.15}>
          <Center bottom>
            <Rover items={items} byId={byId} onHover={noop} onPick={noop} only={part.slot} />
          </Center>
        </Bounds>
      </HighlightCtx.Provider>
      <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={8} blur={2.4} far={2} />
    </Canvas>
  );
}

/** Pull the camera back for bigger chassis so the whole robot stays in frame. */
function CameraRig({ items, byId }: { items: BuildItem[]; byId: Record<string, Part> }) {
  const camera = useThree((s) => s.camera);
  const chassis = items.map((i) => byId[i.part_id]).find((p) => p?.slot === "chassis");
  const wheels = items.map((i) => byId[i.part_id]).find((p) => p?.slot === "wheels");
  const lay = layoutFor(chassis, wheels);
  useEffect(() => {
    const size = Math.max(lay.L, lay.W + 0.8);
    const d = size * 2.05 + 1.3;
    const dir = [0.64, 0.36, 0.68];
    const n = Math.hypot(...dir);
    camera.position.set((dir[0] / n) * d, (dir[1] / n) * d, (dir[2] / n) * d);
    camera.lookAt(0, 0.2, 0);
  }, [camera, lay.L, lay.W]);
  return null;
}

export default function RobotViewer({
  items,
  byId,
  highlight,
  strong,
  onSelect,
}: {
  items: BuildItem[];
  byId: Record<string, Part>;
  highlight?: Slot | Slot[];
  /** Guide mode: brighter highlight for the parts added in this step. */
  strong?: boolean;
  onSelect?: (slot: Slot) => void;
}) {
  const [hovered, setHovered] = useState<Slot | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0, w: 600 });
  const wrap = useRef<HTMLDivElement>(null);
  const part = hovered ? items.map((i) => ({ item: i, p: byId[i.part_id] })).find((x) => x.p?.slot === hovered) : undefined;

  return (
    <div
      ref={wrap}
      className="relative h-full w-full"
      style={{ cursor: hovered ? "pointer" : "grab" }}
      onPointerMove={(e) => {
        const r = wrap.current?.getBoundingClientRect();
        if (r) setMouse({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
      }}
      onPointerLeave={() => setHovered(null)}
    >
      <Canvas shadows="percentage" dpr={[1, 2]} camera={{ position: [4.6, 3.4, 4.8], fov: 32 }} gl={{ antialias: true, preserveDrawingBuffer: true }} onPointerMissed={() => setHovered(null)}>
        <color attach="background" args={["#eceef1"]} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[4, 7, 3]} intensity={1.7} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4} />
        <directionalLight position={[-4, 3, -3]} intensity={0.35} color="#dfe5ff" />
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={2.4} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
          <Lightformer form="rect" intensity={1.3} position={[-5, 2, 1]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
          <Lightformer form="rect" intensity={0.9} position={[5, 2, -2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} color="#dfe5ff" />
          <Lightformer form="ring" intensity={0.6} position={[0, 1, 6]} scale={3} />
        </Environment>
        <HighlightCtx.Provider value={{ selected: highlight, hovered: hovered ?? undefined, strong }}>
          <group position={[0, -0.6, 0]}>
            <Rover items={items} byId={byId} onHover={setHovered} onPick={(s) => onSelect?.(s)} />
            <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, -0.001, 0]}>
              <circleGeometry args={[9, 64]} />
              <meshStandardMaterial color="#e6e8ec" roughness={1} />
            </mesh>
            <ContactShadows position={[0, 0.002, 0]} opacity={0.5} scale={10} blur={2.2} far={3} />
          </group>
        </HighlightCtx.Provider>
        <CameraRig items={items} byId={byId} />
        <OrbitControls makeDefault enablePan={false} minDistance={3.5} maxDistance={10} maxPolarAngle={Math.PI / 2.15} target={[0, 0.2, 0]} />
      </Canvas>

      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 w-64 rounded-2xl bg-ink px-3.5 py-3 text-white shadow-lg"
          style={{ left: Math.max(8, Math.min(mouse.x + 16, mouse.w - 272)), top: Math.max(8, mouse.y - 12) }}
        >
          <p className="text-xs font-medium text-[#9fb0ff]">{SLOT_LABELS[hovered]}</p>
          <p className="mt-0.5 font-semibold leading-snug">{part?.p.name}</p>
          <p className="mt-1 text-sm leading-snug text-white/75">{SLOT_EXPLAIN[hovered]}</p>
          {part && (
            <p className="mt-2 text-xs text-white/60">
              ~${Math.round(part.p.price_usd_approx * part.item.quantity)}
              {onSelect ? ". Click to see other options." : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
