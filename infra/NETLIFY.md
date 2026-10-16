# Deploying to Netlify

Build settings live in [`netlify.toml`](../netlify.toml). Netlify detects Next.js
and applies its adapter on its own, so there's no plugin to install.

```
Netlify (functions + edge) ──▶ Supabase (DB_URL, pooler :6543)
          │
          └──HTTPS + X-Proxy-Secret──▶ SolidPay egress proxy (fixed IP) ──▶ soliapi.xyz
SolidPay callbacks ──────────────────▶ Netlify
```

Netlify has no static outbound IP, so SolidPay API calls **must** go through the
egress proxy in [`solidpay-proxy/`](solidpay-proxy/README.md). Without it,
withdrawals fail with "IP Error".

## 1. Create the site

app.netlify.com → **Add new project → Import an existing project** → pick the
GitHub repo. Leave the build settings as Netlify fills them from `netlify.toml`.
Then push to `main` to deploy, and open a PR to get a deploy preview.

## 2. Environment variables

**Project configuration → Environment variables**. Copy the values from
`.env.local`, **without quotes**. Mark the server-only ones as **secret**.

| Variable | Secret | Notes |
|---|---|---|
| `DB_URL` | yes | Transaction pooler, port **6543**. That's the right port for serverless |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | |
| `NEXT_PUBLIC_SUPABASE_URL` | no | Compiled into the bundle at build time |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | no | Compiled into the bundle at build time |
| `NEXT_PUBLIC_SITE_URL` | no | `https://<your-domain>` |
| `NEXT_PUBLIC_SANDBOX_MODE` | no | |
| `APP_BASE_URL` | no | `https://<your-domain>`, used to build SolidPay callback URLs |
| `SOLID_PAY_API_KEY` | yes | |
| `SOLID_PAY_MERCHANT_NO` | yes | |
| `SOLID_PAY_BASE_URL` | no | The **proxy's** URL, e.g. `https://pay.pulsenow.xyz`, not soliapi.xyz |
| `SOLID_PAY_PROXY_SECRET` | yes | Must match the proxy |
| `SOLID_PAY_CALLBACK_IPS` | no | |
| `SOLID_PAY_ENFORCE_CALLBACK_IP` | no | Safe to turn on: callbacks are checked against `x-nf-client-connection-ip` |
| `PEEK_SLUG` | yes | Path of the unlisted round monitor (`/x/<slug>`) |

Changing a `NEXT_PUBLIC_*` value only takes effect after a **new build**:
**Deploys → Trigger deploy → Clear cache and deploy site**.

## 3. Functions region

**Project configuration → Build & deploy → Functions → Region**. Pick the region
closest to the database (Supabase is in `ap-northeast-2`, Seoul). The default US
region adds a cross-Pacific round trip to every query.

## 4. Supabase auth URLs

Supabase → **Authentication → URL Configuration**:

- **Site URL**: the production domain.
- **Redirect URLs**: add `https://<your-domain>/**`, and
  `https://*--<netlify-site-name>.netlify.app/**` so deploy previews can sign in.

If you skip this, Google sign-in sends users back to the old Site URL.

## 5. Custom domain

**Domain management → Add a domain**. HTTPS is issued automatically.

## Limits to know

- Synchronous functions time out after **10 s** by default (raisable to 26 s on
  paid plans). Anything slower, like a SolidPay call that hangs, is cut off.
- Each function instance opens its own small `postgres` pool. The Supabase
  transaction pooler (6543) multiplexes them, so keep `DB_URL` on that port.
