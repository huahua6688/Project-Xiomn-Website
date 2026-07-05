#!/usr/bin/env bash
set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
cd /home/ubuntu/projects/xiomn-website

exec 9>/tmp/xiomn-auto-deploy.lock
flock -n 9 || exit 0

git fetch origin main

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

echo "[$(date)] New commit detected: $REMOTE"

git pull --ff-only origin main
npm install
npm run build
rsync -a --delete dist/ /var/www/html/

echo "[$(date)] Deployed: $REMOTE"
