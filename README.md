# Co-op Minesweeper

A real-time, web-based, **cooperative** Minesweeper for two or more players. One shared board, both reveal/flag in real time, see each other's cursor live.

```
minesweeper/
├── package.json        ← root scripts (install:all, dev, build, start)
├── server/             ← Node + Express + Socket.IO (game logic, rooms)
└── client/             ← React + Vite + TypeScript (UI)
```

## Prerequisites

- **Node.js 20+** and npm. Download from <https://nodejs.org/> if not installed.
  - Verify: `node --version` should print `v20.x` or higher.
  - On Windows, if `node` isn't recognized after install, restart your terminal (the installer adds it to PATH but existing shells need to be reopened).

## Local development

```bash
# from the minesweeper/ directory
npm run install:all     # installs deps for root, server, and client
npm run dev             # starts server on :3001 and client on :5173
```

Open <http://localhost:5173>. Create a room → share the 5-char code (or the full URL with `?room=CODE`) → the other player joins → both play on the same board.

## How to play

- **Left-click** an unrevealed cell to reveal it.
- **Right-click** to plant/remove a flag.
- **Left-click a revealed number** whose adjacent flags equal that number to "chord" (auto-reveal the rest).
- First click is always safe — mines are placed *after* the first reveal.
- Anyone can act on any cell. Click a mine and **both** players lose. Reveal all safe cells together to win.
- Each player has a colored cursor and a colored highlight on their last action.

## Production build

```bash
npm run build           # builds the client into client/dist
npm start               # serves the API + the built client on $PORT (default 3001)
```

The server auto-detects `client/dist` and serves it as static files, so production is single-origin. Open `http://localhost:3001` after `npm start`.

## Deploying online

The whole app is one Node service. It works out of the box on **Render**, **Railway**, or **Fly.io** free tiers.

### Render (one-click style)

1. Push this folder to a GitHub repo.
2. On <https://render.com> → New → Web Service → connect the repo.
3. Settings:
   - **Build Command:** `npm run install:all && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** add `NODE_VERSION=20` (under Environment → Environment Variables).
4. Deploy. Render will give you a public URL — share it with anyone.

### Railway

```bash
# from the project root
railway init
railway up
```

Use the same build/start commands as above. Railway sets `PORT` automatically.

### Fly.io

```bash
fly launch          # accept defaults; pick a region
fly deploy
```

Add a `fly.toml` `[build]` step that runs `npm run install:all && npm run build`, then `[processes] app = "npm start"`.

### Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port the server binds to. |
| `CORS_ORIGIN` | `*` | Tighten this in production if you serve the client from a different origin. Single-origin deploy doesn't need it. |

## Architecture notes

- **Server-authoritative.** The board (mines + reveal state) lives only on the server. Clients send `reveal`/`flag`/`chord` actions; the server runs the rules and broadcasts a snapshot.
- **Snapshot is sparse.** Only revealed-or-flagged cells go on the wire — trivial bandwidth even for expert mode.
- **Mine layout is hidden.** Until a mine is revealed (game over), its position is never sent to clients. No client can cheat by inspecting state.
- **First-click safety.** Mines are placed only on the first reveal, with the clicked cell + neighbors excluded.
- **Rooms.** 5-char codes (no I/O/0/1 to avoid confusion). Empty rooms are GC'd after 1 hour.
- **Cursors.** Throttled to ~25 Hz client-side; server just relays.

## Files of interest

- [server/src/game.js](server/src/game.js) — board generation, reveal/flag/chord, win detection.
- [server/src/rooms.js](server/src/rooms.js) — room registry and player management.
- [server/src/index.js](server/src/index.js) — Express + Socket.IO entry; serves the built client in prod.
- [client/src/App.tsx](client/src/App.tsx) — top-level state, lobby ↔ game routing.
- [client/src/Game.tsx](client/src/Game.tsx) — HUD, status, room actions.
- [client/src/Board.tsx](client/src/Board.tsx) — grid rendering, input handling, remote cursors.
