import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import pl from './locales/pl.json'
import en from './locales/en.json'
import it from './locales/it.json'
import ko from './locales/ko.json'
import zh from './locales/zh.json'
import { resolveLang } from './lib/langPref'

// Wszystkie języki ładowane od razu (małe pliki) → brak wyścigu przy przełączaniu,
// dzięki czemu każdy string z t() zmienia się natychmiast po zmianie języka.
i18n
  .use(initReactI18next)
  .init({
    // Start od razu w języku gościa (bez mignięcia PL). IT dochodzi dopiero w LanguageSwitch,
    // gdy event ma wersję włoską — tu wybieramy tylko spośród zawsze dostępnych PL/EN.
    lng: resolveLang(['pl', 'en']),
    // KO / ZH: brakujący tekst → angielski (gość z Korei czy Chin łatwiej zrozumie EN niż PL).
    fallbackLng: { ko: ['en', 'pl'], zh: ['en', 'pl'], default: ['pl'] },
    supportedLngs: ['pl', 'en', 'it', 'ko', 'zh'],
    ns: ['translation'],
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false,
    },
    resources: {
      pl: { translation: pl },
      en: { translation: en },
      it: { translation: it },
      ko: { translation: ko },
      zh: { translation: zh },
    },
  })

// <html lang> w zgodzie z językiem: poprawny dobór czcionek CJK, łamanie wierszy, czytniki ekranu.
const syncHtmlLang = (l: string) => {
  try { document.documentElement.lang = l === 'zh' ? 'zh-Hans' : l } catch { /* SSR / testy */ }
}
syncHtmlLang(i18n.language)
i18n.on('languageChanged', syncHtmlLang)

export default i18n
