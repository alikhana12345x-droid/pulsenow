# Deployment & SolidPay IP — handoff

Written 2026-09-02. Everything below was tested, not assumed.

## The one-line problem

SolidPay whitelists payouts **by IP address**. We do not currently have a hosting
setup that gives us a stable outbound IP *and* can reach our database. Deposits
work; payouts do not.

## Where things stand

| Piece | State |
|---|---|
| SolidPay deposits (payIn) | **Working in production.** Hosted cashier page, player pays, order created. |
| SolidPay payouts (payOut) | **Blocked.** Provider returns `IP error` — our IP is not whitelisted. Affects player withdrawals *and* admin profit payouts. |
| SolidPay callbacks | **Not arriving.** `APP_BASE_URL` unset and the notify URLs were never saved in their backend, so nothing settles automatically. The Sync buttons in `/admin/finance` are the manual fallback. |
| Hosting | **Undecided.** Vercel can't give a static IP; Namecheap cPanel can't reach the database. See below. |

## Why Vercel fails

Vercel functions egress from rotating AWS addresses. **There is no static
outbound IP on Hobby or Pro** — their static-IP product (Secure Compute) is
Enterprise-only. So SolidPay has nothing stable to whitelist. `/admin/payouts`
has an "Outbound IP" card that reports the current egress address and warns when
it observes more than one, which is the evidence for this.

Deposits still work from Vercel because SolidPay only IP-restricts payouts.

## Why Namecheap shared cPanel fails (tested fully, 2026-09-02)

The app **deploys and serves pages fine** there — Node 24.19, Passenger,
standalone build, DNS pointed at `198.54.115.65`, HTTP 200. But:

- **Every database query times out.** `ETIMEDOUT` with an `AggregateError` over
  all three Supabase pooler IPs. Tried ports **6543 and 5432 — both blocked**
  outbound. It's a firewall silently dropping packets, not credentials.
- **Passenger spins the app down** (`ERR_SERVER_NOT_RUNNING`, then
  `Failed to find Server Action`), which would drop payment callbacks regardless.
- No git-push deploys — every update is a manual archive upload.

There is no workaround short of rewriting the entire Drizzle data layer onto
supabase-js over HTTPS. **Treat this host as ruled out.**

A support ticket asking Namecheap to open outbound 5432/6543 was the only
remaining idea; shared hosts normally refuse.

## What the host must provide

1. Outbound TCP to Supabase's pooler (5432/6543).
2. A process that never sleeps — SolidPay posts callbacks at any time.
3. A stable outbound IP for the SolidPay payout whitelist.

## The two candidates

**Render — Starter plan, ~$7/mo, Singapore region.**
Git-push deploys like Vercel, no server to run. Publishes a small fixed set of
outbound IPs per region. Caveat: those IPs are *shared with other Render
tenants*. **Ask SolidPay whether they accept shared cloud egress IPs before
committing** — that answer decides between the two options. Do not use the free
tier: it sleeps, which breaks callbacks.

**VPS (Vultr Mumbai or Hetzner) + Coolify — ~$12–24/mo.**
Coolify gives the git-push workflow on your own box. Dedicated IP that is yours
alone, best latency to Pakistan (~30–50ms vs ~90–110ms from Singapore), no
restrictions. Cost: you own the server. Allocate a **reserved/floating IP** so
rebuilding the box doesn't change the address and force re-whitelisting.

## Once a host is chosen

1. Deploy, note the outbound IP (`/admin/payouts` → Outbound IP → Check).
2. Send it to SolidPay support: whitelist for **payIn and payOut**.
3. Set `APP_BASE_URL` to the live origin (e.g. `https://pulsenow.xyz`).
4. In SolidPay's backend → Home → Merchant Setting, save:
   - `payIn_notify_url` → `https://<domain>/api/webhooks/solidpay/payin`
   - `payOut_notify_url` → `https://<domain>/api/webhooks/solidpay/payout`
5. `/admin/settings` shows an auto-route card that lists whatever is still missing.
6. Set the SolidPay account's **deposit commission to 3%** (a PKR 1,000 deposit
   lands as ~970) so the float estimate on `/admin/payouts` stops overstating.

## Build targets — both work, no config edits needed

- `npm run build` — normal build. Use for Render or any git-push host.
- `npm run deploy:build` — sets `BUILD_STANDALONE=true`, produces `deploy.tar.gz`
  ready to upload. Use for a bare VPS.

`next.config.ts` switches on `BUILD_STANDALONE`, so neither path needs editing.
Next fetches Google Fonts at build time; a flaky network fails the build
spuriously — just retry.

## Open decision, still unresolved

**Player withdrawals fail on every attempt** while the IP is unwhitelisted. The
balance is correctly refunded, but the player sees `Payment could not be sent:
IP error`. The payment-mode toggle is all-or-nothing, so switching to Manual
would also drag deposits back to the screenshot flow.

Proposed but **not built**: split the setting into separate deposit mode and
withdrawal mode, so deposits stay auto on SolidPay while withdrawals queue for
admin approval until the whitelist lands. Small change — one extra platform
setting plus the two places that read it.

## Reference

- Env vars the app reads: `DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SOLID_PAY_API_KEY`, `SOLID_PAY_MERCHANT_NO`, `SOLID_PAY_BASE_URL`,
  `SOLID_PAY_CALLBACK_IPS`, `SOLID_PAY_ENFORCE_CALLBACK_IP`, `APP_BASE_URL`,
  plus the build-time `NEXT_PUBLIC_*` set.
- `NEXT_PUBLIC_*` values are compiled into the browser bundle **at build time** —
  setting them on the server afterwards has no effect.
- SolidPay merchant: `pulsenow`. API base `https://soliapi.xyz`. Their callback
  source IP is `52.74.200.89` (inbound to us — never the problem).
- `scripts/solidpay-probe.mjs` — read-only credential check against the live API.
- `scripts/dbcheck.mjs` — DNS + TCP + SQL reachability check; run it on any new
  host before deploying to confirm the database is reachable.
