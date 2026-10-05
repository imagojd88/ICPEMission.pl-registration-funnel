import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import pl from './locales/pl.json'
import en from './locales/en.json'
import it from './locales/it.json'
import { resolveLang } from './lib/langPref'

// Wszystkie języki ładowane od razu (małe pliki) → brak wyścigu przy przełączaniu,
// dzięki czemu każdy string z t() zmienia się natychmiast po zmianie języka.
i18n
  .use(initReactI18next)
  .init({
    // Start od razu w języku gościa (bez mignięcia PL). IT dochodzi dopiero w LanguageSwitch,
    // gdy event ma wersję włoską — tu wybieramy tylko spośród zawsze dostępnych PL/EN.
    lng: resolveLang(['pl', 'en']),
    fallbackLng: 'pl',
    supportedLngs: ['pl', 'en', 'it'],
    ns: ['translation'],
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false,
    },
    resources: {
      pl: { translation: pl },
      en: { translation: en },
      it: { translation: it },
    },
  })

export default i18n
