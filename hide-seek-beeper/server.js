const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const webpush = require('web-push');
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const PUSH_READY = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
if (PUSH_READY) webpush.setVapidDetails('mailto:' + (process.env.VAPID_EMAIL || 'admin@example.com'), VAPID_PUBLIC, VAPID_PRIVATE);
else console.warn('Web Push disabled: configure VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();
const DEFAULT_HIDE_SECONDS = 120;
const MIN_HIDE_SECONDS = 15;
const MAX_HIDE_SECONDS = 900;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() {
  let c;
  do { c = Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); } while (rooms.has(c));
  return c;
}
function phase(room) {
  if (!room.startedAt) return 'lobby';
  if (Date.now() < room.startedAt + room.hideSeconds * 1000) return 'hiding';
  return room.finishedAt ? 'finished' : 'seeking';
}
function summary(room) {
  return {
    code: room.code, host: room.host, startedAt: room.startedAt,
    hideEndsAt: room.startedAt ? room.startedAt + room.hideSeconds * 1000 : null,
    finishedAt: room.finishedAt, drawn: room.drawn, seekerCount: room.seekerCount, hideSeconds: room.hideSeconds,
    phase: phase(room), serverTime: Date.now(),
    players: [...room.players.values()].map(({ id, name, role }) => ({ id, name, role }))
  };
}
function broadcast(room) { io.to(room.code).emit('state', summary(room)); }
function reply(cb, data) { if (typeof cb === 'function') cb(data); }
function getRoom(socket) { const room = rooms.get(socket.data.room); return room?.players.has(socket.data.playerId) ? room : null; }
function playerId(socket) { return socket.data.playerId; }
function attach(socket, room, player) { socket.data.room=room.code; socket.data.playerId=player.id; player.socketId=socket.id; socket.join(room.code); }
async function sendPush(player, room) {
  if (!PUSH_READY || !player.subscription) return;
  try { await webpush.sendNotification(player.subscription, JSON.stringify({ title: '🔊 Hide & Beep', body: 'The seekers sent a beep! Your hiding spot may be revealed.', url: '/', tag: 'beep-' + Date.now() }), { TTL: 30, urgency: 'high' }); }
  catch (err) { if ([404,410].includes(err.statusCode)) player.subscription=null; console.warn('Push failed:', err.statusCode || err.message); }
}
app.get('/api/push-config', (_, res) => res.json({ enabled: PUSH_READY, publicKey: VAPID_PUBLIC }));
function tidyName(name) { return typeof name === 'string' ? name.trim().slice(0, 24) : ''; }
app.use(express.static(path.join(__dirname, 'public')));
io.on('connection', socket => {
  socket.on('create', ({ name } = {}, cb) => {
    if (socket.data.room) return reply(cb, { error: 'Already in a game. Refresh to start a new one.' });
    const cleanName = tidyName(name);
    if (!cleanName) return reply(cb, { error: 'Enter your name first.' });
    const room = { code: makeCode(), host: null, players: new Map(), startedAt: null, finishedAt: null, lastBeep: 0, drawn: false, seekerCount: 1, hideSeconds: DEFAULT_HIDE_SECONDS };
    const player = { id: crypto.randomUUID(), token: crypto.randomBytes(24).toString('hex'), name: cleanName, role: 'hider', subscription: null };
    room.players.set(player.id, player); room.host=player.id;
    rooms.set(room.code, room); attach(socket, room, player);
    reply(cb, { ok: true, id: player.id, token: player.token, ...summary(room) });
  });
  socket.on('join', ({ name, code } = {}, cb) => {
    if (socket.data.room) return reply(cb, { error: 'Already in a game. Refresh to join another.' });
    const cleanName = tidyName(name);
    if (!cleanName) return reply(cb, { error: 'Enter your name before joining.' });
    const room = rooms.get(String(code || '').toUpperCase().replace(/\s/g, ''));
    if (!room) return reply(cb, { error: 'Room not found. Check the code.' });
    if (room.startedAt) return reply(cb, { error: 'This round has already started. Join the next game.' });
    if (room.players.size >= 30) return reply(cb, { error: 'Room is full.' });
    const player = { id: crypto.randomUUID(), token: crypto.randomBytes(24).toString('hex'), name: cleanName, role: 'hider', subscription: null };
    room.players.set(player.id, player);
    room.drawn = false; for (const player of room.players.values()) player.role = 'hider';
    attach(socket, room, player);
    reply(cb, { ok: true, id: player.id, token: player.token, ...summary(room) }); broadcast(room);
  });
  socket.on('resume', ({ code, id, token } = {}, cb) => {
    if (socket.data.room) return reply(cb, { error: 'Already in a room.' });
    const room=rooms.get(String(code||'').toUpperCase());
    const player=room?.players.get(String(id||''));
    if (!room || !player || player.token !== token) return reply(cb, { error: 'Old room unavailable. Please create or join a new room.' });
    if (player.socketId) { const other=io.sockets.sockets.get(player.socketId); if (other) { other.data.room=null; other.data.playerId=null; other.leave(room.code); other.disconnect(true); } }
    attach(socket,room,player); reply(cb,{ ok:true, id:player.id,token:player.token,...summary(room) }); broadcast(room);
  });
  socket.on('subscribePush', ({ subscription } = {}, cb) => {
    const room=getRoom(socket);
    if (!room) return reply(cb,{error:'Join a game first.'});
    if (!PUSH_READY) return reply(cb,{error:'Host has not configured push notification keys.'});
    if (!subscription || typeof subscription.endpoint!=='string' || !subscription.endpoint.startsWith('https://') || !subscription.keys?.p256dh || !subscription.keys?.auth) return reply(cb,{error:'Invalid push subscription.'});
    room.players.get(playerId(socket)).subscription=subscription;
    reply(cb,{ok:true});
  });
  socket.on('draw', ({ count } = {}, cb) => {
    const room = getRoom(socket);
    if (!room || room.host !== playerId(socket)) return reply(cb, { error: 'Only the host can spin the wheel.' });
    if (room.startedAt) return reply(cb, { error: 'The round already started.' });
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n >= room.players.size) return reply(cb, { error: 'Choose at least 1 seeker and leave at least 1 hider.' });
    // Cryptographically secure Fisher-Yates shuffle; selection is authoritative on the server.
    const shuffled = [...room.players.values()];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const player of room.players.values()) player.role = 'hider';
    const selected = shuffled.slice(0, n);
    for (const player of selected) player.role = 'seeker';
    room.seekerCount = n;
    room.drawn = true;
    broadcast(room);
    io.to(room.code).emit('drawResult', { selected: selected.map(p => ({ id: p.id, name: p.name })) });
    reply(cb, { ok: true });
  });
  socket.on('setHideTime', ({ seconds } = {}, cb) => {
    const room = getRoom(socket);
    if (!room || room.host !== playerId(socket)) return reply(cb, { error: 'Only the host can change the hide time.' });
    if (room.startedAt) return reply(cb, { error: 'You cannot change the time after the round starts.' });
    const n = Number(seconds);
    if (!Number.isInteger(n) || n < MIN_HIDE_SECONDS || n > MAX_HIDE_SECONDS) return reply(cb, { error: 'Choose between 15 seconds and 15 minutes.' });
    room.hideSeconds = n;
    broadcast(room); reply(cb, { ok: true });
  });
  socket.on('go', (_, cb) => {
    const room = getRoom(socket);
    if (!room || playerId(socket) !== room.host) return reply(cb, { error: 'Only the host can start.' });
    if (room.startedAt) return reply(cb, { error: 'Round already started.' });
    if (room.players.size < 2) return reply(cb, { error: 'At least one friend must join first.' });
    if (!room.drawn) return reply(cb, { error: 'Spin the wheel to select seekers first.' });
    room.startedAt = Date.now(); broadcast(room); reply(cb, { ok: true });
  });
  socket.on('found', ({ playerId } = {}, cb) => {
    const room = getRoom(socket);
    if (!room || room.players.get(playerId(socket))?.role !== 'seeker') return reply(cb, { error: 'Only seekers can find players.' });
    if (phase(room) !== 'seeking') return reply(cb, { error: 'Wait until the hiding countdown finishes.' });
    const player = room.players.get(String(playerId));
    if (!player || player.role !== 'hider') return reply(cb, { error: 'Player already found or left.' });
    player.role = 'seeker';
    if (![...room.players.values()].some(p => p.role === 'hider')) room.finishedAt = Date.now();
    broadcast(room); reply(cb, { ok: true });
  });
  socket.on('beep', (_, cb) => {
    const room = getRoom(socket);
    if (!room || room.players.get(playerId(socket))?.role !== 'seeker') return reply(cb, { error: 'Only seekers can beep.' });
    if (phase(room) !== 'seeking') return reply(cb, { error: 'Beeping is available after hiding time ends.' });
    const now = Date.now();
    if (now - room.lastBeep < 10000) return reply(cb, { error: 'Wait 10 seconds between beeps.' });
    room.lastBeep = now;
    let count = 0;
    for (const player of room.players.values()) if (player.role === 'hider') { if (player.socketId) io.to(player.socketId).emit('beep', { duration: 5000 }); void sendPush(player, room); count++; }
    reply(cb, { ok: true, count });
  });
  socket.on('disconnect', () => {
    const room = getRoom(socket); if (!room) return;
    const player = room.players.get(playerId(socket));
    if (player?.socketId === socket.id) { player.socketId = null; broadcast(room); }
    // Locked phones commonly disconnect. Keep membership until server restart,
    // so returning players can resume via their private token.
  });
});
server.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('Hide & Beep running'));
