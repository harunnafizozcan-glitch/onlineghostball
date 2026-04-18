const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3000);
const TICK_MS = 33;
const BROADCAST_MS = 50;
const MAP_W = 3000;
const MAP_H = 3000;
const WALL_T = 16;
const PLAYER_R = 13;
const PLAYER_SPEED = 3.2;
const BULLET_SPEED = 10;
const BULLET_LIFE = 1100;
const SHERIFF_COOLDOWN = 5000;
const ROOM_CAPACITY = 15;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  perMessageDeflate: false
});

app.use(express.static(path.join(__dirname)));

const COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
  "#1abc9c", "#e67e22", "#607d8b", "#e91e63", "#00bcd4",
  "#8bc34a", "#ff5722", "#cddc39", "#795548", "#ffc107",
  "#9c27b0", "#3f51b5", "#009688", "#ff9800", "#673ab7"
];

const BOT_NAMES = [
  "BotAli", "BotVeli", "BotHasan", "BotHüseyin", "BotMehmet", "BotAhmet", "BotAyşe", "BotFatma", "BotZeynep", "BotElif",
  "BotCan", "BotDeniz", "BotEce", "Botİrem", "BotKaan", "BotMert", "BotOğuz", "BotSelin", "BotYusuf", "BotZara"
];

const rooms = new Map();

function randomId() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function roleShuffle(players) {
  const ids = [...players.keys()];
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

function normalize(vx, vy) {
  const l = Math.hypot(vx, vy) || 1;
  return { x: vx / l, y: vy / l };
}

function buildMap() {
  const walls = [];
  walls.push({ x: 0, y: 0, w: MAP_W, h: WALL_T });
  walls.push({ x: 0, y: MAP_H - WALL_T, w: MAP_W, h: WALL_T });
  walls.push({ x: 0, y: 0, w: WALL_T, h: MAP_H });
  walls.push({ x: MAP_W - WALL_T, y: 0, w: WALL_T, h: MAP_H });

  const cols = 7;
  const rows = 7;
  const cW = (MAP_W - 60) / cols;
  const cH = (MAP_H - 60) / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cx = 30 + col * cW + cW / 2;
      const cy = 30 + row * cH + cH / 2;
      const rw = 120 + Math.round(Math.random() * 160);
      const rh = 100 + Math.round(Math.random() * 140);
      const rx = Math.max(WALL_T + 20, Math.min(MAP_W - WALL_T - 20, cx - rw / 2));
      const ry = Math.max(WALL_T + 20, Math.min(MAP_H - WALL_T - 20, cy - rh / 2));
      const dw = 40 + Math.round(Math.random() * 20);
      const dh = 40 + Math.round(Math.random() * 20);
      const doorSide = Math.floor(Math.random() * 4);
      
      let dtx, qty, d_y, drx, dry;
      if (doorSide === 0) {
        dtx = rx + rw / 2 - dw / 2;
        qty = ry;
        walls.push({ x: rx, y: ry, w: Math.max(0, dtx - rx), h: WALL_T });
        walls.push({ x: dtx + dw, y: ry, w: Math.max(0, rx + rw - dtx - dw), h: WALL_T });
        walls.push({ x: rx, y: ry + rh - WALL_T, w: rw, h: WALL_T });
      } else if (doorSide === 1) {
        qty = ry + rh / 2 - dh / 2;
        drx = rx + rw - WALL_T;
        walls.push({ x: rx, y: ry, w: rw, h: WALL_T });
        walls.push({ x: rx, y: ry + rh - WALL_T, w: rw, h: WALL_T });
        walls.push({ x: rx, y: ry, w: WALL_T, h: Math.max(0, qty - ry) });
        walls.push({ x: rx, y: qty + dh, w: WALL_T, h: Math.max(0, ry + rh - qty - dh) });
      } else if (doorSide === 2) {
        dtx = rx + rw / 2 - dw / 2;
        walls.push({ x: rx, y: ry, w: rw, h: WALL_T });
        walls.push({ x: rx, y: ry + rh - WALL_T, w: Math.max(0, dtx - rx), h: WALL_T });
        walls.push({ x: dtx + dw, y: ry + rh - WALL_T, w: Math.max(0, rx + rw - dtx - dw), h: WALL_T });
      } else {
        qty = ry + rh / 2 - dh / 2;
        walls.push({ x: rx, y: ry, w: rw, h: WALL_T });
        walls.push({ x: rx, y: ry + rh - WALL_T, w: rw, h: WALL_T });
        walls.push({ x: rx + rw - WALL_T, y: ry, w: WALL_T, h: Math.max(0, qty - ry) });
        walls.push({ x: rx + rw - WALL_T, y: qty + dh, w: WALL_T, h: Math.max(0, ry + rh - qty - dh) });
      }
      walls.push({ x: rx, y: ry, w: WALL_T, h: rh });
      walls.push({ x: rx + rw - WALL_T, y: ry, w: WALL_T, h: rh });
    }
  }

  return walls.filter((w) => w.w > 0 && w.h > 0);


function circleRectOverlap(x, y, radius, rect) {
  const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

function resolveCircleRect(body, rect) {
  if (!circleRectOverlap(body.x, body.y, PLAYER_R, rect)) return;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const ox = (PLAYER_R + rect.w / 2) - Math.abs(body.x - cx);
  const oy = (PLAYER_R + rect.h / 2) - Math.abs(body.y - cy);
  if (ox < oy) body.x += Math.sign(body.x - cx || 1) * ox;
  else body.y += Math.sign(body.y - cy || 1) * oy;
}

function resolveWalls(room, body) {
  for (let i = 0; i < 6; i += 1) {
    for (const w of room.walls) resolveCircleRect(body, w);
    body.x = Math.max(WALL_T + PLAYER_R, Math.min(MAP_W - WALL_T - PLAYER_R, body.x));
    body.y = Math.max(WALL_T + PLAYER_R, Math.min(MAP_H - WALL_T - PLAYER_R, body.y));
  }
}

function nearbyPlayerCount(room, x, y, radius, excludeIds = new Set()) {
  let count = 0;
  room.players.forEach((p, id) => {
    if (excludeIds.has(id) || !p.alive) return;
    if (Math.hypot(p.x - x, p.y - y) <= radius) count += 1;
  });
  return count;
}

function findBestVictim(room, killerId) {
  const killer = room.players.get(killerId);
  if (!killer) return null;
  let best = null;
  let bestScore = Infinity;
  room.players.forEach((p, id) => {
    if (id === killerId || !p.alive || p.role === "katil") return;
    const dist = Math.hypot(killer.x - p.x, killer.y - p.y);
    const witnesses = nearbyPlayerCount(room, p.x, p.y, PLAYER_R * 4, new Set([killerId, id]));
    const score = dist + witnesses * 200 + (p.role === "serif" ? 120 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = { id, player: p, dist, witnesses };
    }
  });
  return best;
}

function chooseWanderTarget(p) {
  const dir = Math.floor(Math.random() * 4);
  return {
    x: p.x + (dir === 2 ? -160 : dir === 3 ? 160 : 0),
    y: p.y + (dir === 0 ? -160 : dir === 1 ? 160 : 0)
  };
}

function touchesAny(room, x, y) {
  if (x < WALL_T + PLAYER_R || x > MAP_W - WALL_T - PLAYER_R) return true;
  if (y < WALL_T + PLAYER_R || y > MAP_H - WALL_T - PLAYER_R) return true;
  return room.walls.some((w) => circleRectOverlap(x, y, PLAYER_R, w));
}

function spawnPosition(room) {
  for (let t = 0; t < 2000; t += 1) {
    const x = WALL_T + PLAYER_R + Math.random() * (MAP_W - 2 * (WALL_T + PLAYER_R));
    const y = WALL_T + PLAYER_R + Math.random() * (MAP_H - 2 * (WALL_T + PLAYER_R));
    if (!touchesAny(room, x, y)) return { x, y };
  }
  return { x: MAP_W / 2, y: MAP_H / 2 };
}

function addLog(room, text) {
  room.logs.push({ at: Date.now(), text });
  if (room.logs.length > 8) room.logs.shift();
}

function markWitnesses(room, killerId, x, y) {
  const radius = 180;
  room.players.forEach((p, id) => {
    if (!p.alive || id === killerId || p.role === "katil") return;
    if (!p.isBot) return;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= radius) {
      p.suspectedTargetId = killerId;
      p.lastSuspectedAt = Date.now();
    }
  });
}

function dropGun(room, x, y) {
  room.gunPickups.push({ x, y, createdAt: Date.now() });
}

function createRoom(hostSocketId) {
  const roomId = randomId();
  const room = {
    id: roomId,
    hostSocketId,
    status: "lobby",
    players: new Map(),
    bullets: [],
    gunPickups: [],
    walls: buildMap(),
    logs: [],
    startedAt: 0,
    capacity: ROOM_CAPACITY
  };
  rooms.set(roomId, room);
  return room;
}

function roomSnapshot(room) {
  const players = [];
  room.players.forEach((p, socketId) => {
    const isLobby = room.status === "lobby";
    players.push({
      socketId,
      name: p.name,
      x: p.x,
      y: p.y,
      role: isLobby ? null : p.role,
      alive: p.alive,
      color: p.color,
      suspectId: p.suspectId || null,
      sheriffCooldownLeft: Math.max(0, SHERIFF_COOLDOWN - (Date.now() - p.lastShotAt))
    });
  });

  return {
    roomId: room.id,
    status: room.status,
    capacity: room.capacity,
    hostSocketId: room.hostSocketId,
    map: { w: MAP_W, h: MAP_H, walls: room.walls },
    players,
    bullets: room.bullets.map((b) => ({ x: b.x, y: b.y })),
    gunPickups: room.gunPickups.map((g) => ({ x: g.x, y: g.y })),
    logs: room.logs
  };
}

function checkWin(room) {
  if (room.status !== "running") return;
  const alive = [...room.players.values()].filter((p) => p.alive);
  const killerAlive = alive.some((p) => p.role === "katil");
  const nonKillerAlive = alive.filter((p) => p.role !== "katil").length;
  if (!killerAlive) {
    room.status = "finished";
    addLog(room, "Katil elendi. Masumlar kazandi.");
  } else if (nonKillerAlive === 0) {
    room.status = "finished";
    addLog(room, "Katil herkesi eledi.");
  }
}

function killPlayer(room, victimSocketId, killerSocketId) {
  const victim = room.players.get(victimSocketId);
  const killer = room.players.get(killerSocketId);
  if (!victim || !killer || !victim.alive || !killer.alive) return;

  victim.alive = false;
  addLog(room, `${victim.name} elendi.`);
  markWitnesses(room, killerSocketId, victim.x, victim.y);

  if (victim.role === "serif") {
    dropGun(room, victim.x, victim.y);
    addLog(room, "Serif dustu, tabanca yere dustu.");
  }

  if (killer.role === "serif" && victim.role !== "katil") {
    killer.alive = false;
    dropGun(room, killer.x, killer.y);
    addLog(room, `${killer.name} masumu vurdu ve elendi.`);
  }

  checkWin(room);
}

function startMatch(room) {
  if (room.status !== "lobby") return false;
  if (room.players.size < room.capacity) return false;

  room.status = "running";
  room.startedAt = Date.now();
  room.bullets = [];
  room.gunPickups = [];

  const order = roleShuffle(room.players);
  room.players.forEach((p) => {
    p.role = "masum";
    p.alive = true;
    p.input = { up: false, down: false, left: false, right: false };
    p.lastShotAt = 0;
    const sp = spawnPosition(room);
    p.x = sp.x;
    p.y = sp.y;
  });
  if (order.length > 0) room.players.get(order[0]).role = "katil";
  if (order.length > 1) room.players.get(order[1]).role = "serif";

  addLog(room, `Mac basladi. Oyuncu: ${room.players.size}`);
  return true;
}

function tryAutoStartIfFull(room) {
  if (room.status !== "lobby") return false;
  if (room.players.size < room.capacity) return false;
  const started = startMatch(room);
  if (started) addLog(room, "Oda doldu. Oyun otomatik baslatildi.");
  return started;
}

function broadcastRoom(room) {
  io.to(room.id).emit("state", roomSnapshot(room));
}

function openRoomsSnapshot() {
  const list = [];
  rooms.forEach((room) => {
    if (room.status !== "lobby") return;
    const host = room.players.get(room.hostSocketId);
    list.push({
      roomId: room.id,
      players: room.players.size,
      capacity: room.capacity,
      hostName: host ? host.name : "Host"
    });
  });
  list.sort((a, b) => b.players - a.players);
  return list;
}

function broadcastOpenRooms() {
  io.emit("openRooms", openRoomsSnapshot());
}

io.on("connection", (socket) => {
  socket.emit("openRooms", openRoomsSnapshot());

  socket.on("createRoom", ({ name }, cb) => {
    const room = createRoom(socket.id);
    socket.join(room.id);
    room.players.set(socket.id, {
      name: (name || "Oyuncu").slice(0, 14),
      color: COLORS[0],
      x: MAP_W / 2,
      y: MAP_H / 2,
      role: null,
      alive: true,
      input: { up: false, down: false, left: false, right: false },
      lastShotAt: 0
    });
    cb({ ok: true, roomId: room.id });
    broadcastRoom(room);
    broadcastOpenRooms();
  });

  socket.on("joinRoom", ({ roomId, name }, cb) => {
    const room = rooms.get((roomId || "").toUpperCase());
    if (!room) return cb({ ok: false, message: "Oda bulunamadi." });
    if (room.status !== "lobby") return cb({ ok: false, message: "Mac baslamis." });
    if (room.players.size >= room.capacity) return cb({ ok: false, message: "Oda dolu." });

    socket.join(room.id);
    const idx = room.players.size % COLORS.length;
    const sp = spawnPosition(room);
    room.players.set(socket.id, {
      name: (name || `Oyuncu${idx + 1}`).slice(0, 14),
      color: COLORS[idx],
      x: sp.x,
      y: sp.y,
      role: null,
      alive: true,
      input: { up: false, down: false, left: false, right: false },
      lastShotAt: 0
    });
    cb({ ok: true, roomId: room.id });
    tryAutoStartIfFull(room);
    broadcastRoom(room);
    broadcastOpenRooms();
  });

  socket.on("startMatch", ({ roomId }) => {
    const room = rooms.get((roomId || "").toUpperCase());
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.players.size < room.capacity) {
      io.to(socket.id).emit("info", {
        text: `Oda dolmadan baslatamazsin (${room.players.size}/${room.capacity}).`
      });
      return;
    }
    if (startMatch(room)) broadcastRoom(room);
    broadcastOpenRooms();
  });

  socket.on("fillWithBots", ({ roomId }) => {
    const room = rooms.get((roomId || "").toUpperCase());
    if (!room || room.hostSocketId !== socket.id || room.status !== "lobby") return;
    let botCount = 1;
    while (room.players.size < room.capacity) {
      const botId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${botCount++}`;
      const idx = room.players.size % COLORS.length;
      const nameIdx = room.players.size % BOT_NAMES.length;
      const sp = spawnPosition(room);
      room.players.set(botId, {
        name: BOT_NAMES[nameIdx],
        color: COLORS[idx],
        x: sp.x,
        y: sp.y,
        role: null,
        alive: true,
        input: { up: false, down: false, left: false, right: false },
        lastShotAt: 0,
        isBot: true
      });
    }
    tryAutoStartIfFull(room);
    broadcastRoom(room);
    broadcastOpenRooms();
  });

  socket.on("requestOpenRooms", () => {
    socket.emit("openRooms", openRoomsSnapshot());
  });

  socket.on("input", ({ roomId, input }) => {
    const room = rooms.get((roomId || "").toUpperCase());
    if (!room || room.status !== "running") return;
    const p = room.players.get(socket.id);
    if (!p) return;
    p.input = {
      up: Boolean(input?.up),
      down: Boolean(input?.down),
      left: Boolean(input?.left),
      right: Boolean(input?.right)
    };
  });

  socket.on("killerAttack", ({ roomId }) => {
    const room = rooms.get((roomId || "").toUpperCase());
    if (!room || room.status !== "running") return;
    const killer = room.players.get(socket.id);
    if (!killer || !killer.alive || killer.role !== "katil") return;
    let victimId = null;
    let closest = Infinity;
    room.players.forEach((p, id) => {
      if (id === socket.id || !p.alive) return;
      const d = Math.hypot(killer.x - p.x, killer.y - p.y);
      if (d < PLAYER_R * 2.4 && d < closest) {
        victimId = id;
        closest = d;
      }
    });
    if (victimId) {
      killPlayer(room, victimId, socket.id);
      broadcastRoom(room);
    }
  });

  socket.on("sheriffShoot", ({ roomId, angle }) => {
    const room = rooms.get((roomId || "").toUpperCase());
    if (!room || room.status !== "running") return;
    const p = room.players.get(socket.id);
    if (!p || !p.alive || p.role !== "serif") return;
    if (Date.now() - p.lastShotAt < SHERIFF_COOLDOWN) return;
    p.lastShotAt = Date.now();
    room.bullets.push({
      x: p.x,
      y: p.y,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      shooter: socket.id,
      bornAt: Date.now()
    });
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      if (!room.players.has(socket.id)) continue;
      room.players.delete(socket.id);
      if (room.players.size === 0) {
        rooms.delete(room.id);
        continue;
      }
      if (room.hostSocketId === socket.id) {
        room.hostSocketId = room.players.keys().next().value;
      }
      if (room.status === "running") checkWin(room);
      broadcastRoom(room);
      broadcastOpenRooms();
    }
  });
});

setInterval(() => {
  const now = Date.now();
  rooms.forEach((room) => {
    if (room.status !== "running") return;

    room.players.forEach((p) => {
      if (!p.alive) return;
      const dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
      const dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
      if (dx !== 0 || dy !== 0) {
        const n = normalize(dx, dy);
        p.x += n.x * PLAYER_SPEED;
        p.y += n.y * PLAYER_SPEED;
      }
      resolveWalls(room, p);
    });

    // Bot AI
    room.players.forEach((p, id) => {
      if (!p.isBot || !p.alive) return;
      let targetX = p.x;
      let targetY = p.y;
      const suspectId = p.suspectedTargetId && room.players.has(p.suspectedTargetId) ? p.suspectedTargetId : null;
      if (suspectId) {
        const suspect = room.players.get(suspectId);
        if (suspect && suspect.alive) {
          targetX = suspect.x;
          targetY = suspect.y;
          if (Date.now() - (p.lastSuspectedAt || 0) > 12000) {
            p.suspectedTargetId = null;
          }
        } else {
          p.suspectedTargetId = null;
        }
      }
      if (p.role === "katil") {
        const target = findBestVictim(room, id);
        if (target) {
          targetX = target.player.x;
          targetY = target.player.y;
          if (target.dist < PLAYER_R * 3.5) {
            if (target.witnesses > 0) {
              p.input = { up: false, down: false, left: false, right: false };
              return;
            }
            killPlayer(room, target.id, id);
            return;
          }
        }
        if (Math.random() < 0.06) {
          const wander = chooseWanderTarget(p);
          targetX = wander.x;
          targetY = wander.y;
        }
      } else if (p.role === "masum") {
        if (!suspectId) {
          let killer = null;
          room.players.forEach((other) => {
            if (other.role === "katil" && other.alive) killer = other;
          });
          if (killer) {
            const distToKiller = Math.hypot(p.x - killer.x, p.y - killer.y);
            if (distToKiller < 420) {
              const dx = p.x - killer.x;
              const dy = p.y - killer.y;
              const len = Math.hypot(dx, dy) || 1;
              targetX = p.x + (dx / len) * 220;
              targetY = p.y + (dy / len) * 220;
            }
          }
          if (Math.random() < 0.08) {
            const wander = chooseWanderTarget(p);
            targetX = wander.x;
            targetY = wander.y;
          }
        }
        const oldX = p.x;
        const oldY = p.y;
        const dx = targetX - p.x;
        const dy = targetY - p.y;
        if (Math.hypot(dx, dy) > 10) {
          const n = normalize(dx, dy);
          p.x += n.x * PLAYER_SPEED;
          p.y += n.y * PLAYER_SPEED;
        }
        resolveWalls(room, p);
        if (Math.hypot(p.x - oldX, p.y - oldY) < 1) {
          const wander = chooseWanderTarget(p);
          targetX = wander.x;
          targetY = wander.y;
        }
        return;
      } else if (p.role === "serif") {
        for (let i = room.gunPickups.length - 1; i >= 0; i -= 1) {
          const g = room.gunPickups[i];
          if (Math.hypot(p.x - g.x, p.y - g.y) < 30) {
            p.role = "serif";
            p.lastShotAt = 0;
            room.gunPickups.splice(i, 1);
            addLog(room, `${p.name} tabancayi aldi, yeni serif oldu.`);
          }
        }
        let killerId = null;
        room.players.forEach((other, oid) => {
          if (other.role === "katil" && other.alive) killerId = oid;
        });
        if (killerId) {
          const killer = room.players.get(killerId);
          targetX = killer.x;
          targetY = killer.y;
          const d = Math.hypot(p.x - killer.x, p.y - killer.y);
          if (d < 240 && Date.now() - p.lastShotAt >= SHERIFF_COOLDOWN) {
            const angle = Math.atan2(killer.y - p.y, killer.x - p.x);
            p.lastShotAt = Date.now();
            room.bullets.push({
              x: p.x,
              y: p.y,
              vx: Math.cos(angle) * BULLET_SPEED,
              vy: Math.sin(angle) * BULLET_SPEED,
              shooter: id,
              bornAt: Date.now()
            });
          }
        } else if (room.gunPickups.length > 0) {
          const g = room.gunPickups[0];
          targetX = g.x;
          targetY = g.y;
        } else if (Math.random() < 0.04) {
          const wander = chooseWanderTarget(p);
          targetX = wander.x;
          targetY = wander.y;
        }
      }
      const dx = targetX - p.x;
      const dy = targetY - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 10) {
        p.input = {
          up: dy < 0,
          down: dy > 0,
          left: dx < 0,
          right: dx > 0
        };
      } else {
        p.input = { up: false, down: false, left: false, right: false };
      }
    });

    for (let i = room.gunPickups.length - 1; i >= 0; i -= 1) {
      const g = room.gunPickups[i];
      let picked = false;
      room.players.forEach((p) => {
        if (picked || !p.alive || p.role !== "masum") return;
        if (Math.hypot(p.x - g.x, p.y - g.y) < 30) {
          p.role = "serif";
          p.lastShotAt = 0;
          room.gunPickups.splice(i, 1);
          addLog(room, `${p.name} tabancayi aldi, yeni serif oldu.`);
          picked = true;
        }
      });
    }

    for (let i = room.bullets.length - 1; i >= 0; i -= 1) {
      const b = room.bullets[i];
      if (now - b.bornAt > BULLET_LIFE) {
        room.bullets.splice(i, 1);
        continue;
      }
      b.x += b.vx;
      b.y += b.vy;
      if (b.x < 0 || b.x > MAP_W || b.y < 0 || b.y > MAP_H) {
        room.bullets.splice(i, 1);
        continue;
      }
      if (room.walls.some((w) => b.x > w.x && b.x < w.x + w.w && b.y > w.y && b.y < w.y + w.h)) {
        room.bullets.splice(i, 1);
        continue;
      }
      let hit = false;
      room.players.forEach((p, id) => {
        if (hit || id === b.shooter || !p.alive) return;
        if (Math.hypot(p.x - b.x, p.y - b.y) <= PLAYER_R) {
          killPlayer(room, id, b.shooter);
          hit = true;
          broadcastRoom(room);
        }
      });
      if (hit) room.bullets.splice(i, 1);
    }
  });
}, TICK_MS);

setInterval(() => {
  rooms.forEach((room) => broadcastRoom(room));
}, BROADCAST_MS);

server.listen(PORT, () => {
  console.log(`Ghost Ball Online server on :${PORT}`);
});
