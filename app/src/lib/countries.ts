/**
 * Kraje do wyboru w edycji eventu (EventInstance.countryCode = ISO 3166-1 alpha-2).
 * Zapisujemy wyłącznie kod; nazwę wyświetlamy w języku aktywnej zakładki (Intl.DisplayNames).
 */

/** Kraje, w których ICPE najczęściej organizuje eventy — na górze listy. */
export const COMMON_COUNTRY_CODES = ['PL', 'IT', 'MT', 'DE', 'FR', 'ES', 'GB', 'IE', 'US', 'KR', 'CN', 'PH']

/** Pełna lista kodów ISO 3166-1 alpha-2 (oficjalnie przypisane). */
export const ALL_COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ')

/** Nazwy krajów per język interfejsu (pl, en, it, ko, zh) — tworzone leniwie i trzymane w pamięci. */
const displayNamesCache = new Map<string, Intl.DisplayNames | null>()

function namesFor(lang: string): Intl.DisplayNames | null {
  const l = (lang || 'pl').toLowerCase()
  if (!displayNamesCache.has(l)) {
    let dn: Intl.DisplayNames | null = null
    try {
      // zh = chiński uproszczony (jak w zapisach).
      dn = new Intl.DisplayNames([l === 'zh' ? 'zh-Hans' : l], { type: 'region' })
    } catch {
      dn = null
    }
    displayNamesCache.set(l, dn)
  }
  return displayNamesCache.get(l) ?? null
}

/** Nazwa kraju w danym języku (np. PL → „Polska” / „Poland” / „Polonia”); bez wsparcia Intl → sam kod. */
export function countryName(code: string, lang = 'pl'): string {
  try {
    return namesFor(lang)?.of(code) ?? code
  } catch {
    return code
  }
}

export type CountryOption = { code: string; name: string }

const optionsCache = new Map<string, { common: CountryOption[]; rest: CountryOption[] }>()

/** Opcje listy w danym języku: najpierw częste kraje, potem pozostałe alfabetycznie. */
export function countryOptions(lang = 'pl'): { common: CountryOption[]; rest: CountryOption[] } {
  const l = (lang || 'pl').toLowerCase()
  const hit = optionsCache.get(l)
  if (hit) return hit
  const collator = l === 'zh' ? 'zh-Hans' : l
  const common = COMMON_COUNTRY_CODES.map((code) => ({ code, name: countryName(code, l) }))
  const rest = ALL_COUNTRY_CODES.filter((c) => !COMMON_COUNTRY_CODES.includes(c))
    .map((code) => ({ code, name: countryName(code, l) }))
    .sort((a, b) => a.name.localeCompare(b.name, collator))
  const out = { common, rest }
  optionsCache.set(l, out)
  return out
}
