import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EDIT_FORM_MANAGED, WIZARD_MANAGED, MIN_PANEL_CONFIG_LEVEL, PANEL_CONFIG_LEVEL, evaluateConfigWrite, mergePricingConfig, pricingSnapshotSummary, readConfigWriteMeta,
} from './configMerge.ts';

const ORIGINAL = {
  free: false,
  currency: 'PLN',
  formationFee: 0,
  mealsFee: 575,
  nights: 5,
  donationEnabled: true,
  futureTopLevel: { a: 1 },
  baseTierName: 'Early bird',
  priceTiers: [
    { id: 't1', name: 'Pre-Summer', from: '2027-05-01', mealsFee: 600, futureTier: 'x', overnightMealsFee: 3 },
    { id: 't2', from: '2027-07-01', mealsFee: 650 },
  ],
  childBrackets: [
    { ltAge: 3, multiplier: 0, futureBracket: true },
    { ltAge: 10, multiplier: 1, eventMultiplier: 1, mealsMultiplier: 1, mealsDiscountAmount: 150 },
  ],
  rooms: [
    { id: '1', name: { pl: 'Miejsce' }, cap: 4, perPerson: 100, desc: 'opis', futureRoom: 7, stock: 10, depositPct: 50 },
    { id: '2', name: { pl: 'Domek' }, cap: 6, perPerson: 900, priceUnit: 'room' },
  ],
  options: { transport: 0, bedding: 0, futureOption: 5 },
  discountCodes: { ICPE10: 0.1 },
  addons: [{ id: 'extra_bed', name: { pl: 'Dostawka' }, limit: 8, futureAddon: 'z' }],
  paymentPlan: { depositPct: 30 },
};

/** To, co zbudowałby formularz po zmianach admina. */
const BUILT = {
  free: false,
  currency: 'PLN',
  formationFee: 0,
  mealsFee: 590, // zmiana
  nights: 5,
  // donationEnabled odznaczone → brak klucza
  baseTierName: 'Early bird',
  priceTiers: [{ id: 't1', name: 'Pre-Summer', from: '2027-05-15', mealsFee: 610 }], // t2 usunięty
  childBrackets: [{ ltAge: 3, multiplier: 0 }, { ltAge: 10, multiplier: 1, eventMultiplier: 1, mealsMultiplier: 1 }], // zniżka kwotowa usunięta
  rooms: [{ id: '1', name: { pl: 'Miejsce w pokoju' }, cap: 4, perPerson: 110, priceUnit: 'person', model: 'os/noc', tag: '' }, { id: '3', name: { pl: 'Nowy' }, cap: 1, perPerson: 1 }], // pokój 2 usunięty, limit i zadatek pokoju 1 usunięte
  options: { transport: 40, bedding: 0 },
  discountCodes: {},
  addons: [{ id: 'extra_bed', name: { pl: 'Dostawka' }, limit: 6 }],
  paymentPlan: { depositPct: 40 },
};

test('mergePricingConfig: nieznane klucze na każdym poziomie przetrwają zapis', () => {
  const m = mergePricingConfig(ORIGINAL, BUILT) as Record<string, any>;
  assert.deepEqual(m.futureTopLevel, { a: 1 });
  assert.equal(m.rooms[0].futureRoom, 7);
  assert.equal(m.rooms[0].desc, 'opis'); // `desc` nie jest polem formularza
  assert.equal(m.childBrackets[0].futureBracket, true);
  assert.equal(m.priceTiers[0].futureTier, 'x');
  assert.equal(m.priceTiers[0].overnightMealsFee, 3);
  assert.equal(m.options.futureOption, 5);
  assert.equal(m.addons[0].futureAddon, 'z');
});

test('mergePricingConfig: zmiany admina wchodzą, a pola usunięte świadomie są usuwane', () => {
  const m = mergePricingConfig(ORIGINAL, BUILT) as Record<string, any>;
  assert.equal(m.mealsFee, 590);
  assert.equal('donationEnabled' in m, false);
  assert.deepEqual(m.priceTiers.map((t: any) => t.id), ['t1']);
  assert.equal(m.priceTiers[0].from, '2027-05-15');
  assert.equal(m.priceTiers[0].mealsFee, 610);
  assert.equal('mealsDiscountAmount' in m.childBrackets[1], false);
  assert.deepEqual(m.rooms.map((r: any) => r.id), ['1', '3']);
  assert.equal(m.rooms[0].perPerson, 110);
  assert.equal('stock' in m.rooms[0], false);
  assert.equal('depositPct' in m.rooms[0], false);
  assert.equal(m.rooms[1].futureRoom, undefined);
  assert.deepEqual(m.discountCodes, {});
  assert.equal(m.options.transport, 40);
  assert.equal(m.addons[0].limit, 6);
  assert.deepEqual(m.paymentPlan, { depositPct: 40 });
  // oryginał nietknięty
  assert.equal(ORIGINAL.mealsFee, 575);
  assert.equal(ORIGINAL.rooms.length, 2);
});

test('mergePricingConfig: formularz, który NIE zna poziomów cen i dodatków (kreator), niczego nie gubi', () => {
  const { priceTiers: _t, baseTierName: _b, addons: _a, ...wizardBuilt } = BUILT;
  const m = mergePricingConfig(ORIGINAL, wizardBuilt, WIZARD_MANAGED) as Record<string, any>;
  assert.deepEqual(m.priceTiers, ORIGINAL.priceTiers);
  assert.equal(m.baseTierName, 'Early bird');
  assert.deepEqual(m.addons, ORIGINAL.addons);
  assert.equal(m.mealsFee, 590);
  // a formularz „Edytuj event”, który je zna, usuwa je, gdy admin je skasował
  const e = mergePricingConfig(ORIGINAL, wizardBuilt, EDIT_FORM_MANAGED) as Record<string, any>;
  assert.equal('priceTiers' in e, false);
  assert.equal('addons' in e, false);
});

test('mergePricingConfig: brak oryginału (nowy event) = to, co zbudował formularz', () => {
  assert.deepEqual(mergePricingConfig(null, BUILT), BUILT);
  assert.deepEqual(mergePricingConfig(undefined, BUILT), BUILT);
});

test('evaluateConfigWrite: stara karta panelu nie zapisze cennika; token serwisowy bez zmian', () => {
  const base = { touchesPricing: true, currentRev: 4 };
  assert.ok(PANEL_CONFIG_LEVEL >= MIN_PANEL_CONFIG_LEVEL);
  // stara karta: brak znacznika
  const stale = evaluateConfigWrite({ ...base, realm: 'admin', meta: {} });
  assert.equal(stale.ok, false);
  assert.equal(!stale.ok && stale.code, 'STALE_PANEL');
  assert.match(!stale.ok ? stale.message : '', /Odśwież stronę/);
  // za niski poziom
  assert.equal(evaluateConfigWrite({ ...base, realm: 'admin', meta: { configLevel: 1 } }).ok, false);
  // aktualny panel
  assert.equal(evaluateConfigWrite({ ...base, realm: 'admin', meta: { configLevel: PANEL_CONFIG_LEVEL, configRev: 4 } }).ok, true);
  assert.equal(evaluateConfigWrite({ ...base, realm: 'admin', meta: { configLevel: PANEL_CONFIG_LEVEL } }).ok, true);
  // dwie karty: konfiguracja zmieniona w międzyczasie
  const conflict = evaluateConfigWrite({ ...base, realm: 'admin', meta: { configLevel: PANEL_CONFIG_LEVEL, configRev: 3 } });
  assert.equal(!conflict.ok && conflict.code, 'CONFLICT');
  // Personal OS (token serwisowy) — nie wysyła znacznika i nie jest blokowany
  assert.equal(evaluateConfigWrite({ ...base, realm: 'service', meta: {} }).ok, true);
  // zapis bez cennika (np. sama zmiana statusu / ukrycia) — bez wymogu
  assert.equal(evaluateConfigWrite({ realm: 'admin', touchesPricing: false, currentRev: 4, meta: {} }).ok, true);
});

test('readConfigWriteMeta: tylko poprawne wartości', () => {
  assert.deepEqual(readConfigWriteMeta({ version: 'abc', configLevel: 2, configRev: 0 }), { clientVersion: 'abc', configLevel: 2, configRev: 0 });
  assert.deepEqual(readConfigWriteMeta({ configLevel: 'x', configRev: -1 }), {});
  assert.deepEqual(readConfigWriteMeta(null), {});
  assert.deepEqual(readConfigWriteMeta('2'), {});
});

test('pricingSnapshotSummary: krótki opis migawki', () => {
  const s = pricingSnapshotSummary(ORIGINAL);
  assert.match(s, /poziomy cen: 2/);
  assert.match(s, /dodatki: 1/);
  assert.equal(pricingSnapshotSummary(null), 'brak cennika');
});
