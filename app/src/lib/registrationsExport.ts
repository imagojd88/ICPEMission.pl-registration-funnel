/**
 * Panel ▸ Zgłoszenia: eksport listy do CSV i adresy do programu pocztowego.
 * Czysta logika (bez Reacta i bez DOM poza `downloadCsv` / `copyText`) — plik powstaje w przeglądarce
 * z danych, które panel już ma; nic nie jest dociągane z serwera.
 */
import { addonsText, displayDietary, type AddonDef, type RegistrationDto } from '@icpe/shared'

/** Pola, które API listy zwraca ponad typ `RegistrationDto`. */
type Row = RegistrationDto & { roomSummary?: string; withoutRoom?: number; contact: RegistrationDto['contact'] & { countryCode?: string } }

const STATUS_PL: Record<string, string> = {
  CONFIRMED: 'Potwierdzone',
  PENDING: 'Oczekuje na wpłatę',
  PENDING_PAYMENT: 'Oczekuje na wpłatę',
  AWAITING_TRANSFER: 'Oczekuje na wpłatę',
  WAITLIST: 'Lista rezerwowa',
  CANCELLED: 'Anulowane',
  DRAFT: 'Szkic',
}

const PAY_STATUS_PL: Record<string, string> = {
  PAID: 'Opłacone',
  PENDING: 'W toku',
  AWAITING_TRANSFER: 'Oczekuje',
  UNPAID: 'Brak wpłaty',
  REFUNDED: 'Zwrócono',
  FAILED: 'Nieudana',
}

const METHOD_PL: Record<string, string> = {
  card: 'Online', online: 'Online', transfer: 'Przelew', bank_transfer: 'Przelew', cash: 'Gotówka', leader_deposit: 'Zaliczka u lidera',
}

const SOURCE_PL: Record<string, string> = {
  tpay: 'Tpay', stripe: 'Stripe', 'bank-import': 'przelew z wyciągu', panel: 'wpis ręczny', manual: 'oznaczone jako opłacone', mock: 'online (test)',
}

export function registrationStatusLabel(status: string): string {
  return STATUS_PL[status] ?? status
}

/** Kwota po polsku: przecinek dziesiętny, bez separatora tysięcy (Excel czyta ją jako liczbę). */
export function csvMoney(n: unknown): string {
  const v = Math.round((Number(n) || 0) * 100) / 100
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')
}

/** Chwila ISO → `25.11.2026 21:07` (czas przeglądarki). */
export function csvDateTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Jedna komórka CSV. Tekst wpisany przez gościa, który arkusz potraktowałby jak formułę
 * (zaczyna się od = @ albo od + / − i nie jest zwykłą liczbą / numerem telefonu), dostaje apostrof z przodu.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  s = s.replace(/\r\n?/g, '\n')
  const formulaLike = /^[=@\t]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[\d\s().,-]+$/.test(s))
  if (formulaLike) s = `'${s}`
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const REGISTRATIONS_CSV_HEADER = [
  'Nr zgłoszenia', 'Data zgłoszenia', 'Status', 'Płatność', 'Imię', 'Nazwisko', 'E-mail', 'Telefon', 'Kraj', 'Język',
  'Adres', 'Parafia', 'Wspólnota', 'Liczba osób', 'Uczestnicy (imię i nazwisko, wiek, typ)', 'Diety uczestników',
  'Pokoje', 'Nr pokoju', 'Uwagi do pokoju', 'Kwota', 'Wpłacono', 'Pozostało', 'Waluta', 'Metoda', 'Operator / źródło wpłat',
  'Darowizna', 'Kod rabatowy', 'Uwagi / dieta', 'Przyjazd', 'Dodatki',
] as const

function registrationCsvRow(r0: RegistrationDto, addonDefs: AddonDef[] = []): unknown[] {
  const r = r0 as Row
  const paid = typeof r.paidAmount === 'number' ? r.paidAmount : r.paymentStatus === 'PAID' ? r.totalPrice : 0
  const remaining = typeof r.payment?.remaining === 'number' ? r.payment.remaining : Math.max(0, (r.totalPrice ?? 0) - paid)
  const people = (r.participants ?? []).map((p) => {
    const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()
    const age = typeof p.age === 'number' ? `${p.age} l., ` : ''
    return `${name} (${age}${p.type === 'child' ? 'dziecko' : 'dorosły'})`
  })
  const diets = (r.participants ?? []).filter((p) => p.dietary).map((p) => `${p.firstName}: ${displayDietary(p.dietary)}`)
  const method = METHOD_PL[String(r.paymentMethod ?? '').toLowerCase()] ?? (r.paymentMethod ? String(r.paymentMethod) : '')
  const sources = (r.paidProviders ?? []).map((p) => SOURCE_PL[p] ?? p).join(' + ')
  const donation = Number(r.options?.donation ?? 0) || 0
  return [
    r.id,
    csvDateTime(r.createdAt),
    registrationStatusLabel(r.status),
    r.status === 'CANCELLED' ? '' : (r.totalPrice ?? 0) === 0 ? 'Bezpłatne' : PAY_STATUS_PL[r.paymentStatus] ?? r.paymentStatus ?? '',
    r.contact.firstName ?? '',
    r.contact.lastName ?? '',
    r.contact.email ?? '',
    r.contact.phone ?? '',
    r.contact.countryCode ?? '',
    r.locale ?? '',
    r.contact.address ?? '',
    r.contact.parish ?? '',
    r.contact.community ?? '',
    (r.participants ?? []).length,
    people.join(' | '),
    diets.join(' | '),
    r.roomSummary ?? '',
    r.roomLabel ?? '',
    r.roomNote ?? '',
    csvMoney(r.totalPrice),
    csvMoney(paid),
    csvMoney(remaining),
    r.currency ?? '',
    method,
    sources,
    donation > 0 ? csvMoney(donation) : '',
    r.discountCode ?? '',
    r.dietaryNotes ?? '',
    csvDateTime(r.checkedInAt),
    // Dodatki z limitem (np. „Dostawka, Łóżeczko turystyczne × 2”) — kolumna na końcu, żeby nie przesuwać dotychczasowych.
    addonsText(addonDefs, r.options?.addons, 'pl'),
  ]
}

/** Treść pliku CSV: średnik, CRLF, BOM UTF-8 na początku (polski Excel otwiera bez kreatora importu). */
export function buildRegistrationsCsv(regs: RegistrationDto[], addonDefs: AddonDef[] = []): string {
  const lines = [REGISTRATIONS_CSV_HEADER as readonly unknown[], ...regs.map((r) => registrationCsvRow(r, addonDefs))]
  return `﻿${lines.map((cells) => cells.map(csvCell).join(';')).join('\r\n')}\r\n`
}

/** Dowolna tabela → CSV w tym samym formacie co lista zgłoszeń (średnik, CRLF, BOM UTF-8). */
export function buildCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return `\uFEFF${rows.map((cells) => cells.map(csvCell).join(';')).join('\r\n')}\r\n`
}

/** Nazwa pliku: `zgloszenia-<event>-2026-11-25.csv` (bez polskich znaków i spacji). */
export function registrationsCsvFilename(eventTitle: string, now = new Date(), prefix = 'zgloszenia'): string {
  const slug = eventTitle
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${prefix}-${slug || 'event'}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.csv`
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ── E-mail: program pocztowy admina (serwer niczego nie wysyła) ───────────────

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/

/** Poprawne, niepowtarzające się adresy zgłaszających (porównanie bez wielkości liter). */
export function uniqueEmails(regs: Array<{ contact: { email?: string | null } }>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of regs) {
    const e = String(r.contact?.email ?? '').trim()
    if (!EMAIL_RE.test(e) || seen.has(e.toLowerCase())) continue
    seen.add(e.toLowerCase())
    out.push(e)
  }
  return out
}

/** Link do jednej osoby: `mailto:adres`. Zły adres → null. */
export function mailtoOne(email?: string | null): string | null {
  const e = String(email ?? '').trim()
  return EMAIL_RE.test(e) ? `mailto:${encodeURIComponent(e).replace(/%40/g, '@')}` : null
}

/** Powyżej tej długości adresu `mailto:` programy pocztowe i przeglądarki potrafią nie otworzyć wiadomości. */
export const MAILTO_SAFE_LENGTH = 1800

/** Wiadomość zbiorcza: adresy w polu UDW (ukryta kopia), żeby goście nie widzieli siebie nawzajem. */
export function mailtoBcc(emails: string[]): { href: string; tooLong: boolean } {
  const href = `mailto:?bcc=${emails.map((e) => encodeURIComponent(e).replace(/%40/g, '@')).join(',')}`
  return { href, tooLong: href.length > MAILTO_SAFE_LENGTH }
}

/** Tekst do schowka: adresy rozdzielone średnikiem (Outlook, Gmail i Apple Mail przyjmują taki zapis po wklejeniu). */
export function emailsForClipboard(emails: string[]): string {
  return emails.join('; ')
}

/** Kopiowanie do schowka z zapasową ścieżką dla przeglądarek bez `navigator.clipboard`. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* próbujemy starszą metodą niżej */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
