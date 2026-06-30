import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePrice, validateRoomCapacity, DEFAULT_PRICING, type PricingConfig } from './pricing.ts';

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
