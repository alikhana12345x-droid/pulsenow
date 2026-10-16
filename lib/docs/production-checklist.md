# BetPulse — Production Readiness Checklist

> **Goal:** Ship 5 live games + full platform to production.  
> Current state: 3 games live, core infra solid, critical gaps in security/testing/ops.

---

## GAME STATUS (Need 5 Before Launch)

| # | Game | Status | Notes |
|---|------|--------|-------|
| 1 | **Dice 3D** | ✅ Live | Provably fair, over/under, full UI |
| 2 | **Coin Flip** | ✅ Live | Provably fair, heads/tails, full UI |
| 3 | **Skyrise** (Crash) | ✅ Live | Auto-cashout, live bets panel, two-bet cards |
| 4 | **Mines** | ❌ Not built | Grid-based, pick safe tiles, cash out anytime |
| 5 | **Hi-Lo / Cards** | ❌ Not built | Andar Bahar or classic Hi-Lo card game |

---

## PHASE 1 — MISSING GAMES (Blocker)

### [ ] Game 4 — Mines
- Reveal grid (5×5), each safe tile multiplies payout
- Player picks safe tiles and cashes out any time
- Provably fair: seed determines which tiles are mines
- Add to: `components/games/mines/`, `app/protected/games/mines/`
- Add API route: `app/api/games/bet` must handle `game_type = "mines"`
- Add to lobby grid and BottomNav links

### [ ] Game 5 — Hi-Lo Cards
- Standard deck, guess next card Higher or Lower
- Streak multiplier the longer the player survives
- Provably fair: deck shuffle via HMAC chain
- Add to: `components/games/hilo/`, `app/protected/games/hilo/`
- Add to lobby grid and BottomNav links

---

## PHASE 2 — SECURITY (Blocker)

### [ ] Rate Limiting
- Add middleware rate limits on: `/api/games/bet`, `/api/deposits/initiate`, `/auth/login`, `/auth/sign-up`
- Use `next-rate-limit` or Upstash Redis + `@upstash/ratelimit`
- Suggested limits: 10 bets/min per user, 5 deposits/hr per user, 5 login attempts/15min per IP

### [ ] Row-Level Security (RLS)
- Enable RLS on Supabase for all tables (bets, wallets, transactions, deposits, withdrawals, profiles)
- Policy: users can only read/write their own rows
- Admin role bypasses via `service_role` key (already used server-side — confirm it never leaks to client)

### [ ] Secrets Audit
- Confirm `.env.local` is in `.gitignore` (verify it was never committed)
- Run `git log --all -- .env.local` to check history
- Move all payment credentials (JazzCash, Easypaisa, crypto) to environment variables, not only DB
- Rotate DB password and Supabase keys if any doubt about exposure

### [ ] CSRF / Input Validation
- All server actions and API routes should validate input with `zod` schemas
- Add CSRF token check on state-mutating endpoints if using cookie sessions

### [ ] Session Security
- Set Supabase session expiry (recommended: 1-day access token, 7-day refresh)
- Confirm `httpOnly` + `secure` + `sameSite=strict` on auth cookies

---

## PHASE 3 — PAYMENT & WITHDRAWAL (High Priority)

### [ ] Webhook Reliability
- Add idempotency check on all webhook handlers (store `gateway_ref` and reject duplicate events)
- Currently: no visible deduplication in `/api/webhooks/jazzcash` or `/easypaisa`
- Add retry queue (use Supabase Edge Function cron or Inngest)

### [ ] Withdrawal Automation (Optional but important)
- Current flow: manual admin approval → manual bank transfer
- For launch: document the manual SLA clearly in the UI ("withdrawals processed within 24h")
- Auto-approve below a threshold (e.g. PKR 5,000) is a future enhancement

### [ ] Payment Gateway Live Keys
- JazzCash sandbox → production credentials
- Easypaisa sandbox → production credentials  
- Crypto (Tatum.io) → production API key, live wallet addresses
- Update `payment_accounts` table entries for production
- Set `NEXT_PUBLIC_SANDBOX_MODE=false` in production env

### [ ] Minimum/Maximum Bet Limits
- Enforce server-side bet limits (not just UI): min PKR 10, max PKR 50,000
- Add per-game limits if needed (e.g. Skyrise max bet lower due to high variance)

---

## PHASE 4 — CORE PLATFORM GAPS

### [ ] KYC Flow
- Currently: `kyc_status` field exists, UI shows it — no actual verification
- Options: integrate a 3rd-party provider (DigiLocker, Jumio, or simple CNIC upload)
- Minimum for launch: allow play without KYC, but gate withdrawals over PKR 25,000 behind KYC

### [ ] Referral Earnings Payout
- `referral_earnings` table populated on each bet
- Need: a cron job or trigger to credit `referral_earnings` to referrer's wallet
- Currently there is no code that actually moves referral money to wallets

### [ ] Live Bets Panel (Real Players)
- Skyrise currently shows **simulated** players (Mulberry32 PRNG seeded by round)
- For production credibility: show real bets via Supabase Realtime subscriptions
- Requires `bets` table to have a `skyrise_round_id` FK and a real-time channel

### [ ] Lobby — Update Game Cards
- Add Mines and Hi-Lo to `LIVE_GAMES` array in `app/protected/page.tsx`
- Remove Mines/Hi-Lo from `SOON_GAMES` when built
- Update `subtitle` for Skyrise (currently shows "Carsh" — fix typo)

### [ ] BottomNav Links
- Verify all 5 games are reachable from bottom navigation
- Check `components/bottom-nav.tsx` and add new game links

---

## PHASE 5 — MONITORING & OPS

### [ ] Error Tracking
- Integrate Sentry: `npm install @sentry/nextjs`
- Capture unhandled API errors, payment failures, game engine errors
- Set up Sentry alerts for error spike

### [ ] Logging
- Add structured server-side logs for: bet placement, deposit events, admin actions
- Use `console.error` at minimum for every catch block in API routes (many are currently silent)
- Consider Axiom or Logtail for production log aggregation

### [ ] Database Backups
- Supabase Pro plan: enable Point-in-Time Recovery (PITR)
- Set daily backup schedule
- Test restore once before going live

### [ ] Uptime Monitoring
- Add uptime check (Better Uptime, UptimeRobot) on the main domain
- Monitor: homepage, `/api/wallet/summary`, `/api/games/bet`

---

## PHASE 6 — DEPLOYMENT

### [ ] Environment Variables (Production)
```
NEXT_PUBLIC_SUPABASE_URL=<prod url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<prod anon key>
SUPABASE_SERVICE_ROLE_KEY=<prod service role — server only>
DB_URL=<prod postgres url>
NEXT_PUBLIC_SANDBOX_MODE=false
JAZZCASH_MERCHANT_ID=<prod>
JAZZCASH_PASSWORD=<prod>
JAZZCASH_INTEGRITY_SALT=<prod>
EASYPAISA_STORE_ID=<prod>
EASYPAISA_HASH_KEY=<prod>
TATUM_API_KEY=<prod>
WEBHOOK_SECRET=<random 64-char string>
```

### [ ] Vercel Configuration
- Set all env vars in Vercel Dashboard → Project → Settings → Environment Variables
- Add `vercel.json` with headers for security:
  ```json
  {
    "headers": [
      { "source": "/(.*)", "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]}
    ]
  }
  ```

### [ ] Database Migration
- Run `drizzle-kit push` on production DB (or apply `drizzle/0000_*.sql` manually)
- Seed: create at least one `payment_account` row per gateway

### [ ] Domain & SSL
- Point custom domain in Vercel
- Verify SSL cert auto-provisioned
- Test `env(safe-area-inset-top)` still works on HTTPS (requires secure context on some browsers)

---

## PHASE 7 — PRE-LAUNCH QA

### [ ] Manual Game Testing
- Play all 5 games end-to-end: place bet → win → verify wallet credit
- Test edge cases: network drop mid-bet, crash at 1.00×, coinflip on same seed
- Test auto-bet / auto-cashout on Skyrise for 20+ rounds

### [ ] Payment Flow Testing
- Complete a real deposit via JazzCash sandbox (end-to-end with webhook)
- Submit a withdrawal and approve it via admin panel
- Verify wallet balance updates correctly after both

### [ ] Admin Panel Smoke Test
- Confirm a deposit, reject a withdrawal, ban/unban a user
- Check audit log records every action with admin ID + timestamp

### [ ] Mobile Testing
- Test all games on real iPhone (Safari fullscreen) and Android Chrome
- Verify `env(safe-area-inset-top)` applies correctly on iOS notch
- Test Skyrise plane scale (0.6) on narrow screens

### [ ] Load Test
- Simulate 50 concurrent bet requests with `k6` or similar
- Confirm wallet balance never goes negative (double-check `FOR UPDATE` lock)

---

## PHASE 8 — LEGAL / COMPLIANCE

### [x] Terms of Service page — `app/legal/terms/page.tsx`
### [x] Privacy Policy page — `app/legal/privacy/page.tsx`
### [x] Responsible Gambling notice + self-exclusion link — `app/legal/responsible/page.tsx`
### [x] Landing page with Three.js game showcase — `app/page.tsx` + `components/landing/`
### [ ] Age verification gate (18+) on first visit (cookie-gated modal on landing)
### [ ] Jurisdiction disclaimer (know your local laws)

---

## QUICK WIN FIXES (Do Now, Cheap)

- [ ] Fix typo: Skyrise subtitle says **"Carsh"** → should be **"Crash"** in `app/protected/page.tsx:29`
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` to env — the server client uses anon key in some places
- [ ] Silent `catch {}` blocks in API routes — add `console.error` at minimum
- [ ] `next.config.ts` is empty — add `images.domains` for avatar URLs and `headers` for security

---

## SUMMARY — LAUNCH GATE STATUS

| Category | Status | Blocker? |
|----------|--------|----------|
| Games (5 total) | 3/5 built | **YES** |
| Rate limiting | ❌ Missing | **YES** |
| RLS on DB | ❌ Not confirmed | **YES** |
| Payment webhooks (deduplication) | ❌ Missing | **YES** |
| Error monitoring | ❌ Missing | No |
| Referral payout cron | ❌ Missing | No |
| Real live bets | ❌ Simulated | No |
| KYC integration | ❌ UI only | No (gate on withdrawal) |
| Tests | ❌ None | No (but risky) |
| Deployment config | ⚠️ Minimal | No |
| Legal pages | ❌ Missing | Depends on jurisdiction |

**Minimum to launch:** Phases 1–3 + Phase 6 + Quick Wins  
**Should do before traffic:** Phases 4–5  
**Can do post-launch:** Phase 7 ongoing, Phase 8 if jurisdiction requires
