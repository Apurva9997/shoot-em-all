/**
 * Movement shared by client prediction and the authoritative server.
 *
 * Frame (y-up, right-handed, yaw 0 looks -Z):
 *   forward = (-sin(yaw), 0, -cos(yaw))
 *   right   = forward × up = (cos(yaw), 0, -sin(yaw))
 * Pitch > 0 looks up. A Three.js camera with rotation.order 'YXZ' matches
 * this when rotation.y = yaw and rotation.x = pitch.
 */

import {
  AIR_ACCEL,
  CROUCH_HEIGHT,
  CROUCH_JUMP_VEL,
  CROUCH_SPEED,
  FRICTION,
  GRAVITY,
  GROUND_ACCEL,
  JUMP_VEL,
  MAX_SPEED,
  PLAYER_RADIUS,
  STAND_HEIGHT,
  STEP_HEIGHT,
  STOP_SPEED,
} from "./constants.js";

export function headingVectors(yaw) {
  const fwdX = -Math.sin(yaw);
  const fwdZ = -Math.cos(yaw);
  return {
    fwd: { x: fwdX, y: 0, z: fwdZ },
    right: { x: -fwdZ, y: 0, z: fwdX },
  };
}

export function lookDirection(yaw, pitch) {
  const cp = Math.cos(pitch);
  const x = -Math.sin(yaw) * cp;
  const y = Math.sin(pitch);
  const z = -Math.cos(yaw) * cp;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

export function eyeHeight(crouch) {
  return crouch ? 0.98 : 1.6;
}

export function bodyHeight(crouch) {
  return crouch ? CROUCH_HEIGHT : STAND_HEIGHT;
}

export function cloneVec(v) {
  return { x: v.x, y: v.y, z: v.z };
}

function applyFriction(player, dt) {
  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (speed < 0.001) {
    player.vel.x = 0;
    player.vel.z = 0;
    return;
  }
  const control = Math.max(speed, STOP_SPEED);
  const drop = control * FRICTION * dt;
  const scaled = Math.max(0, speed - drop) / speed;
  player.vel.x *= scaled;
  player.vel.z *= scaled;
}

function accelerate(player, wishX, wishZ, wishSpeed, accel, dt) {
  const current = player.vel.x * wishX + player.vel.z * wishZ;
  const add = wishSpeed - current;
  if (add <= 0) return;
  const accelSpeed = Math.min(accel * dt, add);
  player.vel.x += wishX * accelSpeed;
  player.vel.z += wishZ * accelSpeed;
}

function circleOverlaps(px, pz, radius, box) {
  const cx = Math.min(Math.max(px, box.min.x), box.max.x);
  const cz = Math.min(Math.max(pz, box.min.z), box.max.z);
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz < radius * radius;
}

function standBlocked(x, y, z, height, solids, ignore) {
  const head = y + height;
  for (const box of solids) {
    if (box === ignore) continue;
    if (box.max.y <= y + 0.02 || box.min.y >= head - 0.02) continue;
    if (circleOverlaps(x, z, PLAYER_RADIUS * 0.92, box)) return true;
  }
  return false;
}

function pushOut(player, box) {
  const r = PLAYER_RADIUS;
  const px = player.pos.x;
  const pz = player.pos.z;
  const cx = Math.min(Math.max(px, box.min.x), box.max.x);
  const cz = Math.min(Math.max(pz, box.min.z), box.max.z);
  let dx = px - cx;
  let dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    const push = r - d + 0.001;
    const nx = dx / d;
    const nz = dz / d;
    player.pos.x += nx * push;
    player.pos.z += nz * push;
    const vn = player.vel.x * nx + player.vel.z * nz;
    if (vn < 0) {
      player.vel.x -= vn * nx;
      player.vel.z -= vn * nz;
    }
    return true;
  }
  const options = [
    { pen: px - (box.min.x - r), x: box.min.x - r - 0.001, z: pz, nx: -1, nz: 0 },
    { pen: box.max.x + r - px, x: box.max.x + r + 0.001, z: pz, nx: 1, nz: 0 },
    { pen: pz - (box.min.z - r), x: px, z: box.min.z - r - 0.001, nx: 0, nz: -1 },
    { pen: box.max.z + r - pz, x: px, z: box.max.z + r + 0.001, nx: 0, nz: 1 },
  ];
  options.sort((a, b) => a.pen - b.pen);
  const c = options[0];
  player.pos.x = c.x;
  player.pos.z = c.z;
  const vn = player.vel.x * c.nx + player.vel.z * c.nz;
  if (vn < 0) {
    player.vel.x -= vn * c.nx;
    player.vel.z -= vn * c.nz;
  }
  return true;
}

function collideY(player, box, prevY, height) {
  if (!circleOverlaps(player.pos.x, player.pos.z, PLAYER_RADIUS, box)) return;
  const newY = player.pos.y;
  if (player.vel.y <= 0 && prevY >= box.max.y - 0.001 && newY < box.max.y) {
    player.pos.y = box.max.y;
    player.vel.y = 0;
    player.grounded = true;
    return;
  }
  const prevHead = prevY + height;
  const newHead = newY + height;
  if (player.vel.y > 0 && prevHead <= box.min.y + 0.001 && newHead > box.min.y) {
    player.pos.y = box.min.y - height - 0.001;
    player.vel.y = 0;
  }
}

function collideXZ(player, box, height, solids) {
  const feet = player.pos.y;
  const head = feet + height;
  const rise = box.max.y - feet;
  const overlaps = circleOverlaps(player.pos.x, player.pos.z, PLAYER_RADIUS, box);
  if (!overlaps) return;
  const vertical = head > box.min.y + 0.02 && feet < box.max.y - 0.02;
  const canStep =
    rise > 0.02 &&
    rise <= STEP_HEIGHT &&
    player.vel.y <= 0.35 &&
    box.max.y > box.min.y + 0.05 &&
    !standBlocked(player.pos.x, box.max.y, player.pos.z, height, solids, box);
  if (canStep) {
    player.pos.y = box.max.y;
    player.vel.y = 0;
    player.grounded = true;
    return;
  }
  if (vertical) pushOut(player, box);
}

/**
 * Advance one substep. Mutates pos, vel, grounded, crouch, yaw.
 * `input` is { yaw, forward, strafe, jump, crouch }.
 */
export function stepPlayer(player, input, dt, solids) {
  player.yaw = input.yaw;
  const wantCrouch = !!input.crouch;
  if (!wantCrouch && player.crouch) {
    if (standBlocked(player.pos.x, player.pos.y, player.pos.z, STAND_HEIGHT, solids, null)) {
      player.crouch = true;
    } else {
      player.crouch = false;
    }
  } else {
    player.crouch = wantCrouch;
  }
  const height = bodyHeight(player.crouch);

  const jumping = !!(input.jump && player.grounded);
  if (player.grounded && !jumping) applyFriction(player, dt);

  const { fwd, right } = headingVectors(player.yaw);
  let wishX = fwd.x * (input.forward || 0) + right.x * (input.strafe || 0);
  let wishZ = fwd.z * (input.forward || 0) + right.z * (input.strafe || 0);
  const wishLen = Math.hypot(wishX, wishZ);
  const wishSpeed = player.crouch ? CROUCH_SPEED : MAX_SPEED;
  if (wishLen > 0.001) {
    wishX /= wishLen;
    wishZ /= wishLen;
    const accel = player.grounded ? GROUND_ACCEL : AIR_ACCEL;
    accelerate(player, wishX, wishZ, wishSpeed, accel, dt);
  }

  if (jumping) {
    player.vel.y = player.crouch ? CROUCH_JUMP_VEL : JUMP_VEL;
    player.grounded = false;
  }

  player.vel.y -= GRAVITY * dt;
  player.grounded = false;

  const prevY = player.pos.y;
  player.pos.y += player.vel.y * dt;
  for (let pass = 0; pass < 2; pass++) {
    for (const box of solids) collideY(player, box, prevY, height);
  }

  player.pos.x += player.vel.x * dt;
  for (let pass = 0; pass < 2; pass++) {
    for (const box of solids) collideXZ(player, box, height, solids);
  }
  player.pos.z += player.vel.z * dt;
  for (let pass = 0; pass < 2; pass++) {
    for (const box of solids) collideXZ(player, box, height, solids);
  }

  if (player.pos.y < -4) {
    player.pos.y = 0.05;
    player.vel.y = 0;
  }
}

export function horizontalSpeed(player) {
  return Math.hypot(player.vel.x, player.vel.z);
}
