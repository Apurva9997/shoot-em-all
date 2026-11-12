/** Lightweight opponents so a lone human still has a round to play. */

import { TICK_DT, TEAMS } from "../shared/constants.js";
import { MAP, siteAt } from "../shared/mapData.js";
import { eyeHeight, horizontalSpeed } from "../shared/physics.js";
import { nearestSolid } from "../shared/combat.js";
import { WEAPONS } from "../shared/weapons.js";

const ROUTES = {
  T: {
    A: [
      { x: 1.5, z: 12 },
      { x: 2.2, z: 2 },
      { x: 1.6, z: -4.4 },
      { x: 8, z: -9 },
      { x: 22, z: -8 },
      { x: 23, z: -16 },
    ],
    B: [
      { x: -2, z: 12 },
      { x: -4, z: 6 },
      { x: -7.2, z: 0 },
      { x: -16, z: -1.5 },
      { x: -22, z: -2 },
    ],
  },
  CT: {
    MID: [
      { x: -14, z: -14 },
      { x: -6, z: -10 },
      { x: 2, z: -8 },
      { x: 2, z: 1 },
    ],
    A: [
      { x: -8, z: -20 },
      { x: 6, z: -20 },
      { x: 18, z: -18 },
      { x: 23, z: -15 },
    ],
    B: [
      { x: -20, z: -12 },
      { x: -18, z: -6 },
      { x: -20, z: -2 },
    ],
  },
};

export function decideBot(bot, match) {
  const input = {
    forward: 0,
    strafe: 0,
    yaw: bot.yaw,
    pitch: bot.pitch || 0,
    jump: false,
    crouch: false,
    fire: false,
    shot: false,
    reload: false,
    drop: false,
    slot: 0,
    buy: null,
    plant: false,
    scope: false,
    seq: 0,
  };
  if (!bot.alive) return input;

  if (match.phase === "FREEZETIME") {
    input.buy = freezeBuy(bot);
    return input;
  }
  if (match.phase === "ROUND_OVER") return input;

  const enemy = acquire(bot, match);
  if (enemy) {
    input.yaw = Math.atan2(-enemy.dir.x, -enemy.dir.z);
    input.pitch = Math.asin(Math.max(-1, Math.min(1, enemy.dir.y)));
    input.fire = true;
    input.shot = true;
    if (enemy.dist > 14) input.forward = 0.7;
    else if (enemy.dist < 4) input.forward = -0.4;
    if (bot.weapon === "knife") input.forward = 1;
    noteProgress(bot, input);
    return input;
  }

  if (bot.team === TEAMS.CT && match.bomb) {
    steer(bot, input, match.bomb.pos);
    const dx = bot.pos.x - match.bomb.pos.x;
    const dz = bot.pos.z - match.bomb.pos.z;
    if (dx * dx + dz * dz < 2.2 * 2.2) {
      input.forward = 0;
      input.plant = true;
    }
    noteProgress(bot, input);
    return input;
  }

  if (bot.team === TEAMS.T && bot.loadout.c4) {
    const site = siteAt(bot.pos.x, bot.pos.y, bot.pos.z);
    if (site) {
      if (bot.weapon !== "c4") input.slot = 5;
      else {
        input.plant = true;
        input.forward = 0;
      }
      noteProgress(bot, input);
      return input;
    }
  }

  const goal = nextGoal(bot, match);
  steer(bot, input, goal);
  if (Math.hypot(goal.x - bot.pos.x, goal.z - bot.pos.z) < 1.3) {
    bot._wp = (bot._wp || 0) + 1;
  }
  noteProgress(bot, input);
  return input;
}

function freezeBuy(bot) {
  const rifle = bot.team === TEAMS.T ? "ak47" : "m4a1";
  const price = WEAPONS[rifle].price;
  if (!bot.loadout.primary && bot.money >= price) return rifle;
  if (!bot.loadout.primary && bot.money >= WEAPONS.awp.price && bot.money >= 8000) return "awp";
  if (bot.armor < 50 && bot.money >= 650) return "kevlar";
  if (bot.armor >= 50 && !bot.helmet && bot.money >= 350) return "helmet";
  return null;
}

function acquire(bot, match) {
  const eyeY = bot.pos.y + eyeHeight(bot.crouch);
  const origin = { x: bot.pos.x, y: eyeY, z: bot.pos.z };
  let best = null;
  for (const other of match.players) {
    if (!other.alive || other.team === bot.team) continue;
    const aim = {
      x: other.pos.x,
      y: other.pos.y + (other.crouch ? 0.7 : 1.15),
      z: other.pos.z,
    };
    const dx = aim.x - origin.x;
    const dy = aim.y - origin.y;
    const dz = aim.z - origin.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 42 || dist < 0.05) continue;
    const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
    const wall = nearestSolid(origin, dir, MAP.solids, dist);
    if (wall !== null && wall < dist - 0.45) continue;
    if (!best || dist < best.dist) best = { dir, dist };
  }
  return best;
}

function routeFor(bot, match) {
  if (bot.team === TEAMS.CT) {
    if (match.bomb?.site === "A") return ROUTES.CT.A;
    if (match.bomb?.site === "B") return ROUTES.CT.B;
    return ROUTES.CT.MID;
  }
  if (!bot._lane) bot._lane = bot.loadout.c4 || bot.id.charCodeAt(1) % 2 === 0 ? "A" : "B";
  if (match.round !== bot._laneRound) {
    bot._laneRound = match.round;
    bot._lane = bot.loadout.c4 ? "A" : bot._lane === "A" ? "B" : "A";
    bot._wp = 0;
  }
  return ROUTES.T[bot._lane] || ROUTES.T.A;
}

function nextGoal(bot, match) {
  const route = routeFor(bot, match);
  const idx = Math.min(bot._wp || 0, route.length - 1);
  return route[idx];
}

function steer(bot, input, goal) {
  const dx = goal.x - bot.pos.x;
  const dz = goal.z - bot.pos.z;
  input.yaw = Math.atan2(-dx, -dz);
  input.pitch = 0;
  input.forward = 1;
}

function noteProgress(bot, input) {
  if (input.forward === 0) {
    bot._stuck = 0;
    return;
  }
  const speed = horizontalSpeed(bot);
  if (speed < 0.2) bot._stuck = (bot._stuck || 0) + TICK_DT;
  else bot._stuck = 0;
  if (bot._stuck > 0.45) input.jump = true;
  if (bot._stuck > 0.7) input.strafe = Math.sin(bot._stuck * 6) > 0 ? 1 : -1;
  if (bot._stuck > 1.6) {
    bot._wp = (bot._wp || 0) + 1;
    bot._stuck = 0;
  }
}
