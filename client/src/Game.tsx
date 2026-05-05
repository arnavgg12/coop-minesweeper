import { useEffect, useMemo, useRef, useState } from 'react';
import { socket } from './socket';
import type { CellView, GameAction, Player, RoomState } from './types';
import Board from './Board';

type Props = { room: RoomState; me: Player; connected: boolean; onLeave: () => void };

const NUMBER_COLORS = ['', '#1d4ed8', '#15803d', '#b91c1c', '#581c87', '#7c2d12', '#0e7490', '#000', '#525252'];

export default function Game({ room, me, connected, onLeave }: Props) {
  const { game, players } = room;

  // Build a sparse cell map from the server's compact payload.
  const cells = useMemo<Map<number, CellView>>(() => {
    const m = new Map<number, CellView>();
    for (const c of game.cells) {
      if ('r' in c) {
        m.set(c.i, { revealed: true, mine: c.v === -1, adjacent: c.v, flaggedBy: null });
      } else {
        m.set(c.i, { revealed: false, mine: false, adjacent: 0, flaggedBy: c.f });
      }
    }
    return m;
  }, [game.cells]);

  const send = (action: GameAction) => socket.emit('game:action', action);

  // When on, taps flag instead of reveal. Essential on touch devices that have no right-click.
  const [flagMode, setFlagMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard may be denied — fallback: select-and-show */ }
  };

  const shareUrl = `${window.location.origin}/?room=${room.code}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };

  // Throttled cursor reporting.
  const lastCursorSent = useRef(0);
  const reportCursor = (x: number | null, y: number | null) => {
    const now = performance.now();
    if (now - lastCursorSent.current < 40) return; // ~25 Hz
    lastCursorSent.current = now;
    socket.emit('cursor:move', { x, y });
  };

  // Simple elapsed timer.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (game.status !== 'playing' || !game.startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [game.status, game.startedAt]);
  const elapsed = game.startedAt
    ? Math.floor(((game.endedAt ?? now) - game.startedAt) / 1000)
    : 0;

  return (
    <div className={`game ${connected ? '' : 'is-disconnected'}`}>
      <header className="topbar">
        <div className="room-meta">
          <button className="ghost" onClick={onLeave}>← Leave</button>
          <div className="code-pill">
            <span className="label">Room</span>
            <strong>{room.code}</strong>
            <button className="link" onClick={copyCode}>copy code</button>
            <button className="link" onClick={copyLink}>copy link</button>
            {copied && <span className="copied">✓ copied</span>}
          </div>
        </div>

        <div className="hud">
          <div className="hud-item" title="Mines remaining (mines − flags placed)">
            <span className="hud-icon">💣</span>
            <span className="hud-value">{Math.max(0, game.mineCount - game.flagsUsed)}</span>
          </div>
          <div className="hud-item" title="Elapsed time">
            <span className="hud-icon">⏱</span>
            <span className="hud-value">{String(elapsed).padStart(3, '0')}</span>
          </div>
          <div className={`status-chip status-${game.status}`}>
            {game.status === 'playing' && 'Playing'}
            {game.status === 'won' && '🎉 You won!'}
            {game.status === 'lost' && '💥 Boom — try again'}
          </div>
          {!connected && (
            <span
              className="conn-indicator"
              title="Lost connection to server. Reconnecting and rejoining your room — your moves won't register until the dot turns green again."
            >
              <span className="conn-dot" />
              Reconnecting…
            </span>
          )}
          <button
            type="button"
            className={`flag-toggle ${flagMode ? 'on' : ''}`}
            onClick={() => setFlagMode((v) => !v)}
            aria-pressed={flagMode}
            title="Toggle flag mode (taps will flag instead of reveal)"
          >
            <span className="flag-icon">⚑</span>
            <span className="flag-label">Flag</span>
          </button>
          {game.status !== 'playing' && (
            <button className="primary small" onClick={() => { send({ kind: 'reset' }); setFlagMode(false); }}>
              New game
            </button>
          )}
        </div>

        <div className="players">
          {players.map((p) => (
            <span key={p.id} className="player-chip" style={{ borderColor: p.color }}>
              <span className="dot" style={{ background: p.color }} />
              {p.name}{p.id === me.id ? ' (you)' : ''}
            </span>
          ))}
        </div>
      </header>

      <main className="board-wrap">
        <Board
          width={game.width}
          height={game.height}
          cells={cells}
          status={game.status}
          players={players}
          meId={me.id}
          numberColors={NUMBER_COLORS}
          flagMode={flagMode}
          onReveal={(idx) => send({ kind: 'reveal', idx })}
          onFlag={(idx) => send({ kind: 'flag', idx })}
          onChord={(idx) => send({ kind: 'chord', idx })}
          onCursor={reportCursor}
          lastAction={game.lastAction}
          playerColor={(id) => players.find((p) => p.id === id)?.color ?? '#999'}
        />
      </main>

      <footer className="hints">
        <span className="hint-desktop"><kbd>Click</kbd> reveal · <kbd>Right-click</kbd> flag</span>
        <span className="hint-mobile">Tap to reveal · Long-press or toggle <kbd>⚑ Flag</kbd> to flag</span>
        <span className="hint-desktop">Click a number with all its mines flagged to chord</span>
      </footer>
    </div>
  );
}
