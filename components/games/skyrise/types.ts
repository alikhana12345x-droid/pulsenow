export type RoundPhase = "betting" | "loading" | "flight" | "crash" | "post";
export type BetId = "A" | "B";
export type BetStatus = "idle" | "queued" | "inflight" | "cashed" | "lost";

export interface BetCardState {
  amount: number;
  autoBet: boolean;
  autoCashout: boolean;
  autoCashoutTarget: number;
  stopOnWinStreak: boolean;
  stopOnLossStreak: boolean;
  winStreakLimit: number;
  lossStreakLimit: number;
  showAuto: boolean;
  status: BetStatus;
  cashedAt: number | null;
  winStreak: number;
  lossStreak: number;
}

export interface LiveBet {
  id: string;
  name: string;
  avatarIndex: number;
  amount: number;
  cashedAt: number | null;
  cashedAtTarget: number | null;
}

export interface PlayerBet {
  id: BetId;
  name: string;
  amount: number;
  status: BetStatus;
  cashedAt: number | null;
}
