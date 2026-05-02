// Cooperative Minesweeper game logic. Pure functions over a board state.
// State shape:
//   {
//     width, height, mineCount,
//     mines: Set<index>,                   // mine positions (server-only knowledge until reveal)
//     revealed: Uint8Array,                // 0 = hidden, 1 = revealed
//     flagged: Map<index, playerId>,       // who flagged each cell
//     adjacent: Int8Array,                 // precomputed neighbor mine counts
//     status: 'playing' | 'won' | 'lost',
//     startedAt, endedAt,
//     firstClick: boolean,                 // true until first reveal (used to guarantee a safe first click)
//     lastAction: { idx, by, kind } | null
//   }

export const DIFFICULTY = {
  beginner:     { width:  9, height:  9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert:       { width: 30, height: 16, mines: 99 },
};

export function createGame(difficulty = 'beginner') {
  const cfg = DIFFICULTY[difficulty] ?? DIFFICULTY.beginner;
  const size = cfg.width * cfg.height;
  return {
    difficulty,
    width: cfg.width,
    height: cfg.height,
    mineCount: cfg.mines,
    mines: new Set(),
    revealed: new Uint8Array(size),
    flagged: new Map(),
    adjacent: new Int8Array(size),
    status: 'playing',
    startedAt: null,
    endedAt: null,
    firstClick: true,
    lastAction: null,
  };
}

function placeMines(game, safeIdx) {
  const { width, height, mineCount } = game;
  const size = width * height;

  // Build a forbidden set: the safe cell + its neighbors, so the first click opens an area.
  const forbidden = new Set([safeIdx, ...neighbors(safeIdx, width, height)]);
  // If forbidden zone is too large to leave room for mines, shrink it to just the click cell.
  const usable = size - forbidden.size;
  if (usable < mineCount) {
    forbidden.clear();
    forbidden.add(safeIdx);
  }

  const candidates = [];
  for (let i = 0; i < size; i++) if (!forbidden.has(i)) candidates.push(i);
  // Fisher-Yates partial shuffle, take first `mineCount`.
  for (let i = 0; i < mineCount; i++) {
    const j = i + Math.floor(Math.random() * (candidates.length - i));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    game.mines.add(candidates[i]);
  }

  // Precompute adjacency counts.
  for (let i = 0; i < size; i++) {
    if (game.mines.has(i)) { game.adjacent[i] = -1; continue; }
    let n = 0;
    for (const nb of neighbors(i, width, height)) if (game.mines.has(nb)) n++;
    game.adjacent[i] = n;
  }
}

function neighbors(idx, width, height) {
  const x = idx % width;
  const y = Math.floor(idx / width);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      out.push(ny * width + nx);
    }
  }
  return out;
}

export function reveal(game, idx, playerId) {
  if (game.status !== 'playing') return { changed: [] };
  if (idx < 0 || idx >= game.width * game.height) return { changed: [] };
  if (game.revealed[idx]) return { changed: [] };
  if (game.flagged.has(idx)) return { changed: [] }; // can't reveal a flagged cell

  if (game.firstClick) {
    placeMines(game, idx);
    game.firstClick = false;
    game.startedAt = Date.now();
  }

  if (game.mines.has(idx)) {
    game.revealed[idx] = 1;
    game.status = 'lost';
    game.endedAt = Date.now();
    game.lastAction = { idx, by: playerId, kind: 'mine' };
    // Reveal all mines so the client can show them.
    const changed = [idx];
    for (const m of game.mines) if (!game.revealed[m]) { game.revealed[m] = 1; changed.push(m); }
    return { changed, exploded: idx };
  }

  // Flood-fill empty cells.
  const changed = [];
  const stack = [idx];
  while (stack.length) {
    const cur = stack.pop();
    if (game.revealed[cur]) continue;
    if (game.flagged.has(cur)) continue;
    game.revealed[cur] = 1;
    changed.push(cur);
    if (game.adjacent[cur] === 0) {
      for (const nb of neighbors(cur, game.width, game.height)) {
        if (!game.revealed[nb] && !game.mines.has(nb)) stack.push(nb);
      }
    }
  }

  game.lastAction = { idx, by: playerId, kind: 'reveal' };
  checkWin(game);
  return { changed };
}

export function toggleFlag(game, idx, playerId) {
  if (game.status !== 'playing') return { changed: [] };
  if (idx < 0 || idx >= game.width * game.height) return { changed: [] };
  if (game.revealed[idx]) return { changed: [] };

  if (game.flagged.has(idx)) game.flagged.delete(idx);
  else game.flagged.set(idx, playerId);

  game.lastAction = { idx, by: playerId, kind: 'flag' };
  return { changed: [idx] };
}

// "Chord": when clicking a revealed number whose adjacent flag count equals its number,
// reveal all unflagged neighbors. Standard minesweeper QoL.
export function chord(game, idx, playerId) {
  if (game.status !== 'playing') return { changed: [] };
  if (!game.revealed[idx]) return { changed: [] };
  const n = game.adjacent[idx];
  if (n <= 0) return { changed: [] };

  const nbs = neighbors(idx, game.width, game.height);
  let flagCount = 0;
  for (const nb of nbs) if (game.flagged.has(nb)) flagCount++;
  if (flagCount !== n) return { changed: [] };

  const allChanged = [];
  let exploded = null;
  for (const nb of nbs) {
    if (game.revealed[nb] || game.flagged.has(nb)) continue;
    const r = reveal(game, nb, playerId);
    allChanged.push(...r.changed);
    if (r.exploded != null) { exploded = r.exploded; break; }
  }
  return exploded != null ? { changed: allChanged, exploded } : { changed: allChanged };
}

function checkWin(game) {
  const total = game.width * game.height;
  let revealedCount = 0;
  for (let i = 0; i < total; i++) if (game.revealed[i]) revealedCount++;
  if (revealedCount === total - game.mineCount) {
    game.status = 'won';
    game.endedAt = Date.now();
  }
}

// Project the server-side game into a payload safe to send to clients.
// Hides un-revealed mine positions while the game is in progress.
export function snapshot(game) {
  const cells = [];
  const total = game.width * game.height;
  for (let i = 0; i < total; i++) {
    if (game.revealed[i]) {
      cells.push({ i, r: 1, v: game.adjacent[i] }); // -1 means mine
    } else if (game.flagged.has(i)) {
      cells.push({ i, f: game.flagged.get(i) });
    }
  }
  return {
    difficulty: game.difficulty,
    width: game.width,
    height: game.height,
    mineCount: game.mineCount,
    status: game.status,
    startedAt: game.startedAt,
    endedAt: game.endedAt,
    flagsUsed: game.flagged.size,
    cells,
    lastAction: game.lastAction,
  };
}
