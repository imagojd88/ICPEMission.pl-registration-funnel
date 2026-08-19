import { useCallback, useEffect, useRef, useState } from 'react'

export interface AutoRefreshOptions {
  /** Odstęp między odświeżeniami w ms. Domyślnie 30000. */
  intervalMs?: number
  /** Gdy false — polling wstrzymany (np. otwarty formularz edycji). Domyślnie true. */
  enabled?: boolean
  /** Odśwież natychmiast po powrocie do karty. Domyślnie true. */
  refreshOnFocus?: boolean
}

export interface AutoRefreshState {
  /** Kiedy ostatnio zakończyło się udane odświeżenie (null = jeszcze nigdy). */
  lastUpdatedAt: Date | null
  /** Trwa odświeżanie w tle. */
  refreshing: boolean
  /** Ręczne wywołanie (przycisk „Odśwież"). */
  refreshNow: () => Promise<void>
}

/**
 * Cichy polling w tle — do odświeżania danych panelu admina bez przeładowania strony.
 *
 * Uwagi implementacyjne:
 * - `fn` jest trzymane w ref i aktualizowane co render, więc podanie nowej instancji
 *   funkcji (typowe przy inline-arrow w komponencie) NIE restartuje interwału.
 * - Kolejny tick jest pomijany, jeśli poprzednie wywołanie `fn` jeszcze trwa
 *   (brak nakładających się requestów).
 * - Gdy karta jest ukryta (`document.hidden`), tick jest pomijany — polling efektywnie
 *   wstrzymany. Po powrocie do karty następuje natychmiastowe odświeżenie
 *   (jeśli `refreshOnFocus`).
 * - Błąd rzucony przez `fn` jest wyciszany — nie zabija interwału i nie wywołuje
 *   unhandled rejection. Komponent wywołujący ma odpowiadać za własny stan błędu.
 */
export function useAutoRefresh(
  fn: () => Promise<void>,
  options?: AutoRefreshOptions,
): AutoRefreshState {
  const { intervalMs = 30000, enabled = true, refreshOnFocus = true } = options ?? {}

  // `fn` zawsze aktualne, bez wpływu na tożsamość efektu niżej.
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  const mountedRef = useRef(true)
  const runningRef = useRef(false)

  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Stabilna referencja — nie zależy od `fn`, tylko od refów.
  const runCycle = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    if (mountedRef.current) setRefreshing(true)
    try {
      await fnRef.current()
      if (mountedRef.current) setLastUpdatedAt(new Date())
    } catch {
      // Błąd `fn` celowo wyciszony — komponent obsługuje własny stan błędu.
    } finally {
      runningRef.current = false
      if (mountedRef.current) setRefreshing(false)
    }
  }, [])

  const refreshNow = useCallback(async () => {
    await runCycle()
  }, [runCycle])

  useEffect(() => {
    if (!enabled) return

    const id = window.setInterval(() => {
      if (document.hidden) return
      void runCycle()
    }, intervalMs)

    function handleVisibilityChange() {
      if (!document.hidden && refreshOnFocus) {
        void runCycle()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, intervalMs, refreshOnFocus, runCycle])

  return { lastUpdatedAt, refreshing, refreshNow }
}
