/**
 * Blocky players and first-person viewmodels.
 * Parent yaw uses rotation.y; local -Z is the face (nose mesh sits at -Z).
 */

import * as THREE from "three";
import { TEAMS } from "@shared/constants.js";

const COLORS = {
  T: { cloth: 0xc45c26, clothDark: 0x8a3d16, skin: 0xd2a679, gear: 0x4a3424 },
  CT: { cloth: 0x243e78, clothDark: 0x162848, skin: 0xc9966a, gear: 0x1c2430 },
};

export function createActor(team) {
  const c = COLORS[team] || COLORS.T;
  const root = new THREE.Group();
  const cloth = new THREE.MeshLambertMaterial({ color: c.cloth });
  const dark = new THREE.MeshLambertMaterial({ color: c.clothDark });
  const skin = new THREE.MeshLambertMaterial({ color: c.skin });
  const gear = new THREE.MeshLambertMaterial({ color: c.gear });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  const legs = new THREE.Group();
  const legL = limb(0.16, 0.7, 0.16, dark);
  legL.position.set(-0.1, 0.35, 0);
  const legR = limb(0.16, 0.7, 0.16, dark);
  legR.position.set(0.1, 0.35, 0);
  legs.add(legL, legR);

  const torso = limb(0.46, 0.62, 0.28, cloth);
  torso.position.y = 1.05;
  const armL = limb(0.12, 0.52, 0.12, cloth);
  armL.position.set(-0.32, 1.12, 0);
  const armR = limb(0.12, 0.52, 0.12, cloth);
  armR.position.set(0.32, 1.12, 0);

  const head = new THREE.Group();
  const skull = limb(0.26, 0.28, 0.26, skin);
  const nose = limb(0.06, 0.06, 0.08, skin);
  nose.position.set(0, 0.02, -0.16);
  nose.name = "nose";
  const eyeL = limb(0.05, 0.04, 0.04, eyeMat);
  eyeL.position.set(-0.06, 0.05, -0.13);
  const eyeR = limb(0.05, 0.04, 0.04, eyeMat);
  eyeR.position.set(0.06, 0.05, -0.13);
  head.add(skull, nose, eyeL, eyeR);
  head.position.y = 1.55;

  const weapon = new THREE.Group();
  weapon.position.set(0.22, 1.05, -0.22);
  weapon.name = "tpWeapon";

  root.add(legs, torso, armL, armR, head, weapon);
  root.userData = { legL, legR, armL, armR, head, weapon, team };
  return root;
}

function limb(w, h, d, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = true;
  return mesh;
}

export function setActorWeapon(actor, weaponId) {
  const slot = actor.userData.weapon;
  slot.clear();
  slot.add(thirdPersonGun(weaponId, actor.userData.team));
}

export function poseActor(actor, time, moving, crouch) {
  const { legL, legR, armL, armR, head } = actor.userData;
  const swing = moving ? Math.sin(time * 9) * 0.55 : 0;
  legL.rotation.x = swing;
  legR.rotation.x = -swing;
  armL.rotation.x = -swing * 0.45;
  armR.rotation.x = swing * 0.35;
  if (crouch) {
    actor.scale.set(1, 0.68, 1);
    head.position.y = 1.48;
  } else {
    actor.scale.set(1, 1, 1);
    head.position.y = 1.55;
  }
}

export function createViewmodel() {
  const root = new THREE.Group();
  root.position.set(0.28, -0.26, -0.42);
  root.name = "viewmodel";
  return root;
}

export function buildViewmodel(weaponId, team) {
  const group = new THREE.Group();
  const c = COLORS[team] || COLORS.T;
  const skin = new THREE.MeshLambertMaterial({ color: c.skin });
  const sleeve = new THREE.MeshLambertMaterial({ color: c.cloth });
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.28), sleeve);
  arm.position.set(0.02, -0.06, 0.16);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.1), skin);
  hand.position.set(0.03, -0.05, 0.02);
  group.add(arm, hand, gunMesh(weaponId));
  const flash = new THREE.PointLight(0xffe2a8, 0, 3.5);
  flash.position.set(0, 0.03, -0.42);
  const flare = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.95 }),
  );
  flare.position.copy(flash.position);
  flare.visible = false;
  group.add(flash, flare);
  group.userData = { flash, flare, baseZ: 0 };
  return group;
}

function gunMesh(id) {
  const g = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: id === "awp" ? 0x2c3a28 : 0x2a2a2a });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
  const magMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
  if (id === "knife") {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, 0.28), metal);
    blade.position.set(0, 0, -0.12);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.1), wood);
    handle.position.set(0, -0.01, 0.06);
    g.add(blade, handle);
    return g;
  }
  if (id === "c4") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.26), new THREE.MeshLambertMaterial({ color: 0x3d4a32 }));
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.06), new THREE.MeshBasicMaterial({ color: 0x7dff6a }));
    screen.position.set(0, 0.05, -0.02);
    g.add(body, screen);
    return g;
  }
  const length = id === "awp" ? 0.72 : id === "ak47" || id === "m4a1" ? 0.52 : 0.3;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, length), metal);
  body.position.set(0, 0, -length * 0.35);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.16), id === "m4a1" ? metal : wood);
  stock.position.set(0, -0.01, 0.12);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.05), magMat);
  mag.position.set(0, -0.08, -0.02);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, id === "awp" ? 0.16 : 0.05), metal);
  sight.position.set(0, 0.045, id === "awp" ? -0.08 : -0.04);
  g.add(body, stock, mag, sight);
  return g;
}

function thirdPersonGun(id, team) {
  const mesh = gunMesh(id || "knife");
  mesh.scale.setScalar(0.85);
  mesh.rotation.y = 0;
  mesh.traverse((obj) => {
    if (obj.isMesh && team === TEAMS.CT && id === "m4a1") {
      obj.material = obj.material;
    }
  });
  return mesh;
}

export function kickViewmodel(vm, amount) {
  vm.position.z += amount;
  vm.rotation.x -= amount * 1.4;
}

export function updateViewmodel(vm, dt, moving) {
  const bob = moving ? Math.sin(performance.now() * 0.012) * 0.012 : 0;
  vm.position.y += (bob - 0.26 - vm.position.y) * Math.min(1, dt * 10);
  vm.position.z += (-0.42 - vm.position.z) * Math.min(1, dt * 8);
  vm.rotation.x += (0 - vm.rotation.x) * Math.min(1, dt * 8);
  const gun = vm.children[0];
  if (gun?.userData?.flash) {
    gun.userData.flash.intensity *= Math.pow(0.001, dt * 8);
    if (gun.userData.flash.intensity < 0.05) {
      gun.userData.flash.intensity = 0;
      gun.userData.flare.visible = false;
    }
  }
}

export function muzzle(vm) {
  const gun = vm.children[0];
  if (!gun?.userData) return;
  gun.userData.flash.intensity = 2.4;
  gun.userData.flare.visible = true;
}
