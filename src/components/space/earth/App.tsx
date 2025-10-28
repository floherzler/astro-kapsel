import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef } from "react";
import Nebula from "./Nebula";
import Starfield from "./Starfield";
import EarthMaterial from "./EarthMaterial";
import AtmosphereMesh from "./AtmosphereMesh";

const SUN_DIRECTION = new THREE.Vector3(-2, 0.5, 1.5).normalize();

function Earth() {
  const meshGroup = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (meshGroup.current) {
      meshGroup.current.rotation.y += delta * 0.08;
    }
  });

  const axialTilt = useMemo(() => THREE.MathUtils.degToRad(23.4), []);

  return (
    <group ref={meshGroup} rotation={[0, 0, axialTilt]} scale={0.75}>
      <mesh>
        <icosahedronGeometry args={[2, 64]} />
        <EarthMaterial sunDirection={SUN_DIRECTION} />
      </mesh>
      <AtmosphereMesh />
    </group>
  );
}

function App() {
  return (
    <Canvas
      camera={{ position: [0, 0.1, 4.5] }}
      gl={{ toneMapping: THREE.NoToneMapping }}
      style={{ width: "100%", height: "100%" }}
    >
      <Earth />
      <hemisphereLight args={[0xffffff, 0x000000, 3]} />
      <directionalLight position={[SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z]} />
      <Nebula />
      <Starfield />
      <OrbitControls enableZoom={false} />
    </Canvas>
  );
}

export default App;
