#!/usr/bin/env bash
# Deploy the current master onto this server. Run as the app user:
#
#   sudo -u pulsenow bash /srv/pulsenow/infra/deploy.sh
#
# Pulls, installs, builds, restarts. The previous build keeps serving until the
# new one is ready, so a failed build leaves the site up rather than down.
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/pulsenow}"
ENV_FILE="${ENV_FILE:-/etc/pulsenow/env}"
BRANCH="${BRANCH:-master}"

cd "$APP_DIR"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Cannot read $ENV_FILE — the build needs NEXT_PUBLIC_* from it." >&2
  exit 1
fi

# The build bakes NEXT_PUBLIC_* into the client bundle, so the same environment
# systemd will run with has to be present here too.
#
# Sourced through sed because an env file copied from Windows carries CRLF
# line endings, and bash reads the trailing \r as part of the command.
set -a
# shellcheck disable=SC1090
. <(sed 's/\r$//' "$ENV_FILE")
set +a

# The browser can only ever talk to the project baked in below, so a wrong
# NEXT_PUBLIC_SUPABASE_URL is invisible until users get bounced to some other
# project's Site URL mid-login. Print it into the deploy log.
#
# Note for whoever edits $ENV_FILE: changing NEXT_PUBLIC_* and restarting the
# service is NOT enough — those values are compiled into the client bundle, so
# they only change when this script rebuilds.
if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]]; then
  echo "NEXT_PUBLIC_SUPABASE_URL is not set in $ENV_FILE — the client bundle" >&2
  echo "would ship with no Supabase project. Refusing to build." >&2
  exit 1
fi

SUPABASE_REF="${NEXT_PUBLIC_SUPABASE_URL#*://}"
SUPABASE_REF="${SUPABASE_REF%%.*}"
echo "==> Supabase project baked into the client bundle: $SUPABASE_REF"
echo "    Auth redirects use THIS project's Site URL / Redirect URLs:"
echo "    https://supabase.com/dashboard/project/$SUPABASE_REF/auth/url-configuration"

# A DB_URL pointing at a different project than the auth client means users
# authenticate against one database and their profile/wallet rows live in
# another. Warn rather than fail — it can be deliberate during a migration.
if [[ -n "${DB_URL:-}" && "${DB_URL}" != *"${SUPABASE_REF}"* ]]; then
  echo "    WARNING: DB_URL does not reference $SUPABASE_REF — auth and data are" >&2
  echo "    pointing at different Supabase projects." >&2
fi

echo "==> Fetching $BRANCH"
git fetch --quiet origin "$BRANCH"
git reset --hard --quiet "origin/$BRANCH"
echo "    $(git log -1 --pretty='%h %s')"

echo "==> Dependencies"
# --include=dev is not optional here. The env file sets NODE_ENV=production
# (correct for the running app), and npm reads that to mean "skip
# devDependencies" — which drops tailwindcss, typescript and recharts' peer
# react-is, so the build fails on missing modules.
npm ci --include=dev --no-audit --no-fund

echo "==> Build"
npm run build

echo "==> Restart"
sudo systemctl restart pulsenow

# Give it a moment, then confirm it actually came back rather than crash-looping.
sleep 4
if systemctl is-active --quiet pulsenow; then
  echo "    running"
else
  echo "    FAILED — recent log:" >&2
  journalctl -u pulsenow -n 40 --no-pager >&2
  exit 1
fi

for _ in {1..10}; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
    echo
    echo "Deployed. $(git log -1 --pretty='%h %s')"
    exit 0
  fi
  sleep 2
done

echo "Service is up but not answering on :3000 — check: journalctl -u pulsenow -f" >&2
exit 1
