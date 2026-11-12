/**
 * Headless checks for the shared frame, map connectivity, and round rules.
 * Run: node scripts/selftest.mjs
 */
import assert from "node:assert/strict";
import { PHASE, SUB_DT, SUBSTEPS, TEAMS, TICK_DT } from "../shared/constants.js";
import { MAP, siteAt } from "../shared/mapData.js";
import { headingVectors, lookDirection, stepPlayer } from "../shared/physics.js";
import { computeDamage, hitboxesFor, rayAABB, rayPlayers } from "../shared/combat.js";
import { createMatch } from "../server/game.js";

function approx(a, b, eps = 1e-6) {
  assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
}

const yaw0 = headingVectors(0);
approx(yaw0.fwd.x, 0);
approx(yaw0.fwd.z, -1);
approx(yaw0.right.x, 1);
approx(yaw0.right.z, 0);
const look = lookDirection(0, 0);
approx(look.z, -1);
const lookUp = lookDirection(0, Math.PI / 2);
approx(lookUp.y, 1, 1e-5);

function makeBot(x, z) {
  return {
    pos: { x, y: 0.05, z },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    crouch: false,
    grounded: true,
  };
}

function walk(bot, input, seconds) {
  const steps = Math.round(seconds / SUB_DT);
  for (let i = 0; i < steps; i++) stepPlayer(bot, input, SUB_DT, MAP.solids);
  return bot;
}

const walker = makeBot(0, 22);
walk(walker, { yaw: 0, forward: 1, strafe: 0, jump: false, crouch: false }, 0.8);
assert.ok(walker.pos.z < 20, `W at yaw 0 should move -Z, z=${walker.pos.z}`);
assert.ok(Math.abs(walker.pos.x) < 0.4, `W should not drift in X, x=${walker.pos.x}`);

const strafer = makeBot(0, 22);
walk(strafer, { yaw: 0, forward: 0, strafe: 1, jump: false, crouch: false }, 0.6);
assert.ok(strafer.pos.x > 1.5, `D should move +X, x=${strafer.pos.x}`);

const jumper = makeBot(0, 22);
walk(jumper, { yaw: 0, forward: 0, strafe: 0, jump: true, crouch: false }, 0.2);
assert.ok(jumper.pos.y > 0.4, `jump should leave the floor, y=${jumper.pos.y}`);
walk(jumper, { yaw: 0, forward: 0, strafe: 0, jump: false, crouch: false }, 1.4);
assert.ok(jumper.grounded, "should land");
assert.ok(jumper.pos.y < 0.2, `should be back on the floor, y=${jumper.pos.y}`);

function flood(start, label) {
  const r = 0.3;
  const step = 0.45;
  const solids = MAP.solids.filter((b) => b.max.y > 0.4 && b.min.y < 1.5);
  const blocked = (x, z) => {
    for (const b of solids) {
      if (b.max.y <= 0.35) continue;
      const cx = Math.min(Math.max(x, b.min.x), b.max.x);
      const cz = Math.min(Math.max(z, b.min.z), b.max.z);
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  };
  const key = (x, z) => `${Math.round(x / step)},${Math.round(z / step)}`;
  const seen = new Set([key(start.x, start.z)]);
  const q = [{ x: start.x, z: start.z }];
  const dirs = [
    [step, 0],
    [-step, 0],
    [0, step],
    [0, -step],
    [step, step],
    [step, -step],
    [-step, step],
    [-step, -step],
  ];
  while (q.length) {
    const cur = q.pop();
    for (const [dx, dz] of dirs) {
      const x = cur.x + dx;
      const z = cur.z + dz;
      if (x < -31.2 || x > 31.2 || z < -25.2 || z > 29.2) continue;
      const k = key(x, z);
      if (seen.has(k) || blocked(x, z)) continue;
      seen.add(k);
      q.push({ x, z });
    }
  }
  return { seen, label, blocked };
}

const tFlood = flood(MAP.spawns.T[0], "T");
const ctFlood = flood(MAP.spawns.CT[0], "CT");
function reachable(flooded, point, name) {
  const k = `${Math.round(point.x / 0.45)},${Math.round(point.z / 0.45)}`;
  let ok = flooded.seen.has(k);
  if (!ok) {
    for (const cell of flooded.seen) {
      const [sx, sz] = cell.split(",").map(Number);
      const x = sx * 0.45;
      const z = sz * 0.45;
      if ((x - point.x) ** 2 + (z - point.z) ** 2 < 1.6) {
        ok = true;
        break;
      }
    }
  }
  assert.ok(ok, `${name} unreachable from ${flooded.label} (${point.x},${point.z})`);
}
reachable(tFlood, { x: 23, z: -16 }, "A site");
reachable(tFlood, { x: -22, z: -2 }, "B site");
reachable(tFlood, { x: 4, z: 2 }, "mid");
reachable(ctFlood, { x: 23, z: -16 }, "A site from CT");
reachable(ctFlood, { x: -22, z: -2 }, "B site from CT");
reachable(ctFlood, MAP.spawns.T[0], "T spawn from CT");
assert.ok(siteAt(23, 0.1, -16)?.id === "A", "A site probe");
assert.ok(siteAt(-22, 0.1, -2)?.id === "B", "B site probe");
assert.equal(siteAt(0, 0.1, 4), null, "mid is not a site");

for (const spawn of [...MAP.spawns.T, ...MAP.spawns.CT]) {
  const bot = makeBot(spawn.x, spawn.z);
  walk(bot, { yaw: spawn.yaw, forward: 0, strafe: 0, jump: false, crouch: false }, 0.4);
  assert.ok(
    Math.hypot(bot.pos.x - spawn.x, bot.pos.z - spawn.z) < 0.35,
    `spawn stuck in a wall ${spawn.x},${spawn.z} -> ${bot.pos.x},${bot.pos.z}`,
  );
}

const target = makeBot(0, 10);
target.alive = true;
target.id = "b";
target.team = TEAMS.CT;
const shooter = { id: "a", team: TEAMS.T, pos: { x: 0, y: 0.05, z: 14 } };
const head = hitboxesFor(target).find((b) => b.part === "head");
const origin = { x: 0, y: (head.min.y + head.max.y) / 2, z: 14 };
const dir = { x: 0, y: 0, z: -1 };
const hit = rayPlayers(origin, dir, [target], shooter, 20);
assert.ok(hit && hit.part === "head", `expected headshot, got ${hit && hit.part}`);
const wallFirst = rayAABB(origin, { x: 0, y: 0, z: 1 }, MAP.solids[0], 5);
assert.equal(wallFirst, null);

const akHead = computeDamage("ak47", "head", { armor: 0, helmet: false }, false);
assert.ok(akHead.health >= 100, `AK head should one-tap, got ${akHead.health}`);
const awpBody = computeDamage("awp", "torso", { armor: 100, helmet: true }, false);
assert.ok(awpBody.health >= 100, `AWP torso should kill, got ${awpBody.health}`);
const glockHead = computeDamage("glock", "head", { armor: 0, helmet: false }, false);
assert.ok(glockHead.health < 100, "glock head is not a one-tap");

const game = createMatch("test");
const t = game.addPlayer("Alpha", TEAMS.T);
const ct = game.addPlayer("Bravo", TEAMS.CT);
assert.equal(t.team, TEAMS.T);
assert.equal(ct.team, TEAMS.CT);
assert.ok(game.match.players.some((p) => p.loadout.c4), "a terrorist carries C4");
t.money = 5000;
const bought = game.buy(t, "ak47");
assert.equal(bought.ok, true, "T can buy AK in freezetime");
assert.equal(t.weapon, "ak47");
assert.equal(game.buy(t, "m4a1").ok, false, "T cannot buy M4");
assert.equal(game.buy(ct, "ak47").ok, false, "CT cannot buy AK");
ct.money = 9000;
assert.equal(game.buy(ct, "m4a1").ok, true);
assert.equal(game.buy(ct, "awp").ok, true, "CT can buy AWP, dropping M4");

const inputs = new Map();
function blank(id) {
  return {
    forward: 0,
    strafe: 0,
    yaw: 0,
    pitch: 0,
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
    seq: 1,
  };
}
inputs.set(t.id, blank());
inputs.set(ct.id, blank());
const freezeTicks = Math.ceil(5 / TICK_DT) + 2;
for (let i = 0; i < freezeTicks; i++) game.tick(inputs);
assert.equal(game.match.phase, PHASE.LIVE, `expected LIVE, got ${game.match.phase}`);

ct.pos = { x: 0, y: 0.05, z: 8 };
ct.vel = { x: 0, y: 0, z: 0 };
t.pos = { x: 0, y: 0.05, z: 12 };
t.vel = { x: 0, y: 0, z: 0 };
t.yaw = 0;
t.pitch = 0;
t.weapon = "awp";
t.ammo.awp = { mag: 10, reserve: 30 };
inputs.get(t.id).shot = true;
inputs.get(t.id).pitch = 0;
game.tick(inputs);
assert.equal(ct.alive, false, `AWP at point blank should kill, hp=${ct.hp}`);
assert.ok(game.match.events.some((e) => e.type === "kill" && e.headshot), "killfeed headshot flag");

const game2 = createMatch("eco");
const t2 = game2.addPlayer("Planter", TEAMS.T);
const ct2 = game2.addPlayer("Defuser", TEAMS.CT);
t2.money = 0;
ct2.money = 0;
const inputs2 = new Map([
  [t2.id, blank()],
  [ct2.id, blank()],
]);
for (let i = 0; i < freezeTicks; i++) game2.tick(inputs2);
assert.equal(game2.match.phase, PHASE.LIVE);
const site = { x: 23, z: -16 };
t2.pos = { x: site.x, y: 0.05, z: site.z };
t2.vel = { x: 0, y: 0, z: 0 };
t2.weapon = "c4";
t2.loadout.c4 = true;
inputs2.get(t2.id).plant = true;
const plantTicks = Math.ceil(3.2 / TICK_DT);
for (let i = 0; i < plantTicks; i++) game2.tick(inputs2);
assert.equal(game2.match.phase, PHASE.BOMB_PLANTED, `plant failed, phase=${game2.match.phase} progress=${t2.plantProgress}`);
assert.equal(t2.loadout.c4, false);
ct2.pos = { x: game2.match.bomb.pos.x, y: 0.05, z: game2.match.bomb.pos.z };
ct2.vel = { x: 0, y: 0, z: 0 };
inputs2.get(t2.id).plant = false;
inputs2.get(ct2.id).plant = true;
const defuseTicks = Math.ceil(5.3 / TICK_DT);
for (let i = 0; i < defuseTicks; i++) game2.tick(inputs2);
assert.equal(game2.match.phase, PHASE.ROUND_OVER);
assert.equal(game2.match.winner, TEAMS.CT);
assert.equal(game2.match.winReason, "defuse");
assert.ok(ct2.money >= 3250, `defuser team gets win cash, got ${ct2.money}`);
assert.ok(t2.money >= 1400 && t2.money < 2000, `loser gets loss cash, got ${t2.money}`);

const beforeGuns = t2.weapon;
for (let i = 0; i < Math.ceil(5.2 / TICK_DT); i++) game2.tick(inputs2);
assert.equal(game2.match.phase, PHASE.FREEZETIME);
assert.equal(t2.weapon, beforeGuns, "surviving planter keeps weapon");
assert.equal(t2.hp, 100);

console.log("selftest ok");
console.log(`  map solids: ${MAP.solids.length}`);
console.log(`  T flood cells: ${tFlood.seen.size}  CT flood cells: ${ctFlood.seen.size}`);
