/**
 * Kreator „Nowy event” — czyste funkcje budujące cennik z pól formularza i slug z nazwy.
 * Bez importów w czasie wykonania (testy: node --experimental-strip-types).
 *
 * Zasada (25.11.2026): to, co admin jawnie ustawił, zapisuje się DOKŁADNIE tak — także 0,
 * pusta lista pokoi, pusta lista progów wiekowych i brak kodów rabatowych. Wartości domyślne
 * (`DEFAULT_PRICING`) mogą być podpowiedzią w formularzu, ale nigdy nie nadpisują wyboru.
 */
import type { AgeBracket, PricingConfig, RoomTypeDef } from './pricing';

/** Kwota z pola formularza: puste / niepoprawne / ujemne → 0; „12,5” → 12.5. Zero zostaje zerem. */
export function wizardAmount(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  if (typeof v !== 'string') return 0;
  const n = parseFloat(v.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Wiersze kodów rabatowych (kod + % zniżki) → mapa kod → ułamek. Puste kody i 0% są pomijane. */
export function wizardDiscountCodes(rows: ReadonlyArray<{ code: string; pct: string | number }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows ?? []) {
    const code = String(row.code ?? '').trim().toUpperCase();
    const pct = wizardAmount(row.pct);
    if (code && pct > 0) out[code] = Math.min(100, pct) / 100;
  }
  return out;
}

export interface WizardPricingCoreInput {
  formationFee: unknown;
  mealsFee: unknown;
  transport: unknown;
  bedding: unknown;
  /** „Bez noclegu” — event bez pokoi i bez nocy, niezależnie od tego, co zostało w kroku „Pokoje”. */
  noAccommodation?: boolean;
  nights: unknown;
  rooms: RoomTypeDef[];
  childBrackets: AgeBracket[];
  discountRows: ReadonlyArray<{ code: string; pct: string | number }>;
}

export type WizardPricingCore = Pick<
  PricingConfig,
  'formationFee' | 'mealsFee' | 'nights' | 'childBrackets' | 'rooms' | 'options' | 'discountCodes'
>;

/** Rdzeń cennika nowego eventu — bez żadnego podstawiania wartości domyślnych. */
export function wizardPricingCore(input: WizardPricingCoreInput): WizardPricingCore {
  const nightsRaw = typeof input.nights === 'number' ? input.nights : parseInt(String(input.nights ?? ''), 10);
  const nights = input.noAccommodation ? 0 : Number.isFinite(nightsRaw) && nightsRaw > 0 ? Math.trunc(nightsRaw) : 0;
  return {
    formationFee: wizardAmount(input.formationFee),
    mealsFee: wizardAmount(input.mealsFee),
    nights,
    childBrackets: [...(input.childBrackets ?? [])],
    rooms: input.noAccommodation ? [] : [...(input.rooms ?? [])],
    options: { transport: wizardAmount(input.transport), bedding: wizardAmount(input.bedding) },
    discountCodes: wizardDiscountCodes(input.discountRows),
  };
}

/** Znaki bez rozkładu NFD (ł, ø, ß…) → odpowiedniki ASCII. */
const SLUG_MAP: Record<string, string> = {
  ł: 'l', Ł: 'l', ø: 'o', Ø: 'o', ß: 'ss', đ: 'd', Đ: 'd', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe', þ: 'th', Þ: 'th',
};

/**
 * Slug strony eventu z nazwy: polskie znaki → ASCII, małe litery, myślniki.
 * „Dzień Formacji — Łódź 2027” → „dzien-formacji-lodz-2027”.
 */
export function slugifyEventName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name
    .replace(/[łŁøØßđĐæÆœŒþÞ]/g, (ch) => SLUG_MAP[ch] ?? ch)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/** Czy cennik ma choć jeden aktywny kod rabatowy (zniżka > 0). */
export function hasDiscountCodes(config: { discountCodes?: Record<string, number> | null } | null | undefined): boolean {
  const codes = config?.discountCodes;
  if (!codes || typeof codes !== 'object') return false;
  return Object.entries(codes).some(([code, frac]) => !!code.trim() && Number(frac) > 0);
}
