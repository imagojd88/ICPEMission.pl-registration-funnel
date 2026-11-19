/**
 * Analityka rejestracji — PostHog (chmura EU) w trybie BEZ COOKIES.
 *
 *  - `cookieless_mode: 'always'`: PostHog nie zapisuje nic w cookies ani local/session
 *    storage; unikalnych odwiedzających liczy serwer z dziennego hasha (IP + przeglądarka).
 *    Wymaga w projekcie PostHog: Settings ▸ Project ▸ Web analytics ▸ „Enable cookieless tracking".
 *  - Tylko publiczna część (strony eventów, strona zgłoszenia) — panel admina nie jest śledzony.
 *  - Bez autocapture i bez nagrań sesji; własne zdarzenia bez danych osobowych
 *    (żadnych imion, maili, diet — tylko slug eventu, krok, liczby, metoda płatności).
 *  - Tokeny z linków (`/z/…`, `/g/…`, `/i/…`, `?inv=`) są wycinane z adresów przed wysyłką.
 *
 * Klucz projektu (publiczny „Project API key", phc_…): zmienna `VITE_POSTHOG_KEY` przy buildzie
 * (Render ▸ icpe-frontend ▸ Environment) albo stała POSTHOG_KEY poniżej. Pusty = analityka wyłączona.
 */

// Projekt „ICPE Rejestracja” (id 357985, organizacja ICPE PL, chmura EU). Klucz publiczny — do frontendu.
const POSTHOG_KEY = 'phc_voyynuBbyfCorvTsAEnu8tNX9FwhxYNZRdDibFo7NXQR'
const ENV = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env
const KEY = (ENV.VITE_POSTHOG_KEY || POSTHOG_KEY).trim()
const HOST = (ENV.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com').trim()

type PostHogLike = {
  init: (key: string, cfg: Record<string, unknown>) => void
  capture: (event: string, props?: Record<string, unknown>) => void
  register: (props: Record<string, unknown>) => void
  __loaded?: boolean
}

declare global {
  interface Window {
    posthog?: PostHogLike
  }
}

let started = false

/** Część panelu admina — tam nie śledzimy. */
function isAdminPath(path: string): boolean {
  return path.startsWith('/admin') || path.startsWith('/panel')
}

/** Wycina tokeny z adresów (linki osobiste z maili nie mogą trafić do analityki). */
export function scrubUrl(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return value
  let out = value.replace(/\/(z|g|i)\/[^/?#]+/g, '/$1/[token]')
  out = out.replace(/([?&])(inv|token)=[^&#]*/g, '$1$2=[token]')
  return out
}

const URL_PROPS = [
  '$current_url', '$pathname', '$referrer', '$initial_current_url', '$initial_pathname',
  '$initial_referrer', '$prev_pageview_pathname', '$prev_pageview_url', '$entry_current_url', '$entry_pathname',
]

/** Wywoływane raz przy starcie aplikacji. Bez klucza / w panelu admina — nic nie robi. */
export function initAnalytics(): void {
  if (started || !KEY || typeof window === 'undefined') return
  if (isAdminPath(window.location.pathname)) return
  started = true

  // Oficjalny loader PostHog (kolejkuje wywołania do czasu wczytania skryptu z CDN EU).
  /* eslint-disable */
  // prettier-ignore
  ;(function(t: any,e: any){var o: any,n: any,p: any,r: any;e.__SV||((window as any).posthog=e,e._i=[],e.init=function(i: any,s: any,a: any){function g(t: any,e: any){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t: any){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset set_config".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)})(document,(window as any).posthog||[]);
  /* eslint-enable */

  window.posthog?.init(KEY, {
    api_host: HOST,
    ui_host: HOST.includes('eu.') ? 'https://eu.posthog.com' : 'https://us.posthog.com',
    cookieless_mode: 'always',
    person_profiles: 'identified_only', // nigdy nie identyfikujemy osób → zdarzenia anonimowe
    autocapture: false,
    capture_pageview: 'history_change', // SPA: pageview przy każdej zmianie adresu
    capture_pageleave: true,
    disable_session_recording: true,
    disable_surveys: true,
    before_send: (event: { event?: string; properties?: Record<string, unknown> } | null) => {
      if (!event) return event
      const p = event.properties ?? {}
      const path = typeof p.$pathname === 'string' ? p.$pathname : window.location.pathname
      if (isAdminPath(path)) return null
      for (const k of URL_PROPS) if (k in p) p[k] = scrubUrl(p[k])
      event.properties = p
      return event
    },
  })
}

/** Własne zdarzenie (bez danych osobowych!). Bezpieczne, gdy analityka wyłączona. */
export function track(event: string, props?: Record<string, unknown>): void {
  if (!started) return
  try {
    window.posthog?.capture(event, props)
  } catch {
    /* analityka nigdy nie może zepsuć zapisu */
  }
}

/** Właściwości doklejane do wszystkich kolejnych zdarzeń w tej wizycie (np. slug eventu). */
export function setAnalyticsContext(props: Record<string, unknown>): void {
  if (!started) return
  try {
    window.posthog?.register(props)
  } catch {
    /* jw. */
  }
}
