import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, paymentState, normalizePaymentPlan, minDepositPctFor, addDays, warsawDate, type PaymentPlan } from './paymentPlan.ts';

const plan: PaymentPlan = {
  enabled: true,
  installments: [
    { id: 'a', label: 'Zadatek', pct: 20, due: 'registration' },
    { id: 'b', label: 'II rata', pct: 30, due: '2027-04-20' },
    { id: 'c', label: 'Dopłata', pct: 50, due: '2027-07-31' },
  ],
};

test('harmonogram 20% + 30% + reszta', () => {
  const s = buildSchedule(1200, plan, '2027-01-20');
  assert.deepEqual(s.map((i) => [i.dueDate, i.cumulativePct, i.cumulativeAmount, i.amount]), [
    ['2027-01-20', 20, 240, 240],
    ['2027-04-20', 50, 600, 360],
    ['2027-07-31', 100, 1200, 600],
  ]);
});

test('zapis po terminie II raty: 50% od razu', () => {
  const s = buildSchedule(1300, plan, '2027-05-10');
  assert.deepEqual(s.map((i) => [i.dueDate, i.cumulativeAmount, i.amount]), [
    ['2027-05-10', 650, 650],
    ['2027-07-31', 1300, 650],
  ]);
  const late = buildSchedule(1400, plan, '2027-08-05');
  assert.deepEqual(late.map((i) => [i.dueDate, i.amount]), [['2027-08-05', 1400]]);
});

test('wyższy zadatek typu zakwaterowania (50%) wchłania II ratę', () => {
  const s = buildSchedule(2400, plan, '2027-01-20', 50);
  assert.deepEqual(s.map((i) => [i.dueDate, i.cumulativeAmount, i.amount]), [
    ['2027-01-20', 1200, 1200],
    ['2027-07-31', 2400, 1200],
  ]);
  assert.equal(minDepositPctFor([{ id: '1' }, { id: '2', depositPct: 50 }], ['1', '2']), 50);
  assert.equal(minDepositPctFor([{ id: '1' }], ['1', 'x']), 0);
});

test('stan rozliczenia: zadatek, zaległość, najbliższa rata', () => {
  const s = buildSchedule(1200, plan, '2027-01-20');
  const none = paymentState(1200, 0, s, '2027-01-25');
  assert.equal(none.dueNow, 240);
  assert.equal(none.overdue, 240);
  assert.equal(none.depositPaid, false);
  assert.deepEqual(none.nextDue, { id: 'a', label: 'Zadatek', dueDate: '2027-01-20', amount: 240 });
  const dep = paymentState(1200, 240, s, '2027-01-25');
  assert.equal(dep.dueNow, 0);
  assert.equal(dep.depositPaid, true);
  assert.deepEqual(dep.nextDue, { id: 'b', label: 'II rata', dueDate: '2027-04-20', amount: 360 });
  const onDay = paymentState(1200, 240, s, '2027-04-20');
  assert.equal(onDay.dueNow, 360);
  assert.equal(onDay.overdue, 0);
  const after = paymentState(1200, 300, s, '2027-04-21');
  assert.equal(after.overdue, 300);
  const full = paymentState(1200, 1200, s, '2027-08-01');
  assert.equal(full.fullyPaid, true);
  assert.equal(full.nextDue, null);
  assert.equal(full.remaining, 0);
});

test('bez planu: cała kwota wymagalna, brak harmonogramu', () => {
  assert.deepEqual(buildSchedule(500, null, '2027-01-01'), []);
  assert.deepEqual(buildSchedule(500, { enabled: false, installments: plan.installments }, '2027-01-01'), []);
  const st = paymentState(500, 100, []);
  assert.equal(st.dueNow, 400);
  assert.equal(st.fullyPaid, false);
});

test('normalizacja: sortowanie, błędne daty, zakresy', () => {
  const n = normalizePaymentPlan({ enabled: true, remindBeforeDays: 99, installments: [
    { id: 'z', pct: 150, due: '2027-07-31' }, { id: 'x', pct: 20, due: 'registration' }, { id: 'y', pct: 30, due: 'kiedys' },
  ] })!;
  assert.deepEqual(n.installments.map((i) => [i.id, i.pct, i.due]), [['x', 20, 'registration'], ['y', 30, 'registration'], ['z', 100, '2027-07-31']]);
  assert.equal(n.remindBeforeDays, 3);
  assert.equal(n.remindAfterDays, 7);
  assert.equal(addDays('2027-04-20', -3), '2027-04-17');
  assert.equal(addDays('2027-02-27', 7), '2027-03-06');
  assert.equal(warsawDate('2027-04-20T22:30:00Z'), '2027-04-21');
});

test('zaokrąglenia: suma rat = kwota', () => {
  const s = buildSchedule(1234.56, { enabled: true, installments: [
    { id: 'a', pct: 33.33, due: 'registration' }, { id: 'b', pct: 33.33, due: '2027-03-01' }, { id: 'c', pct: 0, due: '2027-06-01' },
  ] }, '2027-01-01');
  assert.equal(Math.round(s.reduce((x, i) => x + i.amount, 0) * 100) / 100, 1234.56);
  assert.equal(s[s.length - 1].cumulativeAmount, 1234.56);
});
