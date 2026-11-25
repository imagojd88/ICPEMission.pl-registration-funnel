import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanHeadingText, groupGuests, guestGroupI18nKey, guestGroupKey, guestHeadingKind, headingFieldsToSave, pickHeadingText } from './guestGroups.ts';

const g = (name: string, extra: Record<string, unknown> = {}) => ({ name, ...extra });

test('goście bez pola nagłówka: jedna grupa „special”, liczba jak dotąd', () => {
  const one = groupGuests([g('A')]);
  assert.equal(one.length, 1);
  assert.equal(one[0].kind, 'special');
  assert.equal(one[0].plural, false);
  assert.equal(guestGroupI18nKey(one[0]), 'content.special_guest');

  const pair = groupGuests([g('A i B', { plural: true })]);
  assert.equal(pair[0].plural, true);
  assert.equal(guestGroupI18nKey(pair[0]), 'content.special_guests');

  const many = groupGuests([g('A'), g('B'), g('C')]);
  assert.equal(many.length, 1);
  assert.deepEqual(many[0].guests.map((x) => x.name), ['A', 'B', 'C']);
  assert.equal(guestGroupI18nKey(many[0]), 'content.special_guests');
});

test('grupy w kolejności pierwszego wystąpienia, goście w kolejności listy', () => {
  const groups = groupGuests([
    g('S1', { heading: 'speakers' }),
    g('P1', { heading: 'panelists' }),
    g('S2', { heading: 'speakers' }),
    g('X'),
    g('P2', { heading: 'panelists' }),
  ]);
  assert.deepEqual(groups.map((x) => x.kind), ['speakers', 'panelists', 'special']);
  assert.deepEqual(groups[0].guests.map((x) => x.name), ['S1', 'S2']);
  assert.deepEqual(groups[1].guests.map((x) => x.name), ['P1', 'P2']);
  assert.deepEqual(groups[2].guests.map((x) => x.name), ['X']);
  assert.equal(guestGroupI18nKey(groups[0]), 'content.speakers');
  assert.equal(guestGroupI18nKey(groups[2]), 'content.special_guest');
});

test('liczba pojedyncza / mnoga liczona osobno w każdej grupie', () => {
  const groups = groupGuests([
    g('S1', { heading: 'speakers' }),
    g('P1', { heading: 'panelists', plural: true }),
  ]);
  assert.equal(guestGroupI18nKey(groups[0]), 'content.speaker');
  assert.equal(guestGroupI18nKey(groups[1]), 'content.panelists');
});

test('własny nagłówek: ten sam tekst = jedna grupa, inny tekst = osobna', () => {
  const groups = groupGuests([
    g('A', { heading: 'custom', headingText: { pl: 'Prowadzący', en: 'Hosts' } }),
    g('B', { heading: 'custom', headingText: { en: ' Hosts ', pl: 'Prowadzący', it: '' } }),
    g('C', { heading: 'custom', headingText: { pl: 'Muzycy' } }),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].kind, 'custom');
  assert.deepEqual(groups[0].guests.map((x) => x.name), ['A', 'B']);
  assert.deepEqual(groups[0].text, { en: 'Hosts', pl: 'Prowadzący' });
  assert.equal(guestGroupI18nKey(groups[0]), null);
  assert.deepEqual(groups[1].text, { pl: 'Muzycy' });
});

test('własny nagłówek bez tekstu i nieznana wartość → domyślny', () => {
  assert.equal(guestHeadingKind({ heading: 'custom' }), 'special');
  assert.equal(guestHeadingKind({ heading: 'custom', headingText: { pl: '   ' } }), 'special');
  assert.equal(guestHeadingKind({ heading: 'cokolwiek' }), 'special');
  assert.equal(guestHeadingKind(null), 'special');
  assert.equal(guestGroupKey({ heading: 'special' }), guestGroupKey({}));
  assert.equal(groupGuests([g('A', { heading: 'custom' }), g('B')]).length, 1);
});

test('tekst własnego nagłówka: język → EN → PL → pierwszy dostępny', () => {
  const t = { pl: 'Prowadzący', en: 'Hosts', it: 'Conduttori' };
  assert.equal(pickHeadingText(t, 'it'), 'Conduttori');
  assert.equal(pickHeadingText(t, 'it-IT'), 'Conduttori');
  assert.equal(pickHeadingText(t, 'ko'), 'Hosts');
  assert.equal(pickHeadingText({ pl: 'Prowadzący' }, 'ko'), 'Prowadzący');
  assert.equal(pickHeadingText({ pl: 'Prowadzący', en: '  ' }, 'en'), 'Prowadzący');
  assert.equal(pickHeadingText({ it: 'Conduttori' }, 'pl'), 'Conduttori');
  assert.equal(pickHeadingText(null, 'pl'), '');
  assert.deepEqual(cleanHeadingText('Goście'), { pl: 'Goście' });
});

test('zapis: domyślny nagłówek nie dokłada żadnych pól', () => {
  assert.deepEqual(headingFieldsToSave({}), {});
  assert.deepEqual(headingFieldsToSave({ heading: 'special' }), {});
  assert.deepEqual(headingFieldsToSave({ heading: 'custom', headingText: {} }), {});
  assert.deepEqual(headingFieldsToSave({ heading: 'speakers', headingText: { pl: 'zostaje pominięty' } }), { heading: 'speakers' });
  assert.deepEqual(headingFieldsToSave({ heading: 'custom', headingText: { pl: ' Muzycy ', en: '' } }), { heading: 'custom', headingText: { pl: 'Muzycy' } });
});
