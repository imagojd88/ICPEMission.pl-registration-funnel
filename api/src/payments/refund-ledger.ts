/**
 * Księga zwrotów — pomocnicy odczytu dla wszystkich miejsc, które sumują wpłaty.
 * Bez importów Nest (używane też przez serwisy spoza modułu płatności, bez zależności między modułami).
 * Reguła: „Wpłacono” = wpłaty PAID pomniejszone o zwroty DONE (`netPaidAmount` w shared).
 */
import { netPaidAmount } from '../shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** Suma zwrotów DONE per wpłata (w groszach liczona po stronie `netPaid`). Pusta lista → bez zapytania. */
export async function doneRefundsByPayment(db: Db, paymentIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (paymentIds.length === 0) return map;
  const rows = (await db.paymentRefund.findMany({
    where: { status: 'DONE', paymentId: { in: paymentIds } },
    select: { paymentId: true, amount: true },
  })) as Array<{ paymentId: string; amount: unknown }>;
  for (const r of rows) map.set(r.paymentId, Math.round(((map.get(r.paymentId) ?? 0) + num(r.amount)) * 100) / 100);
  return map;
}

/**
 * Kwoty netto wpłat PAID (po zwrotach częściowych). Zwroty mają tylko wpłaty online (`tpay`),
 * więc zapytanie o zwroty dotyczy wyłącznie ich.
 */
export async function netPaidByPayment(
  db: Db,
  payments: Array<{ id: string; amount: unknown; provider?: string | null; status?: string }>,
): Promise<Map<string, number>> {
  const refunded = await doneRefundsByPayment(db, payments.filter((p) => p.provider === 'tpay').map((p) => p.id));
  const out = new Map<string, number>();
  for (const p of payments) {
    const r = refunded.get(p.id) ?? 0;
    out.set(p.id, netPaidAmount({ amount: num(p.amount), status: p.status ?? 'PAID' }, r > 0 ? [{ amount: r, status: 'DONE' }] : []));
  }
  return out;
}
