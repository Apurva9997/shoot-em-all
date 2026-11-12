/** Hitscan, spread, recoil, and armor. Server is the only caller that applies damage. */

import { HEAD_MULT, LEG_MULT, MAX_SPEED } from "./constants.js";
import { horizontalSpeed, lookDirection } from "./physics.js";
import { WEAPONS } from "./weapons.js";

const YAW_PATTERN = [0, 0.16, -0.12, 0.3, -0.22, 0.18, -0.32, 0.26, -0.14, 0.34, -0.28, 0.12];

export function decayRecoil(state, dt, weapon) {
  const recovery = weapon?.recoilRecovery ?? 7;
  const k = Math.exp(-dt * recovery);
  state.recoilPitch *= k;
  state.recoilYaw *= k;
  if (state.recoilPitch < 0.0015) {
    state.recoilPitch = 0;
    state.recoilYaw = 0;
    state.shotIndex = 0;
  }
}

export function applyRecoilKick(state, weapon) {
  const idx = state.shotIndex || 0;
  const pitchKick = weapon.recoil * (1 + Math.min(idx, 10) * 0.07);
  const yawKick = YAW_PATTERN[idx % YAW_PATTERN.length] * weapon.recoil * 0.7;
  state.shotIndex = idx + 1;
  state.recoilPitch = Math.min(0.24, (state.recoilPitch || 0) + pitchKick);
  state.recoilYaw = Math.max(-0.14, Math.min(0.14, (state.recoilYaw || 0) + yawKick));
  return { pitchKick, yawKick };
}

export function computeSpread(player, weapon, scoped) {
  if (!weapon || weapon.type === "melee" || weapon.type === "c4") return 0;
  const speed = horizontalSpeed(player);
  const moving = speed > 0.35;
  let spread = player.crouch && !moving ? weapon.crouchSpread : weapon.spread;
  if (scoped && weapon.scope) spread = weapon.scopedSpread ?? spread * 0.15;
  spread += (weapon.moveSpread || 0) * Math.min(1.25, speed / MAX_SPEED);
  if (!player.grounded) spread += weapon.airSpread || 0.08;
  spread += (player.recoilPitch || 0) * 0.35;
  return spread;
}

export function shotDirection(yaw, pitch, recoilYaw, recoilPitch, spread, rng) {
  const dir = lookDirection(yaw + (recoilYaw || 0), pitch + (recoilPitch || 0));
  if (spread <= 0.00001) return dir;
  const angle = rng() * Math.PI * 2;
  const radius = spread * Math.sqrt(rng());
  let upX = 0;
  let upY = 1;
  let upZ = 0;
  if (Math.abs(dir.y) > 0.96) {
    upX = 1;
    upY = 0;
  }
  let rx = dir.y * upZ - dir.z * upY;
  let ry = dir.z * upX - dir.x * upZ;
  let rz = dir.x * upY - dir.y * upX;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const ux = ry * dir.z - rz * dir.y;
  const uy = rz * dir.x - rx * dir.z;
  const uz = rx * dir.y - ry * dir.x;
  const c = Math.cos(angle) * radius;
  const s = Math.sin(angle) * radius;
  const x = dir.x + rx * c + ux * s;
  const y = dir.y + ry * c + uy * s;
  const z = dir.z + rz * c + uz * s;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

/** Slab test. Returns entry distance or null. */
export function rayAABB(origin, dir, box, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  const axes = ["x", "y", "z"];
  for (const axis of axes) {
    const o = origin[axis];
    const d = dir[axis];
    const minB = box.min[axis];
    const maxB = box.max[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < minB || o > maxB) return null;
      continue;
    }
    let t1 = (minB - o) / d;
    let t2 = (maxB - o) / d;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : 0;
}

export function nearestSolid(origin, dir, solids, maxDist) {
  let best = null;
  for (const box of solids) {
    if (box.max.y <= 0.02 && box.min.y < 0) continue;
    const t = rayAABB(origin, dir, box, maxDist);
    if (t === null || t < 0.02) continue;
    if (best === null || t < best) best = t;
  }
  return best;
}

export function hitboxesFor(player) {
  const y = player.pos.y;
  const c = player.crouch;
  const x = player.pos.x;
  const z = player.pos.z;
  if (!c) {
    return [
      {
        part: "legs",
        min: { x: x - 0.2, y: y, z: z - 0.18 },
        max: { x: x + 0.2, y: y + 0.72, z: z + 0.18 },
      },
      {
        part: "torso",
        min: { x: x - 0.28, y: y + 0.68, z: z - 0.18 },
        max: { x: x + 0.28, y: y + 1.42, z: z + 0.2 },
      },
      {
        part: "head",
        min: { x: x - 0.15, y: y + 1.4, z: z - 0.15 },
        max: { x: x + 0.15, y: y + 1.76, z: z + 0.15 },
      },
    ];
  }
  return [
    {
      part: "legs",
      min: { x: x - 0.22, y: y, z: z - 0.2 },
      max: { x: x + 0.22, y: y + 0.32, z: z + 0.2 },
    },
    {
      part: "torso",
      min: { x: x - 0.28, y: y + 0.26, z: z - 0.2 },
      max: { x: x + 0.28, y: y + 0.9, z: z + 0.22 },
    },
    {
      part: "head",
      min: { x: x - 0.15, y: y + 0.86, z: z - 0.15 },
      max: { x: x + 0.15, y: y + 1.16, z: z + 0.15 },
    },
  ];
}

/**
 * Ray vs players. Team damage is off. Returns { player, part, t } or null.
 * Hitboxes are world AABBs so the server and a debug draw share one definition.
 */
export function rayPlayers(origin, dir, players, shooter, maxDist) {
  let best = null;
  for (const other of players) {
    if (!other.alive || other.id === shooter.id) continue;
    if (other.team === shooter.team) continue;
    const boxes = hitboxesFor(other);
    for (const box of boxes) {
      const t = rayAABB(origin, dir, box, maxDist);
      if (t === null || t < 0.05) continue;
      if (!best || t < best.t) best = { player: other, part: box.part, t };
    }
  }
  return best;
}

export function computeDamage(weaponId, part, victim, backstab) {
  const weapon = WEAPONS[weaponId];
  let dmg = backstab ? weapon.backstab : weapon.damage;
  if (!backstab) {
    if (part === "head") dmg *= HEAD_MULT;
    else if (part === "legs") dmg *= LEG_MULT;
  }
  if (weapon.ignoreArmor) return { health: dmg, armor: 0 };
  if (part === "head") {
    if (victim.helmet && victim.armor > 0) {
      return {
        health: dmg * 0.85,
        armor: Math.min(victim.armor, dmg * 0.45),
      };
    }
    return { health: dmg, armor: 0 };
  }
  if (victim.armor > 0) {
    return {
      health: dmg * 0.7,
      armor: Math.min(victim.armor, dmg * 0.45),
    };
  }
  return { health: dmg, armor: 0 };
}

export function isBehind(attackerPos, victim) {
  const dx = attackerPos.x - victim.pos.x;
  const dz = attackerPos.z - victim.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const fwdX = -Math.sin(victim.yaw);
  const fwdZ = -Math.cos(victim.yaw);
  return (fwdX * dx) / len + (fwdZ * dz) / len < -0.35;
}
