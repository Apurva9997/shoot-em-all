/** Procedural de_dust2. Every collider has a mesh; interiors use DoubleSide. */

import * as THREE from "three";
import { MAP } from "@shared/mapData.js";
import { materialFor, makeTextures } from "./textures.js";

export function buildWorld(scene) {
  const textures = makeTextures();
  scene.background = new THREE.Color(0xc4a57a);
  scene.fog = new THREE.Fog(0xc4a57a, 28, 78);

  const hemi = new THREE.HemisphereLight(0xfff1d2, 0x6a4a2a, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4df, 1.35);
  sun.position.set(18, 28, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  scene.add(sun);

  const group = new THREE.Group();
  group.name = "map";
  const mats = {
    sand: materialFor(textures, "sand", THREE.DoubleSide),
    stone: materialFor(textures, "stone", THREE.DoubleSide),
    crate: materialFor(textures, "crate", THREE.DoubleSide),
    metal: materialFor(textures, "metal", THREE.DoubleSide),
  };

  for (const box of MAP.solids) {
    const sx = box.max.x - box.min.x;
    const sy = box.max.y - box.min.y;
    const sz = box.max.z - box.min.z;
    if (sx < 0.02 || sy < 0.02 || sz < 0.02) continue;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mats[box.mat] || mats.sand);
    mesh.position.set(
      (box.min.x + box.max.x) / 2,
      (box.min.y + box.max.y) / 2,
      (box.min.z + box.max.z) / 2,
    );
    mesh.castShadow = sy > 0.3 && box.min.y >= -0.01;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const markMat = new THREE.MeshBasicMaterial({ color: 0xf2e2b8, transparent: true, opacity: 0.85 });
  for (const decal of MAP.decals) {
    const geo = new THREE.RingGeometry(decal.size * 0.55, decal.size, 20);
    const ring = new THREE.Mesh(geo, markMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(decal.x, 0.03, decal.z);
    group.add(ring);
    const plate = letterMesh(decal.text);
    plate.position.set(decal.x, 0.04, decal.z);
    group.add(plate);
  }

  const doorMat = new THREE.MeshLambertMaterial({ color: 0x6a5438, side: THREE.DoubleSide });
  const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.45, 0.12), doorMat);
  leftDoor.position.set(-1.7, 1.22, -4.45);
  leftDoor.rotation.y = 0.7;
  const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.45, 0.12), doorMat);
  rightDoor.position.set(5.6, 1.22, -4.45);
  rightDoor.rotation.y = -0.65;
  group.add(leftDoor, rightDoor);

  scene.add(group);
  return { textures, group };
}

function letterMesh(letter) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = "#f4e7c4";
  g.font = "bold 92px Trebuchet MS, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(letter, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function addSky(scene, textures) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 24, 16),
    new THREE.MeshBasicMaterial({ map: textures.sky, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
}
