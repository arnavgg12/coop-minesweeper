import { useLayoutEffect, useRef, useState } from 'react';
import type { CellView, Player } from './types';

type Props = {
  width: number;
  height: number;
  cells: Map<number, CellView>;
  status: 'playing' | 'won' | 'lost';
  players: Player[];
  meId: string;
  numberColors: string[];
  flagMode: boolean;
  onReveal: (idx: number) => void;
  onFlag: (idx: number) => void;
  onChord: (idx: number) => void;
  onCursor: (x: number | null, y: number | null) => void;
  lastAction: { idx: number; by: string; kind: 'reveal' | 'flag' | 'mine' } | null;
  playerColor: (id: string) => string;
};

const LONG_PRESS_MS = 350;     // hold duration to fire a flag
const MOVE_TOLERANCE_PX = 8;   // movement before we consider the gesture "a swipe, not a hold"

export default function Board({
  width, height, cells, status, players, meId,
  numberColors, flagMode, onReveal, onFlag, onChord, onCursor, lastAction, playerColor,
}: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState({ w: 0, h: 0 });

  // ---- Long-press state (Pointer Events) -----------------------------------
  // We use Pointer Events instead of separate touch + mouse events because
  // they unify input across mouse, touch, and pen with consistent ordering.
  // pointerdown → (pointermove)* → pointerup is reliable on iOS Safari,
  // Android Chrome, and desktop. The synthetic onClick still fires after
  // pointerup on touch, which we suppress when a long-press has fired.
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const pointerDownAt = useRef<{ x: number; y: number; touch: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setBoardSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  // ---- Game actions --------------------------------------------------------
  const doReveal = (idx: number) => {
    if (status !== 'playing') return;
    const cell = cells.get(idx);
    if (cell?.revealed && cell.adjacent > 0) onChord(idx);
    else onReveal(idx);
  };

  const doFlag = (idx: number) => {
    if (status !== 'playing') return;
    const cell = cells.get(idx);
    if (cell?.revealed) return;
    onFlag(idx);
  };

  // ---- Pointer handlers ----------------------------------------------------
  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pointerDownAt.current = null;
  };

  const handlePointerDown = (idx: number, e: React.PointerEvent) => {
    // Only run long-press for finger or pen input. For mouse, the user has
    // right-click via the contextmenu handler, so we don't need a hold.
    if (e.pointerType === 'mouse') return;

    longPressFired.current = false;
    pointerDownAt.current = { x: e.clientX, y: e.clientY, touch: true };

    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      // Re-check that no movement / release happened between scheduling and firing.
      if (!pointerDownAt.current) return;
      longPressFired.current = true;
      doFlag(idx);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate?.(15); } catch { /* ignore */ }
      }
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const start = pointerDownAt.current;
    if (!start) return;
    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) cancelLongPress();
  };

  // pointerup AND pointercancel both end the gesture. We don't care which
  // — either way, no more long-press.
  const handlePointerEnd = () => cancelLongPress();

  // ---- Click & contextmenu -------------------------------------------------
  const handleClick = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    // Suppress the synthetic click that follows a touch-driven long-press.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (flagMode) doFlag(idx);
    else doReveal(idx);
  };

  const handleContext = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    // If our long-press timer already flagged this cell (e.g. on Android
    // where the browser also dispatches contextmenu), don't toggle a second
    // time and undo our flag.
    if (longPressFired.current) return;
    doFlag(idx);
    // If a touch is currently in progress, mark long-press as fired so the
    // synthetic click that may follow is suppressed. Desktop right-click
    // sets no pointerDownAt.touch, so the next left-click works normally.
    if (pointerDownAt.current?.touch) longPressFired.current = true;
  };

  // ---- Cursor for other-player tracking (mouse only) ----------------------
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!boardRef.current) return;
    const r = boardRef.current.getBoundingClientRect();
    onCursor((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };
  const handleMouseLeave = () => onCursor(null, null);

  return (
    <div
      ref={boardRef}
      className="board"
      style={{
        // @ts-expect-error - custom CSS properties aren't in React's CSSProperties type.
        '--cols': width,
        '--rows': height,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {Array.from({ length: width * height }, (_, idx) => {
        const cell = cells.get(idx);
        const isLast = lastAction && lastAction.idx === idx;
        const flagger = cell?.flaggedBy ? playerColor(cell.flaggedBy) : null;

        let content: React.ReactNode = null;
        let cls = 'cell';

        if (cell?.revealed) {
          cls += ' revealed';
          if (cell.mine) {
            cls += ' mine';
            if (isLast && lastAction?.kind === 'mine') cls += ' exploded';
            content = '💣';
          } else if (cell.adjacent > 0) {
            content = (
              <span style={{ color: numberColors[cell.adjacent] }}>{cell.adjacent}</span>
            );
          }
        } else if (flagger) {
          cls += ' flagged';
          content = <span style={{ color: flagger }}>⚑</span>;
        }

        if (isLast && lastAction?.kind !== 'mine') cls += ' last-action';
        const lastBorder = isLast ? playerColor(lastAction!.by) : undefined;

        return (
          <div
            key={idx}
            className={cls}
            style={lastBorder ? { boxShadow: `inset 0 0 0 2px ${lastBorder}` } : undefined}
            onClick={(e) => handleClick(e, idx)}
            onContextMenu={(e) => handleContext(e, idx)}
            onPointerDown={(e) => handlePointerDown(idx, e)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onPointerLeave={handlePointerEnd}
          >
            {content}
          </div>
        );
      })}

      {/* Live cursors of other players (desktop only — hidden on phone in CSS) */}
      {players
        .filter((p) => p.id !== meId && p.cursor)
        .map((p) => (
          <div
            key={p.id}
            className="remote-cursor"
            style={{
              left: p.cursor!.x * boardSize.w,
              top: p.cursor!.y * boardSize.h,
              color: p.color,
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M3 2 L21 12 L13 14 L11 22 Z" fill={p.color} stroke="white" strokeWidth="1.5" />
            </svg>
            <span className="cursor-label" style={{ background: p.color }}>{p.name}</span>
          </div>
        ))}
    </div>
  );
}
