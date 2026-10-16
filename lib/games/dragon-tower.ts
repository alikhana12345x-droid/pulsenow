// Dragon Tower — shared config + payout math. Imported by BOTH the server action
// (lib/actions/games.ts) and the client component so the two never drift.
//
// The player climbs a tower of TOWER_ROWS rows. Each difficulty fixes how many
// tiles a row has and how many are safe (eggs); the rest are dragons. Clearing a
// row compounds the multiplier by (1 − edge) / p where p = safe / tiles.

export const TOWER_ROWS = 9;
export const TOWER_HOUSE_EDGE = 0.01;
// Caps a single round's payout multiplier so max exposure on a 20k bet stays in the
// same ballpark as Mines (~2185×). Reaching the cap auto-cashes the round.
export const TOWER_MAX_MULT = 2000;

export type TowerDifficulty = "easy" | "medium" | "hard" | "expert" | "master";

export const TOWER_DIFFICULTIES: Record<
  TowerDifficulty,
  { label: string; tiles: number; safe: number }
> = {
  easy:   { label: "Easy",   tiles: 4, safe: 3 }, // p = 0.75  → ≈1.32×/row
  medium: { label: "Medium", tiles: 3, safe: 2 }, // p = 0.667 → ≈1.49×/row
  hard:   { label: "Hard",   tiles: 2, safe: 1 }, // p = 0.50  → ≈1.98×/row
  expert: { label: "Expert", tiles: 3, safe: 1 }, // p = 0.333 → ≈2.97×/row
  master: { label: "Master", tiles: 4, safe: 1 }, // p = 0.25  → ≈3.96×/row
};

export const TOWER_DIFFICULTY_ORDER: TowerDifficulty[] = [
  "easy", "medium", "hard", "expert", "master",
];

export function isTowerDifficulty(v: unknown): v is TowerDifficulty {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(TOWER_DIFFICULTIES, v);
}

// Per-row multiplier for a difficulty: (1 − edge) / p.
export function towerPerRowMultiplier(difficulty: TowerDifficulty): number {
  const { tiles, safe } = TOWER_DIFFICULTIES[difficulty];
  return (1 - TOWER_HOUSE_EDGE) / (safe / tiles);
}

// Uncapped compounding multiplier after clearing `rowsCleared` rows.
export function towerMultiplierRaw(difficulty: TowerDifficulty, rowsCleared: number): number {
  if (rowsCleared <= 0) return 1;
  return Math.pow(towerPerRowMultiplier(difficulty), rowsCleared);
}

// Capped, 2-dp multiplier actually paid out.
export function towerMultiplier(difficulty: TowerDifficulty, rowsCleared: number): number {
  if (rowsCleared <= 0) return 1;
  return parseFloat(Math.min(TOWER_MAX_MULT, towerMultiplierRaw(difficulty, rowsCleared)).toFixed(4));
}

// The round auto-cashes once the top row is reached OR the payout cap is hit.
export function towerIsTerminal(difficulty: TowerDifficulty, rowsCleared: number): boolean {
  return rowsCleared >= TOWER_ROWS || towerMultiplierRaw(difficulty, rowsCleared) >= TOWER_MAX_MULT;
}
