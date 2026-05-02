import { createGame, reveal, toggleFlag, chord, snapshot } from './game.js';

const ROOM_TTL_MS = 1000 * 60 * 60; // forget empty rooms after 1h
const MAX_PLAYERS_PER_ROOM = 8;     // soft cap; cooperative, but keep it sane

const rooms = new Map(); // code -> Room

function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (rooms.has(code));
  return code;
}

const PALETTE = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export function createRoom(difficulty = 'beginner') {
  const code = newCode();
  const room = {
    code,
    game: createGame(difficulty),
    players: new Map(), // socketId -> { id, name, color, cursor: {x,y} | null }
    createdAt: Date.now(),
    emptySince: null,
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get(code?.toUpperCase());
}

export function joinRoom(room, socketId, name) {
  if (room.players.size >= MAX_PLAYERS_PER_ROOM) return null;
  const usedColors = new Set([...room.players.values()].map(p => p.color));
  const color = PALETTE.find(c => !usedColors.has(c)) ?? PALETTE[room.players.size % PALETTE.length];
  const player = { id: socketId, name: name?.slice(0, 20) || 'Player', color, cursor: null };
  room.players.set(socketId, player);
  room.emptySince = null;
  return player;
}

export function leaveRoom(room, socketId) {
  room.players.delete(socketId);
  if (room.players.size === 0) room.emptySince = Date.now();
}

export function applyAction(room, action, playerId) {
  const { kind } = action;
  if (kind === 'reveal')      return reveal(room.game, action.idx, playerId);
  if (kind === 'flag')        return toggleFlag(room.game, action.idx, playerId);
  if (kind === 'chord')       return chord(room.game, action.idx, playerId);
  if (kind === 'reset') {
    room.game = createGame(action.difficulty ?? room.game.difficulty);
    return { reset: true };
  }
  return { changed: [] };
}

export function publicState(room) {
  return {
    code: room.code,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, color: p.color, cursor: p.cursor,
    })),
    game: snapshot(room.game),
  };
}

// Periodic GC for abandoned rooms.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.emptySince && now - room.emptySince > ROOM_TTL_MS) rooms.delete(code);
  }
}, 60 * 1000).unref?.();
