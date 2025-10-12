import * as THREE from "three";
import { useMemo } from "react";

type SpriteConfig = {
  hasFog?: boolean;
  hue?: number;
  numSprites?: number;
  opacity?: number;
  path?: string;
  radius?: number;
  sat?: number;
  size?: number;
  z?: number;
};

const textureLoader = new THREE.TextureLoader();

function createSprite({
  hasFog,
  color,
  opacity,
  path,
  pos,
  size,
}: {
  hasFog: boolean;
  color: THREE.Color;
  opacity: number;
  path: string;
  pos: THREE.Vector3;
  size: number;
}) {
  const spriteMat = new THREE.SpriteMaterial({
    color,
    fog: hasFog,
    map: textureLoader.load(path),
    transparent: true,
    opacity,
  });
  spriteMat.color.offsetHSL(0, 0, Math.random() * 0.2 - 0.1);
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.set(pos.x, -pos.y, pos.z);
  const randomizedSize = size + Math.random() - 0.5;
  sprite.scale.set(randomizedSize, randomizedSize, randomizedSize);
  sprite.material.rotation = 0;
  return sprite;
}

function createSprites({
  hasFog = true,
  hue = 0.65,
  numSprites = 8,
  opacity = 0.2,
  path = "/earth/rad-grad.png",
  radius = 10,
  sat = 0.5,
  size = 24,
  z = -10.5,
}: SpriteConfig = {}) {
  const layerGroup = new THREE.Group();
  for (let i = 0; i < numSprites; i += 1) {
    const angle = (i / numSprites) * Math.PI * 2;
    const pos = new THREE.Vector3(
      Math.cos(angle) * Math.random() * radius,
      Math.sin(angle) * Math.random() * radius,
      z + Math.random()
    );
    const color = new THREE.Color().setHSL(hue, 1, sat);
    const sprite = createSprite({ hasFog, color, opacity, path, pos, size });
    layerGroup.add(sprite);
  }
  return layerGroup;
}

export function Nebula() {
  const sprites = useMemo(
    () =>
      createSprites({
        numSprites: 8,
        radius: 10,
        z: -10.5,
        size: 24,
        opacity: 0.2,
        path: "/earth/rad-grad.png",
      }),
    []
  );
  return <primitive object={sprites} />;
}

export default Nebula;
