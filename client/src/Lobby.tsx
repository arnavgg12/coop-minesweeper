import { useState } from 'react';
import type { Difficulty } from './types';

type Props = {
  connected: boolean;
  error: string | null;
  onCreate: (name: string, difficulty: Difficulty) => void;
  onJoin: (code: string, name: string) => void;
};

export default function Lobby({ connected, error, onCreate, onJoin }: Props) {
  // Allow joining by URL: /?room=CODE
  const urlCode = (() => {
    if (typeof window === 'undefined') return '';
    const c = new URLSearchParams(window.location.search).get('room');
    return c ? c.toUpperCase().slice(0, 5) : '';
  })();

  const [name, setName] = useState(() => localStorage.getItem('ms:name') ?? '');
  const [code, setCode] = useState(urlCode);
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [mode, setMode] = useState<'create' | 'join'>(urlCode ? 'join' : 'create');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim() || 'Player';
    localStorage.setItem('ms:name', trimmed);
    if (mode === 'create') onCreate(trimmed, difficulty);
    else onJoin(code.trim().toUpperCase(), trimmed);
  };

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h1>Co-op Minesweeper</h1>
        <p className="subtitle">Real-time, two-or-more-player. Solve the board together.</p>

        <div className="tabs">
          <button
            type="button"
            className={mode === 'create' ? 'active' : ''}
            onClick={() => setMode('create')}
          >Create room</button>
          <button
            type="button"
            className={mode === 'join' ? 'active' : ''}
            onClick={() => setMode('join')}
          >Join room</button>
        </div>

        <form onSubmit={submit}>
          <label>
            Your name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Arnav"
              maxLength={20}
            />
          </label>

          {mode === 'create' ? (
            <label>
              Difficulty
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                <option value="beginner">Beginner — 9×9, 10 mines</option>
                <option value="intermediate">Intermediate — 16×16, 40 mines</option>
                <option value="expert">Expert — 30×16, 99 mines</option>
              </select>
            </label>
          ) : (
            <label>
              Room code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. K7M2P"
                maxLength={5}
                style={{ textTransform: 'uppercase', letterSpacing: '0.2em' }}
                required
              />
            </label>
          )}

          <button type="submit" className="primary" disabled={!connected}>
            {mode === 'create' ? 'Create room' : 'Join room'}
          </button>
          {!connected && <p className="status">Connecting…</p>}
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
