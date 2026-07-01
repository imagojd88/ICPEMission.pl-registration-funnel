import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const LABELS: Record<string, string> = { pl: 'PL', en: 'EN', it: 'IT' }
const ORDER = ['pl', 'en', 'it']

/**
 * Pływający przełącznik języka (kody tekstowe PL / EN / IT) dla stron publicznych.
 * Pokazuje tylko języki wybrane dla danego eventu; chowa się, gdy jest ≤ 1 język.
 * Startowy język: wykrywany z przeglądarki (jeśli event go obsługuje),
 * w innym wypadku PL (gdy dostępny), inaczej pierwszy z listy.
 */
export default function LanguageSwitch({ locales }: { locales?: string[] }) {
  const { i18n } = useTranslation()

  // Uporządkuj i odfiltruj do znanych kodów.
  const langs = ORDER.filter((l) => (locales ?? []).includes(l))
  const [current, setCurrent] = useState(i18n.language)
  const initialized = useRef(false)

  // Wybiera język na podstawie ustawień przeglądarki, ograniczony do języków eventu.
  function detectPreferred(available: string[]): string {
    const navLangs =
      typeof navigator !== 'undefined'
        ? navigator.languages && navigator.languages.length
          ? navigator.languages
          : [navigator.language]
        : []
    for (const n of navLangs) {
      const code = (n || '').toLowerCase().slice(0, 2)
      if (available.includes(code)) return code
    }
    return available.includes('pl') ? 'pl' : available[0]
  }

  useEffect(() => {
    if (langs.length === 0) return
    // Pierwsze realne wczytanie (po dociągnięciu locales eventu) → wykryj język przeglądarki.
    if (!initialized.current) {
      initialized.current = true
      const pref = detectPreferred(langs)
      if (pref && pref !== i18n.language) {
        void i18n.changeLanguage(pref)
        setCurrent(pref)
      } else {
        setCurrent(i18n.language)
      }
      return
    }
    // Później: jeśli aktywny język wypadł z listy (np. zmiana konfiguracji), dopasuj.
    if (!langs.includes(i18n.language)) {
      const pref = detectPreferred(langs)
      void i18n.changeLanguage(pref)
      setCurrent(pref)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langs.join(',')])

  if (langs.length <= 1) return null

  function pick(lng: string) {
    void i18n.changeLanguage(lng)
    setCurrent(lng)
  }

  return (
    <div
      className="fixed z-50 flex items-center overflow-hidden rounded-full"
      style={{
        top: 'calc(12px + env(safe-area-inset-top, 0px))',
        right: 58, // na lewo od ThemeToggle (right:12, szer. 38 + odstęp)
        height: 38,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
      }}
    >
      {langs.map((l) => {
        const active = current === l
        return (
          <button
            key={l}
            onClick={() => pick(l)}
            aria-label={`Język: ${LABELS[l]}`}
            aria-pressed={active}
            className="flex items-center justify-center text-xs font-semibold transition-colors"
            style={{
              height: 36,
              minWidth: 34,
              padding: '0 4px',
              background: active ? 'var(--brand)' : 'transparent',
              color: active ? '#fff' : 'var(--muted)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {LABELS[l]}
          </button>
        )
      })}
    </div>
  )
}
