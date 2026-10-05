/**
 * Wybór języka dla gości — wspólna reguła dla wszystkich stron publicznych
 * (rejestracja, zaproszenia, „Zaproś gościa"; ta sama logika jest w site/src/scripts/lang-pref.ts
 * dla strony głównej i panelu formacji).
 *
 * Kolejność:
 *  1. `?lang=xx` w adresie (np. w linku z maila) — zapisywane jako wybór gościa,
 *  2. wybór ręczny zapamiętany wcześniej (cookie na całą domenę icpemission.pl + localStorage),
 *  3. języki przeglądarki: pierwszy z listy preferencji, który strona obsługuje,
 *  4. w każdym innym wypadku — angielski.
 * Przykłady: przeglądarka po polsku → PL; po włosku → IT (gdzie jest wersja włoska, inaczej EN);
 * po niemiecku / hiszpańsku / koreańsku → EN; „de, pl" → PL (gość deklaruje, że zna polski).
 */

export type Lang = 'pl' | 'en' | 'it'

const KNOWN: Lang[] = ['pl', 'en', 'it']
const COOKIE = 'icpe_lang'
const STORAGE = 'icpe_lang'
const ONE_YEAR = 60 * 60 * 24 * 365

const norm = (v: string | null | undefined): Lang | null => {
  const c = (v ?? '').trim().toLowerCase().slice(0, 2)
  return (KNOWN as string[]).includes(c) ? (c as Lang) : null
}

/** Domena cookie: wspólna dla icpemission.pl i rejestracja.icpemission.pl. */
function cookieDomain(): string {
  if (typeof location === 'undefined') return ''
  return /(^|\.)icpemission\.pl$/.test(location.hostname) ? '; domain=.icpemission.pl' : ''
}

/** Zapamiętany wybór gościa (null = nigdy nie wybierał). */
export function getSavedLang(): Lang | null {
  try {
    const m = document.cookie.match(/(?:^|;\s*)icpe_lang=([a-z]{2})/)
    const fromCookie = norm(m?.[1])
    if (fromCookie) return fromCookie
  } catch { /* ignore */ }
  try {
    return norm(localStorage.getItem(STORAGE))
  } catch {
    return null
  }
}

/** Zapamiętuje wybór gościa (ręczne kliknięcie PL/EN/IT albo `?lang=`). */
export function saveLang(l: Lang): void {
  try {
    document.cookie = `${COOKIE}=${l}; path=/; max-age=${ONE_YEAR}; SameSite=Lax${cookieDomain()}`
  } catch { /* ignore */ }
  try {
    localStorage.setItem(STORAGE, l)
  } catch { /* ignore */ }
}

/** Język z `?lang=` (zapisywany od razu jako wybór gościa). */
function langFromUrl(): Lang | null {
  try {
    const l = norm(new URLSearchParams(location.search).get('lang'))
    if (l) saveLang(l)
    return l
  } catch {
    return null
  }
}

/** Języki przeglądarki w kolejności preferencji. */
function browserLangs(): string[] {
  if (typeof navigator === 'undefined') return []
  const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]
  return list.filter(Boolean)
}

/** Sama reguła przeglądarki: pierwszy obsługiwany język z listy, inaczej EN. */
export function detectBrowserLang(available: readonly string[], langs: string[] = browserLangs()): Lang {
  for (const n of langs) {
    const c = norm(n)
    if (c && available.includes(c)) return c
  }
  if (available.includes('en')) return 'en'
  return (norm(available[0]) ?? 'pl')
}

/** Pełny wybór języka dla strony obsługującej `available`. */
export function resolveLang(available: readonly string[]): Lang {
  const fromUrl = langFromUrl()
  if (fromUrl && available.includes(fromUrl)) return fromUrl
  const saved = getSavedLang()
  if (saved && available.includes(saved)) return saved
  return detectBrowserLang(available)
}
