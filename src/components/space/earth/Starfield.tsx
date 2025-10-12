import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useMemo, useRef } from "react";

type StarPoint = {
  position: THREE.Vector3;
  update: (t: number) => number;
};

function createPoints(numStars = 500) {
  function randomSpherePoint(): StarPoint {
    const radius = Math.random() * 25 + 25;
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    const rate = Math.random();
    const prob = Math.random();
    const light = Math.random();

    return {
      position: new THREE.Vector3(x, y, z),
      update: (t: number) => (prob > 0.8 ? light + Math.sin(t * rate) : light),
    };
  }

  const vertices: number[] = [];
  const initialColors: number[] = [];
  const starPoints: StarPoint[] = [];

  for (let i = 0; i < numStars; i += 1) {
    const point = randomSpherePoint();
    starPoints.push(point);
    vertices.push(point.position.x, point.position.y, point.position.z);
    const color = new THREE.Color().setHSL(0.6, 0.2, Math.random());
    initialColors.push(color.r, color.g, color.b);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(initialColors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.2,
    vertexColors: true,
    map: new THREE.TextureLoader().load("/earth/circle.png"),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.userData = {
    update(t: number) {
      points.rotation.y -= 0.0002;
      const colors: number[] = [];
      for (let i = 0; i < numStars; i += 1) {
        const brightness = starPoints[i].update(t);
        const color = new THREE.Color().setHSL(0.6, 0.2, brightness);
        colors.push(color.r, color.g, color.b);
      }
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geometry.attributes.color.needsUpdate = true;
    },
  };

  return points;
}

export function Starfield({ numStars = 3000 }: { numStars?: number }) {
  const points = useMemo(() => createPoints(numStars), [numStars]);
  const ref = useRef<THREE.Points>(null);

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime;
    const updater = (ref.current?.userData as { update?: (t: number) => void })?.update;
    updater?.(elapsed);
  });

  return <primitive object={points} ref={ref} />;
}

export default Starfield;
