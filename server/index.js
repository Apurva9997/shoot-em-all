import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";
import { TICK_DT, TICK_RATE } from "../shared/constants.js";
import { decideBot } from "./bots.js";
import { createMatch } from "./game.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3091;
const CLIENT_DIST = path.resolve(__dirname, "../client/dist");

const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});
app.use(express.static(CLIENT_DIST));
app.get("/health", (_req, res) => {
  res.json({ ok: true, tick: TICK_RATE, rooms: rooms.size });
});
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/socket.io")) return next();
  res.sendFile(path.join(CLIENT_DIST, "index.html"), (err) => {
    if (err) res.status(200).type("html").send(devHint());
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const rooms = new Map();

function roomOf(code) {
  const key = String(code || "dust2").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "dust2";
  let room = rooms.get(key);
  if (!room) {
    const game = createMatch(key);
    const inputs = new Map();
    room = { key, game, inputs, sockets: new Set() };
    rooms.set(key, room);
  }
  return room;
}

io.on("connection", (socket) => {
  let joined = null;

  socket.on("join", (payload = {}) => {
    if (joined) return;
    const room = roomOf(payload.room);
    const player = room.game.addPlayer(payload.name, payload.team);
    joined = { room, id: player.id };
    room.sockets.add(socket);
    room.inputs.set(player.id, blankInput());
    socket.join(room.key);
    socket.emit("welcome", { id: player.id, room: room.key });
    socket.to(room.key).emit("notice", { text: `${player.name} joined ${player.team}` });
    ensureOpposition(room, player.team);
  });

  socket.on("input", (input) => {
    if (!joined) return;
    const slot = joined.room.inputs.get(joined.id);
    if (!slot) return;
    slot.forward = num(input.forward);
    slot.strafe = num(input.strafe);
    slot.yaw = num(input.yaw);
    slot.pitch = num(input.pitch);
    slot.seq = num(input.seq);
    slot.jump = !!input.jump;
    slot.crouch = !!input.crouch;
    slot.fire = !!input.fire;
    slot.plant = !!input.plant;
    if (input.shot) slot.shot = true;
    if (input.reload) slot.reload = true;
    if (input.drop) slot.drop = true;
    if (input.slot) slot.slot = input.slot;
    if (input.buy) slot.buy = String(input.buy);
    if (input.scope) slot.scope = true;
  });

  socket.on("disconnect", () => {
    if (!joined) return;
    const { room, id } = joined;
    room.game.removePlayer(id);
    room.inputs.delete(id);
    room.sockets.delete(socket);
    if (room.sockets.size === 0) rooms.delete(room.key);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    for (const player of room.game.match.players) {
      if (!player.bot) continue;
      const decided = decideBot(player, room.game.match);
      const slot = room.inputs.get(player.id) || blankInput();
      Object.assign(slot, decided);
      room.inputs.set(player.id, slot);
    }
    room.game.tick(room.inputs);
    for (const input of room.inputs.values()) {
      input.fire = false;
      input.shot = false;
      input.reload = false;
      input.drop = false;
      input.slot = 0;
      input.buy = null;
      input.scope = false;
    }
    const snap = room.game.snapshot();
    io.to(room.key).emit("state", snap);
  }
}, TICK_DT * 1000);

server.listen(PORT, () => {
  console.log(`Dust2 server  http://localhost:${PORT}   (${TICK_RATE} Hz)`);
});

function ensureOpposition(room, humanTeam) {
  const other = humanTeam === "T" ? "CT" : "T";
  const hasOther = room.game.match.players.some((p) => p.team === other);
  if (hasOther) return;
  const bot = room.game.addBot(other);
  room.inputs.set(bot.id, blankInput());
}

function blankInput() {
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
    seq: 0,
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function devHint() {
  return `<!doctype html><meta charset="utf-8"><title>Dust2</title>
  <body style="background:#1a120c;color:#e7d3a1;font-family:sans-serif;padding:40px">
  <h1>Server is up.</h1>
  <p>The client build is not in <code>client/dist</code> yet.</p>
  <p>From the repo root run <code>npm run dev</code>, then open the Vite URL (port 5183).</p>
  </body>`;
}
