"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { EarthMaterial } from "./earth/EarthMaterial";
import { AtmosphereMesh } from "./earth/AtmosphereMesh";
import { Starfield } from "./earth/Starfield";

const SUN_DIRECTION = new THREE.Vector3(-2, 0.5, 1.5).normalize();

export function EarthObservationViewport() {
  return (
    <div className="h-full w-full">
      <Canvas camera={{ position: [0, 0.1, 8], fov: 45 }} gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
        <color attach="background" args={["#020617"]} />
        <fog attach="fog" args={[0x020617, 15, 120]} />

        <ambientLight intensity={0.3} />
        <directionalLight position={[SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z]} intensity={1.6} color="#b5d9ff" />
        <directionalLight position={[-SUN_DIRECTION.x, -SUN_DIRECTION.y, -SUN_DIRECTION.z]} intensity={0.35} color="#224466" />

        <Suspense fallback={null}>
          <Earth />
          <Starfield numStars={2600} />
        </Suspense>

        <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} />
      </Canvas>
    </div>
  );
}

function Earth() {
  const groupRef = useRef<THREE.Group>(null);
  const {
    viewport: { height: viewportHeight },
  } = useThree();
  const axialTilt = THREE.MathUtils.degToRad(23.4);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08;
    }
  });

  // Base sphere radius = 2 (diameter 4) -> scale to half viewport height.
  const scale = useMemo(() => (viewportHeight * 0.5) / 4, [viewportHeight]);

  return (
    <group ref={groupRef} scale={scale} rotation={[0, 0, axialTilt]}>
      <mesh>
        <icosahedronGeometry args={[2, 64]} />
        <EarthMaterial sunDirection={SUN_DIRECTION} />
      </mesh>
      <AtmosphereMesh rimHex={0x5ab8ff} facingHex={0x000b1a} />
    </group>
  );
}

export default EarthObservationViewport;
