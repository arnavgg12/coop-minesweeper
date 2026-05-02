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
  onReveal: (idx: number) => void;
  onFlag: (idx: number) => void;
  onChord: (idx: number) => void;
  onCursor: (x: number | null, y: number | null) => void;
  lastAction: { idx: number; by: string; kind: 'reveal' | 'flag' | 'mine' } | null;
  playerColor: (id: string) => string;
};

const CELL = 30;

export default function Board({
  width, height, cells, status, players, meId,
  numberColors, onReveal, onFlag, onChord, onCursor, lastAction, playerColor,
}: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState({ w: 0, h: 0 });

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

  const handleClick = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    if (status !== 'playing') return;
    const cell = cells.get(idx);
    if (cell?.revealed && cell.adjacent > 0) onChord(idx);
    else onReveal(idx);
  };

  const handleContext = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    if (status !== 'playing') return;
    const cell = cells.get(idx);
    if (cell?.revealed) return;
    onFlag(idx);
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
        gridTemplateColumns: `repeat(${width}, ${CELL}px)`,
        gridTemplateRows: `repeat(${height}, ${CELL}px)`,
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
