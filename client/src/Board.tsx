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

const LONG_PRESS_MS = 400;

export default function Board({
  width, height, cells, status, players, meId,
  numberColors, flagMode, onReveal, onFlag, onChord, onCursor, lastAction, playerColor,
}: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState({ w: 0, h: 0 });

  // Long-press tracking. Set on touchstart, cleared on touchmove/touchend.
  // If the timer fires, we mark it "consumed" so the synthetic onClick that
  // follows touchend doesn't also reveal the cell.
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

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

  const handleClick = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    // If a long-press just fired, swallow the click that browsers synthesize from touchend.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (flagMode) doFlag(idx);
    else doReveal(idx);
  };

  const handleContext = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    // On Android, long-press fires our timer AND a native contextmenu event.
    // Both would call doFlag (a toggle), cancelling each other out. If our
    // timer already flagged, skip — but keep longPressFired set so any
    // synthetic click that follows is still suppressed.
    if (longPressFired.current) return;
    doFlag(idx);
    // If this contextmenu came from a touch (one happened within the last
    // second), mark long-press as fired so the synthetic click that may
    // follow on Android is suppressed. On a real desktop right-click no
    // touch is in progress, so we leave the flag alone — otherwise the
    // next left-click would be incorrectly suppressed.
    if (performance.now() - lastTouchAt.current < 1000) longPressFired.current = true;
  };

  // Track the starting touch position so small finger drift doesn't cancel
  // the long-press timer. Without this, ~3 px of natural finger wobble was
  // killing the timer before it could fire on some devices.
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const lastTouchAt = useRef(0); // Used to recognize touch-induced contextmenu events.
  const TOUCH_TOLERANCE_PX = 10;

  const handleTouchStart = (idx: number, e: React.TouchEvent) => {
    longPressFired.current = false;
    lastTouchAt.current = performance.now();
    const t = e.touches[0];
    touchStartPos.current = t ? { x: t.clientX, y: t.clientY } : null;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      doFlag(idx);
      // Light haptic feedback if supported.
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate?.(15); } catch { /* ignore */ }
      }
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = Math.abs(t.clientX - touchStartPos.current.x);
    const dy = Math.abs(t.clientY - touchStartPos.current.y);
    if (dx > TOUCH_TOLERANCE_PX || dy > TOUCH_TOLERANCE_PX) cancelLongPress();
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
  };

  const handleMove = (e: React.MouseEvent) => {
    if (!boardRef.current) return;
    const r = boardRef.current.getBoundingClientRect();
    onCursor((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };
  const handleLeave = () => onCursor(null, null);

  return (
    <div
      ref={boardRef}
      className="board"
      style={{
        // Use CSS custom properties so styles.css media queries can size cells responsively.
        // @ts-expect-error - custom CSS properties aren't in React's CSSProperties type.
        '--cols': width,
        '--rows': height,
      }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
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
            onTouchStart={(e) => handleTouchStart(idx, e)}
            onTouchMove={handleTouchMove}
            onTouchEnd={cancelLongPress}
            onTouchCancel={cancelLongPress}
          >
            {content}
          </div>
        );
      })}

      {/* Live cursors of other players */}
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
