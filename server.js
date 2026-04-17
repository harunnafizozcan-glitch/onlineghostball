const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3000);
const TICK_MS = 33;
const BROADCAST_MS = 50;
const MAP_W = 3000;
const MAP_H = 3000;
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
  "#8bc34a", "#ff5722", "#cddc39", "#795548", "#ffc107"
];
const NAMES = [
  "Kirmizi", "Mavi", "Yesil", "Sari", "Mor",
  "Turkuaz", "Turuncu", "Gri", "Pembe", "Camgobegi",
  "Fistik", "Mercan", "Lime", "Kahve", "Amber"
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

function createRoom(hostSocketId) {
  const roomId = randomId();
  const room = {
    id: roomId,
    hostSocketId,
    status: "lobby",
    players: new Map(),
    bullets: [],
    logs: [],
    startedAt: 0,
    capacity: ROOM_CAPACITY
  };
  rooms.set(roomId, room);
  return room;
}

function spawnPosition() {
  return {
    x: 80 + Math.random() * (MAP_W - 160),
    y: 80 + Math.random() * (MAP_H - 160)
  };
}

function addLog(room, text) {
  room.logs.push({ at: Date.now(), text });
  if (room.logs.length > 8) room.logs.shift();
}

function normalize(vx, vy) {
  const l = Math.hypot(vx, vy) || 1;
  return { x: vx / l, y: vy / l };
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
      sheriffCooldownLeft: Math.max(0, SHERIFF_COOLDOWN - (Date.now() - p.lastShotAt))
    });
  });
  return {
    roomId: room.id,
    status: room.status,
    capacity: room.capacity,
    hostSocketId: room.hostSocketId,
    map: { w: MAP_W, h: MAP_H },
    players,
    bullets: room.bullets.map((b) => ({ x: b.x, y: b.y })),
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
    addLog(room, "Katil oldu. Masumlar kazandi.");
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
  if (killer.role === "serif" && victim.role !== "katil") {
    killer.alive = false;
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
  const order = roleShuffle(room.players);
  room.players.forEach((p) => {
    p.role = "masum";
    p.alive = true;
    p.input = { up: false, down: false, left: false, right: false };
    p.lastShotAt = 0;
    const sp = spawnPosition();
    p.x = sp.x;
    p.y = sp.y;
  });
  if (order.length > 0) {
    room.players.get(order[0]).role = "katil";
  }
  if (order.length > 1) {
    room.players.get(order[1]).role = "serif";
  }
  addLog(room, `Mac basladi. Oyuncu: ${room.players.size}`);
  return true;
}

function tryAutoStartIfFull(room) {
  if (room.status !== "lobby") return false;
  if (room.players.size < room.capacity) return false;
  const started = startMatch(room);
  if (started) {
    addLog(room, "Oda doldu. Oyun otomatik baslatildi.");
  }
  return started;
}

function broadcastRoom(room) {
  const payload = roomSnapshot(room);
  io.to(room.id).emit("state", payload);
}

io.on("connection", (socket) => {
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
  });

  socket.on("joinRoom", ({ roomId, name }, cb) => {
    const room = rooms.get((roomId || "").toUpperCase());
    if (!room) {
      cb({ ok: false, message: "Oda bulunamadi." });
      return;
    }
    if (room.status !== "lobby") {
      cb({ ok: false, message: "Mac baslamis." });
      return;
    }
    if (room.players.size >= room.capacity) {
      cb({ ok: false, message: "Oda dolu." });
      return;
    }
    socket.join(room.id);
    const idx = room.players.size % COLORS.length;
    const sp = spawnPosition();
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
    const started = startMatch(room);
    if (started) broadcastRoom(room);
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
      if (d < PLAYER_R * 2.3 && d < closest) {
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
      p.x = Math.max(PLAYER_R, Math.min(MAP_W - PLAYER_R, p.x));
      p.y = Math.max(PLAYER_R, Math.min(MAP_H - PLAYER_R, p.y));
    });

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
      let hit = false;
      room.players.forEach((p, id) => {
        if (hit || id === b.shooter || !p.alive) return;
        if (Math.hypot(p.x - b.x, p.y - b.y) <= PLAYER_R) {
          killPlayer(room, id, b.shooter);
          hit = true;
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
