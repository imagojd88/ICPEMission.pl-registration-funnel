import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePrice, validateRoomCapacity, buildPriceInput, countRoomsByType, roomAvailability, roomStockShortages, DEFAULT_PRICING, type PricingConfig } from './pricing.ts';

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
