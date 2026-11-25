/**
 * Zapis niedokończonego zgłoszenia w przeglądarce gościa.
 *
 * Lejek wysyła dane na serwer dopiero po kliknięciu „Wyślij zgłoszenie", więc bez tego
 * odświeżenie strony (albo telefon w trakcie wypełniania) kasowało cały postęp i osoba
 * musiała zaczynać od zera — a często po prostu rezygnowała.
 *
 * Dane siedzą wyłącznie na urządzeniu gościa, są przypisane do konkretnego eventu (slug)
 * i kasują się po wysłaniu zgłoszenia albo po upływie TTL.
 */

const PREFIX = 'icpe:funnel:'
/** Podbij, gdy zmieni się kształt StepperState — stare wersje zostaną odrzucone. */
const VERSION = 1
/** Po tylu dniach draft uznajemy za nieaktualny (i tak nie chcemy trzymać danych dłużej). */
const TTL_DAYS = 3

/** Ekrany, na które wolno wrócić z draftu. Cokolwiek innego = dane uszkodzone. */
const RESUMABLE = ['stepper', 'payment_method', 'summary'] as const
export type ResumableScreen = (typeof RESUMABLE)[number]

interface StoredDraft {
  v: number
  slug: string
  savedAt: number
  screen: string
  stepper: unknown
}

const key = (slug: string) => `${PREFIX}${slug}`

const isExpired = (savedAt: number) => Date.now() - savedAt > TTL_DAYS * 24 * 60 * 60 * 1000

/** Zapis jest best-effort: tryb prywatny Safari potrafi rzucić na samym `setItem`. */
export function saveDraft(slug: string, screen: string, stepper: unknown): void {
  if (!slug) return
  try {
    const draft: StoredDraft = { v: VERSION, slug, savedAt: Date.now(), screen, stepper }
    window.localStorage.setItem(key(slug), JSON.stringify(draft))
  } catch {
    /* brak miejsca / zablokowany storage — trudno, lejek działa jak dotąd */
  }
}

/**
 * Zwraca surowy draft. `stepper` jest celowo `unknown` — kształt waliduje dopiero
 * wołający (numer VERSION nie wystarcza: nikt nie zagwarantuje, że został podbity
 * przy zmianie modelu, a wysypka na `undefined.map` kładzie całą stronę).
 */
export function loadDraft(slug: string): { screen: ResumableScreen; stepper: unknown } | null {
  if (!slug) return null
  try {
    const raw = window.localStorage.getItem(key(slug))
    if (!raw) return null
    const d = JSON.parse(raw) as StoredDraft
    const badShape =
      !d || typeof d !== 'object' || d.v !== VERSION || d.slug !== slug ||
      !d.stepper || typeof d.stepper !== 'object' || Array.isArray(d.stepper) ||
      typeof d.savedAt !== 'number'
    if (badShape || isExpired(d.savedAt)) {
      clearDraft(slug)
      return null
    }
    // Ekran sukcesu nie jest punktem powrotu (zgłoszenie już poszło), a nieznana
    // wartość mogłaby wpaść do setScreen i dać pustą stronę bez wyjścia.
    const screen = d.screen === 'success' ? 'summary' : d.screen
    return {
      screen: (RESUMABLE as readonly string[]).includes(screen) ? (screen as ResumableScreen) : 'stepper',
      stepper: d.stepper,
    }
  } catch {
    clearDraft(slug)
    return null
  }
}

export function clearDraft(slug: string): void {
  if (!slug) return
  try {
    window.localStorage.removeItem(key(slug))
  } catch {
    /* jw. */
  }
}

/**
 * Sprząta przeterminowane drafty WSZYSTKICH eventów. Bez tego dane osobowe z porzuconego
 * zgłoszenia leżałyby w przeglądarce bezterminowo — TTL sprawdzał się tylko przy powrocie
 * na ten sam adres.
 */
export function pruneExpiredDrafts(): void {
  try {
    const doomed: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i)
      if (!k || !k.startsWith(PREFIX)) continue
      try {
        const d = JSON.parse(window.localStorage.getItem(k) ?? '') as StoredDraft
        if (d?.v !== VERSION || typeof d?.savedAt !== 'number' || isExpired(d.savedAt)) doomed.push(k)
      } catch {
        doomed.push(k)
      }
    }
    doomed.forEach((k) => window.localStorage.removeItem(k))
  } catch {
    /* jw. */
  }
}

// ---------------------------------------------------------------------------
// Klucz sesji formularza („leadKey”) — niedokończone zgłoszenia
// ---------------------------------------------------------------------------
// Losowy, nieodgadywalny identyfikator tej przeglądarki dla danego eventu. Lejek wysyła go przy zapisie
// „rozpoczętego zgłoszenia” i przy wysłaniu zgłoszenia: dzięki temu poprawienie e-maila w trakcie nie
// zostawia starego adresu z przypomnieniem „dokończ zgłoszenie”, a wysłane zgłoszenie zamyka wszystko,
// co ta sesja zaczęła. Klucz nie daje dostępu do żadnych danych. Osobny prefiks — `pruneExpiredDrafts`
// sprząta tylko szkice.

const LEAD_KEY_PREFIX = 'icpe:leadkey:'
/** Tyle samo, ile API czeka z przypomnieniem najdłużej (7 dni) — potem klucz i tak nic nie znaczy. */
const LEAD_KEY_TTL_DAYS = 7
/** Gdy storage jest zablokowany (tryb prywatny), klucz żyje do zamknięcia karty. */
const memoryLeadKeys = new Map<string, string>()

function randomLeadKey(): string {
  try {
    const bytes = new Uint8Array(24)
    window.crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // Bez Web Crypto nie udajemy losowości — brak klucza = działanie jak dotąd (po samym adresie).
    return ''
  }
}

/** Klucz sesji formularza dla eventu (tworzy przy pierwszym użyciu). Pusty tekst = brak klucza. */
export function getLeadKey(slug: string): string {
  if (!slug) return ''
  const mem = memoryLeadKeys.get(slug)
  if (mem) return mem
  try {
    const raw = window.localStorage.getItem(`${LEAD_KEY_PREFIX}${slug}`)
    if (raw) {
      const d = JSON.parse(raw) as { k?: unknown; t?: unknown }
      const fresh = typeof d?.t === 'number' && Date.now() - d.t < LEAD_KEY_TTL_DAYS * 24 * 60 * 60 * 1000
      if (fresh && typeof d.k === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(d.k)) {
        memoryLeadKeys.set(slug, d.k)
        return d.k
      }
    }
  } catch {
    /* uszkodzony wpis / zablokowany storage — tworzymy nowy klucz niżej */
  }
  const key = randomLeadKey()
  if (!key) return ''
  memoryLeadKeys.set(slug, key)
  try {
    window.localStorage.setItem(`${LEAD_KEY_PREFIX}${slug}`, JSON.stringify({ k: key, t: Date.now() }))
  } catch {
    /* jw. — zostaje klucz w pamięci karty */
  }
  return key
}

/** Po wysłaniu zgłoszenia: następne zgłoszenie z tej przeglądarki to nowa sesja formularza. */
export function clearLeadKey(slug: string): void {
  if (!slug) return
  memoryLeadKeys.delete(slug)
  try {
    window.localStorage.removeItem(`${LEAD_KEY_PREFIX}${slug}`)
  } catch {
    /* jw. */
  }
}
