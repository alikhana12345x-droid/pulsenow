# Admin Reporting & Analytics — Plan & Spec

A complete plan for the **Reports** section the admin panel is missing, written for a
real-money gaming platform going to production. It covers: what the industry's best
operators track, what we already have, what's missing, the exact data behind each report,
and a build order.

> **New to real-money platforms?** Start at [Section 2 — the metrics glossary](#2-the-metrics-every-operator-lives-by). Everything else maps back to it.

---

## 1. Where we are today (honest assessment)

| Area | Today | Gap |
|---|---|---|
| Time-series (daily/weekly/range) | **Almost none** — only "platform events last 24h" in Audit | No date-range picker, no trends, no day/week/month rollups |
| Revenue (GGR/NGR) | One **lifetime** GGR card on dashboard (`Σ total_wagered − Σ total_won`) | Not time-bounded, not per-game, no NGR, no promo cost |
| Per-game breakdown | **None** | Can't see which game makes/loses money |
| Player analytics | Per-user table only | No DAU/MAU, retention, ARPU, LTV, top winners/losers |
| Cash flow | Deposit/withdrawal counts | No net cash flow, funnels, processing times, pending liability |
| Activity timing ("when do they play?") | **None** | No peak-hour / heatmap report |
| Charts | **None installed** | All tables and stat cards |
| Risk / fraud | **None** | No anomalous win-rate or big-winner detection |

**Good news:** the schema is well-built for reporting. Every table has `created_at`, `bets`
links to `game_rounds` (so per-game profit works), and the `transactions` ledger captures
all money movement with before/after balances. We can build most reports on existing data.

---

## 2. The metrics every operator lives by

Learn these — every report below is one of them sliced by time/game/player.

### Revenue & margin
| Metric | Meaning | Formula (our columns) |
|---|---|---|
| **Turnover / Handle** | total money wagered (the "volume") | `Σ bets.amount` |
| **GGR** (Gross Gaming Revenue) | house win before costs — **the core number** | `Σ bets.amount − Σ bets.payout` = `−Σ bets.profit` |
| **Payouts / Wins** | money returned to players | `Σ bets.payout` |
| **Hold % / Margin** | share of turnover the house keeps | `GGR / Turnover` |
| **RTP %** | share returned to players | `Σ payout / Σ amount` = `1 − Hold%` |
| **NGR** (Net Gaming Revenue) | what's left after costs | `GGR − promo cost − referral commissions − payment fees − chargebacks` |
| **Promo cost** | what boosted players cost us | `−Σ profit of promo-player bets` (their negative-GGR) |

> Positive `bets.profit` = **player** won. So **house GGR = −Σ profit**. Hold% > 0 means the house is winning.

### Players
| Metric | Meaning | How |
|---|---|---|
| **DAU / WAU / MAU** | distinct active players per day/week/month | distinct `user_id` in `bets`/`transactions` per period |
| **New signups** | registrations per period | `profiles.created_at` |
| **Conversion** | registered → first deposit → first bet | funnel across `profiles`/`deposits`/`bets` |
| **Retention D1/D7/D30** | % who return N days after signup | cohort on `profiles.created_at` vs activity dates |
| **Churn** | active players who stopped | no activity in last N days |
| **ARPU / ARPPU** | avg GGR per user / per *paying* user | `GGR / active users` |
| **LTV** | lifetime value per player | `wallets.total_wagered × hold%` (or lifetime GGR per user) |

### Cash (real money in/out — different from GGR!)
| Metric | Meaning | How |
|---|---|---|
| **Deposits** | cash in | `Σ deposits.amount where status=confirmed` |
| **Withdrawals** | cash out | `Σ withdrawals.amount where status=processed` |
| **Net cash flow** | deposits − withdrawals | the bank-account view |
| **Deposit success rate** | confirmed / initiated | `deposits` by status |
| **Withdrawal processing time** | speed of payouts | `processed_at − created_at` |
| **Pending liability** | money we owe right now | open player balances + unsettled rounds |

> **GGR ≠ cash flow.** GGR is "who won the bets". Cash flow is "money that entered/left the bank". Track both — they answer different questions.

---

## 3. The Reports section — proposed structure

New route `app/admin/reports/` with a **global date-range picker** (Today / Yesterday /
Last 7d / Last 30d / This month / Custom) and a **granularity toggle** (Hour / Day / Week).
Tabs:

```
Reports
 ├── Overview      ← KPI cards + trend chart for the chosen range
 ├── Revenue       ← GGR / NGR / hold% over time, total + per game
 ├── Games         ← per-game turnover, GGR, hold%, rounds, players, realized vs expected edge
 ├── Players       ← DAU/MAU, new signups, retention, ARPU, top winners/losers
 ├── Cash          ← deposits/withdrawals, net flow, funnels, processing times, pending liability
 ├── Promo Cost    ← promo-player P&L (what campaigns cost us)
 ├── Activity      ← peak-hours heatmap (day-of-week × hour)
 └── Risk          ← anomalous win-rates, big winners, withdrawal spikes
```

---

## 4. Report-by-report spec

Each: **the question → data source → query approach → priority (P0 launch-critical / P1 soon / P2 later).**

### 4.1 Overview (P0)
**Q:** How is the platform doing right now and over the chosen range?
**Cards:** GGR, Turnover, Hold%, Net cash flow, DAU, New signups, Active players, Pending withdrawals (liability).
**Source:** `bets ⨝ game_rounds`, `deposits`, `withdrawals`, `profiles`, `wallets`.
**Query:** sum/count over `created_at BETWEEN range`, plus a per-day trend line for GGR & turnover.
**Compare:** show % change vs previous equal period (e.g. this 7d vs prior 7d).

### 4.2 Revenue — GGR/NGR trend (P0)
**Q:** How much are we making, and is it trending up?
**Source:** `bets` (amount, payout, profit, created_at) ⨝ `game_rounds` (game_type) on `round_id`.
**Query:**
```
SELECT date_trunc('day', b.created_at) AS day,
       SUM(b.amount)                    AS turnover,
       SUM(b.amount) - SUM(b.payout)    AS ggr,
       (SUM(b.amount) - SUM(b.payout)) / NULLIF(SUM(b.amount),0) AS hold_pct
FROM bets b
WHERE b.created_at BETWEEN $from AND $to AND b.status = 'settled'
GROUP BY 1 ORDER BY 1;
```
**NGR:** subtract `Σ referral_earnings.commission` + promo cost (4.6) for the same range.
**Granularity:** swap `date_trunc('day'…)` for `'hour'` or `'week'`. **Per-minute** = `date_trunc('minute'…)` — useful only for a live view, not historical charts.

### 4.3 Games — per-game performance (P0)
**Q:** Which game makes money, which loses, and is each holding its configured edge?
**Source:** `bets ⨝ game_rounds` grouped by `game_type`.
**Per game, per range:** rounds, unique players, turnover, GGR, **realized hold%**, avg bet, biggest single win.
**The killer column — realized vs expected edge:** compare `realized hold% = GGR/turnover` against what the win-probability model *should* produce. This is how you **validate the win-probability system in production** (ties directly to `win-probability-testing.md`). If realized hold drifts from expected, something's wrong (bug, exploit, or mis-set tier).
```
SELECT gr.game_type,
       COUNT(*)                          AS rounds,
       COUNT(DISTINCT b.user_id)          AS players,
       SUM(b.amount)                      AS turnover,
       SUM(b.amount) - SUM(b.payout)      AS ggr,
       (SUM(b.amount)-SUM(b.payout))/NULLIF(SUM(b.amount),0) AS hold_pct
FROM bets b JOIN game_rounds gr ON gr.id = b.round_id
WHERE b.created_at BETWEEN $from AND $to
GROUP BY gr.game_type ORDER BY ggr DESC;
```

### 4.4 Players — engagement & value (P1)
**Q:** How many real players, are they coming back, who's most valuable?
- **DAU/WAU/MAU:** distinct `user_id` from `bets` per period (today = activity proxy until we add login/session tracking — see §6).
- **New signups:** `profiles.created_at` per day, role='player'.
- **Retention cohorts:** group players by signup week; for each, % active on D1/D7/D30 (signup date vs first activity date in `bets`/`transactions`).
- **Top winners / losers:** `Σ profit` per user over range (top positive = winners = risk; top negative = whales).
- **ARPU:** `GGR / active players`.

### 4.5 Cash — deposits, withdrawals, liability (P0)
**Q:** Is money actually flowing in, how fast do we pay out, and what do we owe?
- **Net cash flow:** `Σ confirmed deposits − Σ processed withdrawals` per day.
- **Deposit funnel:** initiated → confirmed → rejected counts + success rate; avg `confirmed_at − created_at`.
- **Withdrawal ops:** pending count + **pending PKR liability**, success rate, avg `processed_at − created_at`, breakdown by `method`.
- **Pending liability (P0 risk):** `Σ wallets.balance` (money we owe players) + value of unsettled `game_rounds` (status='pending') + pending withdrawals. This is your real exposure.
**Source:** `deposits`, `withdrawals`, `wallets`, `game_rounds`.

### 4.6 Promo Cost — what campaigns cost (P1, unique to us)
**Q:** Promo players are *designed* to win — how much are they costing us?
**Source:** bets placed by users who were active in `promotion_players` at bet time.
**Query approach:** join `bets.user_id` to `promotion_players` (is_active) → these players' `Σ profit` is the house's loss = promo cost. Segment GGR into **normal-player GGR (should be ≥0)** vs **promo P&L (expected negative)**.
> ⚠️ **Data gap:** today we infer promo-status by *current* membership, which is wrong if a player was added/removed mid-period. Fix by snapshotting `is_promo` + `win_probability` onto each bet/round at placement time — see §6. Hi-Lo already stores `isPromo` in the round outcome; extend to all games.

### 4.7 Activity — "when do players play?" (P1)
**Q:** What are our peak hours so we can time promos, support staffing, and maintenance?
**Source:** `bets.created_at`.
**Query:** bucket by **day-of-week × hour-of-day**, count rounds and sum turnover → render a 7×24 **heatmap**. Also a simple hourly line for the chosen range.
```
SELECT EXTRACT(dow FROM created_at) AS dow,
       EXTRACT(hour FROM created_at) AS hour,
       COUNT(*) AS rounds, SUM(amount) AS turnover
FROM bets WHERE created_at BETWEEN $from AND $to
GROUP BY 1,2;
```
> Note: store/compare in a **fixed timezone** (e.g. Asia/Karachi) so "peak hour" matches your players' clock, not UTC.

### 4.8 Risk — anomaly detection (P1/P2)
**Q:** Is anyone winning impossibly often, or draining us?
- **Abnormal win rate:** players whose realized win% over N≥50 bets far exceeds their tier's configured probability (possible exploit — e.g. the Mines win-round client-knowledge issue).
- **Big winners:** single payouts or daily `Σ profit` above a threshold.
- **Withdrawal spikes:** users whose withdrawals ≫ deposits (bonus abuse / fraud).
- **Velocity:** unusually high bets/minute from one account.
**Source:** `bets ⨝ game_rounds`, `bet_amount_tiers`/`promotion_players` for expected rate, `deposits`/`withdrawals`.

### 4.9 QA / Validation report — prove the win-probability tests from data (P0)
**Q:** Did the cases in [`win-probability-testing.md`](win-probability-testing.md) actually pass —
**measured from real bet data, not hand-tallied?**
**What it does:** filter by **account(s) + date range + game** (and, for Dice/SkyRise, by
`choice` / target-mode), then for each run show: rounds, **wins**, **win frequency**, wagered,
payout, house P/L, realized RTP, **expected RTP**, and **PASS/FAIL** vs tolerance. This is
the testing doc's Section 6 template, automated.

**Why it needs additions:** the business reports (4.2–4.3) give GGR/hold%/RTP but **not win
frequency**, and they group by `game_type` only — they can't separate a 30%-tier run from a
70% run, a promo run from a normal one, or "dice over 50" from "dice over 90". To validate a
specific test case, three things the business reports lack are required:

| Test-case need | Available now? | Required addition |
|---|---|---|
| **Win frequency** (wins / rounds) — the doc's primary correctness metric | ❌ only GGR/RTP | derive `won = bets.payout > 0`; add as a report column (no schema change) |
| **Which win% / promo flag was actually used** | ❌ for coin/dice/skyrise | **snapshot** effective `win_probability` + `is_promo` on `game_rounds` at placement (see §6 gap #1) |
| **Isolate one run** (account + target + period) | ⚠️ partial | filter by `user_id` + date range; for Dice/SkyRise also group by `choice` |
| **Mines "winnable round" freq** (≠ cashout) | ❌ JSON only | surface `is_win_round` (typed column or `outcome->>'isWinRound'`) |
| **Hi-Lo per-draw win freq** (TC-9/TC-11) | ❌ not stored | log each draw `{drawIndex, currentRank, direction, effectiveWinPct, win}` into the round outcome |

**Expected-RTP column:** with the effective win% snapshot + `game_rounds.multiplier`, the
report computes `expected RTP = effectiveWinPct × multiplier` per bet and compares to realized
— the same numbers as the testing doc's reference tables (§4 there), now automatic.

> **Scope note:** this is a **sandbox/QA-scoped** view (validation), distinct from the
> business/ops reports (4.1–4.8). Same underlying data and snapshots, different audience.
> Keep it filterable to test accounts so QA runs don't mix with live traffic.

---

## 5. What the top 1% of operators do (and we should grow into)

1. **Daily rollup tables.** They never chart over raw bet rows at scale — a nightly job
   aggregates into `daily_game_stats` and `daily_financials` (one row per day per game).
   Reports read the rollups (fast); raw rows stay for drill-down. **Add when bet volume
   makes live queries slow — not on day one.**
2. **Cohort & retention dashboards** as a first-class view (D1/D7/D30, by signup week and by
   acquisition source).
3. **Real-time ops board** — live GGR, active players, and liability updating each minute on
   a wallboard. (This is where your "per-minute profit/loss" belongs.)
4. **Segmentation everywhere** — every metric sliceable by game, country/geo, device,
   currency, VIP tier, acquisition channel.
5. **Responsible-gaming & compliance** — deposit limits, loss limits, self-exclusion,
   session-time reminders, KYC/AML thresholds, suspicious-activity reports. **Required by
   most regulators before going live.**
6. **Bonus/promo accounting** — every bonus has a cost ledger and a wagering-requirement
   tracker; promo ROI is measured (did the campaign's extra GGR exceed its cost?).
7. **Anti-fraud & bot detection** — IP/device fingerprinting, multi-account linking,
   collusion detection.
8. **Alerting** — automated thresholds (e.g. "hold% on Dice dropped below 5% today",
   "withdrawal liability > X", "a player won > Y") pushed to Slack/email, not waiting for
   someone to open a dashboard.
9. **Data warehouse / BI** — production DB feeds a warehouse (BigQuery/Snowflake) with
   Metabase/Looker on top, so heavy analytics don't hit the live DB.

---

## 6. Data gaps to close (schema additions)

These limit reporting today. Priority-ordered.

| # | Gap | Impact | Fix | Pri |
|---|---|---|---|---|
| 1 | **Rounds don't snapshot the EFFECTIVE `win_probability` + `is_promo` used** | Can't compute promo cost, compare realized-vs-configured edge, **or validate the win-prob test cases from data** | Add `win_probability numeric(5,2)` (the *effective/capped* value passed to the RNG) + `is_promo boolean` to `game_rounds`, set at placement. Hi-Lo already stores these in `outcome` — promote to typed columns and extend to all 5 games. | **P0** |
| 1b | **Win frequency is not a reported metric** | The testing doc's *primary* correctness signal is missing | Derive `won = bets.payout > 0`; expose win-count + win% in Games (4.3) and Validation (4.9). **No schema change.** | **P0** |
| 1c | **Mines `isWinRound` only in `outcome` JSON** | Can't report winnable-round frequency (TC-12/13) | Expose `(outcome->>'isWinRound')::boolean`, or add a typed `is_win_round` column on `game_rounds` | **P0** |
| 1d | **Hi-Lo per-draw outcomes not persisted** | Can't validate per-draw win frequency (TC-9/11); bets store only one row per round | Append each draw `{drawIndex, currentRank, direction, effectiveWinPct, win}` to `game_rounds.outcome` | P1 |
| 2 | **No login/session tracking** | DAU/MAU & session length are approximations (bet activity only); can't see players who log in but don't bet | Add a `user_sessions` table (user_id, started_at, last_seen_at, ip, device) written on auth | P1 |
| 3 | **No geo/device/IP on player bets** | No geo reports, weak fraud detection | Capture IP/country/device on session or bet | P1 |
| 4 | **No daily rollup tables** | Reports query raw rows; fine now, slow at scale | Add `daily_game_stats`, `daily_financials` + nightly cron | P1 (when slow) |
| 5 | **No bonus/promo cost ledger** | Promo ROI is inferred, not recorded | Tag promo-driven payouts in `transactions.metadata` or a `bonus_ledger` | P1 |
| 6 | **No acquisition source / UTM** | Can't measure marketing channels (only referrals) | Store `acquisition_source` on `profiles` at signup | P2 |
| 7 | **No responsible-gaming limits** | Regulatory blocker in many markets | Add deposit/loss limits + self-exclusion tables | P2 (P0 if regulated) |

> Gap #1 is the most important for *this* platform: without it you can't prove in production
> that normal players never beat the house and you can't cleanly price your promos.

---

## 7. Build order

**Phase 1 — P0 (before/at launch).** Do the steps in this order — the schema snapshot
unblocks everything else and must land before any data worth keeping is generated:

- **Step 1 — Schema first (do this before launch).** Add `win_probability numeric(5,2)`
  (the *effective/capped* value passed to the RNG) + `is_promo boolean` to `game_rounds`,
  and surface Mines `isWinRound` (typed column or `outcome->>'isWinRound'`). Wire the snapshot
  in **at placement across all 5 games** — small and low-risk; **Hi-Lo already does it**
  (`outcome.winPct` + `outcome.isPromo`), so this is mostly generalising that pattern to
  coin/dice/skyrise/mines. (Gaps #1, #1c. Gap #1b is query-only — no schema change.)
- **Step 2 — Scaffold the section.** Create `app/admin/reports/` with the shared date-range
  picker (Today / Yesterday / 7d / 30d / This month / Custom) + granularity toggle, add a
  charting lib (**Recharts** — simplest fit for Next.js), and a new `lib/actions/reports.ts`
  for the query functions (§8).
- **Step 3 — Build the P0 tabs on top.** Overview (4.1), Revenue/GGR trend (4.2),
  Games + realized-vs-expected hold (4.3), Cash incl. pending liability (4.5), and the
  **Validation report (4.9)** that reproduces the win-probability test template from data.

> Gap #1d (Hi-Lo per-draw logging) is **not** launch-blocking — it only affects validating
> Hi-Lo's per-draw cases (TC-9/11). Defer to Phase 2.

**Phase 2 — P1 (first weeks live):**
- Players (DAU/MAU, retention, top winners/losers), Promo Cost, Activity heatmap, basic Risk.
- Sessions table (gap #2), promo cost ledger (gap #5).
- Threshold alerts to Slack/email.

**Phase 3 — P2 (scale):**
- Daily rollup tables + nightly cron, geo/device, acquisition tracking, responsible-gaming,
  BI/warehouse export.

---

## 8. Query foundations (reuse these)

All time-series share one shape — a date-bounded, grouped aggregate over `bets ⨝ game_rounds`.
Suggested server actions in a new `lib/actions/reports.ts`:

```
getOverviewKpis(from, to)              → cards + prev-period deltas
getRevenueSeries(from, to, grain)      → [{ period, turnover, ggr, hold_pct }]
getGamePerformance(from, to)           → per game_type rows
getPlayerStats(from, to)               → dau/mau, new signups, arpu
getTopPlayers(from, to, 'winners'|'losers', limit)
getCashFlow(from, to)                  → deposits, withdrawals, net, funnels
getPendingLiability()                  → owed balances + open rounds + pending withdrawals
getPromoCost(from, to)                 → promo P&L vs normal GGR
getActivityHeatmap(from, to)           → 7×24 buckets
getRiskFlags(from, to)                 → anomalous players
```
Index support already exists: `bets(user_id, created_at)`, `bets(round_id)`,
`game_rounds(game_type, created_at)`, `deposits(status, created_at)`,
`withdrawals(status, created_at)`, `transactions(wallet_id, created_at)`.

---

## 9. Pre-launch reporting checklist

- [ ] `app/admin/reports` exists with a working date-range picker.
- [ ] Overview KPIs match a hand-calculated spot check for one day.
- [ ] GGR trend renders per day and per game.
- [ ] Per-game **realized hold%** is visible and compared to expected (validates win-prob system live).
- [ ] Pending **liability** (owed balances + open rounds + pending withdrawals) is on one screen.
- [ ] Rounds snapshot effective `win_probability` + `is_promo` (gap #1) so promo cost & edge audits are exact.
- [ ] **Validation report (4.9)** reproduces the testing doc's table: win-freq, RTP, expected RTP, PASS/FAIL — for both normal and promo accounts.
- [ ] Win frequency is shown wherever RTP is (gap #1b); Mines `isWinRound` is queryable (gap #1c).
- [ ] All 14 test cases (TC-1…TC-14) confirmed **from the Validation report**, matching the manual run.
- [ ] Net cash flow (deposits − withdrawals) reconciles against payment-account records.
- [ ] At least one alert wired (e.g. "any game's daily hold% < 0" → notify).
