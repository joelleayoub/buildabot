"use client";
// Live 3D model of the rover, assembled from the parts in the build. 1 unit = 10 cm.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls, RoundedBox } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import type { BuildItem, Part, Slot } from "@/lib/compat/types";

const BLUE = "#2a44f5";

type MatProps = { color: string; hl?: boolean; metal?: number; rough?: number; opacity?: number };
function Mat({ color, hl, metal = 0.1, rough = 0.55, opacity }: MatProps) {
  return (
    <meshStandardMaterial
      color={color}
      metalness={metal}
      roughness={rough}
      emissive={hl ? BLUE : "#000"}
      emissiveIntensity={hl ? 0.22 : 0}
      transparent={opacity !== undefined}
      opacity={opacity ?? 1}
    />
  );
}

interface Layout {
  L: number;
  W: number;
  r: number; // wheel radius
  ww: number; // wheel width
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
  const base = {
    "chassis-2wd-tt-acrylic": { L: 2.2, W: 1.35, gap: 0.42, plate: "#bfe0ea", acrylic: true },
    "chassis-4wd-tt-aluminum": { L: 2.6, W: 1.45, gap: 0.42, plate: "#25272c", acrylic: false },
    "chassis-2wd-37d-plate": { L: 3.0, W: 2.3, gap: 0.62, plate: "#3b3f47", acrylic: false },
    "chassis-4wd-25d-aluminum": { L: 2.6, W: 1.8, gap: 0.5, plate: "#2c2f35", acrylic: false },
  }[id] ?? { L: 2.2, W: 1.35, gap: 0.42, plate: "#bfe0ea", acrylic: true };
  const deck1 = r + 0.12;
  return { L: base.L, W: base.W, r, ww: dia >= 90 ? 0.42 : 0.27, deck1, deck2: deck1 + base.gap, mounts, plate: base.plate, acrylic: base.acrylic };
}

function Deck({ lay, y, w, l, hl }: { lay: Layout; y: number; w: number; l: number; hl?: boolean }) {
  return (
    <RoundedBox args={[l, 0.035, w]} radius={0.015} smoothness={2} position={[0, y, 0]} castShadow receiveShadow>
      {lay.acrylic ? (
        <meshPhysicalMaterial color={lay.plate} roughness={0.15} transmission={0.6} thickness={0.05} transparent opacity={0.75} emissive={hl ? BLUE : "#000"} emissiveIntensity={hl ? 0.2 : 0} />
      ) : (
        <Mat color={lay.plate} hl={hl} metal={0.6} rough={0.35} />
      )}
    </RoundedBox>
  );
}

function Wheel({ pos, lay, hub, hl }: { pos: [number, number, number]; lay: Layout; hub: string; hl?: boolean }) {
  return (
    <group position={pos} rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[lay.r, lay.r, lay.ww, 40]} />
        <Mat color="#1c1d20" rough={0.9} hl={hl} />
      </mesh>
      <mesh position={[0, pos[2] > 0 ? 0.005 : -0.005, 0]}>
        <cylinderGeometry args={[lay.r * 0.6, lay.r * 0.6, lay.ww + 0.01, 24]} />
        <Mat color={hub} metal={0.3} rough={0.4} hl={hl} />
      </mesh>
    </group>
  );
}

function Board({ size, pos, color, hl, rot = 0, children }: { size: [number, number]; pos: [number, number, number]; color: string; hl?: boolean; rot?: number; children?: React.ReactNode }) {
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh castShadow position={[0, 0.06, 0]}>
        <boxGeometry args={[size[0], 0.025, size[1]]} />
        <Mat color={color} hl={hl} rough={0.6} />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b], i) => (
        <mesh key={i} position={[(a * size[0]) / 2.4, 0.03, (b * size[1]) / 2.4]}>
          <cylinderGeometry args={[0.015, 0.015, 0.06, 8]} />
          <Mat color="#e7e1cf" rough={0.5} />
        </mesh>
      ))}
      <group position={[0, 0.075, 0]}>{children}</group>
    </group>
  );
}

const Chip = ({ s, p, c = "#141414" }: { s: [number, number, number]; p: [number, number, number]; c?: string }) => (
  <mesh position={p} castShadow>
    <boxGeometry args={s} />
    <Mat color={c} metal={c === "#c9ccd1" ? 0.8 : 0.1} rough={0.4} />
  </mesh>
);

function Lidar({ pos, part, hl }: { pos: [number, number, number]; part: Part; hl?: boolean }) {
  const top = useRef<Group>(null);
  useFrame((_, dt) => {
    if (top.current) top.current.rotation.y += dt * 2.2;
  });
  const small = part.id.includes("ld19");
  const R = small ? 0.2 : 0.3;
  return (
    <group position={pos}>
      <mesh castShadow position={[0, 0.06, 0]}>
        <boxGeometry args={[R * 2.4, 0.12, R * 2.1]} />
        <Mat color="#232529" hl={hl} rough={0.5} />
      </mesh>
      <group ref={top} position={[0, 0.12, 0]}>
        <mesh castShadow position={[0, 0.12, 0]}>
          <cylinderGeometry args={[R, R, 0.22, 36]} />
          <Mat color={part.id.includes("a1") ? "#3f434b" : "#1d1f23"} hl={hl} metal={0.2} rough={0.35} />
        </mesh>
        <mesh position={[R - 0.01, 0.12, 0]}>
          <boxGeometry args={[0.04, 0.08, 0.14]} />
          <meshStandardMaterial color="#5a1010" emissive="#ff2a2a" emissiveIntensity={0.6} />
        </mesh>
      </group>
    </group>
  );
}

function Rover({ items, byId, highlight }: { items: BuildItem[]; byId: Record<string, Part>; highlight?: Slot }) {
  const get = (s: Slot) => items.map((i) => byId[i.part_id]).find((p) => p?.slot === s);
  const chassis = get("chassis");
  const wheels = get("wheels");
  const motor = get("drive_motor");
  const lay = useMemo(() => layoutFor(chassis, wheels), [chassis, wheels]);
  const hl = (s: Slot) => highlight === s;
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

  const zW = lay.W / 2 + lay.ww / 2 + 0.04;
  const wheelX = lay.mounts === 4 ? [lay.L * 0.32, -lay.L * 0.32] : [lay.L * 0.18];
  const hub = motor?.compat.motor_form_factor === "TT" || !wheels ? "#f2c230" : "#c5c9cf";
  const top = lay.deck2 + 0.02;

  return (
    <group position={[0, 0, 0]}>
      {/* decks + standoffs */}
      <Deck lay={lay} y={lay.deck1} w={lay.W} l={lay.L} hl={hl("chassis")} />
      <Deck lay={lay} y={lay.deck2} w={lay.W * 0.92} l={lay.L * 0.86} hl={hl("chassis")} />
      {[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b], i) => (
        <mesh key={i} position={[a * lay.L * 0.38, (lay.deck1 + lay.deck2) / 2, b * lay.W * 0.38]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, lay.deck2 - lay.deck1, 10]} />
          <Mat color="#c9a24a" metal={0.9} rough={0.3} hl={hl("chassis")} />
        </mesh>
      ))}

      {/* motors + wheels */}
      {wheelX.flatMap((x) =>
        [1, -1].map((side) => (
          <group key={`${x}${side}`}>
            {motor?.compat.motor_form_factor === "TT" ? (
              <mesh position={[x, lay.r, side * (lay.W / 2 - 0.2)]} castShadow>
                <boxGeometry args={[0.65, 0.22, 0.37]} />
                <Mat color="#f2c230" hl={hl("drive_motor")} rough={0.5} />
              </mesh>
            ) : motor ? (
              <mesh position={[x, lay.r, side * (lay.W / 2 - 0.45)]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[motor.compat.motor_form_factor === "37D" ? 0.185 : 0.125, motor.compat.motor_form_factor === "37D" ? 0.185 : 0.125, 0.9, 28]} />
                <Mat color="#a3a9b2" metal={0.85} rough={0.3} hl={hl("drive_motor")} />
              </mesh>
            ) : null}
            <Wheel pos={[x, lay.r, side * zW]} lay={lay} hub={hub} hl={hl("wheels")} />
          </group>
        )),
      )}

      {caster && (
        <group position={[-lay.L * 0.4, 0, 0]}>
          <mesh position={[0, 0.11, 0]} castShadow>
            <sphereGeometry args={[0.11, 24, 16]} />
            <Mat color="#d6d9de" metal={0.95} rough={0.15} hl={hl("caster")} />
          </mesh>
          <mesh position={[0, (lay.deck1 + 0.18) / 2, 0]}>
            <cylinderGeometry args={[0.07, 0.11, lay.deck1 - 0.15, 16]} />
            <Mat color="#2a2c30" hl={hl("caster")} />
          </mesh>
        </group>
      )}

      {/* lower deck: battery, driver, regulator */}
      {battery && (() => {
        const big = (battery.compat.capacity_wh ?? 15) > 50;
        const nimh = battery.compat.chemistry === "NiMH";
        const size: [number, number, number] = big ? [1.0, 0.3, 0.75] : nimh ? [0.85, 0.2, 0.6] : [0.9, 0.22, 0.45];
        const color = nimh ? "#1d1e21" : battery.compat.chemistry === "LiPo" ? "#26282d" : "#2a5fb0";
        return (
          <group position={[-0.05, lay.deck1 + 0.02 + size[1] / 2, 0]}>
            <RoundedBox args={size} radius={0.04} smoothness={2} castShadow>
              <Mat color={color} hl={hl("battery")} rough={0.45} />
            </RoundedBox>
            {nimh &&
              Array.from({ length: 6 }, (_, i) => (
                <mesh key={i} position={[-0.35 + i * 0.14, size[1] / 2 + 0.005, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.065, 0.065, 0.5, 16]} />
                  <Mat color="#3ea05a" hl={hl("battery")} />
                </mesh>
              ))}
          </group>
        );
      })()}
      {driver && (
        <Board size={driver.compat.continuous_a_per_channel! >= 10 ? [0.55, 0.42] : [0.42, 0.3]} pos={[lay.L * 0.33, lay.deck1 + 0.02, 0]} color={driver.id.includes("cytron") ? "#c4302b" : driver.id.includes("l298") ? "#c4302b" : "#1f6f3a"} hl={hl("motor_driver")}>
          <Chip s={[0.1, 0.08, 0.14]} p={[-0.12, 0.04, 0]} c="#2c6be0" />
          <Chip s={[0.1, 0.03, 0.1]} p={[0.06, 0.015, 0]} />
          {driver.id.includes("l298") && <Chip s={[0.16, 0.16, 0.04]} p={[0.08, 0.08, -0.08]} c="#2b2d31" />}
        </Board>
      )}
      {regulator && (
        <Board size={[0.28, 0.2]} pos={[-lay.L * 0.36, lay.deck1 + 0.02, lay.W * 0.28]} color={regulator.id.includes("pololu") ? "#1f6f3a" : "#2f5fb3"} hl={hl("regulator")}>
          <Chip s={[0.11, 0.08, 0.11]} p={[0, 0.04, 0]} c="#2b2d31" />
        </Board>
      )}
      {distance && (
        <group position={[lay.L / 2 - 0.02, lay.deck1 + 0.18, 0]} rotation={[0, 0, Math.PI / 2]}>
          <mesh castShadow>
            <boxGeometry args={[0.2, 0.02, distance.compat.interface === "gpio" ? 0.45 : 0.14]} />
            <Mat color="#2f5fb3" hl={hl("distance_sensor")} />
          </mesh>
          {distance.compat.interface === "gpio" &&
            [-0.12, 0.12].map((z) => (
              <mesh key={z} position={[0, -0.06, z]}>
                <cylinderGeometry args={[0.08, 0.08, 0.12, 24]} />
                <Mat color="#c9cdd3" metal={0.9} rough={0.25} hl={hl("distance_sensor")} />
              </mesh>
            ))}
        </group>
      )}

      {/* top deck: computer, controller, sensors */}
      {compute && (
        <Board size={compute.id.includes("zero") ? [0.65, 0.3] : compute.id.includes("jetson") ? [1.0, 0.9] : [0.85, 0.56]} pos={[lidar ? -lay.L * 0.2 : 0, top, 0]} color={compute.id.includes("jetson") ? "#1a1a1a" : "#2f8f3a"} hl={hl("compute")}>
          {compute.id.includes("jetson") ? (
            <Chip s={[0.6, 0.18, 0.55]} p={[0, 0.09, 0]} c="#3a3d43" />
          ) : (
            <>
              <Chip s={[0.18, 0.025, 0.18]} p={[-0.1, 0.012, 0]} c="#c9ccd1" />
              {!compute.id.includes("zero") && (
                <>
                  <Chip s={[0.16, 0.14, 0.12]} p={[0.32, 0.07, -0.16]} c="#c9ccd1" />
                  <Chip s={[0.16, 0.14, 0.12]} p={[0.32, 0.07, 0.0]} c="#c9ccd1" />
                  <Chip s={[0.16, 0.12, 0.14]} p={[0.32, 0.06, 0.18]} c="#c9ccd1" />
                </>
              )}
            </>
          )}
        </Board>
      )}
      {controller && (
        <Board size={controller.id.includes("arduino") ? [0.69, 0.53] : [0.52, 0.2]} pos={compute ? [-lay.L * 0.36, lay.deck1 + 0.02, -lay.W * 0.26] : [0, top, 0]} rot={compute ? Math.PI / 2 : 0} color={controller.id.includes("arduino") ? "#00878f" : controller.id.includes("esp32") ? "#1c1c1c" : "#2f8f3a"} hl={hl("controller")}>
          <Chip s={[0.12, 0.02, 0.12]} p={[0, 0.01, 0]} />
          {controller.id.includes("esp32") && <Chip s={[0.18, 0.03, 0.17]} p={[0.15, 0.015, 0]} c="#c9ccd1" />}
        </Board>
      )}
      {lidar && <Lidar part={lidar} pos={[lay.L * 0.12, top, 0]} hl={hl("lidar")} />}
      {camera && (
        camera.id.includes("oak") || camera.id.includes("realsense") ? (
          <group position={[lay.L * 0.4, top + 0.2, 0]}>
            <RoundedBox args={[0.22, 0.25, 0.92]} radius={0.05} smoothness={2} castShadow>
              <Mat color="#2b2e34" hl={hl("camera")} metal={0.4} rough={0.35} />
            </RoundedBox>
            {[-0.3, 0, 0.3].map((z) => (
              <mesh key={z} position={[0.115, 0, z]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.06, 0.06, 0.02, 20]} />
                <meshStandardMaterial color="#05060a" metalness={0.5} roughness={0.1} />
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
              <boxGeometry args={[0.25, 0.02, 0.24]} />
              <Mat color="#2f8f3a" hl={hl("camera")} />
            </mesh>
            <mesh position={[0, -0.04, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 0.06, 20]} />
              <meshStandardMaterial color="#05060a" />
            </mesh>
          </group>
        )
      )}
      {imu && (
        <Board size={[0.22, 0.18]} pos={[compute ? -lay.L * 0.2 : lay.L * 0.25, top, lay.W * 0.32]} color="#1b3f8f" hl={hl("imu")}>
          <Chip s={[0.07, 0.02, 0.07]} p={[0, 0.01, 0]} />
        </Board>
      )}
    </group>
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

export default function RobotViewer({ items, byId, highlight }: { items: BuildItem[]; byId: Record<string, Part>; highlight?: Slot }) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [4.6, 3.4, 4.8], fov: 32 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
      <color attach="background" args={["#eceef1"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 7, 3]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2.2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-5, 2, 1]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[5, 2, -2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} color="#dfe5ff" />
      </Environment>
      <group position={[0, -0.6, 0]}>
        <Rover items={items} byId={byId} highlight={highlight} />
        <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, -0.001, 0]}>
          <circleGeometry args={[9, 64]} />
          <meshStandardMaterial color="#e6e8ec" roughness={1} />
        </mesh>
        <ContactShadows position={[0, 0.002, 0]} opacity={0.45} scale={10} blur={2.4} far={3} />
      </group>
      <CameraRig items={items} byId={byId} />
      <OrbitControls makeDefault enablePan={false} minDistance={3.5} maxDistance={10} maxPolarAngle={Math.PI / 2.15} target={[0, 0.2, 0]} />
    </Canvas>
  );
}
