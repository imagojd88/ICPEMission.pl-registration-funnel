import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contactCountry, isPolandCountry, isPolishLanguage, normalizeCountryCode, onlinePayAmount, onlinePayBounds, onlineProviderFor, parsePayAmount,
} from './onlinePayments.ts';

test('normalizeCountryCode: tylko 2 litery, wielkie', () => {
  assert.equal(normalizeCountryCode('pl'), 'PL');
  assert.equal(normalizeCountryCode(' De '), 'DE');
  assert.equal(normalizeCountryCode('PL'), 'PL');
  for (const bad of ['', '  ', 'POL', 'Polska', 'P', '12', 'P1', null, undefined, 616, {}]) {
    assert.equal(normalizeCountryCode(bad), undefined, String(bad));
  }
});

test('kraj z formularza (contact.countryCode) decyduje przed językiem', () => {
  // Polak mieszkający w Polsce, interfejs po angielsku → Tpay.
  assert.equal(onlineProviderFor(contactCountry({ countryCode: 'PL' }), 'en', ['tpay']), 'tpay');
  // Mieszkaniec Niemiec z polskim interfejsem → bez Tpay.
  assert.equal(onlineProviderFor(contactCountry({ countryCode: 'DE' }), 'pl', ['tpay']), null);
  // Stare zgłoszenie bez kraju → decyduje język.
  assert.equal(onlineProviderFor(contactCountry({}), 'pl', ['tpay']), 'tpay');
  assert.equal(onlineProviderFor(contactCountry({ countryCode: '' }), 'en', ['tpay']), null);
});

const TPAY = ['tpay'];

test('kraj Polska → Tpay niezależnie od języka', () => {
  for (const c of ['PL', 'pl', ' Pl ', 'POL', 'Polska', 'polska', 'Poland', 'POLAND', 'Polonia', 'Polen', '폴란드', '波兰', '616']) {
    assert.equal(onlineProviderFor(c, 'en', TPAY), 'tpay', c);
    assert.equal(onlineProviderFor(c, 'ko', TPAY), 'tpay', c);
  }
});

test('inny kraj → brak Tpay, także przy polskim języku', () => {
  for (const c of ['IT', 'it', 'Włochy', 'Italy', 'DE', 'Germany', 'KR', 'Korea', 'XX', 'Polinezja', 'PLN']) {
    assert.equal(onlineProviderFor(c, 'pl', TPAY), null, c);
    assert.equal(onlineProviderFor(c, 'en', TPAY), null, c);
  }
});

test('brak kraju → decyduje język', () => {
  for (const c of [undefined, null, '', '   ']) {
    assert.equal(onlineProviderFor(c, 'pl', TPAY), 'tpay');
    assert.equal(onlineProviderFor(c, 'pl-PL', TPAY), 'tpay');
    assert.equal(onlineProviderFor(c, 'PL', TPAY), 'tpay');
    assert.equal(onlineProviderFor(c, 'en', TPAY), null);
    assert.equal(onlineProviderFor(c, 'it', TPAY), null);
    assert.equal(onlineProviderFor(c, 'ko', TPAY), null);
    assert.equal(onlineProviderFor(c, 'zh', TPAY), null);
    assert.equal(onlineProviderFor(c, undefined, TPAY), null);
    assert.equal(onlineProviderFor(c, '', TPAY), null);
  }
});

test('Tpay nieskonfigurowany → nikt nie dostaje płatności online', () => {
  assert.equal(onlineProviderFor('PL', 'pl', []), null);
  assert.equal(onlineProviderFor('PL', 'pl', null), null);
  assert.equal(onlineProviderFor('PL', 'pl', undefined), null);
  assert.equal(onlineProviderFor(undefined, 'pl', ['stripe']), null);
});

test('pomocnicze: kraj i język', () => {
  assert.equal(isPolandCountry('Polska'), true);
  assert.equal(isPolandCountry('Italia'), false);
  assert.equal(isPolandCountry(''), null);
  assert.equal(isPolandCountry({}), null);
  assert.equal(isPolishLanguage('pl_PL'), true);
  assert.equal(isPolishLanguage('plk'), false);
  assert.equal(contactCountry({ country: ' PL ' }), 'PL');
  assert.equal(contactCountry({ countryCode: 'IT' }), 'IT');
  assert.equal(contactCountry({ country: '', countryCode: 'IT' }), 'IT');
  assert.equal(contactCountry({ address: 'Warszawa' }), undefined);
  assert.equal(contactCountry(null), undefined);
});

test('granice: bez harmonogramu całość jest wymagana teraz', () => {
  assert.deepEqual(onlinePayBounds({ remaining: 1200, dueNow: 1200, nextDue: null }), { due: 1200, min: 1200, max: 1200 });
});

test('granice: zadatek wymagany teraz, reszta później', () => {
  assert.deepEqual(onlinePayBounds({ remaining: 1000, dueNow: 200, nextDue: { amount: 200 } }), { due: 200, min: 200, max: 1000 });
});

test('granice: nic nie jest wymagalne → „teraz” = najbliższa rata, minimum techniczne', () => {
  assert.deepEqual(onlinePayBounds({ remaining: 800, dueNow: 0, nextDue: { amount: 300 } }), { due: 300, min: 1, max: 800 });
  assert.deepEqual(onlinePayBounds({ remaining: 0.5, dueNow: 0, nextDue: { amount: 0.5 } }), { due: 0.5, min: 0.5, max: 0.5 });
  assert.deepEqual(onlinePayBounds({ remaining: 800, dueNow: 0, nextDue: null }), { due: 800, min: 1, max: 800 });
});

test('granice: wszystko zapłacone / nadpłata', () => {
  assert.deepEqual(onlinePayBounds({ remaining: 0, dueNow: 0, nextDue: null }), { due: 0, min: 0, max: 0 });
  assert.deepEqual(onlinePayBounds({ remaining: -5, dueNow: 0 }), { due: 0, min: 0, max: 0 });
  // wymagane teraz nigdy nie przekracza reszty
  assert.deepEqual(onlinePayBounds({ remaining: 100, dueNow: 250 }), { due: 100, min: 100, max: 100 });
});

test('kwota: tryby due / remaining', () => {
  const b = { due: 200, min: 200, max: 1000 };
  assert.deepEqual(onlinePayAmount('due', undefined, b), { ok: true, amount: 200 });
  assert.deepEqual(onlinePayAmount('remaining', undefined, b), { ok: true, amount: 1000 });
  // kwota z żądania jest w tych trybach ignorowana
  assert.deepEqual(onlinePayAmount('due', 1, b), { ok: true, amount: 200 });
  assert.deepEqual(onlinePayAmount('remaining', 1, b), { ok: true, amount: 1000 });
});

test('kwota własna: tylko od wymaganej do reszty', () => {
  const b = { due: 200, min: 200, max: 1000 };
  assert.deepEqual(onlinePayAmount('custom', 200, b), { ok: true, amount: 200 });
  assert.deepEqual(onlinePayAmount('custom', '450,50', b), { ok: true, amount: 450.5 });
  assert.deepEqual(onlinePayAmount('custom', '1000.00', b), { ok: true, amount: 1000 });
  assert.deepEqual(onlinePayAmount('custom', 199.99, b), { ok: false, reason: 'BELOW_MIN' });
  assert.deepEqual(onlinePayAmount('custom', 1000.01, b), { ok: false, reason: 'ABOVE_MAX' });
  assert.deepEqual(onlinePayAmount('custom', 0, b), { ok: false, reason: 'INVALID' });
  assert.deepEqual(onlinePayAmount('custom', -300, b), { ok: false, reason: 'INVALID' });
  assert.deepEqual(onlinePayAmount('custom', 'abc', b), { ok: false, reason: 'INVALID' });
  assert.deepEqual(onlinePayAmount('custom', '1e3', b), { ok: false, reason: 'INVALID' });
  assert.deepEqual(onlinePayAmount('custom', 300.123, b), { ok: false, reason: 'INVALID' });
  assert.deepEqual(onlinePayAmount('custom', undefined, b), { ok: false, reason: 'INVALID' });
  assert.deepEqual(onlinePayAmount('custom', NaN, b), { ok: false, reason: 'INVALID' });
  assert.deepEqual(onlinePayAmount('custom', Infinity, b), { ok: false, reason: 'INVALID' });
});

test('kwota: nic do zapłaty i nieznany tryb', () => {
  const zero = { due: 0, min: 0, max: 0 };
  for (const m of ['due', 'remaining', 'custom'] as const) {
    assert.deepEqual(onlinePayAmount(m, 100, zero), { ok: false, reason: 'NOTHING_TO_PAY' });
  }
  assert.deepEqual(onlinePayAmount('x' as never, 100, { due: 1, min: 1, max: 5 }), { ok: false, reason: 'INVALID' });
});

test('parsePayAmount', () => {
  assert.equal(parsePayAmount('1 250,50'), 1250.5);
  assert.equal(parsePayAmount(' 12 '), 12);
  assert.ok(Number.isNaN(parsePayAmount('12.345')));
  assert.ok(Number.isNaN(parsePayAmount('')));
  assert.ok(Number.isNaN(parsePayAmount(null)));
});
