#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "Building Project Xiomn..."
npm run build

echo "Deploying to /var/www/html..."
sudo rsync -a --delete dist/ /var/www/html/

echo "Done: https://xiomn.com"
