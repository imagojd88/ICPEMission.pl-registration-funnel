import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAlerts, dailySeries, daysBetween, holdsSpot, paceToTarget, type AlertInput } from './dashboard.ts';

const reg = (createdAt: string, people: number, status = 'CONFIRMED') => ({ createdAt, people, status });

test('holdsSpot: anulowane i lista rezerwowa nie trzymają miejsca', () => {
  assert.equal(holdsSpot('CONFIRMED'), true);
  assert.equal(holdsSpot('DRAFT'), true);
  assert.equal(holdsSpot('AWAITING_TRANSFER'), true);
  assert.equal(holdsSpot('CANCELLED'), false);
  assert.equal(holdsSpot('WAITLIST'), false);
});

test('dailySeries: dni bez zapisów jako zera, narastająco, anulowane pominięte', () => {
  const s = dailySeries(
    [
      reg('2027-01-16T08:00:00Z', 4),
      reg('2027-01-16T20:00:00Z', 2),
      reg('2027-01-18T10:00:00Z', 3),
      reg('2027-01-17T10:00:00Z', 5, 'CANCELLED'),
      reg('2027-01-17T11:00:00Z', 2, 'WAITLIST'),
    ],
    '2027-01-16',
    '2027-01-19',
  );
  assert.deepEqual(s.map((p) => p.date), ['2027-01-16', '2027-01-17', '2027-01-18', '2027-01-19']);
  assert.deepEqual(s.map((p) => p.people), [6, 0, 3, 0]);
  assert.deepEqual(s.map((p) => p.cumulativePeople), [6, 6, 9, 9]);
  assert.deepEqual(s.map((p) => p.cumulativeRegistrations), [2, 2, 3, 3]);
});

test('dailySeries: zgłoszenia sprzed początku wchodzą do punktu startowego; puste osoby = 1', () => {
  const s = dailySeries([reg('2027-01-01T10:00:00Z', 2), reg('2027-01-10T10:00:00Z', 0)], '2027-01-10', '2027-01-10');
  assert.equal(s.length, 1);
  assert.equal(s[0].people, 1);
  assert.equal(s[0].cumulativePeople, 3);
});

test('dailySeries: dzień liczony w strefie Warszawy (23:30 UTC = następny dzień)', () => {
  const s = dailySeries([reg('2027-01-16T23:30:00Z', 1)], '2027-01-16', '2027-01-17');
  assert.deepEqual(s.map((p) => p.people), [0, 1]);
});

test('dailySeries: odwrócony zakres → pusto', () => {
  assert.deepEqual(dailySeries([], '2027-02-01', '2027-01-01'), []);
});

test('daysBetween', () => {
  assert.equal(daysBetween('2027-01-16', '2027-01-16'), 0);
  assert.equal(daysBetween('2027-01-16', '2027-08-21'), 217);
  assert.equal(daysBetween('2027-03-27', '2027-03-29'), 2); // zmiana czasu nie psuje liczenia
});

test('paceToTarget: tempo poniżej potrzebnego → behind, z prognozą', () => {
  // 10 dni po 2 osoby = 20 osób, cel 170, zapisy do 2027-08-21
  const regs = Array.from({ length: 10 }, (_, i) => reg(`2027-01-${String(16 + i).padStart(2, '0')}T10:00:00Z`, 2));
  const s = dailySeries(regs, '2027-01-16', '2027-01-25');
  const p = paceToTarget(s, 170, { today: '2027-01-25', opensOn: '2027-01-16', closesOn: '2027-08-21' })!;
  assert.equal(p.current, 20);
  assert.equal(p.missing, 150);
  assert.equal(p.recentPerDay, 2);
  assert.equal(p.daysLeft, 209);
  assert.equal(p.neededPerDay, 0.8); // 150/209 = 0,717… → w górę do 0,8
  assert.equal(p.status, 'on_track'); // 2/dzień wystarczy
});

test('paceToTarget: za wolno → behind', () => {
  const s = dailySeries([reg('2027-08-01T10:00:00Z', 10)], '2027-08-01', '2027-08-10');
  const p = paceToTarget(s, 170, { today: '2027-08-10', opensOn: '2027-08-01', closesOn: '2027-08-21' })!;
  assert.equal(p.status, 'behind');
  assert.equal(p.daysLeft, 12);
  assert.ok(p.projected < 170);
});

test('paceToTarget: cel osiągnięty, zapisy zamknięte, przed otwarciem, brak celu', () => {
  const s = dailySeries([reg('2027-01-16T10:00:00Z', 200)], '2027-01-16', '2027-01-16');
  assert.equal(paceToTarget(s, 170, { today: '2027-01-16', opensOn: '2027-01-16', closesOn: '2027-08-21' })!.status, 'reached');
  const s2 = dailySeries([reg('2027-01-16T10:00:00Z', 10)], '2027-01-16', '2027-08-25');
  const closed = paceToTarget(s2, 170, { today: '2027-08-25', opensOn: '2027-01-16', closesOn: '2027-08-21' })!;
  assert.equal(closed.status, 'closed');
  assert.equal(closed.daysLeft, 0);
  assert.equal(closed.neededPerDay, Infinity);
  const before = paceToTarget([], 170, { today: '2026-11-26', opensOn: '2027-01-16', closesOn: '2027-08-21' })!;
  assert.equal(before.status, 'not_open');
  assert.equal(before.daysLeft, 218);
  assert.equal(before.recentPerDay, 0);
  assert.equal(paceToTarget([], 0, { opensOn: '2027-01-16', closesOn: '2027-08-21' }), null);
});

const base: AlertInput = {
  overdueCount: 0, overdueAmount: 0, currency: 'PLN', staleAwaitingTransfer: 0, unassignedRooms: 0, daysToEvent: 200,
  waitlistRegistrations: 0, abandonedLeads: 0, soldOut: [], almostSoldOut: [], overCapacity: 0, pace: null, registrationOpen: true,
};

test('buildAlerts: nic złego → pusta lista', () => {
  assert.deepEqual(buildAlerts(base), []);
});

test('buildAlerts: kolejność ważności i polska odmiana', () => {
  const a = buildAlerts({
    ...base,
    overdueCount: 3, overdueAmount: 2450.5,
    soldOut: ['Domek na wyłączność'],
    waitlistRegistrations: 1,
    abandonedLeads: 5,
    overCapacity: 2,
  });
  assert.deepEqual(a.map((x) => x.code), ['over_capacity', 'overdue', 'sold_out', 'waitlist', 'abandoned']);
  assert.match(a[0].text, /o 2 osoby/);
  assert.match(a[1].text, /3 zgłoszenia mają zaległą wpłatę/);
  assert.match(a[1].text, /2\s?451 zł/);
  assert.match(a[3].text, /1 zgłoszenie na liście/);
  assert.match(a[4].text, /5 osób zaczęło formularz i nie dokończyło/);
});

test('buildAlerts: pokoje bez przydziału dopiero 30 dni przed eventem', () => {
  assert.equal(buildAlerts({ ...base, unassignedRooms: 4, daysToEvent: 31 }).length, 0);
  const a = buildAlerts({ ...base, unassignedRooms: 4, daysToEvent: 30 });
  assert.equal(a[0].code, 'unassigned_rooms');
  assert.equal(a[0].screen, 'accommodation');
});

test('buildAlerts: tempo poniżej celu tylko przy otwartych zapisach', () => {
  const pace = { target: 170, current: 20, missing: 150, daysLeft: 12, neededPerDay: 12.5, recentPerDay: 1, projected: 32, status: 'behind' as const };
  assert.equal(buildAlerts({ ...base, pace })[0].code, 'pace_behind');
  assert.match(buildAlerts({ ...base, pace })[0].text, /12,5 os\.\/dzień/);
  assert.equal(buildAlerts({ ...base, pace, registrationOpen: false }).length, 0);
});
