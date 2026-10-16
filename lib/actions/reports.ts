"use server";

import { db } from "@/lib/db";
import {
  bets,
  game_rounds,
  deposits,
  withdrawals,
  wallets,
  profiles,
  promotion_players,
  referral_earnings,
} from "@/lib/supabase/schema";
import { eq, and, gte, lte, sql, desc, asc, count, sum } from "drizzle-orm";
import { verifyCapability } from "@/lib/auth/permissions";

// ─── Auth guard ───────────────────────────────────────────────────────────────

// Revenue, GGR, player value and edge validation are superadmin-only — see the
// capability table in lib/auth/roles.ts.
const verifyReportsAccess = () => verifyCapability("view_reports");

// ─── Shared types ─────────────────────────────────────────────────────────────

export type Grain = "hour" | "day" | "week";

export interface DateRange {
  from: Date;
  to: Date;
}

// ─── 4.1  Overview KPIs ───────────────────────────────────────────────────────

export interface OverviewKpis {
  turnover: number;
  ggr: number;
  holdPct: number;
  netCashFlow: number;
  dau: number;
  newSignups: number;
  activePlayers: number;
  pendingWithdrawalsCount: number;
  pendingWithdrawalsAmount: number;
  // Previous period for deltas
  prevTurnover: number;
  prevGgr: number;
  prevDau: number;
  prevNewSignups: number;
  // Trend series (daily GGR + turnover) for the chosen range
  trend: Array<{ period: string; ggr: number; turnover: number }>;
}

export async function getOverviewKpis(range: DateRange): Promise<OverviewKpis> {
  await verifyReportsAccess();

  // postgres-js simple-query mode (prepare:false) cannot serialize Date objects
  // in raw sql templates — convert to ISO strings for db.execute() calls only.
  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();

  const span = range.to.getTime() - range.from.getTime();
  const prevFrom = new Date(range.from.getTime() - span);
  const prevTo = new Date(range.from.getTime() - 1);

  const [betsAgg, prevBetsAgg, depositsAgg, withdrawalsAgg, dauRow, newSignupsRow, prevDauRow, prevSignupsRow, pendingWdRow, trendRows] =
    await Promise.all([
      // Current period bets
      db
        .select({
          turnover: sql<string>`COALESCE(SUM(${bets.amount}), 0)`,
          payout: sql<string>`COALESCE(SUM(${bets.payout}), 0)`,
        })
        .from(bets)
        .where(
          and(
            eq(bets.status, "settled"),
            gte(bets.created_at, range.from),
            lte(bets.created_at, range.to)
          )
        ),

      // Previous period bets
      db
        .select({
          turnover: sql<string>`COALESCE(SUM(${bets.amount}), 0)`,
          payout: sql<string>`COALESCE(SUM(${bets.payout}), 0)`,
        })
        .from(bets)
        .where(
          and(
            eq(bets.status, "settled"),
            gte(bets.created_at, prevFrom),
            lte(bets.created_at, prevTo)
          )
        ),

      // Confirmed deposits in range
      db
        .select({ total: sql<string>`COALESCE(SUM(${deposits.amount}), 0)` })
        .from(deposits)
        .where(
          and(
            eq(deposits.status, "confirmed"),
            gte(deposits.created_at, range.from),
            lte(deposits.created_at, range.to)
          )
        ),

      // Processed withdrawals in range
      db
        .select({ total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)` })
        .from(withdrawals)
        .where(
          and(
            eq(withdrawals.status, "completed"),
            gte(withdrawals.created_at, range.from),
            lte(withdrawals.created_at, range.to)
          )
        ),

      // DAU — distinct players with settled bets today
      db
        .select({ dau: sql<number>`COUNT(DISTINCT ${bets.user_id})` })
        .from(bets)
        .where(
          and(
            eq(bets.status, "settled"),
            gte(bets.created_at, range.from),
            lte(bets.created_at, range.to)
          )
        ),

      // New signups in range
      db
        .select({ total: count() })
        .from(profiles)
        .where(
          and(
            eq(profiles.role, "player"),
            gte(profiles.created_at, range.from),
            lte(profiles.created_at, range.to)
          )
        ),

      // Previous DAU
      db
        .select({ dau: sql<number>`COUNT(DISTINCT ${bets.user_id})` })
        .from(bets)
        .where(
          and(
            eq(bets.status, "settled"),
            gte(bets.created_at, prevFrom),
            lte(bets.created_at, prevTo)
          )
        ),

      // Previous new signups
      db
        .select({ total: count() })
        .from(profiles)
        .where(
          and(
            eq(profiles.role, "player"),
            gte(profiles.created_at, prevFrom),
            lte(profiles.created_at, prevTo)
          )
        ),

      // Pending withdrawal liability
      db
        .select({
          cnt: count(),
          total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)`,
        })
        .from(withdrawals)
        .where(eq(withdrawals.status, "pending")),

      // Daily GGR + turnover trend
      db.execute(sql`
        SELECT
          date_trunc('day', ${bets.created_at} AT TIME ZONE 'Asia/Karachi') AS period,
          COALESCE(SUM(${bets.amount}), 0)::float                            AS turnover,
          COALESCE(SUM(${bets.amount}) - SUM(${bets.payout}), 0)::float     AS ggr
        FROM ${bets}
        WHERE ${bets.status} = 'settled'
          AND ${bets.created_at} >= ${fromISO}
          AND ${bets.created_at} <= ${toISO}
        GROUP BY 1
        ORDER BY 1
      `),
    ]);

  const turnover = Number(betsAgg[0]?.turnover ?? 0);
  const payout = Number(betsAgg[0]?.payout ?? 0);
  const ggr = turnover - payout;
  const holdPct = turnover > 0 ? ggr / turnover : 0;

  const prevTurnover = Number(prevBetsAgg[0]?.turnover ?? 0);
  const prevPayout = Number(prevBetsAgg[0]?.payout ?? 0);
  const prevGgr = prevTurnover - prevPayout;

  const confirmedDeposits = Number(depositsAgg[0]?.total ?? 0);
  const processedWithdrawals = Number(withdrawalsAgg[0]?.total ?? 0);
  const netCashFlow = confirmedDeposits - processedWithdrawals;

  const trend = ([...trendRows] as Array<{ period: Date; turnover: number; ggr: number }>).map((r) => ({
    period: r.period instanceof Date ? r.period.toISOString().slice(0, 10) : String(r.period).slice(0, 10),
    turnover: Number(r.turnover),
    ggr: Number(r.ggr),
  }));

  return {
    turnover,
    ggr,
    holdPct,
    netCashFlow,
    dau: Number(dauRow[0]?.dau ?? 0),
    newSignups: newSignupsRow[0]?.total ?? 0,
    activePlayers: Number(dauRow[0]?.dau ?? 0),
    pendingWithdrawalsCount: pendingWdRow[0]?.cnt ?? 0,
    pendingWithdrawalsAmount: Number(pendingWdRow[0]?.total ?? 0),
    prevTurnover,
    prevGgr,
    prevDau: Number(prevDauRow[0]?.dau ?? 0),
    prevNewSignups: prevSignupsRow[0]?.total ?? 0,
    trend,
  };
}

// ─── 4.2  Revenue series ──────────────────────────────────────────────────────

export interface RevenuePoint {
  period: string;
  turnover: number;
  ggr: number;
  holdPct: number;
  wins: number;
  rounds: number;
}

export async function getRevenueSeries(
  range: DateRange,
  grain: Grain = "day"
): Promise<RevenuePoint[]> {
  await verifyReportsAccess();

  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();
  const trunc = grain === "hour" ? "hour" : grain === "week" ? "week" : "day";

  const rows = await db.execute(sql`
    SELECT
      date_trunc(${trunc}, ${bets.created_at} AT TIME ZONE 'Asia/Karachi') AS period,
      COALESCE(SUM(${bets.amount}), 0)::float                               AS turnover,
      COALESCE(SUM(${bets.amount}) - SUM(${bets.payout}), 0)::float        AS ggr,
      COUNT(*)::int                                                          AS rounds,
      COUNT(*) FILTER (WHERE ${bets.payout} > 0)::int                       AS wins
    FROM ${bets}
    WHERE ${bets.status} = 'settled'
      AND ${bets.created_at} >= ${fromISO}
      AND ${bets.created_at} <= ${toISO}
    GROUP BY 1
    ORDER BY 1
  `);

  return ([...rows] as Array<{ period: Date; turnover: number; ggr: number; rounds: number; wins: number }>).map((r) => ({
    period: r.period instanceof Date ? r.period.toISOString() : String(r.period),
    turnover: Number(r.turnover),
    ggr: Number(r.ggr),
    holdPct: Number(r.turnover) > 0 ? Number(r.ggr) / Number(r.turnover) : 0,
    rounds: Number(r.rounds),
    wins: Number(r.wins),
  }));
}

// ─── 4.3  Game performance ────────────────────────────────────────────────────

export interface GamePerformanceRow {
  gameType: string;
  rounds: number;
  players: number;
  turnover: number;
  ggr: number;
  holdPct: number;
  avgBet: number;
  biggestWin: number;
  wins: number;
  winFreq: number;
  // Gap #1 — available once win_probability snapshot is live
  avgWinProbability: number | null;
  /** Avg win % the RNG actually used after caps (effective snapshot). */
  avgEffectiveWinPct: number | null;
  /** 1 − stake-weighted expected RTP from the per-round snapshot — the true
   *  theoretical hold for the mix of bets actually placed. */
  expectedHoldPct: number | null;
}

export async function getGamePerformance(range: DateRange): Promise<GamePerformanceRow[]> {
  await verifyReportsAccess();

  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();

  const rows = await db.execute(sql`
    SELECT
      gr.game_type,
      COUNT(b.id)::int                                                     AS rounds,
      COUNT(DISTINCT b.user_id)::int                                       AS players,
      COALESCE(SUM(b.amount), 0)::float                                    AS turnover,
      COALESCE(SUM(b.amount) - SUM(b.payout), 0)::float                   AS ggr,
      COALESCE(MAX(b.payout), 0)::float                                    AS biggest_win,
      COALESCE(AVG(b.amount), 0)::float                                    AS avg_bet,
      COUNT(*) FILTER (WHERE b.payout > 0)::int                            AS wins,
      AVG(gr.win_probability)::float                                        AS avg_win_probability,
      AVG(gr.effective_win_probability)::float                              AS avg_effective_win_pct,
      (SUM(b.amount * gr.expected_rtp::float) FILTER (WHERE gr.expected_rtp IS NOT NULL))
        / NULLIF(SUM(b.amount) FILTER (WHERE gr.expected_rtp IS NOT NULL), 0) AS expected_rtp
    FROM ${bets} b
    JOIN ${game_rounds} gr ON gr.id = b.round_id
    WHERE b.status = 'settled'
      AND b.created_at >= ${fromISO}
      AND b.created_at <= ${toISO}
    GROUP BY gr.game_type
    ORDER BY ggr DESC
  `);

  return ([...rows] as Array<{
    game_type: string;
    rounds: number;
    players: number;
    turnover: number;
    ggr: number;
    biggest_win: number;
    avg_bet: number;
    wins: number;
    avg_win_probability: number | null;
    avg_effective_win_pct: number | null;
    expected_rtp: number | null;
  }>).map((r) => {
    const turnover = Number(r.turnover);
    const ggr = Number(r.ggr);
    const rounds = Number(r.rounds);
    const wins = Number(r.wins);
    return {
      gameType: r.game_type,
      rounds,
      players: Number(r.players),
      turnover,
      ggr,
      holdPct: turnover > 0 ? ggr / turnover : 0,
      avgBet: Number(r.avg_bet),
      biggestWin: Number(r.biggest_win),
      wins,
      winFreq: rounds > 0 ? wins / rounds : 0,
      avgWinProbability: r.avg_win_probability != null ? Number(r.avg_win_probability) : null,
      avgEffectiveWinPct: r.avg_effective_win_pct != null ? Number(r.avg_effective_win_pct) : null,
      expectedHoldPct: r.expected_rtp != null ? 1 - Number(r.expected_rtp) : null,
    };
  });
}

// ─── 4.4  Player stats (DAU/MAU, new signups, ARPU) ──────────────────────────

export interface PlayerStats {
  dau: number;
  mau: number;
  newSignups: number;
  arpu: number;
  // Per-day active user trend
  trend: Array<{ period: string; activeUsers: number; newSignups: number }>;
}

export async function getPlayerStats(range: DateRange): Promise<PlayerStats> {
  await verifyReportsAccess();

  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();
  const rangeMs = range.to.getTime() - range.from.getTime();
  const days = rangeMs / (1000 * 60 * 60 * 24);

  // MAU window = last 30 days anchored at range.to
  const mauFrom = new Date(range.to.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [dauRow, mauRow, signupsRow, ggrRow, trendRows] = await Promise.all([
    db
      .select({ dau: sql<number>`COUNT(DISTINCT ${bets.user_id})` })
      .from(bets)
      .where(
        and(
          eq(bets.status, "settled"),
          gte(bets.created_at, range.from),
          lte(bets.created_at, range.to)
        )
      ),

    db
      .select({ mau: sql<number>`COUNT(DISTINCT ${bets.user_id})` })
      .from(bets)
      .where(
        and(
          eq(bets.status, "settled"),
          gte(bets.created_at, mauFrom),
          lte(bets.created_at, range.to)
        )
      ),

    db
      .select({ total: count() })
      .from(profiles)
      .where(
        and(
          eq(profiles.role, "player"),
          gte(profiles.created_at, range.from),
          lte(profiles.created_at, range.to)
        )
      ),

    db.execute(sql`
      SELECT COALESCE(SUM(${bets.amount}) - SUM(${bets.payout}), 0)::float AS ggr,
             COUNT(DISTINCT ${bets.user_id}) AS active
      FROM ${bets}
      WHERE ${bets.status} = 'settled'
        AND ${bets.created_at} >= ${fromISO}
        AND ${bets.created_at} <= ${toISO}
    `),

    days <= 90
      ? db.execute(sql`
          SELECT
            date_trunc('day', b.created_at AT TIME ZONE 'Asia/Karachi') AS period,
            COUNT(DISTINCT b.user_id)::int                               AS active_users,
            COUNT(p.id)::int                                             AS new_signups
          FROM ${bets} b
          LEFT JOIN ${profiles} p
            ON p.role = 'player'
            AND date_trunc('day', p.created_at AT TIME ZONE 'Asia/Karachi')
              = date_trunc('day', b.created_at AT TIME ZONE 'Asia/Karachi')
          WHERE b.status = 'settled'
            AND b.created_at >= ${fromISO}
            AND b.created_at <= ${toISO}
          GROUP BY 1
          ORDER BY 1
        `)
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  const ggrRow0 = [...ggrRow][0] as { ggr: number; active: number } | undefined;
  const ggr = Number(ggrRow0?.ggr ?? 0);
  const active = Number(ggrRow0?.active ?? 1);
  const arpu = active > 0 ? ggr / active : 0;

  const trend = ([...trendRows] as Array<{ period: Date; active_users: number; new_signups: number }>).map((r) => ({
    period: r.period instanceof Date ? r.period.toISOString().slice(0, 10) : String(r.period).slice(0, 10),
    activeUsers: Number(r.active_users),
    newSignups: Number(r.new_signups),
  }));

  return {
    dau: Number(dauRow[0]?.dau ?? 0),
    mau: Number(mauRow[0]?.mau ?? 0),
    newSignups: signupsRow[0]?.total ?? 0,
    arpu,
    trend,
  };
}

// ─── Top players (winners / losers) ──────────────────────────────────────────

export interface TopPlayerRow {
  userId: string;
  username: string | null;
  rounds: number;
  turnover: number;
  profit: number;          // player-centric (positive = player won)
  ggr: number;             // house-centric (positive = house won)
  winFreq: number;
}

export async function getTopPlayers(
  range: DateRange,
  direction: "winners" | "losers",
  limit = 20
): Promise<TopPlayerRow[]> {
  await verifyReportsAccess();

  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();
  const orderCol = direction === "winners"
    ? sql`SUM(b.profit) DESC`
    : sql`SUM(b.profit) ASC`;

  const rows = await db.execute(sql`
    SELECT
      b.user_id,
      p.username,
      COUNT(b.id)::int                                     AS rounds,
      COALESCE(SUM(b.amount), 0)::float                    AS turnover,
      COALESCE(SUM(b.profit), 0)::float                    AS profit,
      COUNT(*) FILTER (WHERE b.payout > 0)::int            AS wins
    FROM ${bets} b
    JOIN ${profiles} p ON p.id = b.user_id
    WHERE b.status = 'settled'
      AND b.created_at >= ${fromISO}
      AND b.created_at <= ${toISO}
    GROUP BY b.user_id, p.username
    ORDER BY ${orderCol}
    LIMIT ${limit}
  `);

  return ([...rows] as Array<{
    user_id: string;
    username: string | null;
    rounds: number;
    turnover: number;
    profit: number;
    wins: number;
  }>).map((r) => ({
    userId: r.user_id,
    username: r.username,
    rounds: Number(r.rounds),
    turnover: Number(r.turnover),
    profit: Number(r.profit),
    ggr: -Number(r.profit),
    winFreq: Number(r.rounds) > 0 ? Number(r.wins) / Number(r.rounds) : 0,
  }));
}

// ─── 4.5  Cash flow + pending liability ───────────────────────────────────────

export interface CashFlowData {
  totalDeposits: number;
  totalWithdrawals: number;
  netCashFlow: number;
  depositCount: number;
  withdrawalCount: number;
  depositSuccessRate: number;
  withdrawalSuccessRate: number;
  pendingDeposits: number;
  pendingDepositsAmount: number;
  pendingWithdrawals: number;
  pendingWithdrawalsAmount: number;
  series: Array<{
    period: string;
    deposits: number;
    withdrawals: number;
    net: number;
  }>;
}

export async function getCashFlow(range: DateRange): Promise<CashFlowData> {
  await verifyReportsAccess();

  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();

  const [depAgg, wdAgg, pendingDep, pendingWd, seriesRows] = await Promise.all([
    db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END), 0)::float AS confirmed_total,
        COUNT(*) FILTER (WHERE status = 'confirmed')::int                               AS confirmed_count,
        COUNT(*) FILTER (WHERE status IN ('confirmed','rejected','pending'))::int        AS total_count
      FROM ${deposits}
      WHERE created_at >= ${fromISO} AND created_at <= ${toISO}
    `),

    db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0)::float AS processed_total,
        COUNT(*) FILTER (WHERE status = 'completed')::int                               AS processed_count,
        COUNT(*) FILTER (WHERE status IN ('completed','processing','failed','pending'))::int AS total_count
      FROM ${withdrawals}
      WHERE created_at >= ${fromISO} AND created_at <= ${toISO}
    `),

    db
      .select({
        cnt: count(),
        total: sql<string>`COALESCE(SUM(${deposits.amount}), 0)`,
      })
      .from(deposits)
      .where(eq(deposits.status, "pending")),

    db
      .select({
        cnt: count(),
        total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)`,
      })
      .from(withdrawals)
      .where(eq(withdrawals.status, "pending")),

    db.execute(sql`
      SELECT
        date_trunc('day', d.day AT TIME ZONE 'Asia/Karachi') AS period,
        COALESCE(SUM(d.dep), 0)::float                        AS deposits,
        COALESCE(SUM(d.wd), 0)::float                         AS withdrawals
      FROM (
        SELECT
          created_at AS day,
          amount AS dep,
          0 AS wd
        FROM ${deposits}
        WHERE status = 'confirmed'
          AND created_at >= ${fromISO}
          AND created_at <= ${toISO}
        UNION ALL
        SELECT
          created_at AS day,
          0 AS dep,
          amount AS wd
        FROM ${withdrawals}
        WHERE status = 'completed'
          AND created_at >= ${fromISO}
          AND created_at <= ${toISO}
      ) d
      GROUP BY 1
      ORDER BY 1
    `),
  ]);

  const depRow = ([...depAgg][0]) as { confirmed_total: number; confirmed_count: number; total_count: number } | undefined;
  const wdRow = ([...wdAgg][0]) as { processed_total: number; processed_count: number; total_count: number } | undefined;

  const totalDeposits = Number(depRow?.confirmed_total ?? 0);
  const totalWithdrawals = Number(wdRow?.processed_total ?? 0);

  const series = ([...seriesRows] as Array<{ period: Date; deposits: number; withdrawals: number }>).map((r) => ({
    period: r.period instanceof Date ? r.period.toISOString().slice(0, 10) : String(r.period).slice(0, 10),
    deposits: Number(r.deposits),
    withdrawals: Number(r.withdrawals),
    net: Number(r.deposits) - Number(r.withdrawals),
  }));

  return {
    totalDeposits,
    totalWithdrawals,
    netCashFlow: totalDeposits - totalWithdrawals,
    depositCount: Number(depRow?.confirmed_count ?? 0),
    withdrawalCount: Number(wdRow?.processed_count ?? 0),
    depositSuccessRate:
      Number(depRow?.total_count ?? 0) > 0
        ? Number(depRow?.confirmed_count ?? 0) / Number(depRow?.total_count ?? 1)
        : 0,
    withdrawalSuccessRate:
      Number(wdRow?.total_count ?? 0) > 0
        ? Number(wdRow?.processed_count ?? 0) / Number(wdRow?.total_count ?? 1)
        : 0,
    pendingDeposits: pendingDep[0]?.cnt ?? 0,
    pendingDepositsAmount: Number(pendingDep[0]?.total ?? 0),
    pendingWithdrawals: pendingWd[0]?.cnt ?? 0,
    pendingWithdrawalsAmount: Number(pendingWd[0]?.total ?? 0),
    series,
  };
}

// ─── Pending liability ────────────────────────────────────────────────────────

export interface PendingLiability {
  walletBalances: number;       // Σ wallets.balance — money owed to all players
  openRoundsValue: number;      // bets in pending game_rounds (not yet settled)
  pendingWithdrawals: number;   // withdrawals already requested, not yet paid
  total: number;
}

export async function getPendingLiability(): Promise<PendingLiability> {
  await verifyReportsAccess();

  const [walletsRow, openRoundsRow, pendingWdRow] = await Promise.all([
    db
      .select({ total: sql<string>`COALESCE(SUM(${wallets.balance}), 0)` })
      .from(wallets),

    // Sum of bet amounts for rounds that are still pending (unsettled)
    db.execute(sql`
      SELECT COALESCE(SUM(b.amount), 0)::float AS total
      FROM ${bets} b
      JOIN ${game_rounds} gr ON gr.id = b.round_id
      WHERE gr.status = 'pending'
    `),

    db
      .select({ total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)` })
      .from(withdrawals)
      .where(eq(withdrawals.status, "pending")),
  ]);

  const walletBalances = Number(walletsRow[0]?.total ?? 0);
  const openRoundsValue = Number(([...openRoundsRow][0] as { total: number } | undefined)?.total ?? 0);
  const pendingWithdrawals = Number(pendingWdRow[0]?.total ?? 0);

  return {
    walletBalances,
    openRoundsValue,
    pendingWithdrawals,
    total: walletBalances + openRoundsValue + pendingWithdrawals,
  };
}

// ─── 4.6  Promo cost ──────────────────────────────────────────────────────────

export interface PromoCostData {
  promoTurnover: number;
  promoGgr: number;             // negative = house lost on promo players
  promoRounds: number;
  promoPlayers: number;
  normalTurnover: number;
  normalGgr: number;
  normalRounds: number;
}

export async function getPromoCost(range: DateRange): Promise<PromoCostData> {
  await verifyReportsAccess();

  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();

  const rows = await db.execute(sql`
    SELECT
      gr.is_promo,
      COUNT(b.id)::int                                    AS rounds,
      COUNT(DISTINCT b.user_id)::int                      AS players,
      COALESCE(SUM(b.amount), 0)::float                   AS turnover,
      COALESCE(SUM(b.amount) - SUM(b.payout), 0)::float  AS ggr
    FROM ${bets} b
    JOIN ${game_rounds} gr ON gr.id = b.round_id
    WHERE b.status = 'settled'
      AND b.created_at >= ${fromISO}
      AND b.created_at <= ${toISO}
    GROUP BY gr.is_promo
  `);

  let promoTurnover = 0, promoGgr = 0, promoRounds = 0, promoPlayers = 0;
  let normalTurnover = 0, normalGgr = 0, normalRounds = 0;

  for (const r of [...rows] as Array<{ is_promo: boolean; rounds: number; players: number; turnover: number; ggr: number }>) {
    if (r.is_promo) {
      promoTurnover = Number(r.turnover);
      promoGgr = Number(r.ggr);
      promoRounds = Number(r.rounds);
      promoPlayers = Number(r.players);
    } else {
      normalTurnover = Number(r.turnover);
      normalGgr = Number(r.ggr);
      normalRounds = Number(r.rounds);
    }
  }

  return { promoTurnover, promoGgr, promoRounds, promoPlayers, normalTurnover, normalGgr, normalRounds };
}

// ─── 4.7  Activity heatmap (day-of-week × hour) ───────────────────────────────

export interface HeatmapCell {
  dow: number;   // 0=Sunday … 6=Saturday
  hour: number;  // 0–23
  rounds: number;
  turnover: number;
}

export async function getActivityHeatmap(range: DateRange): Promise<HeatmapCell[]> {
  await verifyReportsAccess();

  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();

  const rows = await db.execute(sql`
    SELECT
      EXTRACT(DOW FROM created_at AT TIME ZONE 'Asia/Karachi')::int  AS dow,
      EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Karachi')::int AS hour,
      COUNT(*)::int                                                    AS rounds,
      COALESCE(SUM(amount), 0)::float                                  AS turnover
    FROM ${bets}
    WHERE status = 'settled'
      AND created_at >= ${fromISO}
      AND created_at <= ${toISO}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `);

  return ([...rows] as Array<{ dow: number; hour: number; rounds: number; turnover: number }>).map((r) => ({
    dow: Number(r.dow),
    hour: Number(r.hour),
    rounds: Number(r.rounds),
    turnover: Number(r.turnover),
  }));
}

// ─── 4.9  Validation report (win-probability QA) ─────────────────────────────

export interface ValidationRow {
  gameType: string;
  winProbability: number | null;
  /** Avg win % the RNG actually used after house-edge caps (snapshot). */
  effectiveWinPct: number | null;
  isPromo: boolean;
  rounds: number;
  wins: number;
  winFreq: number;
  /** Rounds where the engine's decide-roll is recorded (is_win_round NOT NULL). */
  decidedRounds: number;
  /** Engine win decisions / decidedRounds — the number effectiveWinPct promises. */
  engineWinFreq: number | null;
  turnover: number;
  totalPayout: number;
  housePnl: number;
  realizedRtp: number;
  /** Stake-weighted avg of the per-round theoretical EV snapshot. */
  expectedRtp: number | null;
  /** Engine win-freq within ±5pp of effective win % (n ≥ 30). Null = no snapshot / too few rounds. */
  withinTolerance: boolean | null;
  avgMultiplier: number;
}

export async function getValidationReport(
  range: DateRange,
  filters?: {
    userId?: string;
    gameType?: string;
    isPromo?: boolean;
  }
): Promise<ValidationRow[]> {
  await verifyReportsAccess();

  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();

  const rows = await db.execute(sql`
    SELECT
      gr.game_type,
      gr.win_probability::float                                         AS win_probability,
      gr.is_promo,
      COUNT(b.id)::int                                                  AS rounds,
      COUNT(*) FILTER (WHERE b.payout > 0)::int                        AS wins,
      COALESCE(SUM(b.amount), 0)::float                                 AS turnover,
      COALESCE(SUM(b.payout), 0)::float                                 AS total_payout,
      AVG(gr.multiplier::float)                                         AS avg_multiplier,
      AVG(gr.effective_win_probability::float)                          AS effective_win_pct,
      COUNT(*) FILTER (WHERE gr.is_win_round IS NOT NULL)::int          AS decided_rounds,
      COUNT(*) FILTER (WHERE gr.is_win_round IS TRUE)::int              AS engine_wins,
      (SUM(b.amount * gr.expected_rtp::float) FILTER (WHERE gr.expected_rtp IS NOT NULL))
        / NULLIF(SUM(b.amount) FILTER (WHERE gr.expected_rtp IS NOT NULL), 0) AS expected_rtp
    FROM ${bets} b
    JOIN ${game_rounds} gr ON gr.id = b.round_id
    WHERE b.status = 'settled'
      AND b.created_at >= ${fromISO}
      AND b.created_at <= ${toISO}
      ${filters?.userId ? sql`AND b.user_id = ${filters.userId}` : sql``}
      ${filters?.gameType ? sql`AND gr.game_type = ${filters.gameType}` : sql``}
      ${filters?.isPromo !== undefined ? sql`AND gr.is_promo = ${filters.isPromo}` : sql``}
    GROUP BY gr.game_type, gr.win_probability, gr.is_promo
    ORDER BY gr.game_type, gr.win_probability
  `);

  const TOLERANCE = 0.05; // ±5 percentage points

  return ([...rows] as Array<{
    game_type: string;
    win_probability: number | null;
    is_promo: boolean;
    rounds: number;
    wins: number;
    turnover: number;
    total_payout: number;
    avg_multiplier: number | null;
    effective_win_pct: number | null;
    decided_rounds: number;
    engine_wins: number;
    expected_rtp: number | null;
  }>).map((r) => {
    const rounds = Number(r.rounds);
    const wins = Number(r.wins);
    const turnover = Number(r.turnover);
    const totalPayout = Number(r.total_payout);
    const winFreq = rounds > 0 ? wins / rounds : 0;
    const realizedRtp = turnover > 0 ? totalPayout / turnover : 0;
    const avgMult = Number(r.avg_multiplier ?? 0);
    const winProb = r.win_probability != null ? Number(r.win_probability) : null;
    const effectiveWinPct = r.effective_win_pct != null ? Number(r.effective_win_pct) : null;
    const decidedRounds = Number(r.decided_rounds);
    const engineWins = Number(r.engine_wins);
    const engineWinFreq = decidedRounds > 0 ? engineWins / decidedRounds : null;
    const expectedRtp = r.expected_rtp != null ? Number(r.expected_rtp) : null;

    // The engine's contract is "the decide-roll wins effectiveWinPct% of rounds" —
    // that is what PASS/FAIL tests. Realized RTP vs the expected_rtp snapshot is
    // shown alongside but not gated (multiplier variance needs far more than 30
    // rounds, and skill games realize below their theoretical EV by design).
    const withinTolerance =
      effectiveWinPct != null && engineWinFreq != null && decidedRounds >= 30
        ? Math.abs(engineWinFreq - effectiveWinPct / 100) <= TOLERANCE
        : null;

    return {
      gameType: r.game_type,
      winProbability: winProb,
      effectiveWinPct,
      isPromo: Boolean(r.is_promo),
      rounds,
      wins,
      winFreq,
      decidedRounds,
      engineWinFreq,
      turnover,
      totalPayout,
      housePnl: turnover - totalPayout,
      realizedRtp,
      expectedRtp,
      withinTolerance,
      avgMultiplier: avgMult,
    };
  });
}

// ─── 4.8  Risk flags ──────────────────────────────────────────────────────────

export interface RiskFlag {
  userId: string;
  username: string | null;
  type: "abnormal_win_rate" | "withdrawal_spike";
  detail: string;
  rounds: number;
  winFreq: number;
  expectedWinPct: number | null;
  totalProfit: number;
}

export async function getRiskFlags(range: DateRange): Promise<RiskFlag[]> {
  await verifyReportsAccess();

  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();

  const rows = await db.execute(sql`
    SELECT
      b.user_id,
      p.username,
      COUNT(b.id)::int                                                    AS rounds,
      COUNT(*) FILTER (WHERE b.payout > 0)::int                          AS wins,
      COALESCE(SUM(b.profit), 0)::float                                   AS total_profit,
      AVG(COALESCE(gr.effective_win_probability, gr.win_probability)::float) AS avg_configured_pct,
      COALESCE(SUM(b.amount), 0)::float                                    AS deposits_proxy,
      (SELECT COALESCE(SUM(w.amount), 0) FROM ${withdrawals} w
       WHERE w.user_id = b.user_id
         AND w.status = 'completed'
         AND w.created_at >= ${fromISO} AND w.created_at <= ${toISO}
      )::float AS total_withdrawn,
      (SELECT COALESCE(SUM(d.amount), 0) FROM ${deposits} d
       WHERE d.user_id = b.user_id
         AND d.status = 'confirmed'
         AND d.created_at >= ${fromISO} AND d.created_at <= ${toISO}
      )::float AS total_deposited
    FROM ${bets} b
    JOIN ${profiles} p ON p.id = b.user_id
    JOIN ${game_rounds} gr ON gr.id = b.round_id
    WHERE b.status = 'settled'
      AND b.created_at >= ${fromISO}
      AND b.created_at <= ${toISO}
    GROUP BY b.user_id, p.username
    HAVING COUNT(b.id) >= 20
    ORDER BY total_profit DESC
  `);

  const flags: RiskFlag[] = [];

  for (const r of [...rows] as Array<{
    user_id: string;
    username: string | null;
    rounds: number;
    wins: number;
    total_profit: number;
    avg_configured_pct: number | null;
    total_withdrawn: number;
    total_deposited: number;
  }>) {
    const rounds = Number(r.rounds);
    const wins = Number(r.wins);
    const winFreq = rounds > 0 ? wins / rounds : 0;
    const expectedPct = r.avg_configured_pct != null ? Number(r.avg_configured_pct) / 100 : null;
    const totalProfit = Number(r.total_profit);
    const withdrawn = Number(r.total_withdrawn);
    const deposited = Number(r.total_deposited);

    // Flag if actual win rate is >20pp above configured win probability
    if (expectedPct != null && winFreq > expectedPct + 0.20) {
      flags.push({
        userId: r.user_id,
        username: r.username,
        type: "abnormal_win_rate",
        detail: `Win rate ${(winFreq * 100).toFixed(1)}% vs configured ${(expectedPct * 100).toFixed(1)}%`,
        rounds,
        winFreq,
        expectedWinPct: expectedPct,
        totalProfit,
      });
    }

    // Flag if withdrawals far exceed deposits (bonus abuse / fraud)
    if (deposited > 0 && withdrawn > deposited * 3 && withdrawn > 5000) {
      flags.push({
        userId: r.user_id,
        username: r.username,
        type: "withdrawal_spike",
        detail: `Withdrew PKR ${withdrawn.toLocaleString()} vs deposited PKR ${deposited.toLocaleString()}`,
        rounds,
        winFreq,
        expectedWinPct: expectedPct,
        totalProfit,
      });
    }
  }

  return flags;
}
