import crypto from "crypto";
import { db } from "@/lib/db";
import { wallets, game_rounds, bets, transactions } from "@/lib/supabase/schema";
import { eq, and, sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import {
  generateServerSeed,
  rollDiceWithProbability, diceMultiplier, diceWins,
  flipCoinWithProbability, COINFLIP_MULTIPLIER, COINFLIP_HOUSE_EDGE,
  rollLimboWithProbability,
  dealAndarBahar, AB_MULTIPLIER, AB_HOUSE_EDGE,
  dropPlinkoWithProbability,
  drawKenoWithProbability,
  resolveDragonTigerWithProbability,
  resolveTeenPattiWithProbability,
  capWinProbabilityForHouseEdge,
} from "@/lib/game-engine";
import {
  normalizeDtBets, dtTotal, dtReturn, dtMaxWinPct, dtExpectedRtp,
  type DtZone, type DtCard,
} from "@/lib/games/dragon-tiger";
import {
  normalizeTpBets, tpTotal, tpReturn, tpMaxWinPct, tpExpectedRtp,
  TP_CAT_LABEL, TP_HOUSE_EDGE, TP_OUTCOME,
  type TpCat, type TpHand, type TpOutcomeKey, type TpWinner,
} from "@/lib/games/teen-patti";
import { MIN_BET, MAX_BET, fmtPkr } from "@/lib/finance-limits";
import { getPlayerWinProbability, DEFAULT_WIN_PROBABILITY } from "@/lib/player-win-probability";
import {
  TOWER_ROWS, TOWER_DIFFICULTIES, type TowerDifficulty,
  isTowerDifficulty, towerMultiplier, towerIsTerminal,
} from "@/lib/games/dragon-tower";
import { isPlinkoRows, isPlinkoRisk, plinkoMaxWinPct, plinkoExpectedRtp } from "@/lib/games/plinko";
import { isValidKenoPicks, kenoMaxWinPct, kenoExpectedRtp } from "@/lib/games/keno";
import { assertGamePlayable } from "@/lib/games-registry";

export interface BetResult {
  betId: string;
  roundId: string;
  outcome: Record<string, unknown>;
  multiplier: number;
  payout: number;
  profit: number;
  won: boolean;
  newBalance: number;
}

export async function placeBet(input: {
  gameType: "dice" | "coinflip" | "limbo" | "andar-bahar" | "keno";
  amount: number;
  choice: Record<string, unknown>;
  clientSeed?: string;
}): Promise<BetResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const { gameType, amount, choice, clientSeed = "pulsenow" } = input;

  if (!Number.isFinite(amount) || amount < MIN_BET) throw new Error(`Minimum bet is PKR ${fmtPkr(MIN_BET)}`);
  if (amount > MAX_BET) throw new Error(`Maximum bet is PKR ${fmtPkr(MAX_BET)}`);

  // Block bets on a game admins have taken offline (maintenance/hidden). Reveal &
  // settle actions stay ungated so any round already in progress can still finish.
  await assertGamePlayable(gameType);

  // Resolve win probability before entering the transaction (read-only lookup).
  // `uncapped` (promo, or a tier above 50%) skips each game's house-edge cap.
  const { winProbability, isPromo, uncapped } = await getPlayerWinProbability(userId, amount);

  return db.transaction(async (tx) => {
    // Lock wallet row to prevent concurrent bets
    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(and(eq(wallets.user_id, userId), eq(wallets.currency, "PKR")))
      .for("update");

    if (!wallet) throw new Error("Wallet not found. Please make a deposit first.");
    if (Number(wallet.balance) < amount) throw new Error("Insufficient balance.");

    // Nonce = number of prior bets this user has placed
    const [{ nonce }] = await tx
      .select({ nonce: sql<number>`count(*)::int` })
      .from(bets)
      .where(eq(bets.user_id, userId));

    const { seed: serverSeed, hash: serverSeedHash } = generateServerSeed();
    const nonceNum = Number(nonce);

    let outcome: Record<string, unknown>;
    let multiplier: number;
    let won: boolean;
    let houseEdge: string;
    // Snapshotted on the round: the % the RNG actually used + the round's true EV.
    let effectiveWinPct: number;
    let expectedRtp: number;

    if (gameType === "dice") {
      const target = Number(choice.target);
      const side = choice.side as "over" | "under";
      multiplier = diceMultiplier(target, side);
      // Player picks the target → picks the multiplier (up to 99×). Normal players
      // are capped so EV ≤ 0.80 (≥20% edge) — without it, 15% win × 99× = 14.85 EV.
      // Uncapped players keep their exact win probability (house may lose, by design).
      effectiveWinPct = uncapped
        ? winProbability
        : capWinProbabilityForHouseEdge(winProbability, multiplier, 0.20);
      expectedRtp = (effectiveWinPct / 100) * multiplier;
      const roll = rollDiceWithProbability(serverSeed, clientSeed, nonceNum, effectiveWinPct, target, side);
      won = diceWins(roll, target, side);
      outcome = { roll, target, side };
      houseEdge = "0.0300";
    } else if (gameType === "coinflip") {
      const pick = choice.pick as "heads" | "tails";
      multiplier = COINFLIP_MULTIPLIER;
      // Fixed 1.96× payout → a normal player above a 50% win rate loses the house
      // money, so cap there. Uncapped players keep their exact win probability.
      effectiveWinPct = uncapped
        ? winProbability
        : capWinProbabilityForHouseEdge(winProbability, multiplier, COINFLIP_HOUSE_EDGE);
      expectedRtp = (effectiveWinPct / 100) * multiplier;
      const result = flipCoinWithProbability(serverSeed, clientSeed, nonceNum, effectiveWinPct, pick);
      won = result === pick;
      outcome = { result, pick };
      houseEdge = "0.0200";
    } else if (gameType === "limbo") {
      // Player picks the target multiplier → picks the payout. The displayed win
      // chance uses a 1% fair edge ((1−0.01)/target), but normal players are capped
      // exactly like Dice so EV ≤ 0.80 (≥20% edge) — without it, a 15% player on a
      // 100× target has EV 15.0 and the house bleeds. Uncapped players keep their
      // exact win probability (house may lose, by design).
      // Bounds match the client (1.05×–1000×). This also caps max exposure: a
      // crafted 1,000,000× target on a 20k bet would otherwise risk a ~20bn payout
      // on a rare win, even though the win-probability cap keeps EV house-favourable.
      const target = parseFloat(Number(choice.target).toFixed(2));
      if (!Number.isFinite(target) || target < 1.05 || target > 1000)
        throw new Error("Invalid target multiplier");
      multiplier = target;
      effectiveWinPct = uncapped
        ? winProbability
        : capWinProbabilityForHouseEdge(winProbability, multiplier, 0.20);
      expectedRtp = (effectiveWinPct / 100) * multiplier;
      const { result, won: limboWon } = rollLimboWithProbability(
        serverSeed, clientSeed, nonceNum, effectiveWinPct, target,
      );
      won = limboWon;
      outcome = { result, target };
      houseEdge = "0.0100";
    } else if (gameType === "andar-bahar") {
      const side = choice.side as "andar" | "bahar";
      if (side !== "andar" && side !== "bahar") throw new Error("Invalid side");
      // Even-money bet → fixed 1.96× (2% edge). A normal player above a 50% win rate
      // would beat the house, so cap there; uncapped players keep their exact rate.
      multiplier = AB_MULTIPLIER;
      effectiveWinPct = uncapped
        ? winProbability
        : capWinProbabilityForHouseEdge(winProbability, multiplier, AB_HOUSE_EDGE);
      expectedRtp = (effectiveWinPct / 100) * multiplier;
      const deal = dealAndarBahar(serverSeed, effectiveWinPct, side);
      won = deal.matchSide === side;
      outcome = { joker: deal.joker, andar: deal.andar, bahar: deal.bahar, matchSide: deal.matchSide, side };
      houseEdge = "0.0200";
    } else if (gameType === "keno") {
      const picks = choice.picks;
      if (!isValidKenoPicks(picks)) throw new Error("Pick 1 to 10 numbers (1–40)");
      // Keno is win-or-nothing (losing hit counts pay 0x), so placeBet's win-gated
      // payout fits. Normal players are capped by kenoMaxWinPct for the pick count;
      // uncapped players keep their exact rate.
      effectiveWinPct = uncapped
        ? winProbability
        : Math.min(winProbability, kenoMaxWinPct(picks.length));
      expectedRtp = kenoExpectedRtp(picks.length, effectiveWinPct);
      const { draw, hits, multiplier: kmult } = drawKenoWithProbability(serverSeed, effectiveWinPct, picks);
      multiplier = kmult;
      won = kmult > 0;
      outcome = { picks, draw, hits };
      houseEdge = "0.0100";
    } else {
      throw new Error("Unsupported game type");
    }

    const payout = won ? parseFloat((amount * multiplier).toFixed(2)) : 0;
    const profit = parseFloat((payout - amount).toFixed(2));
    const balanceBefore = Number(wallet.balance);
    const balanceAfter = parseFloat((balanceBefore - amount + payout).toFixed(2));

    // Create game round — snapshot configured + effective win probability, the
    // round's theoretical EV, and the engine's win decision for reports.
    const [round] = await tx.insert(game_rounds).values({
      game_type: gameType,
      server_seed: serverSeed,
      server_seed_hash: serverSeedHash,
      client_seed: clientSeed,
      nonce: nonceNum,
      outcome,
      multiplier: String(multiplier.toFixed(4)),
      house_edge: houseEdge,
      win_probability: String(winProbability.toFixed(2)),
      effective_win_probability: String(effectiveWinPct.toFixed(2)),
      expected_rtp: String(expectedRtp.toFixed(4)),
      is_promo: isPromo,
      is_win_round: won,
      status: "completed",
      completed_at: new Date(),
    }).returning();

    // Create bet record
    const [bet] = await tx.insert(bets).values({
      user_id: userId,
      round_id: round.id,
      amount: String(amount.toFixed(2)),
      currency: "PKR",
      choice,
      payout: String(payout.toFixed(2)),
      profit: String(profit.toFixed(2)),
      status: "settled",
    }).returning();

    // Update wallet atomically
    await tx.update(wallets).set({
      balance: String(balanceAfter.toFixed(2)),
      total_wagered: String((Number(wallet.total_wagered) + amount).toFixed(2)),
      total_won: won
        ? String((Number(wallet.total_won) + payout).toFixed(2))
        : wallet.total_won,
      updated_at: new Date(),
    }).where(eq(wallets.id, wallet.id));

    // Ledger entry
    await tx.insert(transactions).values({
      wallet_id: wallet.id,
      type: "bet",
      amount: String(profit.toFixed(2)),
      balance_before: String(balanceBefore.toFixed(2)),
      balance_after: String(balanceAfter.toFixed(2)),
      reference_type: "bet",
      reference_id: bet.id,
      description: `${gameType} — ${won ? "win" : "loss"}`,
    });

    return { betId: bet.id, roundId: round.id, outcome, multiplier, payout, profit, won, newBalance: balanceAfter };
  });
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function rngFromSeed(serverSeed: string, tag: string) {
  const hmac = crypto.createHmac("sha256", serverSeed);
  hmac.update(tag);
  const hex = hmac.digest("hex");
  let a = parseInt(hex.slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr: number[], rng: () => number): number[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface SkyRiseCrash {
  crashAt: number;
  isWin: boolean;            // the engine's win/loss decision (snapshotted as is_win_round)
  effectivePct: number;      // win % actually used for the decision (snapshotted)
  expectedRtp: number;       // theoretical EV upper bound (snapshotted; manual players may cash below it)
}

function genSkyRiseCrashAt(serverSeed: string, winPct: number, autoCashoutTargets: number[], uncapped: boolean): SkyRiseCrash {
  const rng = rngFromSeed(serverSeed, "skyrise:crash");
  const decide = rng();
  const value = rng();
  const valid = autoCashoutTargets.filter(t => t > 1.0 && t <= 100);

  // Loss rounds crash in a narrow range — manual cashout essentially impossible.
  const lossSpan = (winPct / 100) * 0.70;
  const lossValue = parseFloat((1.00 + value * lossSpan).toFixed(2));

  if (valid.length > 0) {
    const maxT = Math.max(...valid);

    // A win pays exactly maxT× (crash is set just above the highest target so every
    // auto-cashout slot triggers). The payout is FIXED by the player's target, so the
    // only way to keep the edge is capping the win probability: maxT × winPct ≤ 0.97
    // — otherwise a 15% player on a 20× target has EV 3.0 and the house bleeds.
    // Uncapped players (promo, or a tier above 50%) keep their exact win
    // probability (house may lose, by design).
    const effectivePct = uncapped ? winPct : capWinProbabilityForHouseEdge(winPct, maxT, 0.03);
    const isWin = decide < effectivePct / 100;
    const expectedRtp = (effectivePct / 100) * maxT;

    if (isWin) {
      // Crash just above the highest target so every auto-cashout slot triggers.
      const lo = maxT + 0.01;
      const hi = Math.min(100, maxT * 1.5 + 0.5);
      return { crashAt: parseFloat((lo + value * Math.max(0, hi - lo)).toFixed(2)), isWin, effectivePct, expectedRtp };
    }
    return { crashAt: lossValue, isWin, effectivePct, expectedRtp };
  }

  // No auto-cashout (manual play). Here the payout is NOT fixed — we control the
  // crash point — so the tier win probability is honoured EXACTLY and the house
  // edge is enforced by scaling the win-round crash range instead: the win-crash
  // mean M satisfies winPct × M ≤ 0.97, so even a player who always cashes at the
  // last moment can't beat the 3% edge. (The old approach capped the win chance
  // against a flat 10× ceiling, which crushed a 35% tier to 9.7% wins and made the
  // realized hold ~99% — the tier setting was effectively ignored.)
  if (uncapped) {
    // Uncapped (promo, or a tier above 50%): exact win rate AND a generous 2×–10×
    // win range (house may lose, by design).
    const isWin = decide < winPct / 100;
    const crashAt = isWin ? parseFloat((2.0 + value * 8.0).toFixed(2)) : lossValue;
    return { crashAt, isWin, effectivePct: winPct, expectedRtp: (winPct / 100) * 6 };
  }

  // Win-crash mean target: M = 0.97 / q, clamped to [1.5, 6]. The 1.5 floor keeps
  // wins worth cashing (so win % above ~64.7 is clamped down to preserve the edge);
  // the 6 ceiling just avoids silly 90×+ crashes at 1% tiers.
  const MIN_MEAN = 1.5, MAX_MEAN = 6;
  const effectivePct = Math.min(winPct, (0.97 / MIN_MEAN) * 100);
  const mean = Math.min(MAX_MEAN, Math.max(MIN_MEAN, 0.97 / (effectivePct / 100)));
  const isWin = decide < effectivePct / 100;
  const expectedRtp = (effectivePct / 100) * mean;

  if (isWin) {
    // Uniform around `mean`: lo = max(1.15, 0.6·M), hi = 2M − lo, so E[crash|win] = M.
    const lo = Math.max(1.15, mean * 0.6);
    const hi = Math.min(100, 2 * mean - lo);
    return { crashAt: parseFloat((lo + value * Math.max(0, hi - lo)).toFixed(2)), isWin, effectivePct, expectedRtp };
  }
  return { crashAt: lossValue, isWin, effectivePct, expectedRtp };
}

function genMinePositions(serverSeed: string, minesCount: number): number[] {
  // Fully random placement — no outer/center zone bias.
  // The previous biased approach (outer ring for win rounds, center for loss rounds)
  // was exploitable without any DevTools: players who clicked only outer tiles won
  // ~65% of rounds (all "loss rounds" had outer tiles completely safe) instead of
  // the intended 35%. House edge is now enforced purely by the multiplier formula.
  const rng = rngFromSeed(serverSeed, "mines:layout");
  return seededShuffle(Array.from({ length: 25 }, (_, i) => i), rng).slice(0, minesCount);
}

function minesCashoutMultiplier(minesCount: number, safeRevealed: number): number {
  if (safeRevealed === 0) return 1;
  const HOUSE_EDGE = 0.05; // 5% edge — 1% was too thin against variance on large bets
  const comb = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
  };
  return parseFloat(
    (((1 - HOUSE_EDGE) * comb(25, safeRevealed)) / comb(25 - minesCount, safeRevealed)).toFixed(4)
  );
}

// ─── SkyRise ──────────────────────────────────────────────────────────────────

export async function startSkyRiseRound(input: {
  bets: Array<{ amount: number; autoCashoutAt: number | null }>;
}): Promise<{ roundId: string; crashAt: number; newBalance: number }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const activeBets = input.bets.filter(b => b.amount >= MIN_BET && b.amount <= MAX_BET);
  if (activeBets.length === 0) throw new Error("No valid bets");
  const totalAmount = activeBets.reduce((s, b) => s + b.amount, 0);

  await assertGamePlayable("skyrise");
  const { winProbability: winPct, isPromo, uncapped } = await getPlayerWinProbability(userId, totalAmount);

  return db.transaction(async (tx) => {
    const [wallet] = await tx
      .select().from(wallets)
      .where(and(eq(wallets.user_id, userId), eq(wallets.currency, "PKR")))
      .for("update");
    if (!wallet) throw new Error("Wallet not found");
    if (Number(wallet.balance) < totalAmount) throw new Error("Insufficient balance");

    const { seed: serverSeed, hash: serverSeedHash } = generateServerSeed();
    const targets = activeBets.filter(b => b.autoCashoutAt && b.autoCashoutAt > 1).map(b => b.autoCashoutAt as number);
    const { crashAt, isWin, effectivePct, expectedRtp } = genSkyRiseCrashAt(serverSeed, winPct, targets, uncapped);

    const [round] = await tx.insert(game_rounds).values({
      game_type: "skyrise",
      server_seed: serverSeed,
      server_seed_hash: serverSeedHash,
      client_seed: "pulsenow",
      nonce: 0,
      outcome: { userId, crashAt, bets: activeBets, status: "pending" } as Record<string, unknown>,
      multiplier: String(crashAt.toFixed(4)),
      house_edge: "0.0300",
      win_probability: String(winPct.toFixed(2)),
      effective_win_probability: String(effectivePct.toFixed(2)),
      expected_rtp: String(expectedRtp.toFixed(4)),
      is_promo: isPromo,
      is_win_round: isWin,
      status: "pending",
    }).returning();

    const newBalance = parseFloat((Number(wallet.balance) - totalAmount).toFixed(2));
    await tx.update(wallets).set({
      balance: String(newBalance),
      total_wagered: String((Number(wallet.total_wagered) + totalAmount).toFixed(2)),
      updated_at: new Date(),
    }).where(eq(wallets.id, wallet.id));

    await tx.insert(transactions).values({
      wallet_id: wallet.id,
      type: "bet",
      amount: String((-totalAmount).toFixed(2)),
      balance_before: String(Number(wallet.balance).toFixed(2)),
      balance_after: String(newBalance),
      reference_type: "game_round",
      reference_id: round.id,
      description: "skyrise — bet placed",
    });

    return { roundId: round.id, crashAt, newBalance };
  });
}

export async function settleSkyRiseRound(input: {
  roundId: string;
  betOutcomes: Array<{ amount: number; cashedOutAt: number | null }>;
}): Promise<{ newBalance: number }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const { roundId, betOutcomes } = input;

  return db.transaction(async (tx) => {
    const [round] = await tx
      .select().from(game_rounds)
      .where(and(eq(game_rounds.id, roundId), eq(game_rounds.status, "pending")))
      .for("update").limit(1);
    if (!round) throw new Error("Round not found or already settled");

    const roundOutcome = round.outcome as {
      userId?: string;
      crashAt?: number;
      bets?: Array<{ amount: number; autoCashoutAt: number | null }>;
    };
    if (roundOutcome.userId !== userId) throw new Error("Forbidden");

    const serverCrashAt = roundOutcome.crashAt ?? 0;
    const storedBets = roundOutcome.bets ?? [];

    // Build validated outcomes using SERVER-STORED amounts — client-sent amounts
    // are completely ignored to prevent payout inflation attacks.
    // cashedOutAt must be a positive finite number strictly below the server crash.
    const validatedOutcomes = storedBets.map((stored, i) => {
      const requested = betOutcomes[i]?.cashedOutAt;
      const cashedOutAt =
        requested != null &&
        Number.isFinite(requested) &&
        requested > 1.0 &&
        requested < serverCrashAt
          ? parseFloat(requested.toFixed(4))
          : null;
      return { amount: stored.amount, cashedOutAt };
    });

    const [wallet] = await tx
      .select().from(wallets)
      .where(and(eq(wallets.user_id, userId), eq(wallets.currency, "PKR")))
      .for("update");
    if (!wallet) throw new Error("Wallet not found");

    const totalPayout = validatedOutcomes.reduce((sum, b) => {
      return b.cashedOutAt != null ? sum + b.amount * b.cashedOutAt : sum;
    }, 0);

    const newBalance = parseFloat((Number(wallet.balance) + totalPayout).toFixed(2));
    if (totalPayout > 0) {
      await tx.update(wallets).set({
        balance: String(newBalance),
        total_won: String((Number(wallet.total_won) + totalPayout).toFixed(2)),
        updated_at: new Date(),
      }).where(eq(wallets.id, wallet.id));

      await tx.insert(transactions).values({
        wallet_id: wallet.id,
        type: "bet",
        amount: String(totalPayout.toFixed(2)),
        balance_before: String(Number(wallet.balance).toFixed(2)),
        balance_after: String(newBalance),
        reference_type: "game_round",
        reference_id: roundId,
        description: "skyrise — payout",
      });
    }

    for (const b of validatedOutcomes) {
      const won = b.cashedOutAt != null;
      const payout = won ? parseFloat((b.amount * b.cashedOutAt!).toFixed(2)) : 0;
      await tx.insert(bets).values({
        user_id: userId,
        round_id: roundId,
        amount: String(b.amount.toFixed(2)),
        currency: "PKR",
        choice: { cashedOutAt: b.cashedOutAt } as Record<string, unknown>,
        payout: String(payout.toFixed(2)),
        profit: String((payout - b.amount).toFixed(2)),
        status: "settled",
      });
    }

    await tx.update(game_rounds).set({
      outcome: { ...roundOutcome, betOutcomes: validatedOutcomes, status: "completed" } as Record<string, unknown>,
      status: "completed",
      completed_at: new Date(),
    }).where(eq(game_rounds.id, roundId));

    return { newBalance };
  });
}

// ─── Mines ────────────────────────────────────────────────────────────────────

export async function startMinesRound(input: {
  amount: number;
  minesCount: number;
}): Promise<{ roundId: string; mineSet: number[]; seedHash: string; newBalance: number; isWinRound: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const { amount, minesCount } = input;
  if (!Number.isFinite(amount) || amount < MIN_BET) throw new Error(`Minimum bet is PKR ${fmtPkr(MIN_BET)}`);
  if (amount > MAX_BET) throw new Error(`Maximum bet is PKR ${fmtPkr(MAX_BET)}`);
  if (minesCount < 1 || minesCount > 24) throw new Error("Invalid mines count");

  await assertGamePlayable("mines");

  // Mines needs no house-edge cap (even for promo): on a win round the player still
  // faces the real combinatorial odds, so EV = 0.95 × winPct ≤ 0.95 at any win
  // probability. winPct is therefore used directly for promo and normal players.
  const { winProbability: winPct, isPromo } = await getPlayerWinProbability(userId, amount);

  return db.transaction(async (tx) => {
    const [wallet] = await tx
      .select().from(wallets)
      .where(and(eq(wallets.user_id, userId), eq(wallets.currency, "PKR")))
      .for("update");
    if (!wallet) throw new Error("Wallet not found");
    if (Number(wallet.balance) < amount) throw new Error("Insufficient balance");

    const { seed: serverSeed, hash: serverSeedHash } = generateServerSeed();
    const winRng = rngFromSeed(serverSeed, "mines:win");
    const isWinRound = winRng() < winPct / 100;
    const mineSet = genMinePositions(serverSeed, minesCount);

    const [round] = await tx.insert(game_rounds).values({
      game_type: "mines",
      server_seed: serverSeed,
      server_seed_hash: serverSeedHash,
      client_seed: "pulsenow",
      nonce: 0,
      // isWinRound controls whether mineSet is shared with the client:
      // - WIN:  mineSet sent (encoded) → client plays normally, instant reveals
      // - LOSS: mineSet hidden         → client clicks blind, first tile = mine
      outcome: { userId, mineSet, minesCount, betAmount: amount, safeCount: 0, isWinRound, status: "pending" } as Record<string, unknown>,
      multiplier: null,
      house_edge: "0.0500",
      win_probability: String(winPct.toFixed(2)),
      // winPct is used uncapped (see comment above); fair-odds multipliers make
      // EV = 0.95 × winPct regardless of how many tiles the player reveals.
      effective_win_probability: String(winPct.toFixed(2)),
      expected_rtp: String((0.95 * (winPct / 100)).toFixed(4)),
      is_promo: isPromo,
      is_win_round: isWinRound,
      status: "pending",
    }).returning();

    const newBalance = parseFloat((Number(wallet.balance) - amount).toFixed(2));
    await tx.update(wallets).set({
      balance: String(newBalance),
      total_wagered: String((Number(wallet.total_wagered) + amount).toFixed(2)),
      updated_at: new Date(),
    }).where(eq(wallets.id, wallet.id));

    await tx.insert(transactions).values({
      wallet_id: wallet.id,
      type: "bet",
      amount: String((-amount).toFixed(2)),
      balance_before: String(Number(wallet.balance).toFixed(2)),
      balance_after: String(newBalance),
      reference_type: "game_round",
      reference_id: round.id,
      description: "mines — bet placed",
    });

    return { roundId: round.id, mineSet, seedHash: serverSeedHash, newBalance, isWinRound };
  });
}

type RevealResult =
  | { result: "safe"; safeCount: number; multiplier: number }
  | { result: "won"; safeCount: number; multiplier: number; payout: number; newBalance: number; mineSet: number[] }
  | { result: "mine"; mineSet: number[]; newBalance: number };

export async function revealMineTile(input: {
  roundId: string;
  tileIndex: number;
}): Promise<RevealResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const { roundId, tileIndex } = input;
  if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex > 24)
    throw new Error("Invalid tile index");

  return db.transaction(async (tx) => {
    const [round] = await tx
      .select().from(game_rounds)
      .where(and(eq(game_rounds.id, roundId), eq(game_rounds.status, "pending")))
      .for("update").limit(1);
    if (!round) throw new Error("Round not found or already settled");

    const ro = round.outcome as {
      userId?: string;
      mineSet?: number[];
      minesCount?: number;
      betAmount?: number;
      safeCount?: number;
      isWinRound?: boolean;
    };
    if (ro.userId !== userId) throw new Error("Forbidden");

    const mineSet: number[] = ro.mineSet ?? [];
    const minesCount = ro.minesCount ?? 3;
    const betAmount = ro.betAmount ?? 0;
    const prevSafeCount = ro.safeCount ?? 0;
    const maxSafe = 25 - minesCount;

    // Loss rounds: any click is treated as a mine. The server guarantees the player
    // can never cash out — this is how win probability is enforced for mines.
    const isMine = ro.isWinRound === false ? true : mineSet.includes(tileIndex);

    if (isMine) {
      // For loss rounds, guarantee the clicked tile appears as a mine in the display.
      // If it wasn't randomly placed there, swap one mine to that position.
      let displayMineSet = mineSet;
      if (!mineSet.includes(tileIndex)) {
        displayMineSet = [tileIndex, ...mineSet.slice(0, minesCount - 1)];
      }

      await tx.insert(bets).values({
        user_id: userId,
        round_id: roundId,
        amount: String(betAmount.toFixed(2)),
        currency: "PKR",
        choice: { minesCount, safeRevealed: prevSafeCount, outcome: "lost" } as Record<string, unknown>,
        payout: "0.00",
        profit: String((-betAmount).toFixed(2)),
        status: "settled",
      });
      await tx.update(game_rounds).set({
        outcome: { ...ro, result: "lost", status: "completed" } as Record<string, unknown>,
        multiplier: "0.0000",
        status: "completed",
        completed_at: new Date(),
      }).where(eq(game_rounds.id, roundId));

      return { result: "mine", mineSet: displayMineSet, newBalance: 0 };
    }

    // Safe tile — increment server-tracked safeCount.
    const newSafeCount = prevSafeCount + 1;
    const multiplier = minesCashoutMultiplier(minesCount, newSafeCount);

    if (newSafeCount >= maxSafe) {
      // Player cleared all safe tiles — auto-win, settle immediately.
      const [wallet] = await tx
        .select().from(wallets)
        .where(and(eq(wallets.user_id, userId), eq(wallets.currency, "PKR")))
        .for("update");
      if (!wallet) throw new Error("Wallet not found");

      const payout = parseFloat((betAmount * multiplier).toFixed(2));
      const newBalance = parseFloat((Number(wallet.balance) + payout).toFixed(2));

      await tx.update(wallets).set({
        balance: String(newBalance),
        total_won: String((Number(wallet.total_won) + payout).toFixed(2)),
        updated_at: new Date(),
      }).where(eq(wallets.id, wallet.id));

      await tx.insert(transactions).values({
        wallet_id: wallet.id,
        type: "bet",
        amount: String(payout.toFixed(2)),
        balance_before: String(Number(wallet.balance).toFixed(2)),
        balance_after: String(newBalance),
        reference_type: "game_round",
        reference_id: roundId,
        description: `mines — perfect clear ${multiplier.toFixed(2)}×`,
      });

      await tx.insert(bets).values({
        user_id: userId,
        round_id: roundId,
        amount: String(betAmount.toFixed(2)),
        currency: "PKR",
        choice: { minesCount, safeRevealed: newSafeCount, outcome: "cashed" } as Record<string, unknown>,
        payout: String(payout.toFixed(2)),
        profit: String((payout - betAmount).toFixed(2)),
        status: "settled",
      });

      await tx.update(game_rounds).set({
        outcome: { ...ro, safeCount: newSafeCount, result: "cashed", status: "completed" } as Record<string, unknown>,
        multiplier: String(multiplier.toFixed(4)),
        status: "completed",
        completed_at: new Date(),
      }).where(eq(game_rounds.id, roundId));

      return { result: "won", safeCount: newSafeCount, multiplier, payout, newBalance, mineSet };
    }

    // Still in play — update safeCount in outcome.
    await tx.update(game_rounds).set({
      outcome: { ...ro, safeCount: newSafeCount } as Record<string, unknown>,
    }).where(eq(game_rounds.id, roundId));

    return { result: "safe", safeCount: newSafeCount, multiplier };
  });
}

export async function settleMinesRound(input: {
  roundId: string;
  outcome: "cashed" | "lost";
  picks: number[];
  hitTile?: number;
}): Promise<{ newBalance: number }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const { roundId, outcome, picks, hitTile } = input;

  return db.transaction(async (tx) => {
    const [round] = await tx
      .select().from(game_rounds)
      .where(and(eq(game_rounds.id, roundId), eq(game_rounds.status, "pending")))
      .for("update").limit(1);
    if (!round) throw new Error("Round not found or already settled");

    const roundOutcome = round.outcome as {
      userId?: string;
      mineSet?: number[];
      minesCount?: number;
      betAmount?: number;
      safeCount?: number;
      isWinRound?: boolean;
    };
    if (roundOutcome.userId !== userId) throw new Error("Forbidden");

    const mineSet = roundOutcome.mineSet ?? [];
    const minesCount = roundOutcome.minesCount ?? 3;
    const amount = roundOutcome.betAmount ?? 0;
    const isLossRound = roundOutcome.isWinRound === false;

    // Loss rounds: "lost" is the only valid outcome — cashout is never allowed.
    if (isLossRound && outcome === "cashed") {
      throw new Error("Cashout not permitted on a loss round");
    }

    // Win rounds: validate the picks list (all tiles must be genuinely safe).
    // Skip for loss rounds — the mine position is cosmetic/client-generated.
    const mineSetFast = new Set(mineSet);
    const safePicks = isLossRound
      ? []
      : picks.filter((t) => Number.isInteger(t) && t >= 0 && t <= 24 && !mineSetFast.has(t));
    const safeRevealed = safePicks.length;

    // Win rounds only: validate hit tile is an actual mine.
    // Loss rounds skip this — cosmetic hitTile is not in the server-stored mineSet.
    if (!isLossRound && outcome === "lost" && hitTile != null && !mineSetFast.has(hitTile)) {
      throw new Error("Invalid mine tile reported");
    }

    if (!isLossRound && outcome === "cashed" && safeRevealed === 0) {
      throw new Error("Must reveal at least one tile before cashing out");
    }

    const effectiveOutcome = isLossRound ? "lost" : outcome;
    const multiplier = effectiveOutcome === "cashed" ? minesCashoutMultiplier(minesCount, safeRevealed) : 0;
    const payout = effectiveOutcome === "cashed" ? parseFloat((amount * multiplier).toFixed(2)) : 0;
    const profit = parseFloat((payout - amount).toFixed(2));

    const [wallet] = await tx
      .select().from(wallets)
      .where(and(eq(wallets.user_id, userId), eq(wallets.currency, "PKR")))
      .for("update");
    if (!wallet) throw new Error("Wallet not found");

    const newBalance = parseFloat((Number(wallet.balance) + payout).toFixed(2));
    if (payout > 0) {
      await tx.update(wallets).set({
        balance: String(newBalance),
        total_won: String((Number(wallet.total_won) + payout).toFixed(2)),
        updated_at: new Date(),
      }).where(eq(wallets.id, wallet.id));

      await tx.insert(transactions).values({
        wallet_id: wallet.id,
        type: "bet",
        amount: String(payout.toFixed(2)),
        balance_before: String(Number(wallet.balance).toFixed(2)),
        balance_after: String(newBalance),
        reference_type: "game_round",
        reference_id: roundId,
        description: `mines — cashout ${multiplier.toFixed(2)}×`,
      });
    }

    await tx.insert(bets).values({
      user_id: userId,
      round_id: roundId,
      amount: String(amount.toFixed(2)),
      currency: "PKR",
      choice: { minesCount, safeRevealed, outcome: effectiveOutcome } as Record<string, unknown>,
      payout: String(payout.toFixed(2)),
      profit: String(profit.toFixed(2)),
      status: "settled",
    });

    await tx.update(game_rounds).set({
      outcome: { ...roundOutcome, safeRevealed, result: effectiveOutcome, status: "completed" } as Record<string, unknown>,
      multiplier: String(multiplier.toFixed(4)),
      status: "completed",
      completed_at: new Date(),
    }).where(eq(game_rounds.id, roundId));

    return { newBalance };
  });
}

// ─── Hi-Lo ────────────────────────────────────────────────────────────────────

const HILO_HOUSE_EDGE = 0.01;

function hiloMultFromProb(prob: number) {
  return prob <= 0 ? 0 : Math.max(1.01, (1 - HILO_HOUSE_EDGE) / prob);
}

// Generates the next card using the server seed + draw index so every draw is
// provably fair, and biases toward a win/loss outcome based on winPct.
function hiloDrawCard(
  serverSeed: string,
  drawIndex: number,
  currentRank: number,
  direction: "hi" | "lo",
  winPct: number,
): { rank: number; suit: number; win: boolean } {
  const rng = rngFromSeed(serverSeed, `hilo:draw:${drawIndex}`);
  const win = rng() < winPct / 100;
  const suit = Math.floor(rng() * 4);
  const r = rng();

  let rank: number;
  if (direction === "hi") {
    if (win) {
      const count = 12 - currentRank; // winning zone: currentRank+1 … 12
      rank = count <= 0 ? 12 : currentRank + 1 + Math.floor(r * count);
    } else {
      rank = Math.floor(r * (currentRank + 1)); // loss zone: 0 … currentRank
    }
  } else {
    if (win) {
      const count = currentRank; // winning zone: 0 … currentRank-1
      rank = count <= 0 ? 0 : Math.floor(r * count);
    } else {
      const count = 13 - currentRank; // loss zone: currentRank … 12
      rank = currentRank + Math.floor(r * count);
    }
  }

  return { rank, suit, win };
}

export async function startHiLoRound(input: {
  amount: number;
  userId?: string;
}): Promise<{ roundId: string; newBalance: number }> {
  let userId = input.userId;
  if (!userId) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    userId = data?.claims?.sub as string | undefined;
  }
  if (!userId) throw new Error("Unauthorized");

  const { amount } = input;
  if (!Number.isFinite(amount) || amount < MIN_BET) throw new Error(`Minimum bet is PKR ${fmtPkr(MIN_BET)}`);
  if (amount > MAX_BET) throw new Error(`Maximum bet is PKR ${fmtPkr(MAX_BET)}`);

  await assertGamePlayable("hi-lo");

  // uncapped is persisted on the round so each draw (a separate request) knows
  // whether to bypass the fair-odds house-edge cap.
  const { winProbability: winPct, isPromo, uncapped } = await getPlayerWinProbability(userId, amount);

  return db.transaction(async (tx) => {
    const [wallet] = await tx
      .select().from(wallets)
      .where(and(eq(wallets.user_id, userId), eq(wallets.currency, "PKR")))
      .for("update");
    if (!wallet) throw new Error("Wallet not found");
    if (Number(wallet.balance) < amount) throw new Error("Insufficient balance");

    const { seed: serverSeed, hash: serverSeedHash } = generateServerSeed();

    const [round] = await tx.insert(game_rounds).values({
      game_type: "hi-lo",
      server_seed: serverSeed,
      server_seed_hash: serverSeedHash,
      client_seed: "pulsenow",
      nonce: 0,
      outcome: {
        userId,
        amount,
        winPct,
        isPromo,
        uncapped,
        drawIndex: 0,
        multiplier: 1,
        status: "pending",
      } as Record<string, unknown>,
      multiplier: null,
      house_edge: "0.0100",
      win_probability: String(winPct.toFixed(2)),
      // effective_win_probability / expected_rtp stay NULL: hi-lo caps per DRAW
      // (min(winPct, natural odds) depends on each card + direction), so there is
      // no single round-level effective % — validation shows N/A for hi-lo.
      is_promo: isPromo,
      status: "pending",
    }).returning();

    const newBalance = parseFloat((Number(wallet.balance) - amount).toFixed(2));
    await tx.update(wallets).set({
      balance: String(newBalance),
      total_wagered: String((Number(wallet.total_wagered) + amount).toFixed(2)),
      updated_at: new Date(),
    }).where(eq(wallets.id, wallet.id));

    await tx.insert(transactions).values({
      wallet_id: wallet.id,
      type: "bet",
      amount: String((-amount).toFixed(2)),
      balance_before: String(Number(wallet.balance).toFixed(2)),
      balance_after: String(newBalance),
      reference_type: "game_round",
      reference_id: round.id,
      description: "hi-lo — bet placed",
    });

    return { roundId: round.id, newBalance };
  });
}

export async function drawHiLoCard(input: {
  roundId: string;
  currentRank: number;
  direction: "hi" | "lo";
  userId?: string; // pass from x-user-sub header to skip the Supabase auth round-trip
}): Promise<{ nextCard: { rank: number; suit: number }; win: boolean; settled: boolean }> {
  // Use pre-verified userId from middleware header when available.
  // The DB query still validates ownership (outcome.userId === userId),
  // so this is safe — the middleware already verified the JWT.
  let userId = input.userId;
  if (!userId) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    userId = data?.claims?.sub as string | undefined;
  }
  if (!userId) throw new Error("Unauthorized");

  const { roundId, currentRank, direction } = input;

  if (!Number.isInteger(currentRank) || currentRank < 0 || currentRank > 12)
    throw new Error("Invalid card rank");
  if (direction !== "hi" && direction !== "lo")
    throw new Error("Invalid direction");

  return db.transaction(async (tx) => {
    const [round] = await tx
      .select().from(game_rounds)
      .where(and(eq(game_rounds.id, roundId), eq(game_rounds.status, "pending")))
      .for("update").limit(1);
    if (!round) throw new Error("Round not found or already settled");

    const outcome = round.outcome as {
      userId?: string;
      amount?: number;
      winPct?: number;
      isPromo?: boolean;
      uncapped?: boolean;
      drawIndex?: number;
      multiplier?: number;
    };
    if (outcome.userId !== userId) throw new Error("Forbidden");

    const betAmount = outcome.amount ?? 0;
    const winPct = outcome.winPct ?? DEFAULT_WIN_PROBABILITY;
    // Rounds started before `uncapped` existed only stored isPromo.
    const uncapped = outcome.uncapped ?? outcome.isPromo ?? false;
    const drawIndex = outcome.drawIndex ?? 0;
    const prevMult = outcome.multiplier ?? 1;

    // Fair odds for this card/direction (also 0 when the direction is impossible —
    // rank 12 betting "hi", rank 0 betting "lo").
    const naturalHiLoWinPct = direction === "hi"
      ? (Math.max(0, 12 - currentRank) / 13) * 100
      : (Math.max(0, currentRank) / 13) * 100;
    // Normal players: capped at fair odds, which preserves the 1% edge (each win
    // multiplies by 0.99 / fairOdds, so EV = 0.99). Uncapped players: their exact
    // win probability, still forced to 0 when no winning card exists (house may lose).
    const effectiveHiLoWinPct = uncapped
      ? (naturalHiLoWinPct > 0 ? winPct : 0)
      : Math.min(winPct, naturalHiLoWinPct);

    const { rank, suit, win } = hiloDrawCard(
      round.server_seed!,
      drawIndex,
      currentRank,
      direction,
      effectiveHiLoWinPct,
    );

    const prob = direction === "hi"
      ? Math.max(0, 12 - currentRank) / 13
      : Math.max(0, currentRank) / 13;
    const newMult = win
      ? parseFloat((prevMult * hiloMultFromProb(prob)).toFixed(4))
      : prevMult;

    if (!win) {
      // Auto-settle the loss in the same transaction — eliminates the separate
      // /settle API call for losses, cutting ~1.7–1.9 s off every losing pick.
      await tx.insert(bets).values({
        user_id: userId,
        round_id: roundId,
        amount: String(betAmount.toFixed(2)),
        currency: "PKR",
        choice: { direction, drawIndex, outcome: "lost" } as Record<string, unknown>,
        payout: "0.00",
        profit: String((-betAmount).toFixed(2)),
        status: "settled",
      });
      await tx.update(game_rounds).set({
        outcome: { ...outcome, drawIndex: drawIndex + 1, multiplier: prevMult, result: "lost", status: "completed" } as Record<string, unknown>,
        multiplier: String(prevMult.toFixed(4)),
        status: "completed",
        completed_at: new Date(),
      }).where(eq(game_rounds.id, roundId));
      return { nextCard: { rank, suit }, win: false, settled: true };
    }

    // Win — update outcome in-place, round stays pending for next draw or cashout.
    await tx.update(game_rounds).set({
      outcome: { ...outcome, drawIndex: drawIndex + 1, multiplier: newMult } as Record<string, unknown>,
    }).where(eq(game_rounds.id, roundId));

    return { nextCard: { rank, suit }, win: true, settled: false };
  });
}

export async function settleHiLoRound(input: {
  roundId: string;
  outcome: "cashed" | "lost";
}): Promise<{ newBalance: number }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const { roundId, outcome } = input;

  return db.transaction(async (tx) => {
    const [round] = await tx
      .select().from(game_rounds)
      .where(and(eq(game_rounds.id, roundId), eq(game_rounds.status, "pending")))
      .for("update").limit(1);
    if (!round) throw new Error("Round not found or already settled");

    const roundOutcome = round.outcome as {
      userId?: string;
      amount?: number;
      multiplier?: number;
      drawIndex?: number;
    };
    if (roundOutcome.userId !== userId) throw new Error("Forbidden");

    // Use server-stored values — client cannot inflate these
    const amount = roundOutcome.amount ?? 0;
    const finalMultiplier = outcome === "cashed" ? (roundOutcome.multiplier ?? 1) : 0;
    const drawsCount = roundOutcome.drawIndex ?? 0;
    const payout = outcome === "cashed" ? parseFloat((amount * finalMultiplier).toFixed(2)) : 0;
    const profit = parseFloat((payout - amount).toFixed(2));

    const [wallet] = await tx
      .select().from(wallets)
      .where(and(eq(wallets.user_id, userId), eq(wallets.currency, "PKR")))
      .for("update");
    if (!wallet) throw new Error("Wallet not found");

    const newBalance = parseFloat((Number(wallet.balance) + payout).toFixed(2));
    if (payout > 0) {
      await tx.update(wallets).set({
        balance: String(newBalance),
        total_won: String((Number(wallet.total_won) + payout).toFixed(2)),
        updated_at: new Date(),
      }).where(eq(wallets.id, wallet.id));

      await tx.insert(transactions).values({
        wallet_id: wallet.id,
        type: "bet",
        amount: String(payout.toFixed(2)),
        balance_before: String(Number(wallet.balance).toFixed(2)),
        balance_after: String(newBalance),
        reference_type: "game_round",
        reference_id: roundId,
        description: `hi-lo — cashout ${finalMultiplier.toFixed(2)}×`,
      });
    }

    await tx.insert(bets).values({
      user_id: userId,
      round_id: roundId,
      amount: String(amount.toFixed(2)),
      currency: "PKR",
      choice: { drawsCount, outcome } as Record<string, unknown>,
      payout: String(payout.toFixed(2)),
      profit: String(profit.toFixed(2)),
      status: "settled",
    });

    await tx.update(game_rounds).set({
      outcome: { ...roundOutcome, drawsCount, result: outcome, status: "completed" } as Record<string, unknown>,
      multiplier: String(finalMultiplier.toFixed(4)),
      status: "completed",
      completed_at: new Date(),
    }).where(eq(game_rounds.id, roundId));

    return { newBalance };
  });
}

// ─── Dragon Tower ───────────────────────────────────────────────────────────
// Mirrors Mines (start → reveal → settle, `isWinRound` gating), but the layout is
// kept SERVER-SIDE and revealed one row at a time — so, unlike Mines, the client
// never receives the layout up-front and cannot play perfectly on win rounds.
//
// House safety needs no per-multiplier cap (same as Mines): on a win round the
// player faces the real per-row odds p, and the multiplier ((1−edge)/p)^rows makes
// EV = (1−edge)^rows ≤ (1−edge) at any win probability; loss rounds pay 0. So winPct
// is used directly for both normal and promo players.

// Generates the per-row safe positions. Each row independently picks `safe` tiles
// out of `tiles` via the seeded shuffle, so it is provably fair from the seed.
function genTowerLayout(serverSeed: string, difficulty: TowerDifficulty): number[][] {
  const { tiles, safe } = TOWER_DIFFICULTIES[difficulty];
  const rng = rngFromSeed(serverSeed, "tower:layout");
  const layout: number[][] = [];
  for (let row = 0; row < TOWER_ROWS; row++) {
    const positions = seededShuffle(Array.from({ length: tiles }, (_, i) => i), rng).slice(0, safe);
    layout.push(positions.sort((a, b) => a - b));
  }
  return layout;
}

export async function startDragonTowerRound(input: {
  amount: number;
  difficulty: string;
}): Promise<{ roundId: string; seedHash: string; newBalance: number }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const { amount, difficulty } = input;
  if (!Number.isFinite(amount) || amount < MIN_BET) throw new Error(`Minimum bet is PKR ${fmtPkr(MIN_BET)}`);
  if (amount > MAX_BET) throw new Error(`Maximum bet is PKR ${fmtPkr(MAX_BET)}`);
  if (!isTowerDifficulty(difficulty)) throw new Error("Invalid difficulty");

  await assertGamePlayable("dragon-tower");

  const { tiles, safe } = TOWER_DIFFICULTIES[difficulty];
  const { winProbability: winPct, isPromo } = await getPlayerWinProbability(userId, amount);

  return db.transaction(async (tx) => {
    const [wallet] = await tx
      .select().from(wallets)
      .where(and(eq(wallets.user_id, userId), eq(wallets.currency, "PKR")))
      .for("update");
    if (!wallet) throw new Error("Wallet not found");
    if (Number(wallet.balance) < amount) throw new Error("Insufficient balance");

    const { seed: serverSeed, hash: serverSeedHash } = generateServerSeed();
    const winRng = rngFromSeed(serverSeed, "tower:win");
    const isWinRound = winRng() < winPct / 100;
    const layout = genTowerLayout(serverSeed, difficulty);

    const [round] = await tx.insert(game_rounds).values({
      game_type: "dragon-tower",
      server_seed: serverSeed,
      server_seed_hash: serverSeedHash,
      client_seed: "pulsenow",
      nonce: 0,
      // Layout stays server-side; client only learns it when the round ends.
      outcome: {
        userId, difficulty, tiles, safe, rows: TOWER_ROWS,
        layout, rowsCleared: 0, betAmount: amount, isWinRound, status: "pending",
      } as Record<string, unknown>,
      multiplier: null,
      house_edge: "0.0100",
      win_probability: String(winPct.toFixed(2)),
      // winPct gates the round uncapped; per-row fair-odds multipliers make
      // EV = winPct × 0.99^rowsClimbed — snapshot the one-row upper bound.
      effective_win_probability: String(winPct.toFixed(2)),
      expected_rtp: String((0.99 * (winPct / 100)).toFixed(4)),
      is_promo: isPromo,
      is_win_round: isWinRound,
      status: "pending",
    }).returning();

    const newBalance = parseFloat((Number(wallet.balance) - amount).toFixed(2));
    await tx.update(wallets).set({
      balance: String(newBalance),
      total_wagered: String((Number(wallet.total_wagered) + amount).toFixed(2)),
      updated_at: new Date(),
    }).where(eq(wallets.id, wallet.id));

    await tx.insert(transactions).values({
      wallet_id: wallet.id,
      type: "bet",
      amount: String((-amount).toFixed(2)),
      balance_before: String(Number(wallet.balance).toFixed(2)),
      balance_after: String(newBalance),
      reference_type: "game_round",
      reference_id: round.id,
      description: "dragon-tower — bet placed",
    });

    return { roundId: round.id, seedHash: serverSeedHash, newBalance };
  });
}

type TowerRevealResult =
  | { result: "safe"; row: number; rowsCleared: number; multiplier: number }
  | { result: "won"; row: number; rowsCleared: number; multiplier: number; payout: number; newBalance: number; layout: number[][] }
  | { result: "dragon"; row: number; tileIndex: number; layout: number[][]; newBalance: number };

export async function revealTowerTile(input: {
  roundId: string;
  row: number;
  tileIndex: number;
}): Promise<TowerRevealResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const { roundId, row, tileIndex } = input;

  return db.transaction(async (tx) => {
    const [round] = await tx
      .select().from(game_rounds)
      .where(and(eq(game_rounds.id, roundId), eq(game_rounds.status, "pending")))
      .for("update").limit(1);
    if (!round) throw new Error("Round not found or already settled");

    const ro = round.outcome as {
      userId?: string;
      difficulty?: TowerDifficulty;
      tiles?: number;
      layout?: number[][];
      rowsCleared?: number;
      betAmount?: number;
      isWinRound?: boolean;
    };
    if (ro.userId !== userId) throw new Error("Forbidden");

    const difficulty = ro.difficulty as TowerDifficulty;
    const tiles = ro.tiles ?? TOWER_DIFFICULTIES[difficulty].tiles;
    const layout = ro.layout ?? [];
    const rowsCleared = ro.rowsCleared ?? 0;
    const betAmount = ro.betAmount ?? 0;

    // Picks must be sequential, bottom-up: the only valid row is the current one.
    if (!Number.isInteger(row) || row !== rowsCleared) throw new Error("Invalid row");
    if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= tiles)
      throw new Error("Invalid tile index");

    // Loss round: any tile is a dragon. Win round: only the stored safe tiles pass.
    const isSafe = ro.isWinRound === false ? false : (layout[row]?.includes(tileIndex) ?? false);

    if (!isSafe) {
      // On a loss round the picked tile may not actually be a layout dragon — force it
      // to display as a dragon (mirrors Mines' displayMineSet swap).
      const displayLayout = layout.map((r) => [...r]);
      if (ro.isWinRound === false && displayLayout[row]?.includes(tileIndex)) {
        displayLayout[row] = displayLayout[row].filter((t) => t !== tileIndex);
      }

      await tx.insert(bets).values({
        user_id: userId,
        round_id: roundId,
        amount: String(betAmount.toFixed(2)),
        currency: "PKR",
        choice: { difficulty, rowsCleared, outcome: "lost" } as Record<string, unknown>,
        payout: "0.00",
        profit: String((-betAmount).toFixed(2)),
        status: "settled",
      });
      await tx.update(game_rounds).set({
        outcome: { ...ro, result: "lost", hitRow: row, hitTile: tileIndex, status: "completed" } as Record<string, unknown>,
        multiplier: "0.0000",
        status: "completed",
        completed_at: new Date(),
      }).where(eq(game_rounds.id, roundId));

      return { result: "dragon", row, tileIndex, layout: displayLayout, newBalance: 0 };
    }

    const newRowsCleared = rowsCleared + 1;
    const multiplier = towerMultiplier(difficulty, newRowsCleared);

    if (towerIsTerminal(difficulty, newRowsCleared)) {
      // Reached the top row or hit the payout cap — auto-cash the round.
      const [wallet] = await tx
        .select().from(wallets)
        .where(and(eq(wallets.user_id, userId), eq(wallets.currency, "PKR")))
        .for("update");
      if (!wallet) throw new Error("Wallet not found");

      const payout = parseFloat((betAmount * multiplier).toFixed(2));
      const newBalance = parseFloat((Number(wallet.balance) + payout).toFixed(2));

      await tx.update(wallets).set({
        balance: String(newBalance),
        total_won: String((Number(wallet.total_won) + payout).toFixed(2)),
        updated_at: new Date(),
      }).where(eq(wallets.id, wallet.id));

      await tx.insert(transactions).values({
        wallet_id: wallet.id,
        type: "bet",
        amount: String(payout.toFixed(2)),
        balance_before: String(Number(wallet.balance).toFixed(2)),
        balance_after: String(newBalance),
        reference_type: "game_round",
        reference_id: roundId,
        description: `dragon-tower — top reached ${multiplier.toFixed(2)}×`,
      });

      await tx.insert(bets).values({
        user_id: userId,
        round_id: roundId,
        amount: String(betAmount.toFixed(2)),
        currency: "PKR",
        choice: { difficulty, rowsCleared: newRowsCleared, outcome: "cashed" } as Record<string, unknown>,
        payout: String(payout.toFixed(2)),
        profit: String((payout - betAmount).toFixed(2)),
        status: "settled",
      });

      await tx.update(game_rounds).set({
        outcome: { ...ro, rowsCleared: newRowsCleared, result: "cashed", status: "completed" } as Record<string, unknown>,
        multiplier: String(multiplier.toFixed(4)),
        status: "completed",
        completed_at: new Date(),
      }).where(eq(game_rounds.id, roundId));

      return { result: "won", row, rowsCleared: newRowsCleared, multiplier, payout, newBalance, layout };
    }

    // Still climbing — advance the server-tracked rowsCleared.
    await tx.update(game_rounds).set({
      outcome: { ...ro, rowsCleared: newRowsCleared } as Record<string, unknown>,
    }).where(eq(game_rounds.id, roundId));

    return { result: "safe", row, rowsCleared: newRowsCleared, multiplier };
  });
}

export async function settleDragonTowerRound(input: {
  roundId: string;
  outcome: "cashed" | "lost";
}): Promise<{ newBalance: number }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const { roundId, outcome } = input;

  return db.transaction(async (tx) => {
    const [round] = await tx
      .select().from(game_rounds)
      .where(and(eq(game_rounds.id, roundId), eq(game_rounds.status, "pending")))
      .for("update").limit(1);
    if (!round) throw new Error("Round not found or already settled");

    const ro = round.outcome as {
      userId?: string;
      difficulty?: TowerDifficulty;
      rowsCleared?: number;
      betAmount?: number;
      isWinRound?: boolean;
    };
    if (ro.userId !== userId) throw new Error("Forbidden");

    const difficulty = ro.difficulty as TowerDifficulty;
    const rowsCleared = ro.rowsCleared ?? 0;
    const amount = ro.betAmount ?? 0;

    // Cashout is only valid after at least one cleared row. Loss rounds can never
    // reach here with rows cleared (reveal forces a dragon on the first pick).
    if (outcome === "cashed" && rowsCleared < 1)
      throw new Error("Climb at least one row before cashing out");

    const multiplier = outcome === "cashed" ? towerMultiplier(difficulty, rowsCleared) : 0;
    const payout = outcome === "cashed" ? parseFloat((amount * multiplier).toFixed(2)) : 0;
    const profit = parseFloat((payout - amount).toFixed(2));

    const [wallet] = await tx
      .select().from(wallets)
      .where(and(eq(wallets.user_id, userId), eq(wallets.currency, "PKR")))
      .for("update");
    if (!wallet) throw new Error("Wallet not found");

    const newBalance = parseFloat((Number(wallet.balance) + payout).toFixed(2));
    if (payout > 0) {
      await tx.update(wallets).set({
        balance: String(newBalance),
        total_won: String((Number(wallet.total_won) + payout).toFixed(2)),
        updated_at: new Date(),
      }).where(eq(wallets.id, wallet.id));

      await tx.insert(transactions).values({
        wallet_id: wallet.id,
        type: "bet",
        amount: String(payout.toFixed(2)),
        balance_before: String(Number(wallet.balance).toFixed(2)),
        balance_after: String(newBalance),
        reference_type: "game_round",
        reference_id: roundId,
        description: `dragon-tower — cashout ${multiplier.toFixed(2)}×`,
      });
    }

    await tx.insert(bets).values({
      user_id: userId,
      round_id: roundId,
      amount: String(amount.toFixed(2)),
      currency: "PKR",
      choice: { difficulty, rowsCleared, outcome } as Record<string, unknown>,
      payout: String(payout.toFixed(2)),
      profit: String(profit.toFixed(2)),
      status: "settled",
    });

    await tx.update(game_rounds).set({
      outcome: { ...ro, result: outcome, status: "completed" } as Record<string, unknown>,
      multiplier: String(multiplier.toFixed(4)),
      status: "completed",
      completed_at: new Date(),
    }).where(eq(game_rounds.id, roundId));

    return { newBalance };
  });
}

// ─── Plinko ─────────────────────────────────────────────────────────────────
// Single-transaction, but NOT a placeBet branch: Plinko ALWAYS pays bucket × bet
// (even sub-1× buckets return part of the stake), so it can't use placeBet's
// win-gated payout. House safety: normal players' win probability is capped by
// plinkoMaxWinPct for the chosen config; uncapped players keep their exact rate.
export async function placePlinkoBet(input: {
  amount: number;
  rows: number;
  risk: string;
}): Promise<{ path: ("L" | "R")[]; bucket: number; multiplier: number; payout: number; profit: number; won: boolean; newBalance: number }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const { amount, rows, risk } = input;
  if (!Number.isFinite(amount) || amount < MIN_BET) throw new Error(`Minimum bet is PKR ${fmtPkr(MIN_BET)}`);
  if (amount > MAX_BET) throw new Error(`Maximum bet is PKR ${fmtPkr(MAX_BET)}`);
  if (!isPlinkoRows(rows)) throw new Error("Invalid rows");
  if (!isPlinkoRisk(risk)) throw new Error("Invalid risk");

  await assertGamePlayable("plinko");

  const { winProbability, isPromo, uncapped } = await getPlayerWinProbability(userId, amount);
  const effectiveWinPct = uncapped
    ? winProbability
    : Math.min(winProbability, plinkoMaxWinPct(rows, risk));

  return db.transaction(async (tx) => {
    const [wallet] = await tx
      .select().from(wallets)
      .where(and(eq(wallets.user_id, userId), eq(wallets.currency, "PKR")))
      .for("update");
    if (!wallet) throw new Error("Wallet not found");
    if (Number(wallet.balance) < amount) throw new Error("Insufficient balance");

    const { seed: serverSeed, hash: serverSeedHash } = generateServerSeed();
    const { path, bucket, multiplier } = dropPlinkoWithProbability(serverSeed, effectiveWinPct, rows, risk);

    const payout = parseFloat((amount * multiplier).toFixed(2));
    const profit = parseFloat((payout - amount).toFixed(2));
    const won = profit > 0;
    const balanceBefore = Number(wallet.balance);
    const balanceAfter = parseFloat((balanceBefore - amount + payout).toFixed(2));

    const [round] = await tx.insert(game_rounds).values({
      game_type: "plinko",
      server_seed: serverSeed,
      server_seed_hash: serverSeedHash,
      client_seed: "pulsenow",
      nonce: 0,
      outcome: { userId, rows, risk, path, bucket, multiplier } as Record<string, unknown>,
      multiplier: String(multiplier.toFixed(4)),
      house_edge: "0.0100",
      win_probability: String(winProbability.toFixed(2)),
      effective_win_probability: String(effectiveWinPct.toFixed(2)),
      expected_rtp: String(plinkoExpectedRtp(rows, risk, effectiveWinPct).toFixed(4)),
      is_promo: isPromo,
      // Plinko always pays something — "win" means the engine sampled a profit
      // bucket (mult > 1), which is exactly what effectiveWinPct controls.
      is_win_round: multiplier > 1,
      status: "completed",
      completed_at: new Date(),
    }).returning();

    const [bet] = await tx.insert(bets).values({
      user_id: userId,
      round_id: round.id,
      amount: String(amount.toFixed(2)),
      currency: "PKR",
      choice: { rows, risk } as Record<string, unknown>,
      payout: String(payout.toFixed(2)),
      profit: String(profit.toFixed(2)),
      status: "settled",
    }).returning();

    await tx.update(wallets).set({
      balance: String(balanceAfter.toFixed(2)),
      total_wagered: String((Number(wallet.total_wagered) + amount).toFixed(2)),
      // Only count net wins (profit > 0) toward total_won — a sub-1× bucket returns
      // part of the stake but is still a net loss. Matches placeBet's convention.
      total_won: won
        ? String((Number(wallet.total_won) + payout).toFixed(2))
        : wallet.total_won,
      updated_at: new Date(),
    }).where(eq(wallets.id, wallet.id));

    await tx.insert(transactions).values({
      wallet_id: wallet.id,
      type: "bet",
      amount: String(profit.toFixed(2)),
      balance_before: String(balanceBefore.toFixed(2)),
      balance_after: String(balanceAfter.toFixed(2)),
      reference_type: "bet",
      reference_id: bet.id,
      description: `plinko — ${multiplier.toFixed(2)}× bucket`,
    });

    return { path, bucket, multiplier, payout, profit, won, newBalance: balanceAfter };
  });
}

// ─── Dragon vs Tiger ──────────────────────────────────────────────────────────
// One shot, zero client trust: the whole round (debit → resolve → credit) settles
// in a single transaction the moment bets lock. There is no pending state and no
// settle round-trip — the client can only animate what is already settled.
//
// Multi-zone stakes make this a PORTFOLIO bet: a "losing" outcome can still
// return money (dragon+tiger hedge), so the flat capWinProbabilityForHouseEdge is
// NOT safe here. Normal players are capped by dtMaxWinPct (the qMax portfolio
// cap, same correction as Plinko/Keno); uncapped players keep their exact rate.

export interface DragonTigerResult {
  roundId: string;
  winner: DtZone;
  dragonCard: DtCard;
  tigerCard: DtCard;
  totalStaked: number;
  payout: number;
  profit: number;
  won: boolean;
  newBalance: number;
}

export async function playDragonTigerRound(input: {
  bets: unknown;
  clientSeed?: string;
}): Promise<DragonTigerResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const dtBets = normalizeDtBets(input.bets);
  if (!dtBets) throw new Error("Invalid bets — each zone min PKR 10, round total PKR 10–20,000");
  const totalStaked = dtTotal(dtBets);
  const clientSeed = input.clientSeed ?? "pulsenow";

  await assertGamePlayable("dragon-tiger");

  const { winProbability, isPromo, uncapped } = await getPlayerWinProbability(userId, totalStaked);
  const effectiveWinPct = uncapped
    ? winProbability
    : Math.min(winProbability, dtMaxWinPct(dtBets));
  const expectedRtp = dtExpectedRtp(dtBets, effectiveWinPct);

  return db.transaction(async (tx) => {
    const [wallet] = await tx
      .select().from(wallets)
      .where(and(eq(wallets.user_id, userId), eq(wallets.currency, "PKR")))
      .for("update");
    if (!wallet) throw new Error("Wallet not found. Please make a deposit first.");
    if (Number(wallet.balance) < totalStaked) throw new Error("Insufficient balance.");

    const [{ nonce }] = await tx
      .select({ nonce: sql<number>`count(*)::int` })
      .from(bets)
      .where(eq(bets.user_id, userId));

    const { seed: serverSeed, hash: serverSeedHash } = generateServerSeed();
    const deal = resolveDragonTigerWithProbability(serverSeed, effectiveWinPct, dtBets);

    const payout = parseFloat(dtReturn(dtBets, deal.winner).toFixed(2));
    const profit = parseFloat((payout - totalStaked).toFixed(2));
    const portfolioMultiplier = payout / totalStaked;
    const balanceBefore = Number(wallet.balance);
    const balanceAfter = parseFloat((balanceBefore - totalStaked + payout).toFixed(2));

    const [round] = await tx.insert(game_rounds).values({
      game_type: "dragon-tiger",
      server_seed: serverSeed,
      server_seed_hash: serverSeedHash,
      client_seed: clientSeed,
      nonce: Number(nonce),
      outcome: {
        bets: dtBets,
        winner: deal.winner,
        dragonCard: deal.dragonCard,
        tigerCard: deal.tigerCard,
      } as Record<string, unknown>,
      multiplier: String(portfolioMultiplier.toFixed(4)),
      house_edge: "0.0500",
      win_probability: String(winProbability.toFixed(2)),
      effective_win_probability: String(effectiveWinPct.toFixed(2)),
      expected_rtp: String(expectedRtp.toFixed(4)),
      is_promo: isPromo,
      is_win_round: deal.win,
      status: "completed",
      completed_at: new Date(),
    }).returning();

    const [bet] = await tx.insert(bets).values({
      user_id: userId,
      round_id: round.id,
      amount: String(totalStaked.toFixed(2)),
      currency: "PKR",
      choice: { bets: dtBets } as Record<string, unknown>,
      payout: String(payout.toFixed(2)),
      profit: String(profit.toFixed(2)),
      status: "settled",
    }).returning();

    await tx.update(wallets).set({
      balance: String(balanceAfter.toFixed(2)),
      total_wagered: String((Number(wallet.total_wagered) + totalStaked).toFixed(2)),
      // Only net-positive rounds count toward total_won — a hedge's partial return
      // is still a net loss. Matches Plinko's convention.
      total_won: deal.win
        ? String((Number(wallet.total_won) + payout).toFixed(2))
        : wallet.total_won,
      updated_at: new Date(),
    }).where(eq(wallets.id, wallet.id));

    await tx.insert(transactions).values({
      wallet_id: wallet.id,
      type: "bet",
      amount: String(profit.toFixed(2)),
      balance_before: String(balanceBefore.toFixed(2)),
      balance_after: String(balanceAfter.toFixed(2)),
      reference_type: "bet",
      reference_id: bet.id,
      description: `dragon-tiger — ${deal.winner} (${deal.win ? "win" : "loss"})`,
    });

    return {
      roundId: round.id,
      winner: deal.winner,
      dragonCard: deal.dragonCard,
      tigerCard: deal.tigerCard,
      totalStaked,
      payout,
      profit,
      won: deal.win,
      newBalance: balanceAfter,
    };
  });
}

// ── Teen Patti 20-20 ────────────────────────────────────────────────────────

export interface TeenPattiResult {
  roundId: string;
  outcome: TpOutcomeKey;
  winner: TpWinner;
  handA: TpHand;
  handB: TpHand;
  catA: TpCat;
  catB: TpCat;
  totalStaked: number;
  payout: number;
  profit: number;
  won: boolean;
  newBalance: number;
}

export async function playTeenPattiRound(input: {
  bets: unknown;
  clientSeed?: string;
}): Promise<TeenPattiResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("Unauthorized");

  const tpBets = normalizeTpBets(input.bets);
  if (!tpBets) throw new Error("Invalid bets — each zone min PKR 10, round total PKR 10–20,000");
  const totalStaked = tpTotal(tpBets);
  const clientSeed = input.clientSeed ?? "pulsenow";

  await assertGamePlayable("teen-patti");

  const { winProbability, isPromo, uncapped } = await getPlayerWinProbability(userId, totalStaked);
  const effectiveWinPct = uncapped
    ? winProbability
    : Math.min(winProbability, tpMaxWinPct(tpBets));
  const expectedRtp = tpExpectedRtp(tpBets, effectiveWinPct);

  return db.transaction(async (tx) => {
    const [wallet] = await tx
      .select().from(wallets)
      .where(and(eq(wallets.user_id, userId), eq(wallets.currency, "PKR")))
      .for("update");
    if (!wallet) throw new Error("Wallet not found. Please make a deposit first.");
    if (Number(wallet.balance) < totalStaked) throw new Error("Insufficient balance.");

    const [{ nonce }] = await tx
      .select({ nonce: sql<number>`count(*)::int` })
      .from(bets)
      .where(eq(bets.user_id, userId));

    const { seed: serverSeed, hash: serverSeedHash } = generateServerSeed();
    const deal = resolveTeenPattiWithProbability(serverSeed, effectiveWinPct, tpBets);

    const winner = TP_OUTCOME[deal.outcome].winner;
    const catA = deal.scoreA[0] as TpCat;
    const catB = deal.scoreB[0] as TpCat;

    const payout = parseFloat(tpReturn(tpBets, deal.outcome).toFixed(2));
    const profit = parseFloat((payout - totalStaked).toFixed(2));
    const portfolioMultiplier = payout / totalStaked;
    const balanceBefore = Number(wallet.balance);
    const balanceAfter = parseFloat((balanceBefore - totalStaked + payout).toFixed(2));

    const [round] = await tx.insert(game_rounds).values({
      game_type: "teen-patti",
      server_seed: serverSeed,
      server_seed_hash: serverSeedHash,
      client_seed: clientSeed,
      nonce: Number(nonce),
      outcome: {
        bets: tpBets,
        outcome: deal.outcome,
        winner,
        handA: deal.handA,
        handB: deal.handB,
        catA,
        catB,
      } as Record<string, unknown>,
      multiplier: String(portfolioMultiplier.toFixed(4)),
      house_edge: TP_HOUSE_EDGE.toFixed(4),
      win_probability: String(winProbability.toFixed(2)),
      effective_win_probability: String(effectiveWinPct.toFixed(2)),
      expected_rtp: String(expectedRtp.toFixed(4)),
      is_promo: isPromo,
      is_win_round: deal.win,
      status: "completed",
      completed_at: new Date(),
    }).returning();

    const [bet] = await tx.insert(bets).values({
      user_id: userId,
      round_id: round.id,
      amount: String(totalStaked.toFixed(2)),
      currency: "PKR",
      choice: { bets: tpBets } as Record<string, unknown>,
      payout: String(payout.toFixed(2)),
      profit: String(profit.toFixed(2)),
      status: "settled",
    }).returning();

    await tx.update(wallets).set({
      balance: String(balanceAfter.toFixed(2)),
      total_wagered: String((Number(wallet.total_wagered) + totalStaked).toFixed(2)),
      // Only net-positive rounds count toward total_won — a hedge's partial return
      // is still a net loss. Matches Plinko / Dragon Tiger's convention.
      total_won: deal.win
        ? String((Number(wallet.total_won) + payout).toFixed(2))
        : wallet.total_won,
      updated_at: new Date(),
    }).where(eq(wallets.id, wallet.id));

    await tx.insert(transactions).values({
      wallet_id: wallet.id,
      type: "bet",
      amount: String(profit.toFixed(2)),
      balance_before: String(balanceBefore.toFixed(2)),
      balance_after: String(balanceAfter.toFixed(2)),
      reference_type: "bet",
      reference_id: bet.id,
      description: `teen-patti — ${winner} ${TP_CAT_LABEL[winner === "player-a" ? catA : catB]} (${deal.win ? "win" : "loss"})`,
    });

    return {
      roundId: round.id,
      outcome: deal.outcome,
      winner,
      handA: deal.handA,
      handB: deal.handB,
      catA,
      catB,
      totalStaked,
      payout,
      profit,
      won: deal.win,
      newBalance: balanceAfter,
    };
  });
}
