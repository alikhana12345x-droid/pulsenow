#!/usr/bin/env bash
# One-time server bootstrap for a fresh Ubuntu VPS. Run as root:
#
#   bash server-setup.sh
#
# Installs Node, Caddy (HTTPS), a service user, a systemd unit and a firewall.
# No Docker. Idempotent — safe to re-run.
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-22.14.0}"   # Next 16 needs >= 20.9
APP_USER="${APP_USER:-pulsenow}"
APP_DIR="${APP_DIR:-/srv/pulsenow}"
ENV_FILE="/etc/pulsenow/env"
DOMAIN="${DOMAIN:-pulsenow.xyz}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash server-setup.sh" >&2
  exit 1
fi

echo "==> Packages"
apt-get update -qq
apt-get install -y -qq curl git ca-certificates debian-keyring debian-archive-keyring apt-transport-https ufw

# 4 GB is enough to run the app but `next build` can spike past it. Swap turns
# a hard OOM-kill during deploy into a slow build.
if ! swapon --show | grep -q .; then
  echo "==> Swap (2G)"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap -q /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Official tarball rather than a distro/NodeSource repo: works on any Ubuntu
# release, including ones too new to have a matching repo yet.
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != "v${NODE_VERSION}" ]]; then
  echo "==> Node ${NODE_VERSION}"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz
  rm -rf /usr/local/lib/nodejs
  mkdir -p /usr/local/lib/nodejs
  tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs --strip-components=1
  rm /tmp/node.tar.xz
  ln -sf /usr/local/lib/nodejs/bin/node /usr/local/bin/node
  ln -sf /usr/local/lib/nodejs/bin/npm /usr/local/bin/npm
  ln -sf /usr/local/lib/nodejs/bin/npx /usr/local/bin/npx
fi
echo "    node $(node -v), npm $(npm -v)"

if ! command -v caddy >/dev/null 2>&1; then
  echo "==> Caddy (automatic HTTPS)"
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi

echo "==> Service user + directories"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR" /etc/pulsenow
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# Secrets live outside the repo checkout, root-owned, not world-readable.
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<'EOF'
# Runtime + build environment. KEY=value, no quotes, no `export`.
# NEXT_PUBLIC_* are compiled into the browser bundle at build time, so they
# must be correct here BEFORE a deploy — setting them later changes nothing.
NODE_ENV=production
PORT=3000

NEXT_PUBLIC_SANDBOX_MODE=false
NEXT_PUBLIC_SITE_URL=https://pulsenow.xyz
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

DB_URL=
SUPABASE_SERVICE_ROLE_KEY=

APP_BASE_URL=https://pulsenow.xyz
SOLID_PAY_API_KEY=
SOLID_PAY_MERCHANT_NO=
SOLID_PAY_BASE_URL=https://soliapi.xyz
SOLID_PAY_CALLBACK_IPS=52.74.200.89
SOLID_PAY_ENFORCE_CALLBACK_IP=false
EOF
  echo "    created $ENV_FILE — fill it in before deploying"
fi
# Root writes it; the app user only reads it. 600 would lock out deploy.sh,
# which runs as $APP_USER and needs NEXT_PUBLIC_* at build time.
chown "root:$APP_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

echo "==> systemd unit"
install -m 644 "$(dirname "$0")/pulsenow.service" /etc/systemd/system/pulsenow.service
systemctl daemon-reload
systemctl enable pulsenow >/dev/null

echo "==> Caddy site"
sed "s/{{DOMAIN}}/${DOMAIN}/g" "$(dirname "$0")/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

echo "==> Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp   >/dev/null
ufw allow 443/tcp  >/dev/null
ufw --force enable >/dev/null

echo
echo "Done. Outbound IP for the SolidPay whitelist:"
curl -fsS https://api.ipify.org || true
echo
echo
echo "Next:"
echo "  1. Fill in $ENV_FILE"
echo "  2. Point DNS for $DOMAIN at this server"
echo "  3. Clone the repo into $APP_DIR and run infra/deploy.sh"
