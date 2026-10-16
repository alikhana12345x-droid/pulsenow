# Deploying to the Vultr VPS

No Docker. Node + systemd + Caddy, with push-to-deploy via GitHub Actions.

| | |
|---|---|
| Server | Vultr Mumbai, Ubuntu, 2 vCPU / 4 GB |
| Static IP | `65.20.91.128` — this is what SolidPay whitelists |
| App runs as | `pulsenow`, from `/srv/pulsenow`, on port 3000 |
| HTTPS | Caddy, automatic certificates |
| Secrets | `/etc/pulsenow/env` (`root:pulsenow`, 640, outside the checkout) |

---

## 1. First login

From your PC (the Vultr console shows the root password):

```bash
ssh root@65.20.91.128
```

## 2. Get the code onto the server

If the GitHub repo is **private**, give the server read access first:

```bash
ssh-keygen -t ed25519 -C "pulsenow-vps" -f /root/.ssh/id_ed25519 -N ""
cat /root/.ssh/id_ed25519.pub
```

Copy that key into GitHub → your repo → **Settings → Deploy keys → Add deploy key**
(read-only is enough).

Then clone:

```bash
git clone git@github.com:<your-user>/BetPulse.git /srv/pulsenow
```

## 3. Run the bootstrap

```bash
cd /srv/pulsenow
DOMAIN=pulsenow.xyz bash infra/server-setup.sh
```

Installs Node 22, Caddy, 2 GB swap, the `pulsenow` user, the systemd unit and a
firewall. It prints the server's outbound IP at the end — **that is the address
for SolidPay.**

## 4. Fill in the environment

```bash
nano /etc/pulsenow/env
```

Copy the values from your local `.env.local`. Two rules:

- **No quotes around values.** `DB_URL=postgresql://…`, not `DB_URL="postgresql://…"`.
- `NEXT_PUBLIC_*` are compiled into the browser bundle **at build time**, so they
  must be right before the first deploy.

Then hand the checkout — and a copy of the GitHub key — to the app user.
Deploys run as `pulsenow`, so the key cannot stay in root's home only:

```bash
chown -R pulsenow:pulsenow /srv/pulsenow

mkdir -p /home/pulsenow/.ssh
cp /root/.ssh/id_ed25519 /root/.ssh/id_ed25519.pub /home/pulsenow/.ssh/
ssh-keyscan -t ed25519 github.com >> /home/pulsenow/.ssh/known_hosts 2>/dev/null
chown -R pulsenow:pulsenow /home/pulsenow/.ssh
chmod 700 /home/pulsenow/.ssh
chmod 600 /home/pulsenow/.ssh/id_ed25519
```

If the env file was copied from Windows, strip its line endings — bash reads a
trailing `\r` as part of the command and the deploy dies with `$'\r': command
not found`:

```bash
sed -i 's/\r$//' /etc/pulsenow/env
```

## 5. Point DNS at the server

At Namecheap → Advanced DNS, set both A records to `65.20.91.128`:

| Type | Host | Value |
|---|---|---|
| A | `@` | `65.20.91.128` |
| A | `www` | `65.20.91.128` |

Wait until `nslookup pulsenow.xyz 1.1.1.1` returns the new IP. Caddy cannot get a
certificate until it does.

## 6. First deploy

```bash
sudo -u pulsenow bash /srv/pulsenow/infra/deploy.sh
```

Pulls, installs, builds, restarts, and verifies the app answers. Then open
`https://pulsenow.xyz` — Caddy will have issued the certificate on first request.

## 7. Push-to-deploy (optional but worth it)

On the server, let the deploy user restart the service without a password:

```bash
echo 'pulsenow ALL=(root) NOPASSWD: /usr/bin/systemctl restart pulsenow' \
  > /etc/sudoers.d/pulsenow-deploy
chmod 440 /etc/sudoers.d/pulsenow-deploy
```

(`sudo` matches the resolved path, so it must be `/usr/bin/systemctl`, not `/bin/systemctl`.)

Create a key for GitHub to log in with:

```bash
ssh-keygen -t ed25519 -C "github-actions" -f /tmp/gha -N ""
mkdir -p /home/pulsenow/.ssh
cat /tmp/gha.pub >> /home/pulsenow/.ssh/authorized_keys
chown -R pulsenow:pulsenow /home/pulsenow/.ssh
chmod 700 /home/pulsenow/.ssh && chmod 600 /home/pulsenow/.ssh/authorized_keys
cat /tmp/gha            # ← copy this private key, then: rm /tmp/gha /tmp/gha.pub
```

In GitHub → repo → **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `SSH_HOST` | `65.20.91.128` |
| `SSH_USER` | `pulsenow` |
| `SSH_PRIVATE_KEY` | the private key you just printed |

From then on, every push to `master` deploys itself.

## 8. Finish the SolidPay setup

1. Send `65.20.91.128` to SolidPay support — whitelist for **payIn and payOut**.
2. In their backend → Home → Merchant Setting:
   - `payIn_notify_url` → `https://pulsenow.xyz/api/webhooks/solidpay/payin`
   - `payOut_notify_url` → `https://pulsenow.xyz/api/webhooks/solidpay/payout`
3. Check `/admin/settings` — the auto-route card lists anything still missing.
4. Set the SolidPay account's deposit commission to **3%** so the float estimate
   on `/admin/payouts` is honest.

---

## Day to day

```bash
# logs, live
journalctl -u pulsenow -f

# restart / status
systemctl restart pulsenow
systemctl status pulsenow

# deploy by hand
sudo -u pulsenow bash /srv/pulsenow/infra/deploy.sh

# is the database reachable from here?
DB_URL='postgresql://…' node scripts/dbcheck.mjs

# what IP does SolidPay see?
curl https://api.ipify.org
```

**Run `scripts/dbcheck.mjs` before the first deploy.** Namecheap's shared hosting
silently firewalled outbound Postgres, which cost a day to diagnose — thirty
seconds here rules it out. A VPS has no such restriction, so expect it to pass.
