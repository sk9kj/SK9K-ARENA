const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
const db = new Database(path.join(__dirname, 'sk9k-arena.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    coins INTEGER NOT NULL DEFAULT 0,
    elo INTEGER NOT NULL DEFAULT 1000,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '8kb' }));
app.use(express.static(path.join(__dirname, 'public')));
const sessions = new Map(); // token -> user id; local prototype only
const sockets = new Map();  // ws -> player
const players = new Map();  // user id -> player state
const WORLD = { w: 2400, h: 1600 };
const MAX_ORBS = 180;
let nextOrbId = 1;
let tick = 0;

function validUsername(name) {
  return typeof name === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(name);
}
function publicUser(row) {
  return { id: row.id, username: row.username, coins: row.coins, elo: row.elo };
}
function tokenFor(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, userId);
  return token;
}
function authToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}
function userFromToken(token) {
  const id = sessions.get(token);
  return id ? db.prepare('SELECT id, username, coins, elo FROM users WHERE id=?').get(id) : null;
}
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!validUsername(username)) return res.status(400).json({ error: 'Pseudo invalide : 3 à 16 caractères, lettres, chiffres et _ uniquement.' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 72)
    return res.status(400).json({ error: 'Le mot de passe doit contenir entre 8 et 72 caractères.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    const row = db.prepare('SELECT id, username, coins, elo FROM users WHERE id=?').get(result.lastInsertRowid);
    const token = tokenFor(row.id);
    res.json({ token, user: publicUser(row) });
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé.' });
    console.error(e); res.status(500).json({ error: 'Erreur serveur.' });
  }
});
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Pseudo et mot de passe requis.' });
  const row = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) return res.status(401).json({ error: 'Identifiants incorrects.' });
  const token = tokenFor(row.id);
  res.json({ token, user: publicUser(row) });
});
app.post('/api/logout', (req, res) => {
  const token = authToken(req);
  const id = sessions.get(token);
  sessions.delete(token);
  if (id) {
    const p = players.get(id);
    if (p) { players.delete(id); if (p.ws) sockets.delete(p.ws); }
  }
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  const user = userFromToken(authToken(req));
  if (!user) return res.status(401).json({ error: 'Session expirée.' });
  res.json({ user: publicUser(user) });
});
app.get('/api/health', (req, res) => res.json({ ok: true, players: [...players.values()].filter(p => !p.bot).length, uptime: Math.round(process.uptime()) }));

function rand(min, max) { return min + Math.random() * (max - min); }
const orbs = [];
function spawnOrb() {
  orbs.push({ id: nextOrbId++, x: rand(35, WORLD.w - 35), y: rand(35, WORLD.h - 35), r: rand(4, 8), hue: Math.floor(rand(170, 320)), value: 7 });
}
for (let i = 0; i < MAX_ORBS; i++) spawnOrb();
function spawnPlayer(user, ws, bot = false) {
  return {
    id: bot ? `bot-${user.id}` : String(user.id), userId: user.id, username: user.username,
    ws, bot, x: rand(200, WORLD.w - 200), y: rand(200, WORLD.h - 200),
    angle: rand(-Math.PI, Math.PI), targetAngle: 0, speed: 150, baseSpeed: 150,
    health: 100, maxHealth: 100, boost: false, alive: true, radius: 13,
    color: bot ? '#ffb84d' : (user.username.toLowerCase() === 'sk9k' ? '#f4ce62' : `hsl(${Math.floor(rand(0, 360))} 85% 62%)`),
    trail: [], lastInput: 0, lastSend: 0, respawnAt: 0, coins: user.coins || 0, elo: user.elo || 1000
  };
}
function removePlayer(p) {
  if (!p) return;
  players.delete(p.userId);
  if (p.ws) sockets.delete(p.ws);
}
function ensureBots() {
  // One explicitly labelled training bot keeps the local prototype playable.
  const hasBot = [...players.values()].some(p => p.bot);
  if (!hasBot) {
    const botUser = { id: -1, username: 'BOT • Training', coins: 0, elo: 0 };
    const bot = spawnPlayer(botUser, null, true);
    bot.userId = -1;
    players.set(-1, bot);
  }
}
function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function snapshot() {
  return {
    type: 'state', world: WORLD, tick,
    players: [...players.values()].map(p => ({
      id: p.id, username: p.username, x: p.x, y: p.y, angle: p.angle,
      health: p.health, maxHealth: p.maxHealth, alive: p.alive, radius: p.radius,
      color: p.color, boost: p.boost, bot: p.bot, elo: p.elo, coins: p.coins,
      crown: !p.bot && p.username.toLowerCase() === 'sk9k',
      trail: p.trail.slice(-20)
    })),
    orbs: orbs.map(o => ({ id: o.id, x: o.x, y: o.y, r: o.r, hue: o.hue }))
  };
}
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws') return socket.destroy();
  const token = url.searchParams.get('token') || '';
  const user = userFromToken(token);
  if (!user) return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req, user));
});
wss.on('connection', (ws, req, user) => {
  // A second connection for the same account replaces the first.
  const old = players.get(user.id);
  if (old && old.ws) { send(old.ws, { type: 'notice', message: 'Ce compte vient de se connecter ailleurs.' }); old.ws.close(); }
  const p = spawnPlayer(user, ws);
  players.set(user.id, p); sockets.set(ws, p);
  send(ws, { type: 'welcome', selfId: p.id, world: WORLD, username: p.username });
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'input') {
      const now = Date.now();
      if (now - p.lastInput < 25) return; // cap accepted inputs to ~40/s
      p.lastInput = now;
      if (Number.isFinite(msg.angle)) p.targetAngle = Math.max(-Math.PI, Math.min(Math.PI, msg.angle));
      p.boost = msg.boost === true && p.health > 15 && p.alive;
    }
  });
  ws.on('close', () => { if (players.get(user.id) === p) players.delete(user.id); sockets.delete(ws); });
  ws.on('error', () => { if (players.get(user.id) === p) players.delete(user.id); sockets.delete(ws); });
});
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function eliminate(p) {
  p.alive = false; p.boost = false; p.health = 0; p.respawnAt = Date.now() + 1800; p.trail = [];
}
function respawn(p) {
  p.x = rand(150, WORLD.w - 150); p.y = rand(150, WORLD.h - 150);
  p.angle = rand(-Math.PI, Math.PI); p.health = 100; p.alive = true; p.trail = [];
}
function step() {
  tick++;
  ensureBots();
  const now = Date.now();
  for (const p of players.values()) {
    if (!p.alive) { if (now >= p.respawnAt) respawn(p); continue; }
    if (p.bot) {
      p.targetAngle += rand(-0.055, 0.055);
      if (p.health > 45 && Math.random() < 0.008) p.boost = true;
      if (Math.random() < 0.02) p.boost = false;
    }
    const turn = wrapAngle(p.targetAngle - p.angle);
    p.angle += Math.max(-0.095, Math.min(0.095, turn));
    const boosting = p.boost && p.health > 15;
    const desired = p.baseSpeed * (boosting ? 1.75 : 1);
    p.speed += (desired - p.speed) * 0.12;
    const dt = 1 / 30;
    p.x = Math.max(p.radius, Math.min(WORLD.w - p.radius, p.x + Math.cos(p.angle) * p.speed * dt));
    p.y = Math.max(p.radius, Math.min(WORLD.h - p.radius, p.y + Math.sin(p.angle) * p.speed * dt));
    if (boosting) p.health = Math.max(15, p.health - 8 * dt);
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 90) p.trail.shift();
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i], dx = p.x - o.x, dy = p.y - o.y;
      if (dx * dx + dy * dy < (p.radius + o.r + 4) ** 2) {
        p.health = Math.min(p.maxHealth, p.health + o.value);
        if (!p.bot) {
          p.coins += 1;
          db.prepare('UPDATE users SET coins=? WHERE id=?').run(p.coins, p.userId);
        }
        orbs.splice(i, 1); spawnOrb();
      }
    }
  }
  const alive = [...players.values()].filter(p => p.alive);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      if (dx * dx + dy * dy < (a.radius + b.radius) ** 2) {
        // Deterministic collision outcome: both players are eliminated.
        eliminate(a); eliminate(b);
      }
    }
  }
  if (tick % 2 === 0) {
    const state = JSON.stringify(snapshot());
    for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN) ws.send(state);
  }
}
setInterval(step, 1000 / 30);
server.listen(PORT, () => console.log(`SK9K ARENA prêt : http://localhost:${PORT}`));
