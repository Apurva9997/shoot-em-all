/**
 * Client: pointer-lock look, predicted movement, interpolated remotes.
 *
 * Camera frame matches shared/physics.js:
 *   camera.rotation.order = 'YXZ'
 *   camera.rotation.y = yaw, camera.rotation.x = pitch
 * Positive pitch looks up. shared lookDirection uses sin(pitch) on Y, which
 * matches Three.js YXZ rotation.x (verified: pitch 0 looks at the horizon).
 * Movement reads camera.getWorldDirection every prediction step — no second yaw formula.
 */

import * as THREE from "three";
import { io } from "socket.io-client";
import { MAP } from "@shared/mapData.js";
import { PHASE, PITCH_LIMIT, SUB_DT, TEAMS, TICK_DT } from "@shared/constants.js";
import { eyeHeight, headingVectors, horizontalSpeed, stepPlayer } from "@shared/physics.js";
import { computeSpread } from "@shared/combat.js";
import { WEAPONS } from "@shared/weapons.js";
import { createAudio } from "./audio.js";
import { addSky, buildWorld } from "./world.js";
import {
  buildViewmodel,
  createActor,
  createViewmodel,
  kickViewmodel,
  muzzle,
  poseActor,
  setActorWeapon,
  updateViewmodel,
} from "./actors.js";
import { createHud } from "./hud.js";
import { serverOrigin } from "./net.js";

const canvas = document.querySelector("#view");
const blocker = document.querySelector("#blocker");
const hudRoot = document.querySelector("#hud");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 140);
camera.rotation.order = "YXZ";
scene.add(camera);

const { textures } = buildWorld(scene);
addSky(scene, textures);

const viewmodel = createViewmodel();
camera.add(viewmodel);
const viewLight = new THREE.PointLight(0xfff1d0, 1.4, 3);
viewLight.position.set(0.1, 0.05, -0.2);
camera.add(viewLight);

const audio = createAudio();
const hud = createHud();

const keys = new Set();
const mouse = { dx: 0, dy: 0, left: false, rightEdge: false };
let locked = false;
let engaged = false;
let joined = false;
let myId = null;
let serverState = null;
let predicted = null;
const pending = [];
let seq = 0;
const remotes = new Map();
const drops = new Map();
let bombMesh = null;
let lastAck = 0;
let spreadVis = 0;
let lastHp = 100;
let bombBeepAt = 0;
let vmWeapon = "";
let lastPhase = "";

const socket = io(serverOrigin(), { transports: ["websocket", "polling"] });

socket.on("welcome", ({ id }) => {
  myId = id;
  joined = true;
  hudRoot.hidden = false;
  blocker.classList.add("hidden");
  engaged = true;
  canvas.requestPointerLock();
});

socket.on("state", (snap) => {
  serverState = snap;
  const me = snap.players.find((p) => p.id === myId);
  if (!me) return;
  if (!predicted) {
    predicted = fromServer(me);
    lastAck = me.ack || 0;
  } else {
    reconcile(me);
  }
  for (const fx of snap.fx || []) {
    if (fx.type === "shot") {
      audio.shot(fx.weapon, fx.id === myId);
      if (fx.id === myId) {
        muzzle(viewmodel);
        kickViewmodel(viewmodel, fx.weapon === "awp" ? 0.12 : 0.05);
        predicted.recoilPitch = me.recoil || predicted.recoilPitch;
        predicted.recoilYaw = me.recoilYaw || 0;
      }
    }
    if (fx.type === "explode") audio.boom();
  }
  for (const hit of snap.hits || []) {
    if (hit.id === myId) audio.hit();
  }
  if (me.hp < lastHp) hud.flashDamage(lastHp - me.hp);
  lastHp = me.hp;
  for (const ev of snap.events || []) {
    if (ev.type === "plant") audio.voice("plant");
    if (ev.type === "round" && ev.id && !window.__heard?.has(ev.id)) {
      (window.__heard = window.__heard || new Set()).add(ev.id);
      audio.voice(ev.winner === me.team ? "win" : "lose");
    }
  }
});

socket.on("connect_error", () => {
  hud.toast("Cannot reach the server on port 3091");
});

document.querySelectorAll(".team").forEach((btn) => {
  btn.addEventListener("click", () => {
    const name = document.querySelector("#name").value.trim() || "Player";
    const room = document.querySelector("#room").value.trim() || "dust2";
    audio.resume();
    socket.emit("join", { name, room, team: btn.dataset.team });
  });
});

document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  const resume = document.querySelector("#resume");
  if (resume) resume.hidden = locked || !joined;
});

function captureMouse() {
  if (!joined) return;
  canvas.requestPointerLock();
}
blocker.addEventListener("click", (ev) => {
  if (!joined) return;
  if (ev.target.closest("button, input, a")) return;
  captureMouse();
});
document.querySelector("#resume")?.addEventListener("click", captureMouse);
canvas.addEventListener("click", captureMouse);

document.addEventListener("keydown", (ev) => {
  if (ev.target.matches("input")) return;
  keys.add(ev.code);
  if (!joined) return;
  if (ev.code === "KeyB") {
    const me = meFromServer();
    if (serverState?.phase === PHASE.FREEZETIME) {
      hud.toggleBuy(me);
      window.__me = me;
    } else hud.toast("Buy menu is freeze time only");
    ev.preventDefault();
  }
  if (ev.code === "Escape") hud.closeBuy();
  if (hud.isBuyOpen() && ev.code.startsWith("Digit")) {
    const item = hud.buyKey(ev.code.slice(5), window.__me);
    if (item) sendBuy(item);
    ev.preventDefault();
  }
  if (ev.code === "Digit1") queueSlot(1);
  if (ev.code === "Digit2") queueSlot(2);
  if (ev.code === "Digit3") queueSlot(3);
  if (ev.code === "Digit5") queueSlot(5);
  if (ev.code === "KeyR") queueEdge("reload");
  if (ev.code === "KeyG") queueEdge("drop");
});
document.addEventListener("keyup", (ev) => keys.delete(ev.code));

document.addEventListener("mousemove", (ev) => {
  if (!locked) return;
  mouse.dx += ev.movementX;
  mouse.dy += ev.movementY;
});
document.addEventListener("mousedown", (ev) => {
  if (!locked) return;
  if (ev.button === 0) mouse.left = true;
  if (ev.button === 2) mouse.rightEdge = true;
});
document.addEventListener("mouseup", (ev) => {
  if (ev.button === 0) mouse.left = false;
});
document.addEventListener("contextmenu", (ev) => ev.preventDefault());
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud.setBuyHandler((item) => sendBuy(item));

const edges = { reload: false, drop: false, slot: 0, buy: null, scope: false, shot: false };

function queueSlot(n) {
  edges.slot = n;
}
function queueEdge(kind) {
  edges[kind] = true;
}
function sendBuy(item) {
  edges.buy = item;
  hud.toast(`Buying ${item}`);
}

function meFromServer() {
  return serverState?.players.find((p) => p.id === myId) || null;
}

function fromServer(p) {
  return {
    pos: { ...p.pos },
    vel: { ...p.vel },
    yaw: p.yaw,
    pitch: p.pitch,
    crouch: p.crouch,
    grounded: p.grounded,
    recoilPitch: p.recoil || 0,
    recoilYaw: p.recoilYaw || 0,
  };
}

function reconcile(me) {
  if (!predicted) return;
  const ack = me.ack || 0;
  while (pending.length && pending[0].seq <= ack) pending.shift();
  predicted = fromServer(me);
  for (const cmd of pending) {
    for (let i = 0; i < 2; i++) stepPlayer(predicted, cmd.wish, SUB_DT, MAP.solids);
    predicted.yaw = cmd.wish.yaw;
    predicted.pitch = cmd.pitch;
  }
  lastAck = ack;
}

function readWish() {
  const sensitivity = 0.0022;
  predicted.yaw -= mouse.dx * sensitivity;
  predicted.pitch -= mouse.dy * sensitivity;
  predicted.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, predicted.pitch));
  mouse.dx = 0;
  mouse.dy = 0;
  // Place the camera from this yaw first, then read its planar basis. That is
  // the only movement frame — W adds camera-forward, D adds camera-right.
  camera.rotation.order = "YXZ";
  camera.rotation.y = predicted.yaw;
  camera.rotation.x = predicted.pitch;
  const { fwd, right } = cameraBasis();
  let moveX = 0;
  let moveZ = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) {
    moveX += fwd.x;
    moveZ += fwd.z;
  }
  if (keys.has("KeyS") || keys.has("ArrowDown")) {
    moveX -= fwd.x;
    moveZ -= fwd.z;
  }
  if (keys.has("KeyD") || keys.has("ArrowRight")) {
    moveX += right.x;
    moveZ += right.z;
  }
  if (keys.has("KeyA") || keys.has("ArrowLeft")) {
    moveX -= right.x;
    moveZ -= right.z;
  }
  const shared = headingVectors(predicted.yaw);
  const wishFwd = moveX * shared.fwd.x + moveZ * shared.fwd.z;
  const wishStr = moveX * shared.right.x + moveZ * shared.right.z;
  const frozen = !serverState || serverState.phase === PHASE.FREEZETIME || serverState.phase === PHASE.ROUND_OVER;
  const alive = meFromServer()?.alive !== false;
  return {
    yaw: predicted.yaw,
    forward: frozen || !alive ? 0 : wishFwd,
    strafe: frozen || !alive ? 0 : wishStr,
    jump: !frozen && alive && (keys.has("Space")),
    crouch: !frozen && alive && (keys.has("ControlLeft") || keys.has("ControlRight") || keys.has("KeyC")),
  };
}

function cameraBasis() {
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
  return { fwd, right };
}

function sampleInput() {
  if (!predicted) return null;
  const wish = readWish();
  const me = meFromServer();
  const planting = (keys.has("KeyE") || mouse.left) && me?.weapon === "c4";
  const stepWish = planting
    ? { ...wish, forward: wish.forward * 0.15, strafe: wish.strafe * 0.15, jump: false }
    : wish;
  for (let i = 0; i < 2; i++) stepPlayer(predicted, stepWish, SUB_DT, MAP.solids);
  seq += 1;
  const spec = me ? WEAPONS[me.weapon] : null;
  const auto = spec && (spec.automatic || spec.type === "melee");
  const shotEdge = mouse.left && !mouse.sentSemi && !auto;
  if (mouse.left && !auto) mouse.sentSemi = true;
  if (!mouse.left) mouse.sentSemi = false;
  const input = {
    seq,
    forward: wish.forward,
    strafe: wish.strafe,
    yaw: predicted.yaw,
    pitch: predicted.pitch,
    jump: wish.jump,
    crouch: wish.crouch,
    fire: mouse.left && !!auto,
    shot: shotEdge || edges.shot,
    reload: edges.reload,
    drop: edges.drop,
    slot: edges.slot,
    buy: edges.buy,
    plant: keys.has("KeyE") || (mouse.left && me?.weapon === "c4"),
    scope: mouse.rightEdge,
  };
  edges.reload = false;
  edges.drop = false;
  edges.slot = 0;
  edges.buy = null;
  edges.shot = false;
  mouse.rightEdge = false;
  pending.push({ seq, wish: { ...wish }, pitch: predicted.pitch });
  if (pending.length > 90) pending.shift();
  socket.emit("input", input);
  return wish;
}

function syncCamera() {
  if (!predicted) return;
  const eye = eyeHeight(predicted.crouch);
  camera.position.set(predicted.pos.x, predicted.pos.y + eye, predicted.pos.z);
  camera.rotation.y = predicted.yaw;
  camera.rotation.x = predicted.pitch + (predicted.recoilPitch || 0) * 0.35;
  camera.rotation.z = 0;
  const spec = meFromServer();
  const scoped = spec?.scoped && spec.weapon === "awp";
  camera.fov = scoped ? 18 : 78;
  camera.updateProjectionMatrix();
}

function ensureRemote(p) {
  let actor = remotes.get(p.id);
  if (!actor) {
    actor = createActor(p.team);
    scene.add(actor);
    remotes.set(p.id, actor);
    actor.userData.net = { pos: { ...p.pos }, yaw: p.yaw, weapon: p.weapon };
    setActorWeapon(actor, p.weapon);
  }
  if (actor.userData.net.weapon !== p.weapon) {
    setActorWeapon(actor, p.weapon);
    actor.userData.net.weapon = p.weapon;
  }
  return actor;
}

function updateRemotes(dt, alpha) {
  if (!serverState) return;
  const aliveIds = new Set();
  for (const p of serverState.players) {
    if (p.id === myId || !p.alive) continue;
    aliveIds.add(p.id);
    const actor = ensureRemote(p);
    const net = actor.userData.net;
    const k = 1 - Math.pow(0.001, dt);
    net.pos.x += (p.pos.x - net.pos.x) * k;
    net.pos.y += (p.pos.y - net.pos.y) * k;
    net.pos.z += (p.pos.z - net.pos.z) * k;
    net.yaw = lerpAngle(net.yaw, p.yaw, Math.min(1, dt * 12));
    actor.position.set(net.pos.x, net.pos.y, net.pos.z);
    actor.rotation.y = net.yaw;
    const moving = Math.hypot(p.vel.x, p.vel.z) > 0.4;
    poseActor(actor, performance.now() / 1000, moving, p.crouch);
  }
  for (const [id, actor] of remotes) {
    if (!aliveIds.has(id)) {
      scene.remove(actor);
      remotes.delete(id);
    }
  }
  void alpha;
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function updateDrops() {
  if (!serverState) return;
  const ids = new Set();
  for (const drop of serverState.drops || []) {
    ids.add(drop.id);
    let mesh = drops.get(drop.id);
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.1, 0.5),
        new THREE.MeshLambertMaterial({ color: drop.weapon === "c4" ? 0x6a8f3a : 0x222222 }),
      );
      scene.add(mesh);
      drops.set(drop.id, mesh);
    }
    mesh.position.set(drop.pos.x, drop.pos.y + 0.05, drop.pos.z);
    mesh.rotation.y += 0.01;
  }
  for (const [id, mesh] of drops) {
    if (!ids.has(id)) {
      scene.remove(mesh);
      drops.delete(id);
    }
  }
}

function updateBomb() {
  const bomb = serverState?.bomb;
  if (!bomb) {
    if (bombMesh) bombMesh.visible = false;
    return;
  }
  if (!bombMesh) {
    bombMesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.18, 0.62),
      new THREE.MeshLambertMaterial({ color: 0x3d4a32 }),
    );
    const light = new THREE.PointLight(0xff4422, 0.8, 6);
    light.position.y = 0.3;
    bombMesh.add(body, light);
    bombMesh.userData.light = light;
    scene.add(bombMesh);
  }
  bombMesh.visible = true;
  bombMesh.position.set(bomb.pos.x, 0.1, bomb.pos.z);
  bombMesh.userData.light.intensity = 0.4 + Math.sin(performance.now() * 0.02) * 0.4;
  const interval = Math.max(0.12, Math.min(1.1, bomb.time / 40));
  if (performance.now() - bombBeepAt > interval * 1000) {
    bombBeepAt = performance.now();
    audio.beep(bomb.time < 10);
  }
}

function refreshViewmodel() {
  const me = meFromServer();
  if (!me) return;
  if (vmWeapon !== me.weapon || viewmodel.userData.team !== me.team) {
    viewmodel.clear();
    if (me.alive) viewmodel.add(buildViewmodel(me.weapon, me.team));
    vmWeapon = me.weapon;
    viewmodel.userData.team = me.team;
  }
  if (!me.alive) viewmodel.clear();
}

let acc = 0;
let last = performance.now();
let sentAt = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (joined && predicted && engaged) {
    acc += dt;
    while (acc >= TICK_DT) {
      sampleInput();
      acc -= TICK_DT;
      sentAt = now;
      if (acc > TICK_DT * 3) acc = TICK_DT;
    }
    syncCamera();
    const me = meFromServer();
    if (me && predicted.grounded && horizontalSpeed(predicted) > 1.2 && !predicted.crouch) {
      audio.step(horizontalSpeed(predicted));
    }
    const spec = me ? WEAPONS[me.weapon] : null;
    if (spec && predicted) {
      const fake = {
        vel: predicted.vel,
        crouch: predicted.crouch,
        grounded: predicted.grounded,
        recoilPitch: predicted.recoilPitch || 0,
      };
      spreadVis = computeSpread(fake, spec, me.scoped) * 900;
    }
  }
  updateRemotes(dt, 0);
  updateDrops();
  updateBomb();
  refreshViewmodel();
  updateViewmodel(viewmodel, dt, predicted ? horizontalSpeed(predicted) > 0.4 : false);
  if (serverState && myId) {
    hud.update(serverState, meFromServer(), spreadVis, keys.has("Tab"));
    if (hud.isBuyOpen()) {
      window.__me = meFromServer();
      hud.renderBuy(window.__me);
    }
    if (serverState.phase !== lastPhase) {
      const prev = lastPhase;
      lastPhase = serverState.phase;
      if (prev && serverState.phase !== PHASE.FREEZETIME) hud.closeBuy();
    }
  }
  renderer.render(scene, camera);
}

requestAnimationFrame(frame);

window.__keys = keys;
window.__mouse = mouse;
window.__edges = edges;
window.__setYaw = (yaw) => {
  if (predicted) predicted.yaw = yaw;
};
window.__predicted = new Proxy({}, { get: (_t, prop) => predicted?.[prop] });
Object.defineProperty(window, "__predictedLive", { get: () => predicted });

window.__selfTestControls = async function selfTestControls() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!predicted) return { ok: false, reason: "no prediction yet" };
  const results = [];
  const press = async (code, ms) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    keys.add(code);
    await sleep(ms);
    window.dispatchEvent(new KeyboardEvent("keyup", { code }));
    keys.delete(code);
  };
  const yaw = predicted.yaw;
  const cases = [
    ["KeyW", "f", 1],
    ["KeyS", "f", -1],
    ["KeyD", "r", 1],
    ["KeyA", "r", -1],
  ];
  for (const [code, axis, sign] of cases) {
    const p0 = { ...predicted.pos };
    const { fwd, right } = cameraBasis();
    await press(code, 280);
    await sleep(40);
    const d = { x: predicted.pos.x - p0.x, z: predicted.pos.z - p0.z };
    const len = Math.hypot(d.x, d.z);
    const ref = axis === "f" ? fwd : right;
    const along = len < 0.02 ? 0 : ((d.x * ref.x + d.z * ref.z) / len) * sign;
    results.push({ code, along, moved: len, yaw });
  }
  return { ok: results.every((r) => r.along > 0.85), results };
};
