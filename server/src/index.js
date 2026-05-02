import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import { createRoom, getRoom, joinRoom, leaveRoom, applyAction, publicState } from './rooms.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST'] },
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// In production, serve the built client.
const clientDist = join(__dirname, '..', '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
}

io.on('connection', (socket) => {
  let currentRoomCode = null;

  const broadcastRoom = (code) => {
    const room = getRoom(code);
    if (!room) return;
    io.to(code).emit('room:state', publicState(room));
  };

  socket.on('room:create', ({ name, difficulty }, cb) => {
    const room = createRoom(difficulty);
    const player = joinRoom(room, socket.id, name);
    socket.join(room.code);
    currentRoomCode = room.code;
    cb?.({ ok: true, code: room.code, you: player, state: publicState(room) });
    broadcastRoom(room.code);
  });

  socket.on('room:join', ({ code, name }, cb) => {
    const room = getRoom(code);
    if (!room) return cb?.({ ok: false, error: 'Room not found' });
    const player = joinRoom(room, socket.id, name);
    if (!player) return cb?.({ ok: false, error: 'Room is full' });
    socket.join(room.code);
    currentRoomCode = room.code;
    cb?.({ ok: true, code: room.code, you: player, state: publicState(room) });
    broadcastRoom(room.code);
  });

  socket.on('game:action', (action) => {
    if (!currentRoomCode) return;
    const room = getRoom(currentRoomCode);
    if (!room) return;
    applyAction(room, action, socket.id);
    broadcastRoom(currentRoomCode);
  });

  // Throttled cursor updates from clients. We don't store much state — just relay.
  socket.on('cursor:move', ({ x, y }) => {
    if (!currentRoomCode) return;
    const room = getRoom(currentRoomCode);
    if (!room) return;
    const me = room.players.get(socket.id);
    if (!me) return;
    me.cursor = (x == null || y == null) ? null : { x, y };
    socket.to(currentRoomCode).emit('cursor:update', { id: socket.id, cursor: me.cursor });
  });

  socket.on('disconnect', () => {
    if (!currentRoomCode) return;
    const room = getRoom(currentRoomCode);
    if (!room) return;
    leaveRoom(room, socket.id);
    broadcastRoom(currentRoomCode);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
