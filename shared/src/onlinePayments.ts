/**
 * Płatności online (Tpay; później Stripe) — czyste funkcje wspólne dla API, lejka,
 * strony gościa i maili. JEDNO miejsce z regułą „kto widzi płatność online” oraz
 * z granicami kwot. Bez importów w czasie wykonania (testy: node --experimental-strip-types).
 *
 * Reguła (decyzja właściciela, 25.11.2026):
 *  - Tpay jest tylko dla Polaków,
 *  - „Polak” = NAJPIERW kraj zamieszkania zgłaszającego (Polska → Tpay; inny kraj → brak Tpay,
 *    niezależnie od języka), dopiero gdy kraju brak — język interfejsu / zgłoszenia (polski → Tpay).
 */

export type OnlineProvider = 'tpay';

/** Minimalna kwota techniczna płatności online, gdy nic nie jest jeszcze wymagalne (w walucie zgłoszenia). */
export const ONLINE_MIN_AMOUNT = 1;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Zapisy Polski: kod ISO alpha-2 / alpha-3 / numeryczny oraz nazwa w językach interfejsu i kilku innych. */
const POLAND = new Set([
  'PL', 'POL', '616', 'POLSKA', 'POLAND', 'POLONIA', 'POLEN', 'POLOGNE', 'POLSKO', 'RP',
  'RZECZPOSPOLITA POLSKA', 'REPUBLIC OF POLAND', '폴란드', '波兰', '波蘭',
]);

/** Ujednolica zapis kraju: bez spacji na brzegach, wielkie litery, bez znaków diakrytycznych. */
function normCountry(v: unknown): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v)
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // znaki diakrytyczne
    .normalize('NFC') // koreański: NFD rozkłada sylaby na jamo, składamy je z powrotem
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Czy podany kraj to Polska. `null` = kraju brak (puste pole) → decyduje język.
 * Obsługuje kod („PL”, „pl”, „POL”) i nazwę („Polska”, „Poland”, „Polonia”, „폴란드”, „波兰”).
 */
export function isPolandCountry(country: unknown): boolean | null {
  const c = normCountry(country);
  if (!c) return null;
  return POLAND.has(c);
}

/** Czy język (np. „pl”, „pl-PL”, „PL”) jest polski. */
export function isPolishLanguage(language: unknown): boolean {
  return typeof language === 'string' && language.trim().toLowerCase().split(/[-_]/)[0] === 'pl';
}

/**
 * Który dostawca płatności online przysługuje zgłaszającemu (null = żaden).
 * @param country    kraj zamieszkania zgłaszającego (kod ISO albo nazwa); pusty = nieznany
 * @param language   język interfejsu / zgłoszenia (używany TYLKO, gdy kraju brak)
 * @param configured dostawcy skonfigurowani na serwerze (`GET /payments/config`)
 */
export function onlineProviderFor(
  country: unknown,
  language: unknown,
  configured: readonly string[] | null | undefined,
): OnlineProvider | null {
  if (!Array.isArray(configured) || !configured.includes('tpay')) return null;
  const pl = isPolandCountry(country);
  const polish = pl === null ? isPolishLanguage(language) : pl;
  return polish ? 'tpay' : null;
}

/** Kraj zamieszkania z kontaktu zgłoszenia (`country` albo `countryCode`); brak → undefined. */
export function contactCountry(contact: unknown): string | undefined {
  const c = (contact ?? {}) as { country?: unknown; countryCode?: unknown };
  for (const v of [c.country, c.countryCode]) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Kod kraju z formularza (ISO 3166-1 alpha-2): „pl”, „ PL ” → „PL”. Wszystko inne (puste, nazwa,
 * 3 litery, cyfry) → undefined. Pole `contact.countryCode` zapisujemy WYŁĄCZNIE w tej postaci.
 */
export function normalizeCountryCode(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const c = v.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : undefined;
}

export interface OnlinePayBounds {
  /** kwota przycisku „Zapłać teraz”: wymagana teraz, a gdy nic nie jest wymagalne — najbliższa rata */
  due: number;
  /** najmniejsza dopuszczalna kwota (wymagana teraz; gdy nic nie jest wymagalne — minimum techniczne) */
  min: number;
  /** największa dopuszczalna kwota = pozostało do zapłaty */
  max: number;
}

/**
 * Granice kwoty płatności online dla stanu rozliczenia zgłoszenia.
 * Kwota dowolna, ale nie mniejsza niż wymagana teraz i nie większa niż pozostała do zapłaty.
 */
export function onlinePayBounds(state: {
  remaining: number;
  dueNow: number;
  nextDue?: { amount: number } | null;
}): OnlinePayBounds {
  const max = round2(Math.max(0, Number(state.remaining) || 0));
  if (!(max > 0)) return { due: 0, min: 0, max: 0 };
  const dueNow = round2(Math.min(max, Math.max(0, Number(state.dueNow) || 0)));
  if (dueNow > 0) return { due: dueNow, min: dueNow, max };
  // Nic nie jest jeszcze wymagalne (np. zadatek wpłacony, rata przed terminem): „teraz” = najbliższa rata.
  const next = round2(Math.min(max, Math.max(0, Number(state.nextDue?.amount) || 0)));
  return { due: next > 0 ? next : max, min: Math.min(ONLINE_MIN_AMOUNT, max), max };
}

export type OnlinePayMode = 'due' | 'remaining' | 'custom';
export type OnlinePayAmountError = 'NOTHING_TO_PAY' | 'INVALID' | 'BELOW_MIN' | 'ABOVE_MAX';
export type OnlinePayAmountResult = { ok: true; amount: number } | { ok: false; reason: OnlinePayAmountError };

/** Kwota z formularza („150,50”, „150.5”, 150.5) → liczba; inne → NaN. Bez zapisu wykładniczego. */
export function parsePayAmount(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const s = v.trim().replace(/\s/g, '').replace(',', '.');
  return /^\d{1,7}(\.\d{1,2})?$/.test(s) ? parseFloat(s) : NaN;
}

/**
 * Kwota płatności dla wybranego trybu, sprawdzona względem granic.
 *  - `due`       → kwota wymagana teraz („Zapłać teraz”),
 *  - `remaining` → wszystko, co pozostało („Zapłać całość”),
 *  - `custom`    → kwota gościa, od `min` do `max` („Inna kwota”).
 */
export function onlinePayAmount(mode: OnlinePayMode, amount: unknown, bounds: OnlinePayBounds): OnlinePayAmountResult {
  if (!(bounds.max > 0)) return { ok: false, reason: 'NOTHING_TO_PAY' };
  if (mode === 'due') return { ok: true, amount: bounds.due };
  if (mode === 'remaining') return { ok: true, amount: bounds.max };
  if (mode !== 'custom') return { ok: false, reason: 'INVALID' };
  const n = parsePayAmount(amount);
  if (!Number.isFinite(n) || !(n > 0)) return { ok: false, reason: 'INVALID' };
  // Grosze: więcej niż 2 miejsca po przecinku to błąd formularza, nie zaokrąglamy po cichu.
  if (Math.abs(round2(n) - n) > 1e-9) return { ok: false, reason: 'INVALID' };
  const a = round2(n);
  if (a < bounds.min - 0.005) return { ok: false, reason: 'BELOW_MIN' };
  if (a > bounds.max + 0.005) return { ok: false, reason: 'ABOVE_MAX' };
  return { ok: true, amount: a };
}
