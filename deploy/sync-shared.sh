#!/usr/bin/env bash
# Kopiuje kanoniczny pakiet shared do wbudowanej kopii w api (api/src/_shared),
# z której korzysta produkcyjny build backendu. Uruchamiaj po każdej zmianie w /shared.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p api/src/_shared
cp shared/src/pricing.ts shared/src/types.ts shared/src/calendar.ts shared/src/index.ts api/src/_shared/
echo "✓ shared zsynchronizowany → api/src/_shared"
