/** Etykiety i formatowanie dla Dashboardu eventu (panel admina, po polsku). */

export const STEP_LABELS: Record<string, string> = {
  visit: 'Weszli na stronę eventu',
  start: 'Zaczęli wypełniać formularz',
  s1_applicant: 'Krok 1: dane zgłaszającego',
  s2_participants: 'Krok 2: uczestnicy',
  s3_preferences: 'Krok 3: preferencje',
  s4_accommodation: 'Krok 4: nocleg',
  s5_options: 'Krok 5: opcje',
  payment: 'Wybrali sposób płatności',
  submit: 'Wysłali zgłoszenie',
}

export const BLOCKED_LABELS: Record<string, string> = {
  accommodation: 'Nocleg — nie wszyscy przypisani do pokoju albo brak wyboru',
  options: 'Opcje — dodatek wyczerpany',
}

export const FAILED_LABELS: Record<string, string> = {
  network: 'Gość stracił internet przy wysyłce',
  rooms_sold_out: 'Brak wolnych pokoi w chwili wysyłki',
  addon_sold_out: 'Dodatek wyczerpał się w chwili wysyłki',
  closed: 'Zapisy zamknięte w trakcie wypełniania',
  error: 'Inny błąd serwera',
}

export function sourceLabel(s: string): string {
  if (s.startsWith('utm:')) return `Kampania: ${s.slice(4)}`
  return (
    {
      direct: 'Bezpośrednio (link z WhatsAppa, SMS, zakładki)',
      facebook: 'Facebook',
      instagram: 'Instagram',
      email: 'E-mail',
      search: 'Wyszukiwarka',
      'icpemission.pl': 'Strona icpemission.pl',
      internal: 'Inna strona rejestracji',
      other: 'Inne strony',
    } as Record<string, string>
  )[s] ?? s
}

export const LANG_LABELS: Record<string, string> = {
  pl: 'polski',
  en: 'angielski',
  it: 'włoski',
  ko: 'koreański',
  zh: 'chiński',
  de: 'niemiecki',
  es: 'hiszpański',
  fr: 'francuski',
  uk: 'ukraiński',
}

export const DEVICE_LABELS: Record<string, string> = { mobile: 'Telefon', desktop: 'Komputer', tablet: 'Tablet' }

export const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'Potwierdzone',
  PENDING_PAYMENT: 'Czeka na płatność',
  AWAITING_TRANSFER: 'Czeka na przelew',
  WAITLIST: 'Lista rezerwowa',
  CANCELLED: 'Anulowane',
  DRAFT: 'Szkic',
}

export const METHOD_LABELS: Record<string, string> = {
  ONLINE: 'Online (Tpay)',
  BANK_TRANSFER: 'Przelew',
  CASH: 'Gotówka na miejscu',
  LEADER_DEPOSIT: 'Zaliczka u lidera',
  NONE: 'Nie wybrano',
  FREE: 'Bezpłatne',
}

export const PROVIDER_LABELS: Record<string, string> = {
  tpay: 'Tpay (online)',
  stripe: 'Stripe (karta)',
  'bank-import': 'Przelew z wyciągu',
  panel: 'Wpis ręczny',
  manual: 'Oznaczone jako opłacone',
  test: 'Wpłaty testowe',
  desk: 'Recepcja',
}

let regionNames: Intl.DisplayNames | null = null
export function countryLabel(code: string): string {
  if (!code || code === '—') return 'Nie podano'
  try {
    regionNames ??= new Intl.DisplayNames(['pl'], { type: 'region' })
    return regionNames.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

export const fmtInt = (n: number) => new Intl.NumberFormat('pl-PL').format(Math.round(n))

export function fmtMoney(n: number, currency = 'PLN'): string {
  const v = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(Math.round(n))
  return currency === 'PLN' ? `${v} zł` : `${v} ${currency}`
}

export function fmtPct(part: number, whole: number): string {
  if (!whole) return '—'
  const p = (part / whole) * 100
  return `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1).replace('.', ',')}%`
}

/** `YYYY-MM-DD` → „16 sty” */
export function fmtDay(iso: string, withYear = false): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  return dt.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).replace('.', '')
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })
}

export const plural = (n: number, one: string, few: string, many: string) => {
  const n10 = n % 10
  const n100 = n % 100
  if (n === 1) return one
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few
  return many
}
