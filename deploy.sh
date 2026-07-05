#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

echo "Building Project Xiomn..."
npm run build

echo "Deploying to /var/www/html..."
rsync -a --delete dist/ /var/www/html/

echo "Done: https://xiomn.com"
