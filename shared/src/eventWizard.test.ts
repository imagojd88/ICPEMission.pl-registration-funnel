import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasDiscountCodes, slugifyEventName, wizardAmount, wizardDiscountCodes, wizardPricingCore } from './eventWizard.ts';

const base = {
  formationFee: '40', mealsFee: '0', transport: '0', bedding: '0', nights: '0',
  rooms: [], childBrackets: [], discountRows: [],
};

test('a) zera w wyżywieniu / transporcie / pościeli zostają zerami (nie 80 / 40 / 15)', () => {
  const c = wizardPricingCore(base);
  assert.equal(c.formationFee, 40);
  assert.equal(c.mealsFee, 0);
  assert.deepEqual(c.options, { transport: 0, bedding: 0 });
});

test('a) puste pola kwot = 0, nie wartości domyślne', () => {
  const c = wizardPricingCore({ ...base, formationFee: '', mealsFee: '', transport: '', bedding: '' });
  assert.equal(c.formationFee, 0);
  assert.equal(c.mealsFee, 0);
  assert.deepEqual(c.options, { transport: 0, bedding: 0 });
});

test('b) pusta lista pokoi zostaje pusta (bez trzech pokoi domyślnych)', () => {
  assert.deepEqual(wizardPricingCore(base).rooms, []);
});

test('b) „Bez noclegu” czyści pokoje i noce, nawet gdy zostały w formularzu', () => {
  const room = { id: 'r1', name: 'Dwójka', cap: 2, perPerson: 90 } as never;
  const c = wizardPricingCore({ ...base, nights: '2', rooms: [room], noAccommodation: true });
  assert.deepEqual(c.rooms, []);
  assert.equal(c.nights, 0);
  const d = wizardPricingCore({ ...base, nights: '2', rooms: [room] });
  assert.equal(d.rooms.length, 1);
  assert.equal(d.nights, 2);
});

test('c) usunięte progi wiekowe i kody rabatowe nie wracają', () => {
  const c = wizardPricingCore(base);
  assert.deepEqual(c.childBrackets, []);
  assert.deepEqual(c.discountCodes, {});
  assert.equal(hasDiscountCodes(c), false);
});

test('c) wpisane progi i kody są zapisywane bez zmian', () => {
  const c = wizardPricingCore({
    ...base,
    childBrackets: [{ ltAge: 6, multiplier: 0.5 }],
    discountRows: [{ code: ' lato15 ', pct: '15' }, { code: '', pct: '10' }, { code: 'ZERO', pct: '0' }, { code: 'ZLE', pct: 'abc' }],
  });
  assert.deepEqual(c.childBrackets, [{ ltAge: 6, multiplier: 0.5 }]);
  assert.deepEqual(c.discountCodes, { LATO15: 0.15 });
  assert.equal(hasDiscountCodes(c), true);
});

test('wizardAmount: przecinek, liczby, śmieci, wartości ujemne', () => {
  assert.equal(wizardAmount('12,5'), 12.5);
  assert.equal(wizardAmount(' 30 '), 30);
  assert.equal(wizardAmount(7), 7);
  assert.equal(wizardAmount('0'), 0);
  assert.equal(wizardAmount('-5'), 0);
  assert.equal(wizardAmount('abc'), 0);
  assert.equal(wizardAmount(undefined), 0);
  assert.equal(wizardAmount(NaN), 0);
});

test('wizardDiscountCodes: zniżka ponad 100% jest przycinana', () => {
  assert.deepEqual(wizardDiscountCodes([{ code: 'all', pct: 150 }]), { ALL: 1 });
});

test('hasDiscountCodes: brak / pusto / same zera → false', () => {
  assert.equal(hasDiscountCodes(null), false);
  assert.equal(hasDiscountCodes({}), false);
  assert.equal(hasDiscountCodes({ discountCodes: {} }), false);
  assert.equal(hasDiscountCodes({ discountCodes: { X: 0 } }), false);
  assert.equal(hasDiscountCodes({ discountCodes: { ICPE10: 0.1 } }), true);
});

test('slug z nazwy: polskie znaki, małe litery, myślniki', () => {
  assert.equal(slugifyEventName('Dzień Formacji — Łódź 2027'), 'dzien-formacji-lodz-2027');
  assert.equal(slugifyEventName('  Zażółć gęślą jaźń!  '), 'zazolc-gesla-jazn');
  assert.equal(slugifyEventName('Test płatności (Tpay)'), 'test-platnosci-tpay');
  assert.equal(slugifyEventName('ŻÓŁW & Święto'), 'zolw-swieto');
  assert.equal(slugifyEventName(''), '');
  assert.equal(slugifyEventName('---'), '');
  assert.equal(slugifyEventName(undefined), '');
  assert.ok(slugifyEventName('a'.repeat(200)).length <= 80);
});
