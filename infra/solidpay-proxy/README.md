# SolidPay egress proxy (AWS Lightsail)

The app runs on **Vercel**, which has no static outbound IP. SolidPay only accepts
payOut calls from whitelisted IPs, so withdrawals fail with "IP Error". This
small VPS relays SolidPay API calls so they always leave from one fixed IP.

```
Vercel app ──HTTPS + X-Proxy-Secret──▶ pay.pulsenow.xyz (Hetzner, fixed IP) ──▶ soliapi.xyz
SolidPay callbacks ──────────────────────────────────────────────────────────▶ Vercel (unchanged)
```

Only outgoing API calls go through the proxy. Callbacks, the cashier page and
everything else stay as they are.

## 1. Create the server (AWS Lightsail)

Use an AWS account on the **Paid** plan. The Free plan closes the account after
6 months, which would delete the server and its whitelisted IP. Set a budget
alert under Billing → Budgets.

lightsail.aws.amazon.com → **Create instance**:

| Setting | Choose |
|---|---|
| Region | **Asia Pacific (Singapore)**, the same region as SolidPay and Supabase |
| Platform / blueprint | Linux/Unix → **OS Only → Ubuntu 24.04 LTS** |
| Network type | **Dual-stack** (IPv4 + IPv6) |
| Plan | The smallest dual-stack plan (about $5/mo) is plenty |
| SSH key | Default key is fine. Download it from Account → SSH keys |

Then:

1. **Networking → Create static IP** and attach it to the instance. Without it,
   the IPv4 changes every time the instance stops. A static IP is free while it
   stays attached.
2. Instance → **Networking** tab → in **both** the IPv4 and IPv6 firewalls, allow
   **HTTP (80)** and **HTTPS (443)** next to SSH. Lightsail's firewall sits in
   front of the server's own `ufw`, and Caddy can't get a certificate without
   port 80.

**Never delete and recreate the instance, and never release the static IP.**
SolidPay would have to whitelist a new IP. The IPv6 belongs to the instance,
so it survives stop/start but not deletion.

SSH in as `ubuntu`, not root: `ssh -i LightsailDefaultKey.pem ubuntu@<static-ip>`,
or use the browser "Connect" button.

## 2. DNS

At your DNS provider, add records for a subdomain such as `pay.pulsenow.xyz`:

| Type | Host | Value |
|---|---|---|
| A | `pay` | server IPv4 |
| AAAA | `pay` | server IPv6 |

Wait until `nslookup pay.pulsenow.xyz 1.1.1.1` returns the IP.

## 3. Run the setup

From your PC:

```bash
scp -i LightsailDefaultKey.pem infra/solidpay-proxy/setup.sh ubuntu@<static-ip>:~/
ssh -i LightsailDefaultKey.pem ubuntu@<static-ip>
sudo DOMAIN=pay.pulsenow.xyz bash ~/setup.sh
```

With the browser "Connect" button, paste the script into `nano setup.sh` instead
of using scp. Pasting from Windows doubles every line break, which breaks the
`\` line continuations, so clean it up before running:

```bash
sed -i -e 's/\r$//' -e '/\\$/{n;/^$/d}' setup.sh
bash -n setup.sh && echo SCRIPT-OK
```

It installs Caddy (automatic HTTPS), generates the proxy secret, locks the
firewall to 22/80/443, and prints:

- the **IPv4 and IPv6** to send to SolidPay, and
- the two **Vercel env vars** to set.

It is safe to re-run. The secret is generated once and kept in
`/etc/solidpay-proxy/secret`.

## 4. Whitelist with SolidPay

Send support **both** the IPv4 and the IPv6 address, for payIn **and** payOut.
If `soliapi.xyz` resolves over IPv6, the proxy connects over IPv6, so whitelisting
only the IPv4 can still produce "IP Error".

## 5. Point Vercel at the proxy

Vercel → Project → Settings → Environment Variables (Production):

```
SOLID_PAY_BASE_URL=https://pay.pulsenow.xyz
SOLID_PAY_PROXY_SECRET=<printed by setup.sh>
```

**Redeploy** afterwards. Env var changes only take effect in a new deployment.

## Checks

```bash
# From anywhere: no secret → 403 (the proxy is not an open relay)
curl -i -X POST https://pay.pulsenow.xyz/api/payIn/query

# Locally, with the two vars above in .env.local: a full round-trip through the proxy
node scripts/solidpay-probe.mjs

# On the server
tail -f /var/log/caddy/solidpay-proxy.log
curl -4 https://api.ipify.org; curl -6 https://api6.ipify.org
```

## Rotating the secret

```bash
sudo sh -c 'openssl rand -hex 32 > /etc/solidpay-proxy/secret'
sudo DOMAIN=pay.pulsenow.xyz bash ~/setup.sh
```

Then update `SOLID_PAY_PROXY_SECRET` in Vercel and redeploy. Payouts fail with
403 in the window between those two steps.
