/**
 * Settings and the local high-score table, kept in localStorage (inside the Tauri app too).
 * Every access is wrapped: storage can be unavailable (private windows, blocked site data), and the game must still run.
 */
const PREFIX = 'avalanche-run.';

function load(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Not persisted; the session keeps working.
  }
}

export interface GameSpeed {
  name: string;
  multiplier: number;
}

/** The simulation clock is scaled by `multiplier`, so skier, avalanche, creatures and timers speed up together. */
export const speeds: readonly GameSpeed[] = [
  { name: 'Chill', multiplier: 0.75 },
  { name: 'Normal', multiplier: 1 },
  { name: 'Fast', multiplier: 1.25 },
  { name: 'Turbo', multiplier: 1.5 },
];

export const speedLabel = (s: GameSpeed) => `${s.name} (${s.multiplier}×)`;

export const Settings = {
  get speedIndex(): number {
    const raw = load('gameSpeed');
    const index = raw === null ? 1 : Number(raw);
    return Number.isInteger(index) ? Math.max(0, Math.min(speeds.length - 1, index)) : 1;
  },
  set speedIndex(index: number) {
    save('gameSpeed', String(index));
  },
  get speed(): GameSpeed {
    return speeds[this.speedIndex];
  },
  cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % speeds.length;
  },
  nameFor(multiplier: number): string {
    return speeds.find((s) => s.multiplier === multiplier)?.name ?? `${multiplier}×`;
  },
  get soundMode(): number {
    const mode = Number(load('soundMode') ?? 0);
    return mode >= 0 && mode <= 2 ? mode : 0;
  },
  set soundMode(mode: number) {
    save('soundMode', String(mode));
  },
};

export interface ScoreEntry {
  name: string;
  score: number;
  meters: number;
  date: string;
  /** Slowest game-speed multiplier used during the run. */
  speed?: number;
}

/** Local top-10 table. */
export const Leaderboard = {
  size: 10,

  get entries(): ScoreEntry[] {
    try {
      const list = JSON.parse(load('leaderboard') ?? '[]');
      return Array.isArray(list) ? (list as ScoreEntry[]) : [];
    } catch {
      return [];
    }
  },

  get best(): number {
    return this.entries[0]?.score ?? 0;
  },

  get lastName(): string {
    return load('lastName') ?? '';
  },
  set lastName(name: string) {
    save('lastName', name);
  },

  qualifies(score: number): boolean {
    const list = this.entries;
    return score > 0 && (list.length < this.size || score > (list[list.length - 1]?.score ?? 0));
  },

  /** Where `score` would land (0-based). Ties go below existing entries. */
  rankFor(score: number): number {
    const list = this.entries;
    const index = list.findIndex((e) => score > e.score);
    return index === -1 ? list.length : index;
  },

  record(entry: ScoreEntry): number {
    const list = this.entries;
    const rank = this.rankFor(entry.score);
    list.splice(rank, 0, entry);
    save('leaderboard', JSON.stringify(list.slice(0, this.size)));
    return rank;
  },
};
