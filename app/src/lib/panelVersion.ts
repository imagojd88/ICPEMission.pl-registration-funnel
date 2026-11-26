/**
 * Wersja panelu działająca w tej karcie przeglądarki + wykrywanie, że na serwerze jest już nowsza.
 *
 * Po co: formularze konfiguracji eventu („Edytuj event”, kreator) zapisują cały cennik. Karta otwarta
 * przed wdrożeniem nowej wersji nie zna nowych pól i zapisem mogłaby je skasować (tak 25–26.11.2026
 * zniknęły poziomy cen eventu). Dlatego:
 *  - build frontu zapisuje `/version.json` (ten sam znacznik co stała `__APP_BUILD__`),
 *  - panel co kilka minut i przy powrocie do karty porównuje oba znaczniki,
 *  - różnica → baner „odśwież stronę” i zablokowane przyciski zapisu (stan zostaje do odświeżenia),
 *  - przy zapisie konfiguracji panel dokleja `_client` (wersja, poziom formularza, `configRev`) —
 *    po tym API rozpoznaje starą kartę (która tego pola nie wysyła) i odrzuca jej zapis.
 * Znacznik idzie w CIELE żądania, nie w nagłówku: API ma zamkniętą listę nagłówków CORS, więc nowy
 * nagłówek wysłany przed wdrożeniem API zablokowałby wszystkie żądania panelu.
 */
import { useSyncExternalStore } from 'react'
import { PANEL_CONFIG_LEVEL } from '@icpe/shared'

declare const __APP_BUILD__: string | undefined

/** Znacznik buildu tej karty (hash commita z Render albo czas buildu); w `vite dev` — „dev”. */
export const PANEL_BUILD: string = typeof __APP_BUILD__ === 'string' && __APP_BUILD__ ? __APP_BUILD__ : 'dev'

/** Pole `_client` do zapisów konfiguracji eventu. */
export function clientStamp(configRev?: number | null): { version: string; configLevel: number; configRev?: number } {
  return {
    version: PANEL_BUILD,
    configLevel: PANEL_CONFIG_LEVEL,
    ...(typeof configRev === 'number' && Number.isInteger(configRev) && configRev >= 0 ? { configRev } : {}),
  }
}

export const STALE_SAVE_MESSAGE =
  'Dostępna jest nowa wersja panelu. Zapis jest zablokowany, bo ta karta mogłaby skasować nowsze ustawienia. Odśwież stronę i wprowadź zmiany ponownie.'

let stale = false
let deployed: string | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Czysta decyzja (łatwa do sprawdzenia): czy karta jest nieaktualna względem wdrożonej wersji. */
export function isStaleBuild(running: string, deployedBuild: unknown): boolean {
  if (typeof deployedBuild !== 'string' || !deployedBuild.trim()) return false
  if (!running || running === 'dev') return false
  return deployedBuild.trim() !== running
}

/** Sprawdza `/version.json`. Błąd sieci / brak pliku / nie-JSON = nic nie wiemy → bez zmian. */
export async function checkPanelVersion(): Promise<boolean> {
  if (stale || PANEL_BUILD === 'dev' || typeof fetch !== 'function') return stale
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!res.ok) return stale
    if (!(res.headers.get('content-type') ?? '').includes('json')) return stale // SPA-fallback oddał index.html
    const data = (await res.json()) as { build?: unknown }
    if (isStaleBuild(PANEL_BUILD, data?.build)) {
      stale = true
      deployed = String(data.build)
      emit()
    }
  } catch {
    /* brak sieci — spróbujemy przy następnym sprawdzeniu */
  }
  return stale
}

/** Uruchamia okresowe sprawdzanie (co 3 min + powrót do karty / okna). Zwraca funkcję sprzątającą. */
export function startPanelVersionWatch(intervalMs = 3 * 60_000): () => void {
  if (typeof window === 'undefined') return () => undefined
  const run = () => { void checkPanelVersion() }
  const onVisible = () => { if (document.visibilityState === 'visible') run() }
  const timer = window.setInterval(run, intervalMs)
  window.addEventListener('focus', run)
  document.addEventListener('visibilitychange', onVisible)
  run()
  return () => {
    window.clearInterval(timer)
    window.removeEventListener('focus', run)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/** true = wdrożono nowszą wersję panelu niż ta w karcie (zostaje true do odświeżenia strony). */
export function usePanelStale(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => stale,
    () => false,
  )
}

export function deployedPanelBuild(): string | null {
  return deployed
}
