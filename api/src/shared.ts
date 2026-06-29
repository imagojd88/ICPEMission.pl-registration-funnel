// Wbudowana kopia @icpe/shared (vendored w api/src/_shared) — żeby produkcyjny
// build `node dist/main.js` był samowystarczalny (bez cross-package require).
// Źródło prawdy nadal w /shared; deploy/sync-shared.sh kopiuje je tutaj.
export * from './_shared/index';
