#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

git pull --ff-only

docker compose build db api
docker compose up -d db api

docker compose build web-build
docker compose run --rm web-build

echo "[deploy] done"
