#!/usr/bin/env bash
# Redeploy: pobiera zmiany, buduje front+back, migruje bazę, restartuje PM2.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▶ Pobieranie zmian…"
git pull --ff-only 2>/dev/null || echo "  (pomijam git pull — brak repo git)"

echo "▶ Zależności…"
npm install

echo "▶ Build backendu…"
npm run build --workspace=api

echo "▶ Build frontendu…"
VITE_API_URL="https://rejestracja.icpemission.pl/api" npm run build --workspace=app

echo "▶ Migracje bazy…"
npx prisma migrate deploy --schema=api/prisma/schema.prisma

echo "▶ Restart backendu (PM2)…"
pm2 restart icpe-api

echo "✓ Gotowe."
