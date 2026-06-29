import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePrice, ageMultiplier, DEFAULT_PRICING } from './pricing.ts';

test('dorosły w pokoju 2-os. (1 noc) = 210 zł', () => {
  const r = computePrice({ participants: [{ type: 'adult', age: 30 }], roomId: 'double' });
  assert.equal(r.total, 210);
});

test('mnożniki wiekowe', () => {
  assert.equal(ageMultiplier({ type: 'child', age: 2 }, DEFAULT_PRICING.childBrackets), 0);
  assert.equal(ageMultiplier({ type: 'child', age: 8 }, DEFAULT_PRICING.childBrackets), 0.7);
  assert.equal(ageMultiplier({ type: 'child', age: 15 }, DEFAULT_PRICING.childBrackets), 0.9);
  assert.equal(ageMultiplier({ type: 'adult', age: 40 }, DEFAULT_PRICING.childBrackets), 1);
});

test('2 dorosłych + dziecko 8 lat w 2-os.', () => {
  const r = computePrice({
    participants: [
      { type: 'adult', age: 34 },
      { type: 'adult', age: 37 },
      { type: 'child', age: 8 },
    ],
    roomId: 'double',
  });
  // 210 + 210 + 147 = 567
  assert.equal(r.total, 567);
  assert.equal(r.accommodation, 80 + 80 + 80 * 0.7);
});

test('opcje + rabat ICPE10', () => {
  const r = computePrice({
    participants: [{ type: 'adult', age: 30 }],
    roomId: 'single',
    options: { transport: true, bedding: true },
    discountCode: 'icpe10',
  });
  // single perPerson 100 → osoba (50+100+80)=230; opcje 40+15=55; subtotal 285; rabat round(28.5)=29
  assert.equal(r.subtotal, 285);
  assert.equal(r.discount, 29);
  assert.equal(r.total, 256);
});
