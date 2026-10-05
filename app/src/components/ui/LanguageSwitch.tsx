import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveLang, saveLang, type Lang } from '../../lib/langPref'

const LABELS: Record<string, string> = { pl: 'PL', en: 'EN', it: 'IT' }
const ORDER = ['pl', 'en', 'it']

/** Języki, w których zawsze jest przetłumaczony interfejs — oferowane niezależnie od ustawień eventu. */
const ALWAYS = ['pl', 'en']

/**
 * Pływający przełącznik języka (kody tekstowe PL / EN / IT) dla stron publicznych.
 * Pokazuje PL i EN zawsze (interfejs jest w nich w pełni przetłumaczony — gość anglojęzyczny
 * nie może zostać z polską stroną tylko dlatego, że w evencie zaznaczono sam PL), plus
 * ewentualne dodatkowe języki eventu (IT). Treść eventu bez tłumaczenia spada do PL.
 * Startowy język: `resolveLang` (lib/langPref) — ?lang=, zapamiętany wybór gościa,
 * potem język przeglądarki (PL → PL, IT → IT gdy event ma IT), w każdym innym wypadku EN.
 */
export default function LanguageSwitch({ locales }: { locales?: string[] }) {
  const { i18n } = useTranslation()

  // Uporządkuj i odfiltruj do znanych kodów.
  const langs = ORDER.filter((l) => ALWAYS.includes(l) || (locales ?? []).includes(l))
  const [current, setCurrent] = useState(i18n.language)
  const initialized = useRef(false)

  useEffect(() => {
    // Czekamy na języki eventu (undefined = jeszcze się ładują) — inaczej wykrycie języka
    // przeglądarki odbyłoby się tylko wśród PL/EN i Włoch nie dostałby automatycznie IT.
    if (locales === undefined || langs.length === 0) return
    // Pierwsze realne wczytanie (po dociągnięciu locales eventu) → wybierz język gościa.
    if (!initialized.current) {
      initialized.current = true
      const pref = resolveLang(langs)
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
      const pref = resolveLang(langs)
      void i18n.changeLanguage(pref)
      setCurrent(pref)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langs.join(',')])

  if (langs.length <= 1) return null

  function pick(lng: string) {
    saveLang(lng as Lang) // ręczny wybór wygrywa z językiem przeglądarki — także przy kolejnych wizytach
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
