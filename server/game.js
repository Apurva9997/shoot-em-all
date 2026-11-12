/**
 * Authoritative match. One instance per room. The socket layer only relays.
 */

import {
  DEFUSE_RADIUS,
  DEFUSE_TIME,
  KILL_REWARD,
  LOSS_REWARD,
  MAX_MONEY,
  PHASE,
  PHASE_DURATION,
  PICKUP_RADIUS,
  PLANT_MOVE_SPEED,
  PLANT_TIME,
  START_MONEY,
  SUB_DT,
  SUBSTEPS,
  TEAMS,
  TICK_DT,
  WIN_REWARD,
} from "../shared/constants.js";
import { MAP, clampToSite, siteAt } from "../shared/mapData.js";
import {
  bodyHeight,
  cloneVec,
  eyeHeight,
  horizontalSpeed,
  stepPlayer,
} from "../shared/physics.js";
import {
  applyRecoilKick,
  computeDamage,
  computeSpread,
  decayRecoil,
  isBehind,
  nearestSolid,
  rayPlayers,
  shotDirection,
} from "../shared/combat.js";
import {
  BUY_MENU,
  HELMET_PRICE,
  HELMET_UPGRADE,
  KEVLAR_PRICE,
  WEAPONS,
  defaultMagazine,
  defaultReserve,
} from "../shared/weapons.js";

let nextId = 1;

function grantMoney(player, amount) {
  player.money = Math.min(MAX_MONEY, Math.max(0, player.money + amount));
}

function starterPistol(team) {
  return team === TEAMS.T ? "glock" : "usp";
}

function emptyLoadout() {
  return {
    knife: true,
    secondary: null,
    primary: null,
    c4: false,
    ammo: {},
  };
}

function ensureAmmo(player, id) {
  if (!player.ammo[id]) {
    player.ammo[id] = { mag: defaultMagazine(id), reserve: defaultReserve(id) };
  }
  return player.ammo[id];
}

function createPlayer(id, name, team) {
  const pistol = starterPistol(team);
  const loadout = emptyLoadout();
  loadout.secondary = pistol;
  const player = {
    id,
    name,
    team,
    money: START_MONEY,
    armor: 0,
    helmet: false,
    hp: 100,
    alive: true,
    kills: 0,
    deaths: 0,
    score: 0,
    pos: { x: 0, y: 0.05, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    crouch: false,
    grounded: true,
    loadout,
    weapon: pistol,
    ammo: {},
    recoilPitch: 0,
    recoilYaw: 0,
    shotIndex: 0,
    ack: 0,
    nextFire: 0,
    reloading: false,
    reloadUntil: 0,
    scoped: false,
    plantProgress: 0,
    defuseProgress: 0,
    spawnIndex: 0,
  };
  ensureAmmo(player, pistol);
  return player;
}

export function createMatch(code) {
  const rngState = { s: (Date.now() ^ (code.length * 9973)) >>> 0 || 1 };
  const rng = () => {
    rngState.s = (Math.imul(1664525, rngState.s) + 1013904223) >>> 0;
    return rngState.s / 4294967296;
  };

  const match = {
    code,
    phase: PHASE.FREEZETIME,
    phaseTime: PHASE_DURATION.FREEZETIME,
    round: 1,
    scores: { T: 0, CT: 0 },
    players: [],
    bomb: null,
    drops: [],
    events: [],
    fx: [],
    hits: [],
    winner: null,
    winReason: null,
    time: 0,
    rng,
  };

  function living(team) {
    return match.players.filter((p) => p.alive && (!team || p.team === team));
  }

  function spawnAt(player) {
    const list = MAP.spawns[player.team];
    const slot = list[player.spawnIndex % list.length];
    player.spawnIndex += 1;
    player.pos = { x: slot.x, y: slot.y, z: slot.z };
    player.vel = { x: 0, y: 0, z: 0 };
    player.yaw = slot.yaw;
    player.pitch = 0;
    player.crouch = false;
    player.grounded = true;
    player.recoilPitch = 0;
    player.recoilYaw = 0;
    player.shotIndex = 0;
    player.scoped = false;
    player.reloading = false;
    player.reloadUntil = 0;
    player.nextFire = 0;
    player.plantProgress = 0;
    player.defuseProgress = 0;
  }

  function stripToPistol(p) {
    const pistol = starterPistol(p.team);
    p.loadout = emptyLoadout();
    p.loadout.secondary = pistol;
    p.ammo = {};
    ensureAmmo(p, pistol);
    p.weapon = pistol;
    p.armor = 0;
    p.helmet = false;
  }

  function resetRound(keepWeapons) {
    match.phase = PHASE.FREEZETIME;
    match.phaseTime = PHASE_DURATION.FREEZETIME;
    match.winner = null;
    match.winReason = null;
    match.bomb = null;
    match.drops = [];
    match.events = [];
    match.fx = [];
    match.hits = [];
    for (const p of match.players) {
      const survived = p.alive && p.hp > 0;
      p.hp = 100;
      p.alive = true;
      p.plantProgress = 0;
      p.defuseProgress = 0;
      p.scoped = false;
      p.reloading = false;
      if (!keepWeapons) {
        stripToPistol(p);
        p.money = START_MONEY;
      } else if (!survived) {
        stripToPistol(p);
      } else if (!p.loadout.secondary && !p.loadout.primary) {
        const pistol = starterPistol(p.team);
        p.loadout.secondary = pistol;
        ensureAmmo(p, pistol);
        if (!p.weapon || p.weapon === "c4") p.weapon = pistol;
      }
      p.loadout.c4 = false;
      if (p.weapon === "c4" || !p.weapon) {
        p.weapon = p.loadout.primary || p.loadout.secondary || "knife";
      }
      spawnAt(p);
    }
    const terrorists = match.players.filter((p) => p.team === TEAMS.T);
    if (terrorists.length) {
      const carrier = terrorists[Math.floor(rng() * terrorists.length)];
      carrier.loadout.c4 = true;
    }
  }

  function endRound(winner, reason) {
    if (match.phase === PHASE.ROUND_OVER) return;
    match.phase = PHASE.ROUND_OVER;
    match.phaseTime = PHASE_DURATION.ROUND_OVER;
    match.winner = winner;
    match.winReason = reason;
    match.scores[winner] += 1;
    for (const p of match.players) {
      grantMoney(p, p.team === winner ? WIN_REWARD : LOSS_REWARD);
      p.plantProgress = 0;
      p.defuseProgress = 0;
    }
    pushEvent({ type: "round", winner, reason, text: winText(winner, reason) });
  }

  function pushEvent(event) {
    match.events.push({ ...event, id: nextId++, t: match.time });
    if (match.events.length > 12) match.events.shift();
  }

  function pushFx(event) {
    match.fx.push({ ...event, id: nextId++ });
  }

  function addPlayer(name, preferredTeam) {
    const tCount = match.players.filter((p) => p.team === TEAMS.T).length;
    const ctCount = match.players.filter((p) => p.team === TEAMS.CT).length;
    let team = preferredTeam;
    if (team !== TEAMS.T && team !== TEAMS.CT) {
      team = tCount <= ctCount ? TEAMS.T : TEAMS.CT;
    }
    const id = "p" + nextId++;
    const clean = String(name || "Player").replace(/[^\w .'-]/g, "").slice(0, 16) || "Player";
    const player = createPlayer(id, clean, team);
    player.spawnIndex = match.players.filter((p) => p.team === team).length;
    match.players.push(player);
    if (match.phase === PHASE.FREEZETIME || match.players.length === 1) {
      player.alive = true;
      spawnAt(player);
      if (team === TEAMS.T && !match.players.some((p) => p.loadout.c4)) player.loadout.c4 = true;
    } else {
      player.alive = false;
      player.hp = 0;
    }
    return player;
  }

  function addBot(team) {
    const names = team === TEAMS.T
      ? ["Phoenix", "Dusty", "Sandman"]
      : ["Urban", "Steel", "Rampart"];
    const used = new Set(match.players.map((p) => p.name));
    const name = names.find((n) => !used.has(n)) || "Bot";
    const player = addPlayer(name, team);
    player.bot = true;
    return player;
  }

  function removePlayer(id) {
    const idx = match.players.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const [gone] = match.players.splice(idx, 1);
    if (gone.loadout.c4 && gone.alive && match.phase === PHASE.LIVE && !match.bomb) {
      const mate = match.players.find((p) => p.team === TEAMS.T && p.alive);
      if (mate) mate.loadout.c4 = true;
    }
  }

  function buy(player, item) {
    if (match.phase !== PHASE.FREEZETIME || !player.alive) return { ok: false, reason: "freeze" };
    if (item === "ammo") {
      if (player.money < 200) return { ok: false, reason: "money" };
      let filled = false;
      for (const id of [player.loadout.primary, player.loadout.secondary]) {
        if (!id) continue;
        const spec = WEAPONS[id];
        const ammo = ensureAmmo(player, id);
        if (ammo.reserve < spec.reserve) {
          ammo.reserve = spec.reserve;
          filled = true;
        }
      }
      if (!filled) return { ok: false, reason: "full" };
      grantMoney(player, -200);
      return { ok: true };
    }
    if (item === "kevlar") {
      if (player.armor >= 100) return { ok: false, reason: "owned" };
      if (player.money < KEVLAR_PRICE) return { ok: false, reason: "money" };
      grantMoney(player, -KEVLAR_PRICE);
      player.armor = 100;
      return { ok: true };
    }
    if (item === "helmet") {
      const price = player.armor >= 100 ? HELMET_UPGRADE : HELMET_PRICE;
      if (player.armor >= 100 && player.helmet) return { ok: false, reason: "owned" };
      if (player.money < price) return { ok: false, reason: "money" };
      grantMoney(player, -price);
      player.armor = 100;
      player.helmet = true;
      return { ok: true };
    }
    const spec = WEAPONS[item];
    if (!spec || spec.price <= 0 || spec.type === "c4" || spec.type === "melee") {
      return { ok: false, reason: "item" };
    }
    if (spec.team !== "BOTH" && spec.team !== player.team) return { ok: false, reason: "team" };
    if (player.money < spec.price) return { ok: false, reason: "money" };
    grantMoney(player, -spec.price);
    if (spec.slot === 1) {
      if (player.loadout.primary) dropWeapon(player, player.loadout.primary);
      player.loadout.primary = spec.id;
    } else {
      if (player.loadout.secondary) dropWeapon(player, player.loadout.secondary);
      player.loadout.secondary = spec.id;
    }
    player.ammo[spec.id] = { mag: spec.magazine, reserve: spec.reserve };
    player.weapon = spec.id;
    return { ok: true };
  }

  function dropWeapon(player, id) {
    const spec = WEAPONS[id];
    if (!spec || spec.type === "melee") return;
    const ammo = player.ammo[id] || { mag: defaultMagazine(id), reserve: defaultReserve(id) };
    if (id === "c4") {
      if (!player.loadout.c4 || match.bomb) return;
      player.loadout.c4 = false;
    } else if (player.loadout.primary === id) {
      player.loadout.primary = null;
    } else if (player.loadout.secondary === id) {
      player.loadout.secondary = null;
    } else {
      return;
    }
    delete player.ammo[id];
    if (player.weapon === id) {
      player.weapon = player.loadout.primary || player.loadout.secondary || (player.loadout.c4 ? "c4" : "knife");
    }
    match.drops.push({
      id: "d" + nextId++,
      weapon: id,
      ammo: { mag: ammo.mag || 0, reserve: ammo.reserve || 0 },
      pos: {
        x: player.pos.x,
        y: player.pos.y + 0.15,
        z: player.pos.z,
      },
      vel: {
        x: -Math.sin(player.yaw) * 2.2,
        y: 1.4,
        z: -Math.cos(player.yaw) * 2.2,
      },
    });
  }

  function switchWeapon(player, slotOrId) {
    if (!player.alive) return;
    const map = { 1: "primary", 2: "secondary", 3: "knife", 5: "c4" };
    let id = slotOrId;
    if (map[slotOrId]) {
      if (slotOrId === "3" || slotOrId === 3) id = "knife";
      else if (slotOrId === "5" || slotOrId === 5) id = player.loadout.c4 ? "c4" : null;
      else id = player.loadout[map[slotOrId]];
    }
    if (!id) return;
    if (id === "knife" || id === player.loadout.primary || id === player.loadout.secondary || (id === "c4" && player.loadout.c4)) {
      if (player.weapon !== id) {
        player.weapon = id;
        player.reloading = false;
        player.scoped = false;
        player.shotIndex = 0;
      }
    }
  }

  function startReload(player) {
    const spec = WEAPONS[player.weapon];
    if (!spec || spec.type !== "hitscan" || !player.alive) return;
    const ammo = ensureAmmo(player, spec.id);
    if (ammo.mag >= spec.magazine || ammo.reserve <= 0 || player.reloading) return;
    player.reloading = true;
    player.reloadUntil = match.time + spec.reload;
    player.scoped = false;
  }

  function finishReload(player) {
    const spec = WEAPONS[player.weapon];
    if (!spec || spec.type !== "hitscan") {
      player.reloading = false;
      return;
    }
    const ammo = ensureAmmo(player, spec.id);
    const need = spec.magazine - ammo.mag;
    const take = Math.min(need, ammo.reserve);
    ammo.mag += take;
    ammo.reserve -= take;
    player.reloading = false;
  }

  function kill(victim, attacker, weaponId, headshot) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    victim.vel = { x: 0, y: 0, z: 0 };
    victim.deaths += 1;
    victim.plantProgress = 0;
    victim.defuseProgress = 0;
    victim.scoped = false;
    if (attacker && attacker.id !== victim.id) {
      attacker.kills += 1;
      attacker.score += headshot ? 2 : 1;
      grantMoney(attacker, KILL_REWARD);
    }
    pushEvent({
      type: "kill",
      killer: attacker ? attacker.name : victim.name,
      killerTeam: attacker ? attacker.team : victim.team,
      victim: victim.name,
      victimTeam: victim.team,
      weapon: WEAPONS[weaponId]?.name || weaponId,
      weaponId,
      headshot: !!headshot,
    });
    if (victim.loadout.primary) dropWeapon(victim, victim.loadout.primary);
    if (victim.loadout.secondary) dropWeapon(victim, victim.loadout.secondary);
    if (victim.loadout.c4 && !match.bomb) dropWeapon(victim, "c4");
    checkEliminations();
  }

  function detonate() {
    const pos = match.bomb ? match.bomb.pos : null;
    match.bomb = null;
    if (pos) {
      for (const p of match.players) {
        if (!p.alive) continue;
        const dist = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
        if (dist >= 16) continue;
        const dmg = dist < 4.5 ? 400 : Math.max(0, 180 - dist * 12);
        p.hp -= dmg;
        if (p.hp <= 0) {
          p.alive = false;
          p.hp = 0;
          p.deaths += 1;
        }
      }
      pushEvent({ type: "explode", pos });
    }
    endRound(TEAMS.T, "detonation");
  }

  function checkEliminations() {
    if (match.phase !== PHASE.LIVE && match.phase !== PHASE.BOMB_PLANTED) return;
    const tAlive = living(TEAMS.T).length;
    const ctAlive = living(TEAMS.CT).length;
    if (tAlive === 0 && ctAlive === 0) {
      endRound(TEAMS.CT, "elimination");
      return;
    }
    if (tAlive === 0) {
      if (match.phase === PHASE.BOMB_PLANTED) return;
      endRound(TEAMS.CT, "elimination");
    } else if (ctAlive === 0) {
      endRound(TEAMS.T, "elimination");
    }
  }

  function fire(player) {
    const spec = WEAPONS[player.weapon];
    if (!player.alive || !spec) return;
    if (match.phase !== PHASE.LIVE && match.phase !== PHASE.BOMB_PLANTED) return;
    if (match.time < player.nextFire || player.reloading) return;
    if (spec.type === "c4") return;
    if (spec.type === "melee") {
      player.nextFire = match.time + spec.fireDelay;
      melee(player);
      pushFx({
        type: "shot",
        id: player.id,
        weapon: spec.id,
        origin: eyeOf(player),
        dir: lookOf(player),
      });
      return;
    }
    const ammo = ensureAmmo(player, spec.id);
    if (ammo.mag <= 0) {
      startReload(player);
      return;
    }
    ammo.mag -= 1;
    player.nextFire = match.time + spec.fireDelay;
    const spread = computeSpread(player, spec, player.scoped);
    const origin = eyeOf(player);
    const dir = shotDirection(
      player.yaw,
      player.pitch,
      player.recoilYaw,
      player.recoilPitch,
      spread,
      rng,
    );
    const kick = applyRecoilKick(player, spec);
    resolveShot(player, origin, dir, spec);
    pushFx({
      type: "shot",
      id: player.id,
      weapon: spec.id,
      origin,
      dir,
      kick,
    });
    if (player.scoped && spec.scope) player.scoped = false;
  }

  function eyeOf(player) {
    return {
      x: player.pos.x,
      y: player.pos.y + eyeHeight(player.crouch),
      z: player.pos.z,
    };
  }

  function lookOf(player) {
    return shotDirection(player.yaw, player.pitch, 0, 0, 0, rng);
  }

  function resolveShot(player, origin, dir, spec) {
    const maxDist = 80;
    const wall = nearestSolid(origin, dir, MAP.solids, maxDist);
    const hit = rayPlayers(origin, dir, match.players, player, wall ?? maxDist);
    if (!hit) return;
    const dealt = computeDamage(spec.id, hit.part, hit.player, false);
    match.hits.push({
      id: player.id,
      victim: hit.player.id,
      part: hit.part,
      amount: Math.round(dealt.health),
    });
    applyDamage(hit.player, dealt, player, spec.id, hit.part === "head");
  }

  function applyDamage(victim, dealt, attacker, weaponId, headshot) {
    victim.armor = Math.max(0, victim.armor - dealt.armor);
    if (victim.armor <= 0) victim.helmet = false;
    victim.hp -= dealt.health;
    if (victim.hp <= 0) kill(victim, attacker, weaponId, headshot);
  }

  function melee(player) {
    const origin = eyeOf(player);
    const dir = lookOf(player);
    const hit = rayPlayers(origin, dir, match.players, player, WEAPONS.knife.range);
    if (!hit) return;
    const back = isBehind(player.pos, hit.player);
    const dealt = computeDamage("knife", hit.part, hit.player, back);
    applyDamage(hit.player, dealt, player, "knife", false);
  }

  function tryPickup(player) {
    if (!player.alive) return;
    for (let i = match.drops.length - 1; i >= 0; i--) {
      const drop = match.drops[i];
      const dx = drop.pos.x - player.pos.x;
      const dz = drop.pos.z - player.pos.z;
      if (dx * dx + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      if (drop.weapon === "c4") {
        if (player.team !== TEAMS.T || player.loadout.c4) continue;
        player.loadout.c4 = true;
        match.drops.splice(i, 1);
        continue;
      }
      const spec = WEAPONS[drop.weapon];
      if (!spec) continue;
      if (spec.slot === 1) {
        if (player.loadout.primary && player.loadout.primary !== drop.weapon) continue;
        player.loadout.primary = drop.weapon;
      } else if (spec.slot === 2) {
        if (player.loadout.secondary && player.loadout.secondary !== drop.weapon) continue;
        player.loadout.secondary = drop.weapon;
      } else continue;
      player.ammo[drop.weapon] = {
        mag: drop.ammo.mag,
        reserve: drop.ammo.reserve,
      };
      player.weapon = drop.weapon;
      match.drops.splice(i, 1);
    }
  }

  function stepDrops(dt) {
    for (const drop of match.drops) {
      drop.vel.y -= 16 * dt;
      drop.pos.x += drop.vel.x * dt;
      drop.pos.y += drop.vel.y * dt;
      drop.pos.z += drop.vel.z * dt;
      drop.vel.x *= 0.92;
      drop.vel.z *= 0.92;
      if (drop.pos.y < 0.12) {
        drop.pos.y = 0.12;
        drop.vel.y = 0;
        drop.vel.x *= 0.6;
        drop.vel.z *= 0.6;
      }
    }
  }

  function applyInput(player, input) {
    const frozen = match.phase === PHASE.FREEZETIME || match.phase === PHASE.ROUND_OVER || !player.alive;
    const planting =
      player.plantProgress > 0 &&
      match.phase === PHASE.LIVE &&
      player.alive &&
      player.team === TEAMS.T;
    const defusing = player.defuseProgress > 0 && match.phase === PHASE.BOMB_PLANTED && player.alive;
    const yaw = Number.isFinite(input.yaw) ? input.yaw : player.yaw;
    const pitch = Number.isFinite(input.pitch) ? Math.max(-1.45, Math.min(1.45, input.pitch)) : player.pitch;
    player.pitch = pitch;
    const wish = {
      yaw,
      forward: frozen ? 0 : clampAxis(input.forward),
      strafe: frozen ? 0 : clampAxis(input.strafe),
      jump: !frozen && !planting && !defusing && !!input.jump,
      crouch: !frozen && !!input.crouch,
    };
    if (planting || defusing) {
      wish.forward *= 0.15;
      wish.strafe *= 0.15;
      wish.jump = false;
    }
    for (let i = 0; i < SUBSTEPS; i++) stepPlayer(player, wish, SUB_DT, MAP.solids);
    if (planting && horizontalSpeed(player) > PLANT_MOVE_SPEED) {
      player.plantProgress = 0;
    }
  }

  function updateObjectives(dt) {
    const planter = match.players.find((p) => p.alive && p.team === TEAMS.T && p.loadout.c4 && p.weapon === "c4" && p.planting);
    for (const p of match.players) {
      if (p !== planter) p.plantProgress = 0;
    }
    if (planter && match.phase === PHASE.LIVE) {
      const site = siteAt(planter.pos.x, planter.pos.y, planter.pos.z);
      if (site && horizontalSpeed(planter) <= PLANT_MOVE_SPEED) {
        planter.plantProgress += dt;
        if (planter.plantProgress >= PLANT_TIME) {
          const spot = clampToSite(site, planter.pos.x, planter.pos.z);
          match.bomb = {
            site: site.id,
            pos: { x: spot.x, y: 0.05, z: spot.z },
            time: PHASE_DURATION.BOMB_PLANTED,
          };
          planter.loadout.c4 = false;
          planter.plantProgress = 0;
          if (planter.weapon === "c4") {
            planter.weapon = planter.loadout.primary || planter.loadout.secondary || "knife";
          }
          match.phase = PHASE.BOMB_PLANTED;
          match.phaseTime = PHASE_DURATION.BOMB_PLANTED;
          pushEvent({ type: "plant", site: site.id, name: planter.name });
        }
      } else {
        planter.plantProgress = 0;
      }
    }

    if (match.phase === PHASE.BOMB_PLANTED && match.bomb) {
      let defuser = null;
      for (const p of match.players) {
        if (!p.alive || p.team !== TEAMS.CT || !p.defusing) {
          p.defuseProgress = 0;
          continue;
        }
        const dx = p.pos.x - match.bomb.pos.x;
        const dz = p.pos.z - match.bomb.pos.z;
        if (dx * dx + dz * dz <= DEFUSE_RADIUS * DEFUSE_RADIUS) {
          defuser = p;
          p.defuseProgress += dt;
          if (p.defuseProgress >= DEFUSE_TIME) {
            match.bomb = null;
            endRound(TEAMS.CT, "defuse");
            return;
          }
        } else {
          p.defuseProgress = 0;
        }
      }
      for (const p of match.players) {
        if (p !== defuser) p.defuseProgress = 0;
      }
    }
  }

  function tick(inputs) {
    const dt = TICK_DT;
    match.time += dt;
    match.phaseTime = Math.max(0, match.phaseTime - dt);

    for (const player of match.players) {
      const input = inputs.get(player.id) || {};
      player.planting = !!input.plant && player.weapon === "c4" && player.loadout.c4;
      player.defusing = !!input.plant && player.team === TEAMS.CT;
      if (Number.isFinite(input.seq)) player.ack = input.seq | 0;
      const held = WEAPONS[player.weapon];
      const trigger = held && (held.automatic || held.type === "melee") ? input.fire : input.shot;
      if (trigger) fire(player);
      if (input.reload) startReload(player);
      if (input.drop) {
        if (player.weapon !== "knife") dropWeapon(player, player.weapon);
        input.drop = false;
      }
      if (input.slot) {
        switchWeapon(player, input.slot);
        input.slot = 0;
      }
      if (input.buy) {
        buy(player, input.buy);
        input.buy = null;
      }
      if (input.scope && WEAPONS[player.weapon]?.scope) {
        player.scoped = !player.scoped;
        input.scope = false;
      }
      applyInput(player, input);
      decayRecoil(player, dt, WEAPONS[player.weapon]);
      if (player.reloading && match.time >= player.reloadUntil) finishReload(player);
      tryPickup(player);
    }
    stepDrops(dt);
    updateObjectives(dt);

    if (match.phase === PHASE.FREEZETIME && match.phaseTime <= 0) {
      match.phase = PHASE.LIVE;
      match.phaseTime = PHASE_DURATION.LIVE;
    } else if (match.phase === PHASE.LIVE && match.phaseTime <= 0) {
      endRound(TEAMS.CT, "time");
    } else if (match.phase === PHASE.BOMB_PLANTED) {
      if (match.bomb) {
        match.bomb.time = match.phaseTime;
        if (match.phaseTime <= 0) detonate();
      }
    } else if (match.phase === PHASE.ROUND_OVER && match.phaseTime <= 0) {
      match.round += 1;
      resetRound(true);
    }
  }

  function snapshot() {
    return {
      code: match.code,
      phase: match.phase,
      phaseTime: round1(match.phaseTime),
      round: match.round,
      scores: { ...match.scores },
      winner: match.winner,
      winReason: match.winReason,
      bomb: match.bomb
        ? {
            site: match.bomb.site,
            time: round1(match.bomb.time),
            pos: { ...match.bomb.pos },
          }
        : null,
      drops: match.drops.map((d) => ({
        id: d.id,
        weapon: d.weapon,
        pos: { x: round2(d.pos.x), y: round2(d.pos.y), z: round2(d.pos.z) },
      })),
      events: match.events.slice(-8),
      fx: match.fx.splice(0, match.fx.length),
      hits: match.hits.splice(0, match.hits.length),
      players: match.players.map(publicPlayer),
    };
  }

  resetRound(false);

  return {
    match,
    addPlayer,
    addBot,
    removePlayer,
    buy,
    tick,
    snapshot,
    switchWeapon,
  };
}

function publicPlayer(p) {
  const ammo = p.ammo[p.weapon];
  return {
    id: p.id,
    name: p.name,
    team: p.team,
    hp: Math.max(0, Math.round(p.hp)),
    armor: Math.round(p.armor),
    helmet: p.helmet,
    alive: p.alive,
    money: p.money,
    kills: p.kills,
    deaths: p.deaths,
    score: p.score,
    pos: { x: round2(p.pos.x), y: round2(p.pos.y), z: round2(p.pos.z) },
    vel: { x: round2(p.vel.x), y: round2(p.vel.y), z: round2(p.vel.z) },
    yaw: round3(p.yaw),
    pitch: round3(p.pitch),
    crouch: p.crouch,
    grounded: p.grounded,
    weapon: p.weapon,
    hasC4: p.loadout.c4,
    primary: p.loadout.primary,
    secondary: p.loadout.secondary,
    mag: ammo ? ammo.mag : 0,
    reserve: ammo ? ammo.reserve : 0,
    reloading: p.reloading,
    scoped: p.scoped,
    plant: round2(p.plantProgress),
    defuse: round2(p.defuseProgress),
    ack: p.ack || 0,
    recoil: round3(p.recoilPitch || 0),
    recoilYaw: round3(p.recoilYaw || 0),
    bot: !!p.bot,
  };
}

function clampAxis(v) {
  const n = Number(v) || 0;
  return Math.max(-1, Math.min(1, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

export function winText(winner, reason) {
  const side = winner === TEAMS.T ? "Terrorists Win" : "Counter-Terrorists Win";
  const why =
    reason === "detonation"
      ? "The bomb detonated"
      : reason === "defuse"
        ? "The bomb has been defused"
        : reason === "time"
          ? "Time ran out"
          : "The enemy was eliminated";
  return `${side} — ${why}`;
}

export function buyCatalog() {
  return BUY_MENU;
}

export { bodyHeight, cloneVec };
