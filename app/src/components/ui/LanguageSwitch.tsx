import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const LABELS: Record<string, string> = { pl: 'PL', en: 'EN', it: 'IT' }
const ORDER = ['pl', 'en', 'it']

/**
 * Pływający przełącznik języka (kody tekstowe PL / EN / IT) dla stron publicznych.
 * Pokazuje tylko języki wybrane dla danego eventu; chowa się, gdy jest ≤ 1 język.
 * Startowy język: pierwszy z listy (preferując PL, jeśli jest).
 */
export default function LanguageSwitch({ locales }: { locales?: string[] }) {
  const { i18n } = useTranslation()

  // Uporządkuj i odfiltruj do znanych kodów.
  const langs = ORDER.filter((l) => (locales ?? []).includes(l))
  const [current, setCurrent] = useState(i18n.language)

  // Ustaw startowy język, jeśli aktywny nie należy do wybranych dla eventu.
  useEffect(() => {
    if (langs.length === 0) return
    if (!langs.includes(i18n.language)) {
      const preferred = langs.includes('pl') ? 'pl' : langs[0]
      void i18n.changeLanguage(preferred)
      setCurrent(preferred)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locales])

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
