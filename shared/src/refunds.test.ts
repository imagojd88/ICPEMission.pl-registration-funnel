import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyChargeback, netPaidAmount, netPaidTotal, parseRefundAmount, planRefund, refundableAmount, refundedAmount,
  refundedOfPayment, refundInFlight, refundState,
} from './refunds.ts';

type Row = { amount: number; status: string };
type Pay = { amount: number; status: string };

/** Mini-księga: odtwarza to, co robi serwis (zlecenie → wynik operatora → zapis), na czystych funkcjach. */
function ledger(amount: number) {
  const payment: Pay = { amount, status: 'PAID' };
  const refunds: Row[] = [];
  return {
    payment,
    refunds,
    /** zlecenie z panelu; `outcome` = odpowiedź operatora */
    request(requested: unknown, outcome: 'ok' | 'rejected' | 'uncertain' = 'ok') {
      const plan = planRefund(payment, refunds, requested);
      if (!plan.ok) return plan;
      const row: Row = { amount: plan.amount, status: 'PENDING' };
      refunds.push(row);
      if (outcome === 'ok') {
        row.status = 'DONE';
        if (plan.closes) payment.status = 'REFUNDED';
      } else if (outcome === 'rejected') row.status = 'FAILED';
      else row.status = 'UNCERTAIN';
      return plan;
    },
    /** powiadomienie `chargeback` */
    chargeback() {
      const r = applyChargeback(payment, refunds);
      if (!r.changed) return r;
      for (const row of refunds) if (row.status === 'PENDING' || row.status === 'UNCERTAIN') row.status = 'DONE';
      if (r.residual > 0) refunds.push({ amount: r.residual, status: 'DONE' });
      payment.status = 'REFUNDED';
      return r;
    },
    net: () => netPaidAmount(payment, refunds),
  };
}

test('zwrot pełny z panelu, potem chargeback: wpłata liczona 0, bez drugiego pomniejszenia', () => {
  const l = ledger(32.5);
  const plan = l.request(undefined);
  assert.deepEqual(plan, { ok: true, amount: 32.5, closes: true, sendFull: true, left: 0 });
  assert.equal(l.payment.status, 'REFUNDED');
  assert.equal(l.net(), 0);
  const cb = l.chargeback();
  assert.deepEqual(cb, { changed: false, residual: 0 });
  assert.equal(l.refunds.length, 1);
  assert.equal(refundedAmount(l.refunds), 32.5);
  assert.equal(l.net(), 0);
});

test('chargeback bez zwrotu z panelu: ten sam stan końcowy co zwrot pełny z panelu', () => {
  const a = ledger(100);
  a.request(undefined);
  const b = ledger(100);
  assert.deepEqual(b.chargeback(), { changed: true, residual: 100 });
  assert.equal(a.payment.status, b.payment.status);
  assert.equal(a.net(), b.net());
  assert.equal(refundedAmount(a.refunds), refundedAmount(b.refunds));
  assert.equal(refundedOfPayment(a.payment, a.refunds), 100);
  // powtórzone powiadomienie
  assert.deepEqual(b.chargeback(), { changed: false, residual: 0 });
  assert.equal(b.refunds.length, 1);
});

test('chargeback najpierw, potem zlecenie z panelu: odmowa', () => {
  const l = ledger(100);
  l.chargeback();
  assert.deepEqual(l.request(10), { ok: false, reason: 'NOT_PAID', max: 0 });
});

test('częściowy + częściowy', () => {
  const l = ledger(100);
  assert.deepEqual(l.request(20), { ok: true, amount: 20, closes: false, sendFull: false, left: 80 });
  assert.equal(l.net(), 80);
  assert.equal(refundState(l.payment, l.refunds), 'PARTIAL');
  assert.deepEqual(l.request('30,50'), { ok: true, amount: 30.5, closes: false, sendFull: false, left: 49.5 });
  assert.equal(l.net(), 49.5);
  assert.equal(l.payment.status, 'PAID');
  assert.equal(refundableAmount(l.payment, l.refunds), 49.5);
});

test('częściowy + pełny reszty: wpłata zamknięta, do operatora idzie kwota (nie „zwrot pełny”)', () => {
  const l = ledger(100);
  l.request(20);
  const plan = l.request(undefined);
  assert.deepEqual(plan, { ok: true, amount: 80, closes: true, sendFull: false, left: 0 });
  assert.equal(l.payment.status, 'REFUNDED');
  assert.equal(l.net(), 0);
  assert.equal(refundState(l.payment, l.refunds), 'FULL');
  assert.equal(refundedAmount(l.refunds), 100);
});

test('częściowy z panelu, potem chargeback (zwrot reszty w panelu operatora): reszta dopisana raz', () => {
  const l = ledger(100);
  l.request(20);
  assert.deepEqual(l.chargeback(), { changed: true, residual: 80 });
  assert.equal(refundedAmount(l.refunds), 100);
  assert.equal(l.net(), 0);
  assert.deepEqual(l.chargeback(), { changed: false, residual: 0 });
  assert.equal(refundedAmount(l.refunds), 100);
});

test('zwrot ponad dostępną kwotę i kwoty niepoprawne', () => {
  const l = ledger(100);
  assert.deepEqual(l.request(100.01), { ok: false, reason: 'ABOVE_MAX', max: 100 });
  l.request(60);
  assert.deepEqual(l.request(40.01), { ok: false, reason: 'ABOVE_MAX', max: 40 });
  for (const bad of [0, -5, 'abc', '1.234', 1.234, NaN, Infinity, {}, true]) {
    assert.deepEqual(l.request(bad), { ok: false, reason: 'INVALID', max: 40 }, String(bad));
  }
  assert.equal(l.net(), 40);
  l.request(40);
  assert.deepEqual(l.request(1), { ok: false, reason: 'NOT_PAID', max: 0 });
});

test('grosze: sumy bez błędów zaokrągleń', () => {
  const l = ledger(0.3);
  l.request(0.1);
  l.request(0.1);
  assert.equal(refundableAmount(l.payment, l.refunds), 0.1);
  const plan = l.request('0,10');
  assert.equal(plan.ok && plan.closes, true);
  assert.equal(l.payment.status, 'REFUNDED');
  const m = ledger(32.5);
  m.request(12.49);
  assert.equal(m.net(), 20.01);
  assert.deepEqual(m.request(20.02), { ok: false, reason: 'ABOVE_MAX', max: 20.01 });
  assert.equal(parseRefundAmount('20,5'), 20.5);
  assert.equal(parseRefundAmount(' 7 '), 7);
  assert.ok(Number.isNaN(parseRefundAmount('20,555')));
  assert.ok(Number.isNaN(parseRefundAmount('1e3')));
});

test('podwójne żądanie: drugie w trakcie pierwszego jest odrzucane', () => {
  const payment: Pay = { amount: 50, status: 'PAID' };
  const refunds: Row[] = [{ amount: 50, status: 'PENDING' }];
  assert.equal(refundInFlight(refunds), true);
  assert.deepEqual(planRefund(payment, refunds, undefined), { ok: false, reason: 'IN_FLIGHT', max: 50 });
  // zwrot w toku nie pomniejsza jeszcze wpłat
  assert.equal(netPaidAmount(payment, refunds), 50);
});

test('odpowiedź niejednoznaczna blokuje kolejne zwroty i nie zmienia „Wpłacono”; odrzucony zwrot nie liczy się wcale', () => {
  const l = ledger(100);
  l.request(30, 'rejected');
  assert.equal(l.net(), 100);
  assert.equal(refundState(l.payment, l.refunds), 'NONE');
  l.request(30, 'uncertain');
  assert.equal(l.net(), 100);
  assert.deepEqual(l.request(10), { ok: false, reason: 'IN_FLIGHT', max: 100 });
  // chargeback rozstrzyga: zwrot „do wyjaśnienia” uznany, reszta dopisana; odrzucony pominięty
  assert.deepEqual(l.chargeback(), { changed: true, residual: 70 });
  assert.equal(refundedAmount(l.refunds), 100);
  assert.equal(l.net(), 0);
});

test('stare dane: wpłata REFUNDED bez wierszy zwrotów liczy się jako 0 i „zwrócono całość”', () => {
  const p: Pay = { amount: 80, status: 'REFUNDED' };
  assert.equal(netPaidAmount(p, []), 0);
  assert.equal(refundedOfPayment(p, []), 80);
  assert.equal(refundState(p, []), 'FULL');
  assert.equal(netPaidAmount({ amount: 80, status: 'FAILED' }, []), 0);
});

test('„Wpłacono” zgłoszenia: suma netto kilku wpłat', () => {
  assert.equal(
    netPaidTotal([
      { amount: 20, status: 'PAID', refunds: [{ amount: 20, status: 'UNCERTAIN' }] },
      { amount: 32.5, status: 'PAID', refunds: [{ amount: 12.5, status: 'DONE' }, { amount: 5, status: 'FAILED' }] },
      { amount: 40, status: 'REFUNDED', refunds: [] },
      { amount: 10.1, status: 'PAID', refunds: [] },
    ]),
    50.1,
  );
});
