import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

i18n
  .use(initReactI18next)
  .init({
    lng: 'pl',
    fallbackLng: 'pl',
    supportedLngs: ['pl', 'en', 'it'],
    ns: ['translation'],
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false,
    },
    backend: {
      loadPath: '/locales/{{lng}}.json',
    },
    resources: {},
  })

// Lazy-load locale files
const loadLocale = async (lng: string) => {
  if (i18n.hasResourceBundle(lng, 'translation')) return
  try {
    const module = await import(`./locales/${lng}.json`)
    i18n.addResourceBundle(lng, 'translation', module.default ?? module, true, true)
  } catch {
    console.warn(`[i18n] Could not load locale: ${lng}`)
  }
}

// Eagerly load default language, lazy-load others on demand
loadLocale('pl')
i18n.on('languageChanged', (lng) => loadLocale(lng))

export default i18n
