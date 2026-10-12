"use client";
// 3D preview of a designed part on a print bed. Geometry is in mm, shown at 1 unit = 10 mm.
import { Canvas } from "@react-three/fiber";
import { Bounds, ContactShadows, Environment, Grid, Lightformer, OrbitControls } from "@react-three/drei";
import type { BufferGeometry } from "three";

export default function PartPreview({ geometry, size }: { geometry: BufferGeometry | null; size: [number, number, number] }) {
  return (
    <Canvas shadows="percentage" dpr={[1, 2]} camera={{ fov: 30, position: [8, 6, 8] }} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={["#eceef1"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 9, 4]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0008} shadow-normalBias={0.02} />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={1} position={[-5, 2, 2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
      </Environment>
      {geometry && (
        // Refit the camera whenever the part changes size. CAD is Z-up; rotate into the viewer's Y-up world.
        <Bounds fit clip observe margin={1.5} key={size.map((v) => Math.round(v)).join("x")}>
          <mesh geometry={geometry} scale={0.1} rotation-x={-Math.PI / 2} castShadow receiveShadow>
            <meshStandardMaterial color="#5c72ff" roughness={0.6} metalness={0} />
          </mesh>
        </Bounds>
      )}
      <Grid position={[0, 0.001, 0]} args={[30, 30]} cellSize={1} cellThickness={0.6} cellColor="#c9ced6" sectionSize={5} sectionThickness={1} sectionColor="#aeb4bd" fadeDistance={30} infiniteGrid />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.4} scale={20} blur={2} far={4} />
      <OrbitControls makeDefault enablePan={false} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}
