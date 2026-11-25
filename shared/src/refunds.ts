/**
 * Zwroty wpłat online — czysta logika kwot (bez bazy i bez sieci), wspólna dla API i panelu.
 *
 * Model: wpłata (`Payment`) nie jest nadpisywana. Każdy zwrot to osobny wiersz (`PaymentRefund`)
 * ze statusem:
 *   PENDING   — zlecenie w toku (wywołanie operatora trwa),
 *   DONE      — zwrot przyjęty przez operatora; TYLKO takie pomniejszają „Wpłacono”,
 *   UNCERTAIN — odpowiedź operatora niejednoznaczna (np. przekroczony czas) — do wyjaśnienia,
 *   FAILED    — operator odrzucił zlecenie; nic nie zwrócono.
 * Wpłata zwrócona w całości dostaje status `REFUNDED` i liczy się jako 0 — niezależnie od tego,
 * czy zwrot zlecono w panelu, czy przyszedł powiadomieniem `chargeback`.
 */

export type RefundStatus = 'PENDING' | 'DONE' | 'UNCERTAIN' | 'FAILED';

export interface RefundRowLike {
  amount: number;
  status: string;
}

export interface RefundablePaymentLike {
  amount: number;
  /** status wpłaty: PAID | REFUNDED | … */
  status: string;
}

/** Kwota w groszach (liczby całkowite — bez błędów zaokrągleń przy sumowaniu). */
export const toGrosze = (n: number): number => Math.round((Number(n) || 0) * 100);
const fromGrosze = (g: number): number => g / 100;

/** Suma zwrotów przyjętych przez operatora (DONE). */
export function refundedAmount(refunds: RefundRowLike[]): number {
  return fromGrosze(refunds.filter((r) => r.status === 'DONE').reduce((s, r) => s + toGrosze(r.amount), 0));
}

/** Czy jest zwrot w toku albo do wyjaśnienia — do czasu rozstrzygnięcia nie zlecamy kolejnego. */
export function refundInFlight(refunds: RefundRowLike[]): boolean {
  return refunds.some((r) => r.status === 'PENDING' || r.status === 'UNCERTAIN');
}

/** Ile jeszcze można zwrócić z tej wpłaty (0 dla wpłaty niezaksięgowanej albo zwróconej w całości). */
export function refundableAmount(payment: RefundablePaymentLike, refunds: RefundRowLike[]): number {
  if (payment.status !== 'PAID') return 0;
  return fromGrosze(Math.max(0, toGrosze(payment.amount) - toGrosze(refundedAmount(refunds))));
}

/** Ile z tej wpłaty liczy się do „Wpłacono”: PAID → kwota minus zwroty DONE; każdy inny status → 0. */
export function netPaidAmount(payment: RefundablePaymentLike, refunds: RefundRowLike[]): number {
  return refundableAmount(payment, refunds);
}

/** Ile z tej wpłaty zwrócono (wpłata REFUNDED = cała kwota, także gdy nie ma wierszy zwrotów — stare dane). */
export function refundedOfPayment(payment: RefundablePaymentLike, refunds: RefundRowLike[]): number {
  if (payment.status === 'REFUNDED') return fromGrosze(toGrosze(payment.amount));
  if (payment.status !== 'PAID') return 0;
  return fromGrosze(Math.min(toGrosze(payment.amount), toGrosze(refundedAmount(refunds))));
}

/** Znacznik w panelu: brak zwrotu / zwrot częściowy / zwrot całości. */
export function refundState(payment: RefundablePaymentLike, refunds: RefundRowLike[]): 'NONE' | 'PARTIAL' | 'FULL' {
  if (payment.status === 'REFUNDED') return 'FULL';
  if (payment.status !== 'PAID') return 'NONE';
  const done = toGrosze(refundedAmount(refunds));
  if (done <= 0) return 'NONE';
  return done >= toGrosze(payment.amount) ? 'FULL' : 'PARTIAL';
}

/** Kwota zwrotu z formularza / żądania: liczba albo tekst z przecinkiem; najwyżej 2 miejsca po przecinku. NaN = niepoprawna. */
export function parseRefundAmount(value: unknown): number {
  let n: number;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && /^\s*\d+([.,]\d{1,2})?\s*$/.test(value)) n = parseFloat(value.trim().replace(',', '.'));
  else return NaN;
  if (!Number.isFinite(n)) return NaN;
  // „co do grosza”: kwoty z trzecim miejscem po przecinku odrzucamy zamiast po cichu zaokrąglać
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return NaN;
  return fromGrosze(Math.round(n * 100));
}

export type RefundPlan =
  | {
      ok: true;
      /** kwota zwrotu */
      amount: number;
      /** po tym zwrocie wpłata jest zwrócona w całości → status REFUNDED */
      closes: boolean;
      /** zlecenie „zwrot pełny” u operatora (puste ciało): cała wpłata naraz, bez wcześniejszych zwrotów */
      sendFull: boolean;
      /** ile zostanie do zwrotu po tym zwrocie */
      left: number;
    }
  | { ok: false; reason: 'NOT_PAID' | 'IN_FLIGHT' | 'NOTHING_LEFT' | 'INVALID' | 'ABOVE_MAX'; max: number };

/**
 * Sprawdza zlecenie zwrotu. `requested` puste (undefined / null / '') = cała pozostała kwota.
 * Zwrot dopuszczalny tylko dla wpłaty PAID, bez zwrotu w toku, na kwotę > 0 i ≤ pozostałej — co do grosza.
 */
export function planRefund(payment: RefundablePaymentLike, refunds: RefundRowLike[], requested?: unknown): RefundPlan {
  const max = refundableAmount(payment, refunds);
  if (payment.status !== 'PAID') return { ok: false, reason: 'NOT_PAID', max: 0 };
  if (refundInFlight(refunds)) return { ok: false, reason: 'IN_FLIGHT', max };
  if (!(max > 0)) return { ok: false, reason: 'NOTHING_LEFT', max: 0 };
  const whole = requested === undefined || requested === null || requested === '';
  const amount = whole ? max : parseRefundAmount(requested);
  if (!Number.isFinite(amount) || !(amount > 0)) return { ok: false, reason: 'INVALID', max };
  if (toGrosze(amount) > toGrosze(max)) return { ok: false, reason: 'ABOVE_MAX', max };
  const closes = toGrosze(amount) === toGrosze(max);
  const sendFull = closes && toGrosze(refundedAmount(refunds)) === 0;
  return { ok: true, amount, closes, sendFull, left: fromGrosze(toGrosze(max) - toGrosze(amount)) };
}

/**
 * Powiadomienie operatora o zwrocie pełnym (`chargeback`). Idempotentne względem zwrotów z panelu:
 * wpłata już REFUNDED → nic się nie zmienia. W przeciwnym razie wpłata przechodzi na REFUNDED,
 * zwroty w toku / do wyjaśnienia uznajemy za wykonane (operator potwierdził zwrot całości),
 * a brakującą resztę zapisujemy jako jeden wiersz ze źródłem „powiadomienie”.
 */
export function applyChargeback(payment: RefundablePaymentLike, refunds: RefundRowLike[]): { changed: boolean; residual: number } {
  if (payment.status !== 'PAID') return { changed: false, residual: 0 };
  const settled = refunds.filter((r) => r.status !== 'FAILED').reduce((s, r) => s + toGrosze(r.amount), 0);
  return { changed: true, residual: fromGrosze(Math.max(0, toGrosze(payment.amount) - settled)) };
}

/** „Wpłacono” zgłoszenia: suma wpłat netto (po zwrotach). */
export function netPaidTotal(payments: Array<RefundablePaymentLike & { refunds: RefundRowLike[] }>): number {
  return fromGrosze(payments.reduce((s, p) => s + toGrosze(netPaidAmount(p, p.refunds)), 0));
}
