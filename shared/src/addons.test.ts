import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADDON_TEMPLATES, addonAvailability, addonLabel, addonLines, addonProblemMessage, addonReport, addonUsage, addonVisible, addonsPrice, addonsText,
  cleanAddonSelection, eventAddons, nextAddonTimes, validateAddonSelection, visibleAddonSelection, type AddonDef,
} from './addons.ts';
import { computePrice, DEFAULT_PRICING } from './pricing.ts';

const BED: AddonDef = { id: 'extra_bed', name: { pl: 'Dostawka', en: 'Extra bed' }, limit: 8, maxPerRegistration: 1 };
const COT: AddonDef = { id: 'travel_cot', name: { pl: 'Łóżeczko', en: 'Travel cot' }, limit: 5, maxPerRegistration: 2, childUnderAge: 3 };
const FREE: AddonDef = { id: 'parking', name: 'Parking', price: 20 };
const DEFS = [BED, COT, FREE];
const FAMILY = [{ type: 'adult', age: 35 }, { type: 'child', age: 2 }];
const ADULTS = [{ type: 'adult', age: 35 }, { type: 'adult', age: 2 }];

test('eventAddons: brak konfiguracji = pusta lista; błędne wpisy i powtórzone id pomijane', () => {
  assert.deepEqual(eventAddons(null), []);
  assert.deepEqual(eventAddons({}), []);
  assert.deepEqual(eventAddons({ addons: 'x' }), []);
  const out = eventAddons({ addons: [BED, { id: 'extra_bed', name: 'dubel' }, { id: 'zła nazwa!', name: 'x' }, { id: 'pusty', name: { pl: ' ' } }, null, COT] });
  assert.deepEqual(out.map((a) => a.id), ['extra_bed', 'travel_cot']);
});

test('szablony: dostawka 8 / 1 na zgłoszenie, łóżeczko 5 / dziecko poniżej 3 lat, tłumaczenia PL/EN/IT/KO/ZH', () => {
  const [bed, cot] = ADDON_TEMPLATES;
  assert.equal(bed.limit, 8);
  assert.equal(bed.maxPerRegistration, 1);
  assert.equal(cot.limit, 5);
  assert.equal(cot.childUnderAge, 3);
  for (const t of ADDON_TEMPLATES) {
    for (const l of ['pl', 'en', 'it', 'ko', 'zh']) {
      assert.ok(addonLabel(t.name, l).length > 0, `${t.id} name ${l}`);
      assert.ok(addonLabel(t.desc, l).length > 0, `${t.id} desc ${l}`);
    }
    assert.equal(t.price, 0);
  }
  assert.match(addonLabel(bed.desc, 'pl'), /wyłącznie w pokojach hotelowych/);
  assert.match(addonLabel(bed.desc, 'pl'), /prośbą/);
  assert.equal(eventAddons({ addons: ADDON_TEMPLATES }).length, 2);
});

test('warunek wieku: łóżeczko tylko gdy jest dziecko poniżej 3 lat (dorosły z wiekiem 2 się nie liczy)', () => {
  assert.equal(addonVisible(COT, FAMILY), true);
  assert.equal(addonVisible(COT, ADULTS), false);
  assert.equal(addonVisible(COT, [{ type: 'CHILD', age: 3 }]), false);
  assert.equal(addonVisible(COT, [{ type: 'child', age: 0 }]), true);
  assert.equal(addonVisible(BED, []), true);
  assert.deepEqual(visibleAddonSelection({ extra_bed: 1, travel_cot: 1 }, DEFS, ADULTS), { extra_bed: 1 });
});

test('cleanAddonSelection: tylko znane id i dodatnie liczby całkowite', () => {
  assert.deepEqual(cleanAddonSelection({ extra_bed: 1, travel_cot: '2', parking: 0, obcy: 3, x: -1 }, DEFS), { extra_bed: 1, travel_cot: 2 });
  assert.deepEqual(cleanAddonSelection({ extra_bed: true }, DEFS), { extra_bed: 1 });
  assert.deepEqual(cleanAddonSelection(null, DEFS), {});
  assert.deepEqual(cleanAddonSelection([1], DEFS), {});
});

test('zajętość i dostępność: anulowane i lista rezerwowa nie zajmują sztuk', () => {
  const regs = [
    { status: 'CONFIRMED', options: { addons: { extra_bed: 1, travel_cot: 2 } } },
    { status: 'PENDING_PAYMENT', options: { addons: { extra_bed: 1 } } },
    { status: 'AWAITING_TRANSFER', options: { addons: { extra_bed: 1 } } },
    { status: 'CANCELLED', options: { addons: { extra_bed: 1 } } },
    { status: 'WAITLIST', options: { addons: { extra_bed: 1, travel_cot: 1 } } },
    { status: 'CONFIRMED', options: {} },
    { status: 'CONFIRMED', options: null },
  ];
  const used = addonUsage(regs);
  assert.deepEqual(used, { extra_bed: 3, travel_cot: 2 });
  assert.deepEqual(addonAvailability(DEFS, used), { extra_bed: 5, travel_cot: 3 }); // parking bez limitu → brak klucza
  assert.deepEqual(addonAvailability(DEFS, { extra_bed: 20 }), { extra_bed: 0, travel_cot: 5 });
});

test('walidacja: limit, maksimum na zgłoszenie, warunek wieku; admin może przekroczyć', () => {
  assert.deepEqual(validateAddonSelection(DEFS, { extra_bed: 1 }, FAMILY, { extra_bed: 1, travel_cot: 5 }), []);
  assert.deepEqual(validateAddonSelection(DEFS, { extra_bed: 1 }, FAMILY, { extra_bed: 0, travel_cot: 5 }), [{ addonId: 'extra_bed', code: 'SOLD_OUT', requested: 1, allowed: 0 }]);
  assert.deepEqual(validateAddonSelection(DEFS, { travel_cot: 2 }, FAMILY, { extra_bed: 8, travel_cot: 1 }), [{ addonId: 'travel_cot', code: 'SOLD_OUT', requested: 2, allowed: 1 }]);
  assert.deepEqual(validateAddonSelection(DEFS, { extra_bed: 2 }, FAMILY, { extra_bed: 8 }), [{ addonId: 'extra_bed', code: 'MAX_PER_REGISTRATION', requested: 2, allowed: 1 }]);
  assert.deepEqual(validateAddonSelection(DEFS, { travel_cot: 1 }, ADULTS, { travel_cot: 5 }), [{ addonId: 'travel_cot', code: 'NOT_ELIGIBLE', requested: 1, allowed: 0 }]);
  // dodatek bez limitu nigdy nie jest „wyprzedany”
  assert.deepEqual(validateAddonSelection(DEFS, { parking: 1 }, ADULTS, {}), []);
  // admin: bez potwierdzenia limit obowiązuje, reguły gościa (wiek, maks.) już nie
  assert.deepEqual(validateAddonSelection(DEFS, { extra_bed: 2, travel_cot: 1 }, ADULTS, { extra_bed: 1, travel_cot: 5 }, { adminOverride: true }), [{ addonId: 'extra_bed', code: 'SOLD_OUT', requested: 2, allowed: 1 }]);
  assert.deepEqual(validateAddonSelection(DEFS, { extra_bed: 2 }, ADULTS, { extra_bed: 0 }, { adminOverride: true, ignoreLimit: true }), []);
});

test('komunikat dla gościa zawiera nazwę dodatku w jego języku', () => {
  const p = { addonId: 'extra_bed', code: 'SOLD_OUT' as const, requested: 1, allowed: 0 };
  assert.match(addonProblemMessage(p, DEFS, 'pl'), /„Dostawka” nie jest już dostępny/);
  assert.match(addonProblemMessage(p, DEFS, 'en'), /“Extra bed” is no longer available/);
  assert.match(addonProblemMessage(p, DEFS, 'it'), /Extra bed/); // brak IT → EN
  assert.match(addonProblemMessage({ ...p, requested: 2, allowed: 1 }, DEFS, 'pl'), /zostało tylko 1 szt/);
  for (const l of ['ko', 'zh']) assert.ok(addonProblemMessage(p, DEFS, l).includes('Extra bed'));
});

test('cena dodatków: cena × sztuki; wchodzi do opcji w computePrice; 0 zł nic nie zmienia', () => {
  assert.equal(addonsPrice(DEFS, { parking: 2, extra_bed: 1 }), 40);
  const input = { rooms: [{ roomId: 'double', participants: [{ type: 'adult' as const, age: 30 }] }], options: { addons: { parking: 2, extra_bed: 1 } } };
  const base = computePrice({ rooms: input.rooms }, DEFAULT_PRICING);
  const withFree = computePrice(input, { ...DEFAULT_PRICING, addons: [BED] });
  assert.equal(withFree.total, base.total);
  const paid = computePrice(input, { ...DEFAULT_PRICING, addons: DEFS });
  assert.equal(paid.options, 40);
  assert.equal(paid.total, base.total + 40);
  // event bez dodatków ignoruje wybór
  assert.equal(computePrice(input, DEFAULT_PRICING).total, base.total);
});

test('addonLines / addonsText: nazwy w języku, usunięty dodatek widoczny po id', () => {
  assert.equal(addonsText(DEFS, { extra_bed: 1, travel_cot: 2 }, 'pl'), 'Dostawka, Łóżeczko × 2');
  assert.equal(addonsText(DEFS, { extra_bed: 1 }, 'en'), 'Extra bed');
  assert.equal(addonsText(DEFS, undefined), '');
  assert.deepEqual(addonLines([BED], { extra_bed: 1, stary: 2 }).map((l) => l.name), ['Dostawka', 'stary']);
});

test('kolejność zamówień: zachowany czas pierwszego zamówienia; raport zamówiono / limit', () => {
  assert.deepEqual(nextAddonTimes({ extra_bed: 1, travel_cot: 1 }, { extra_bed: '2027-01-01T10:00:00Z', parking: 'x' }, '2027-02-02T00:00:00Z'), {
    extra_bed: '2027-01-01T10:00:00Z', travel_cot: '2027-02-02T00:00:00Z',
  });
  const small: AddonDef = { ...BED, limit: 2 };
  const rep = addonReport([small, COT], [
    { id: 'r3', status: 'CONFIRMED', registrant: 'C', createdAt: '2027-01-03', options: { addons: { extra_bed: 1 } } },
    { id: 'r1', status: 'PENDING', registrant: 'A', createdAt: '2027-01-01', options: { addons: { extra_bed: 1 }, addonsAt: { extra_bed: '2027-01-05' } } },
    { id: 'r2', status: 'CONFIRMED', registrant: 'B', createdAt: '2027-01-02', options: { addons: { extra_bed: 1 } } },
    { id: 'r4', status: 'CANCELLED', registrant: 'D', createdAt: '2026-12-01', options: { addons: { extra_bed: 1 } } },
    { id: 'r5', status: 'CONFIRMED', registrant: 'E', createdAt: '2027-01-02', options: {} },
  ]);
  const bed = rep[0];
  assert.equal(bed.ordered, 3);
  assert.equal(bed.limit, 2);
  assert.equal(bed.left, 0);
  assert.deepEqual(bed.orders.map((o) => [o.registrationId, o.withinLimit, o.inactive]), [
    ['r2', true, false], ['r3', true, false], ['r1', false, false], ['r4', false, true],
  ]);
  assert.equal(rep[1].ordered, 0);
  assert.equal(rep[1].left, 5);
});
