import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canDesk, canDeskAdminOnly, canUseAdminApi, deskGrantExpired, effectiveDeskScopes, normalizeDeskScopes, DESK_SCOPES,
} from './desk.ts';

const NOW = new Date('2027-08-22T10:00:00Z');

test('pełny admin ma każdy zakres bez grantu', () => {
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'COORDINATOR']) {
    for (const s of DESK_SCOPES) assert.equal(canDesk(role, undefined, s), true, `${role} ${s}`);
    assert.equal(canDesk(role, [], null), true);
    assert.equal(canDeskAdminOnly(role), true);
  }
});

test('pomocnik: tylko zakresy z grantu', () => {
  const g = ['checkin', 'keys'];
  assert.equal(canDesk('EVENT_STAFF', g, 'checkin'), true);
  assert.equal(canDesk('EVENT_STAFF', g, 'keys'), true);
  assert.equal(canDesk('EVENT_STAFF', g, 'payments'), false);
  assert.equal(canDesk('EVENT_STAFF', g, 'requests'), false);
  assert.equal(canDesk('EVENT_STAFF', g, ['payments', 'keys']), true);
  assert.equal(canDesk('EVENT_STAFF', g, ['payments', 'requests']), false);
  assert.equal(canDesk('EVENT_STAFF', g, null), true);
  assert.equal(canDeskAdminOnly('EVENT_STAFF'), false);
});

test('pomocnik bez grantu / z pustym grantem / z nieznanymi zakresami nie ma nic', () => {
  assert.equal(canDesk('EVENT_STAFF', undefined, null), false);
  assert.equal(canDesk('EVENT_STAFF', [], null), false);
  assert.equal(canDesk('EVENT_STAFF', [], 'checkin'), false);
  assert.equal(canDesk('EVENT_STAFF', ['admin', '*', 'CHECKIN', 42, null], 'checkin'), false);
  assert.equal(canDesk('EVENT_STAFF', 'checkin', 'checkin'), false);
  assert.equal(canDesk('EVENT_STAFF', ['checkin'], []), false);
});

test('wygasły grant nie daje dostępu, przyszła data daje', () => {
  assert.equal(canDesk('EVENT_STAFF', ['checkin'], 'checkin', { expiresAt: '2027-08-22T09:59:59Z', now: NOW }), false);
  assert.equal(canDesk('EVENT_STAFF', ['checkin'], 'checkin', { expiresAt: NOW, now: NOW }), false);
  assert.equal(canDesk('EVENT_STAFF', ['checkin'], 'checkin', { expiresAt: '2027-08-28T00:00:00Z', now: NOW }), true);
  assert.equal(canDesk('EVENT_STAFF', ['checkin'], 'checkin', { expiresAt: null, now: NOW }), true);
  assert.equal(canDesk('EVENT_STAFF', ['checkin'], 'checkin', { expiresAt: 'nie-data', now: NOW }), false);
  assert.equal(deskGrantExpired(undefined, NOW), false);
  // Wygaśnięcie grantu nie dotyczy pełnego admina.
  assert.equal(canDesk('ADMIN', [], 'payments', { expiresAt: '2020-01-01', now: NOW }), true);
});

test('nieznana rola, brak roli, realm kursanta: odmowa', () => {
  for (const role of [undefined, null, '', 'GUEST', 'member', 'event_staff', 'admin', {}]) {
    assert.equal(canDesk(role, ['checkin', 'payments'], 'checkin'), false, String(role));
    assert.equal(canDesk(role, ['checkin'], null), false);
    assert.equal(canDeskAdminOnly(role), false);
  }
});

test('API panelu admina: tylko realm admin + pełna rola', () => {
  assert.equal(canUseAdminApi('admin', 'SUPER_ADMIN'), true);
  assert.equal(canUseAdminApi('admin', 'ADMIN'), true);
  assert.equal(canUseAdminApi('admin', 'COORDINATOR'), true);
  assert.equal(canUseAdminApi('admin', 'EVENT_STAFF'), false);
  assert.equal(canUseAdminApi('desk', 'EVENT_STAFF'), false);
  assert.equal(canUseAdminApi('desk', 'ADMIN'), false);
  assert.equal(canUseAdminApi('member', 'ADMIN'), false);
  assert.equal(canUseAdminApi('admin', undefined), false);
  assert.equal(canUseAdminApi('admin', 'NOWA_ROLA'), false);
  assert.equal(canUseAdminApi(undefined, undefined), false);
});

test('normalizacja zakresów: tylko znane, bez powtórzeń, stała kolejność', () => {
  assert.deepEqual(normalizeDeskScopes(['keys', 'checkin', 'keys', 'x', 1, 'lodging.edit']), ['checkin', 'keys', 'lodging.edit']);
  assert.deepEqual(normalizeDeskScopes(null), []);
  assert.deepEqual(normalizeDeskScopes('checkin'), []);
  assert.deepEqual(effectiveDeskScopes('EVENT_STAFF', { scopes: ['requests', 'zzz'] }), ['requests']);
  assert.deepEqual(effectiveDeskScopes('EVENT_STAFF', null), []);
  assert.deepEqual(effectiveDeskScopes('ADMIN', null), [...DESK_SCOPES]);
});
