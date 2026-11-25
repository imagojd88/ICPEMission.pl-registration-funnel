import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePrice, validateRoomCapacity, buildPriceInput, countRoomsByType, roomAvailability, roomStockShortages, leaderDepositSplit, pricingAt, activeTier, priceLevels, DEFAULT_PRICING, type PricingConfig } from './pricing.ts';

test('ojciec + dziecko 8 + maluch 2 w pokoju 2-os. (1 noc)', () => {
  const r = computePrice({
    rooms: [
      {
        roomId: 'double',
        participants: [
          { type: 'adult', age: 40 }, // 50 + 80 + 80 = 210
          { type: 'child', age: 8 },  // 0.7: 50 + 56 + 56 = 162
          { type: 'child', age: 2 },  // gratis: 0
        ],
      },
    ],
  });
  assert.equal(r.lines[0].total, 210);
  assert.equal(r.lines[1].total, 162);
  assert.equal(r.lines[2].total, 0);
  assert.equal(r.total, 372);
  assert.equal(r.people, 3);
});

test('maluch (0–3) jest w pełni gratis (też bez opłaty formacyjnej)', () => {
  const r = computePrice({ rooms: [{ roomId: 'single', participants: [{ type: 'child', age: 1 }] }] });
  assert.equal(r.total, 0);
  assert.equal(r.formation, 0);
});

test('pokój 1-os. dla dorosłego = 50 + 100 + 80 = 230', () => {
  const r = computePrice({ rooms: [{ roomId: 'single', participants: [{ type: 'adult', age: 30 }] }] });
  assert.equal(r.total, 230);
});

test('walidacja pojemności: 3 osoby w pokoju 2-os. → błąd', () => {
  const v = validateRoomCapacity({
    rooms: [{ roomId: 'double', participants: [{ type: 'adult', age: 30 }, { type: 'adult', age: 31 }, { type: 'child', age: 10 }] }],
  });
  assert.equal(v.ok, false);
  assert.ok(v.errors.length >= 1);
});

test('konfiguracja per-event: inne progi i ceny', () => {
  const custom: PricingConfig = {
    ...DEFAULT_PRICING,
    formationFee: 0,
    mealsFee: 100,
    childBrackets: [
      { ltAge: 6, multiplier: 0 }, // 0–5 gratis
      { ltAge: 18, multiplier: 0.5 }, // 6–17 połowa
    ],
    rooms: [{ id: 'double', name: 'Dwójka', cap: 2, perPerson: 60 }],
  };
  const r = computePrice(
    { rooms: [{ roomId: 'double', participants: [{ type: 'adult', age: 30 }, { type: 'child', age: 10 }] }] },
    custom,
  );
  // dorosły: 0 + 60 + 100 = 160 ; dziecko 10 (0.5): 0 + 30 + 50 = 80
  assert.equal(r.lines[0].total, 160);
  assert.equal(r.lines[1].total, 80);
  assert.equal(r.total, 240);
});

test('opcje + rabat % od sumy', () => {
  const r = computePrice({
    rooms: [{ roomId: 'double', participants: [{ type: 'adult', age: 30 }, { type: 'adult', age: 31 }] }],
    options: { transport: true, bedding: true },
    discountCode: 'icpe10',
  });
  // 2 × (50+80+80)=420 ; opcje: 40 + 15×2=30 → 70 ; subtotal 490 ; rabat 49 ; total 441
  assert.equal(r.subtotal, 490);
  assert.equal(r.discount, 49);
  assert.equal(r.total, 441);
});

test('nocleg opcjonalny: osoba bez pokoju płaci formację + wyżywienie, bez noclegu', () => {
  const cfg: PricingConfig = { ...DEFAULT_PRICING, accommodationOptional: true, mealsFee: 40, overnightMealsFee: 30 };
  const r = computePrice(
    buildPriceInput(
      [{ type: 'adult', age: 40 }, { type: 'child', age: 8 }, { type: 'adult', age: 70 }],
      [{ roomId: 'double', participantIndexes: [0, 1] }],
    ),
    cfg,
  );
  // dorosły w pokoju: 50 + 80 + (40 + 30) = 200; dziecko 8 (0.7): 50 + 56 + 49 = 155; bez noclegu: 50 + 40 = 90
  assert.equal(r.lines[0].total, 200);
  assert.equal(r.lines[1].total, 155);
  assert.equal(r.lines[2].roomId, '');
  assert.equal(r.lines[2].total, 90);
  assert.equal(r.withoutRoom, 1);
  assert.equal(r.people, 3);
  assert.equal(r.total, 445);
});

test('buildPriceInput: bez pokoi wszyscy trafiają do withoutRoom, duplikaty indeksów ignorowane', () => {
  const inp = buildPriceInput([{ type: 'adult', age: 30 }, { type: 'adult', age: 31 }], [{ roomId: 'double', participantIndexes: [0, 0, 5] }]);
  assert.equal(inp.rooms[0].participants.length, 1);
  assert.equal(inp.withoutRoom?.length, 1);
  const none = buildPriceInput([{ type: 'adult', age: 30 }], []);
  assert.equal(none.withoutRoom?.length, 1);
  assert.equal(computePrice(none).total, 50 + 80);
});

test('waluta wyniku = waluta eventu', () => {
  const r = computePrice({ rooms: [], withoutRoom: [{ type: 'adult', age: 30 }] }, { ...DEFAULT_PRICING, currency: 'EUR' });
  assert.equal(r.currency, 'EUR');
});

test('limit pokoi: wolne = stock − zajęte, typ bez limitu pomijany, braki wykrywane', () => {
  const cfg: PricingConfig = {
    ...DEFAULT_PRICING,
    rooms: DEFAULT_PRICING.rooms.map((r) => (r.id === 'double' ? { ...r, stock: 3 } : r.id === 'single' ? { ...r, stock: 1 } : r)),
  };
  const used = countRoomsByType([
    { roomId: 'double', participantIndexes: [0, 1] },
    { roomId: 'double', participantIndexes: [0] },
    { roomId: 'single', participantIndexes: [] }, // pusty pokój się nie liczy
  ]);
  assert.deepEqual(used, { double: 2 });
  const av = roomAvailability(cfg, used);
  assert.deepEqual(av, { double: 1, single: 1 });
  assert.deepEqual(roomStockShortages(cfg, [{ roomId: 'double', participantIndexes: [0] }], av), []);
  assert.deepEqual(roomStockShortages(cfg, [{ roomId: 'double', participantIndexes: [0] }, { roomId: 'double', participantIndexes: [1] }, { roomId: 'family', participantIndexes: [2] }], av), [
    { roomId: 'double', requested: 2, available: 1 },
  ]);
});

test('rezerwa dla gości specjalnych: zdejmowana z puli publicznej, zużywana najpierw przez gości specjalnych', () => {
  const cfg: PricingConfig = { ...DEFAULT_PRICING, rooms: [{ ...DEFAULT_PRICING.rooms[0], stock: 10, reserved: 2 }] };
  const id = cfg.rooms[0].id;
  assert.deepEqual(roomAvailability(cfg, { [id]: 5 }), { [id]: 3 }); // 10 − 2 − 5
  assert.deepEqual(roomAvailability(cfg, { [id]: 5 }, { [id]: 1 }), { [id]: 3 }); // gość specjalny w rezerwie
  assert.deepEqual(roomAvailability(cfg, { [id]: 5 }, { [id]: 4 }), { [id]: 1 }); // ponad rezerwę → z puli
  assert.deepEqual(roomAvailability(cfg, { [id]: 9 }), { [id]: 0 }); // nigdy poniżej zera
});

test('cena za pokój: stała za pokój i noc, dzielona między mieszkańców, bez mnożnika wieku', () => {
  const cfg: PricingConfig = {
    ...DEFAULT_PRICING,
    nights: 1,
    rooms: [{ id: 'dbl', name: 'Pokój 2-os.', cap: 2, perPerson: 200, priceUnit: 'room' }],
  };
  const two = computePrice({ rooms: [{ roomId: 'dbl', participants: [{ type: 'adult', age: 40 }, { type: 'child', age: 8 }] }] }, cfg);
  assert.equal(two.accommodation, 200);
  assert.equal(two.lines[0].accommodation, 100);
  assert.equal(two.lines[1].accommodation, 100);
  const one = computePrice({ rooms: [{ roomId: 'dbl', participants: [{ type: 'adult', age: 40 }] }] }, cfg);
  assert.equal(one.accommodation, 200); // sam w pokoju płaci za cały pokój
  const two2 = computePrice({ rooms: [{ roomId: 'dbl', participants: [{ type: 'adult', age: 40 }] }] }, { ...cfg, nights: 2 });
  assert.equal(two2.accommodation, 400);
});

test('zniżki dzieci osobno: nocleg gratis do 3 lat, wydarzenie pełne', () => {
  const cfg: PricingConfig = {
    ...DEFAULT_PRICING,
    formationFee: 50, mealsFee: 50, nights: 1, overnightMealsFee: 20,
    childBrackets: [{ ltAge: 4, multiplier: 0, eventMultiplier: 1 }, { ltAge: 13, multiplier: 0.5, eventMultiplier: 0.5 }],
    rooms: [{ id: 'r', name: 'P', cap: 3, perPerson: 100 }],
  };
  const r = computePrice({ rooms: [{ roomId: 'r', participants: [{ type: 'child', age: 2 }, { type: 'child', age: 8 }] }] }, cfg);
  // 2 lata: nocleg 0, posiłki nocujących 0, wydarzenie pełne: 50 + 50 = 100
  assert.equal(r.lines[0].accommodation, 0);
  assert.equal(r.lines[0].formation, 50);
  assert.equal(r.lines[0].meals, 50);
  assert.equal(r.lines[0].total, 100);
  // 8 lat: 50% wszystkiego: 25 + 50 + (25 + 10) = 110
  assert.equal(r.lines[1].total, 110);
  // bez noclegu: 2 lata płaci wydarzenie 100
  const n = computePrice({ rooms: [], withoutRoom: [{ type: 'child', age: 2 }] }, cfg);
  assert.equal(n.total, 100);
  // stary próg (bez eventMultiplier) bez zmian: mnożnik 0 = całość gratis
  const legacy = computePrice({ rooms: [], withoutRoom: [{ type: 'child', age: 2 }] }, { ...cfg, childBrackets: [{ ltAge: 4, multiplier: 0 }] });
  assert.equal(legacy.total, 0);
});

test('zaliczka u lidera: domyślnie 50%, reszta na miejscu', () => {
  assert.deepEqual(leaderDepositSplit(230), { pct: 50, deposit: 115, rest: 115 });
  assert.deepEqual(leaderDepositSplit(225), { pct: 50, deposit: 113, rest: 112 });
  assert.deepEqual(leaderDepositSplit(200, { leaderDepositPct: 30 }), { pct: 30, deposit: 60, rest: 140 });
});

test('ręczna korekta admina: rabat %, kwotowy i kwota końcowa', () => {
  const base = computePrice({ rooms: [], withoutRoom: [{ type: 'adult', age: 30 }, { type: 'adult', age: 30 }] });
  assert.equal(base.total, 260); // 2 × (50 + 80)
  const pct = computePrice({ rooms: [], withoutRoom: [{ type: 'adult', age: 30 }, { type: 'adult', age: 30 }], options: { adjustment: { discountPct: 10, discountAmount: 20 } } });
  assert.equal(pct.total, 260 - 26 - 20);
  assert.equal(pct.manualAdjustment, 46);
  const over = computePrice({ rooms: [], withoutRoom: [{ type: 'adult', age: 30 }], options: { adjustment: { discountPct: 50, overrideTotal: 99 } } });
  assert.equal(over.total, 99);
  assert.equal(over.overridden, true);
  const floor = computePrice({ rooms: [], withoutRoom: [{ type: 'adult', age: 30 }], options: { adjustment: { discountAmount: 999 } } });
  assert.equal(floor.total, 0);
});

test('trzy zniżki osobno: nocleg −100%, formacja −50%, wyżywienie bez zniżki (dziecko do 3 lat)', () => {
  const cfg: PricingConfig = {
    ...DEFAULT_PRICING, formationFee: 50, mealsFee: 50, nights: 1,
    childBrackets: [{ ltAge: 4, multiplier: 0, eventMultiplier: 0.5, mealsMultiplier: 1 }],
    rooms: [{ id: 'r', name: 'P', cap: 3, perPerson: 100 }],
  };
  const r = computePrice({ rooms: [{ roomId: 'r', participants: [{ type: 'child', age: 3 }] }] }, cfg);
  assert.equal(r.lines[0].accommodation, 0);
  assert.equal(r.lines[0].formation, 25);
  assert.equal(r.lines[0].meals, 50);
  assert.equal(r.total, 75);
});

test('darowizna: doliczana po rabatach i korekcie, tylko gdy event ją włączył', () => {
  const people = [{ type: 'adult' as const, age: 30 }, { type: 'adult' as const, age: 30 }];
  const on: PricingConfig = { ...DEFAULT_PRICING, donationEnabled: true };
  const off = computePrice({ rooms: [], withoutRoom: people, options: { donation: 100 } });
  assert.equal(off.total, 260);
  assert.equal(off.donation, undefined);
  const plain = computePrice({ rooms: [], withoutRoom: people, options: { donation: 100 } }, on);
  assert.equal(plain.total, 360);
  assert.equal(plain.donation, 100);
  assert.equal(plain.subtotal, 260);
  const code = computePrice({ rooms: [], withoutRoom: people, options: { donation: 50 }, discountCode: 'icpe10' }, on);
  assert.equal(code.total, 260 - 26 + 50);
  const adj = computePrice({ rooms: [], withoutRoom: people, options: { donation: 75.5, adjustment: { discountPct: 10 } } }, on);
  assert.equal(adj.total, 234 + 75.5);
  assert.equal(adj.manualAdjustment, 26);
  const over = computePrice({ rooms: [], withoutRoom: people, options: { donation: 200, adjustment: { overrideTotal: 99 } } }, on);
  assert.equal(over.total, 299);
  assert.equal(computePrice({ rooms: [], withoutRoom: people, options: { donation: -5 } }, on).total, 260);
  assert.equal(computePrice({ rooms: [], withoutRoom: people, options: { donation: Number.NaN } }, on).total, 260);
});

test('poziomy cen: United In Mission (early bird / pre-summer / regular) + zniżka kwotowa dziecka', () => {
  const cfg: PricingConfig = {
    ...DEFAULT_PRICING, formationFee: 0, mealsFee: 575, nights: 5, discountCodes: {},
    childBrackets: [
      { ltAge: 3, multiplier: 0 },
      { ltAge: 10, multiplier: 1, eventMultiplier: 1, mealsMultiplier: 1, mealsDiscountAmount: 150 },
    ],
    rooms: [
      { id: '1', name: 'Miejsce', cap: 8, perPerson: 125 },
      { id: '2', name: 'Pokój 2-os.', cap: 2, perPerson: 250, priceUnit: 'room' },
      { id: '3', name: 'Jedynka', cap: 1, perPerson: 365 },
      { id: '4', name: 'Domek', cap: 11, perPerson: 1000, priceUnit: 'room' },
    ],
    baseTierName: 'Early bird',
    priceTiers: [
      { id: 'reg', name: 'Regular', from: '2027-07-01', mealsFee: 650, rooms: { '1': 150, '2': 290, '3': 400, '4': 1300 } },
      { id: 'pre', name: 'Pre-Summer', from: '2027-05-01', mealsFee: 625, rooms: { '1': 135, '2': 250, '3': 375, '4': 1110 } },
    ],
  };
  const adult = { type: 'adult' as const, age: 40 };
  const kid = { type: 'child' as const, age: 5 };
  const price = (date: string, roomId: string, people: Array<typeof adult | typeof kid>) =>
    computePrice({ rooms: [{ roomId, participants: people }] }, pricingAt(cfg, date)).total;
  // osoba
  assert.equal(price('2027-01-16', '1', [adult]), 1200);
  assert.equal(price('2027-04-30', '1', [adult]), 1200);
  assert.equal(price('2027-05-01', '1', [adult]), 1300);
  assert.equal(price('2027-06-30', '1', [adult]), 1300);
  assert.equal(price('2027-07-01', '1', [adult]), 1400);
  // dziecko 3–9: zawsze 150 zł taniej; do 3 lat gratis; 10 lat jak dorosły
  assert.equal(price('2027-01-16', '1', [kid]), 1050);
  assert.equal(price('2027-05-10', '1', [kid]), 1150);
  assert.equal(price('2027-07-10', '1', [kid]), 1250);
  assert.equal(price('2027-07-10', '1', [{ type: 'child', age: 2 }]), 0);
  assert.equal(price('2027-07-10', '1', [{ type: 'child', age: 10 }]), 1400);
  // pokój dla dwóch osób: 2 400 / 2 500 / 2 750
  assert.equal(price('2027-02-01', '2', [adult, adult]), 2400);
  assert.equal(price('2027-05-01', '2', [adult, adult]), 2500);
  assert.equal(price('2027-08-01', '2', [adult, adult]), 2750);
  // pokój jednoosobowy: 2 400 / 2 500 / 2 650 (375×5+625; 400×5+650)
  assert.equal(price('2027-02-01', '3', [adult]), 2400);
  assert.equal(price('2027-05-01', '3', [adult]), 2500);
  assert.equal(price('2027-08-01', '3', [adult]), 2650);
  // domek: 5 000 / 5 550 / 6 500 + wyżywienie
  assert.equal(price('2027-02-01', '4', [adult, adult, kid, kid]), 5000 + 2 * 575 + 2 * 425);
  assert.equal(price('2027-05-01', '4', [adult, adult, kid, kid]), 5550 + 2 * 625 + 2 * 475);
  assert.equal(price('2027-08-01', '4', [adult, adult, kid, kid]), 6500 + 2 * 650 + 2 * 500);
  // aktywny poziom i lista dla gości
  assert.equal(activeTier(cfg, '2027-04-30'), null);
  assert.equal(activeTier(cfg, '2027-05-01')?.id, 'pre');
  assert.equal(activeTier(cfg, '2027-12-01')?.id, 'reg');
  assert.deepEqual(priceLevels(cfg, '2027-05-15').map((l) => [l.name, l.from, l.until, l.fromPrice, l.active]), [
    ['Early bird', null, '2027-04-30', 1200, false],
    ['Pre-Summer', '2027-05-01', '2027-06-30', 1300, true],
    ['Regular', '2027-07-01', null, 1400, false],
  ]);
  assert.deepEqual(priceLevels({ ...cfg, priceTiers: [] }), []);
  // bez poziomów cennik wraca bez zmian (stare eventy)
  assert.equal(pricingAt(DEFAULT_PRICING, '2030-01-01'), DEFAULT_PRICING);
});
