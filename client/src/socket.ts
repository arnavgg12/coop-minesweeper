import { io, Socket } from 'socket.io-client';

// In dev, Vite proxies /socket.io -> http://localhost:3001 (see vite.config.ts).
// In production (single-origin deploy), the same path is served by the Node server.
export const socket: Socket = io({
  autoConnect: false,
  // Allow polling fallback in case the host (or a corporate proxy) blocks WebSocket upgrades.
  transports: ['websocket', 'polling'],
});
