import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomShortageMessage, touchesRoomStock, roomAvailability, roomStockShortages, type PricingConfig } from './pricing.ts';

const CFG: PricingConfig = {
  formationFee: 0,
  mealsFee: 575,
  nights: 5,
  childBrackets: [],
  rooms: [
    { id: 'place', name: 'Miejsce w pokoju', cap: 8, perPerson: 125 },
    { id: 'double', name: { pl: 'Pokój dla dwóch osób', en: 'Room for two' }, cap: 2, perPerson: 250, priceUnit: 'room', stock: 18 },
    { id: 'cottage', name: { pl: 'Domek na wyłączność', en: 'Private cottage', ko: '독채' }, cap: 11, perPerson: 1000, priceUnit: 'room', stock: 4, reserved: 1 },
  ],
  options: { transport: 0, bedding: 0 },
  discountCodes: {},
};

test('roomShortageMessage: nazwa pokoju i treść w języku gościa', () => {
  const none = { roomId: 'cottage', requested: 1, available: 0 };
  assert.equal(roomShortageMessage(CFG, none, 'pl'), 'Brak wolnych pokoi typu „Domek na wyłączność". Wybierz inny pokój.');
  assert.equal(roomShortageMessage(CFG, none), roomShortageMessage(CFG, none, 'pl'));
  assert.equal(roomShortageMessage(CFG, none, 'en'), 'No rooms of type "Private cottage" are left. Please choose another room.');
  assert.match(roomShortageMessage(CFG, none, 'ko'), /"독채" 객실이 모두 마감/);
  assert.match(roomShortageMessage(CFG, none, 'it'), /«Private cottage»/); // brak nazwy IT → EN
  assert.match(roomShortageMessage(CFG, none, 'zh'), /“Private cottage”房型已订满/);
  assert.match(roomShortageMessage(CFG, none, 'en-GB'), /Private cottage/);
  const some = { roomId: 'double', requested: 3, available: 2 };
  assert.equal(roomShortageMessage(CFG, some, 'pl'), 'Zostało tylko 2 wolnych pokoi typu „Pokój dla dwóch osób" (wybrano 3).');
  assert.equal(roomShortageMessage(CFG, some, 'en'), 'Only 2 rooms of type "Room for two" are left (you selected 3).');
  assert.equal(roomShortageMessage(CFG, { roomId: 'double', requested: 2, available: 1 }, 'en'), 'Only 1 room of type "Room for two" is left (you selected 2).');
  // nieznany typ pokoju → id zamiast nazwy, bez wyjątku
  assert.match(roomShortageMessage(CFG, { roomId: 'x1', requested: 1, available: 0 }, 'pl'), /„x1"/);
  assert.match(roomShortageMessage(null, none, 'pl'), /„cottage"/);
});

test('touchesRoomStock: blokada tylko, gdy zgłoszenie bierze pokój z limitem', () => {
  assert.equal(touchesRoomStock(CFG, [{ roomId: 'place' }]), false);
  assert.equal(touchesRoomStock(CFG, [{ roomId: 'place' }, { roomId: 'cottage' }]), true);
  assert.equal(touchesRoomStock(CFG, [{ roomId: 'double' }]), true);
  assert.equal(touchesRoomStock(CFG, []), false);
  assert.equal(touchesRoomStock(CFG, null), false);
  assert.equal(touchesRoomStock(null, [{ roomId: 'cottage' }]), false);
  // event bez limitów → nigdy
  const noLimits = { ...CFG, rooms: CFG.rooms.map(({ stock: _s, reserved: _r, ...r }) => r) };
  assert.equal(touchesRoomStock(noLimits, [{ roomId: 'cottage' }]), false);
  assert.equal(touchesRoomStock({ ...CFG, rooms: CFG.rooms.map((r) => ({ ...r, stock: 0 })) }, [{ roomId: 'cottage' }]), false);
});

test('ostatnia sztuka: po zapisie pierwszego zgłoszenia ponowne przeliczenie odrzuca drugie', () => {
  const want = [{ roomId: 'cottage', participantIndexes: [0, 1, 2, 3] }];
  // limit 4, rezerwa 1 → publicznie 3; zajęte 2 → wolny 1
  const before = roomAvailability(CFG, { cottage: 2 });
  assert.equal(before.cottage, 1);
  assert.deepEqual(roomStockShortages(CFG, want, before), []);
  // drugie zgłoszenie liczy zajętość JUŻ z pierwszym
  const after = roomAvailability(CFG, { cottage: 3 });
  assert.equal(after.cottage, 0);
  assert.deepEqual(roomStockShortages(CFG, want, after), [{ roomId: 'cottage', requested: 1, available: 0 }]);
  // zmiana noclegu przez gościa: własny pokój wraca do puli (zajętość liczona bez jego zgłoszenia)
  assert.deepEqual(roomStockShortages(CFG, want, roomAvailability(CFG, { cottage: 2 })), []);
  // typ bez limitu nigdy nie jest brakiem
  assert.deepEqual(roomStockShortages(CFG, [{ roomId: 'place', participantIndexes: [0] }], after), []);
});
