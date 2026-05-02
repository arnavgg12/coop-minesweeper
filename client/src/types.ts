export type Difficulty = 'beginner' | 'intermediate' | 'expert';

export type Player = {
  id: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
};

// Compact cell payload from the server. Only revealed-or-flagged cells are sent.
export type CellPayload =
  | { i: number; r: 1; v: number }              // revealed; v = adjacent mines (-1 = mine)
  | { i: number; f: string };                    // flagged by player id

export type GameSnapshot = {
  difficulty: Difficulty;
  width: number;
  height: number;
  mineCount: number;
  status: 'playing' | 'won' | 'lost';
  startedAt: number | null;
  endedAt: number | null;
  flagsUsed: number;
  cells: CellPayload[];
  lastAction: { idx: number; by: string; kind: 'reveal' | 'flag' | 'mine' } | null;
};

export type RoomState = {
  code: string;
  players: Player[];
  game: GameSnapshot;
};

export type GameAction =
  | { kind: 'reveal'; idx: number }
  | { kind: 'flag'; idx: number }
  | { kind: 'chord'; idx: number }
  | { kind: 'reset'; difficulty?: Difficulty };

// Normalized cell map for rendering. Built from CellPayload[].
export type CellView = { revealed: boolean; mine: boolean; adjacent: number; flaggedBy: string | null };
