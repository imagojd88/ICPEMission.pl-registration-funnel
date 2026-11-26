import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIETS, dietLabel, parseDietary, displayDietary, participantDietaryText, summarizeDiets, dietAgeGroups, dietSummaryText, dietaryPartOfNotes } from './diets.ts';

test('etykieta diety bezmlecznej: „Bez mleka” we wszystkich językach, klucz bez zmian', () => {
  const d = DIETS.find((x) => x.key === 'lactose_free')!;
  assert.equal(d.label.pl, 'Bez mleka');
  assert.equal(d.label.en, 'Dairy-free');
  assert.equal(d.label.it, 'Senza latticini');
  assert.ok(!/락토스|乳糖|lakto|lacto|latto/i.test(Object.values(d.label).join(' ')));
  assert.equal(dietLabel('lactose_free', 'en-GB'), 'Dairy-free');
  assert.equal(participantDietaryText(['no_meat', 'lactose_free'], ' orzechy '), 'Bez mięsa, Bez mleka, orzechy');
});

test('parseDietary: stare „Bez laktozy” liczy się do tej samej diety co „Bez mleka”', () => {
  assert.deepEqual(parseDietary('Bez laktozy').keys, ['lactose_free']);
  assert.deepEqual(parseDietary('Bez mleka').keys, ['lactose_free']);
  assert.deepEqual(parseDietary('bez laktozy').keys, ['lactose_free']);
  assert.deepEqual(parseDietary('Lactose-free; Senza lattosio').keys, ['lactose_free']);
  assert.deepEqual(parseDietary('Bez mięsa, Bez laktozy, alergia na orzechy'), { keys: ['no_meat', 'lactose_free'], note: 'alergia na orzechy' });
  // wolny tekst nie jest zgadywany
  assert.deepEqual(parseDietary('nietolerancja laktozy'), { keys: [], note: 'nietolerancja laktozy' });
  assert.deepEqual(parseDietary(null), { keys: [], note: '' });
  assert.deepEqual(parseDietary('Wegetariańska, bezglutenowa').keys, ['no_meat', 'gluten_free']);
});

test('displayDietary: stara etykieta pokazywana pod nową nazwą, wolny tekst bez zmian', () => {
  assert.equal(displayDietary('Bez laktozy, Bez glutenu, jabłka'), 'Bez glutenu, Bez mleka, jabłka');
  assert.equal(displayDietary(''), '');
  assert.equal(displayDietary('coś innego'), 'coś innego');
});

test('dietAgeGroups: progi z cennika → Dorośli / Dzieci 3–9 / Dzieci do 3 lat; bez progów Dorośli / Dzieci', () => {
  assert.deepEqual(dietAgeGroups([{ ltAge: 3 }, { ltAge: 10 }]).map((g) => g.label), ['Dorośli (i dzieci od 10 lat)', 'Dzieci 3–9 lat', 'Dzieci do 3 lat (0–2)']);
  assert.deepEqual(dietAgeGroups([]).map((g) => g.id), ['adult', 'child']);
  assert.deepEqual(dietAgeGroups(null).map((g) => g.label), ['Dorośli', 'Dzieci']);
});

const P = (type: string, firstName: string, age: number | null, dietary?: string) => ({ type, firstName, lastName: 'Nowak', age, dietary: dietary ?? null });

test('summarizeDiets: liczy osoby, nie zgłoszenia; anulowane i lista rezerwowa pominięte; suma kontrolna', () => {
  const regs = [
    { id: 'a', status: 'CONFIRMED', registrant: 'Jan Nowak', dietaryNotes: 'alergia na seler\nUwagi: przyjedziemy późno', participants: [
      P('adult', 'Jan', 40, 'Bez mięsa'),
      P('adult', 'Anna', 38, 'Bez laktozy'),
      P('child', 'Ola', 7, 'Bez mleka, orzechy'),
      P('child', 'Staś', 1),
    ] },
    { id: 'b', status: 'PENDING', registrant: 'Ewa Kot', participants: [
      P('adult', 'Ewa', 30, 'Bez glutenu, Bez mleka'),
      P('child', 'Tomek', 12, 'Wegańska'),
      P('adult', 'Piotr', 33, 'nie jem ryb'),
    ] },
    { id: 'c', status: 'CANCELLED', registrant: 'X', participants: [P('adult', 'X', 20, 'Wegańska')] },
    { id: 'd', status: 'WAITLIST', registrant: 'Y', participants: [P('adult', 'Y', 20, 'Bez mięsa')] },
    { id: 'e', status: 'AWAITING_TRANSFER', registrant: 'Bez Listy', participants: [] },
  ];
  const s = summarizeDiets(regs, [{ ltAge: 3 }, { ltAge: 10 }]);
  assert.equal(s.registrations, 3);
  assert.equal(s.people, 8);
  assert.equal(s.rows.reduce((n, r) => n + r.total, 0), s.people);
  assert.equal(Object.values(s.totals).reduce((a, b) => a + b, 0), s.people);
  assert.deepEqual(s.totals, { adult: 6, lt10: 1, lt3: 1 });
  const row = (id: string) => s.rows.find((r) => r.id === id)!;
  assert.equal(s.rows[0].id, 'standard');
  assert.deepEqual(row('standard').counts, { adult: 2, lt10: 0, lt3: 1 }); // Piotr (wolny tekst), „Bez Listy”, Staś
  assert.deepEqual(row('no_meat').counts, { adult: 1, lt10: 0, lt3: 0 });
  // stara i nowa etykieta razem: Anna („Bez laktozy”) + Ola („Bez mleka”)
  assert.deepEqual(row('lactose_free').counts, { adult: 1, lt10: 1, lt3: 0 });
  assert.equal(row('lactose_free').label, 'Bez mleka');
  assert.equal(row('lactose_free').kitchen, 'bezmleczna');
  // dziecko 12 lat (powyżej ostatniego progu) liczone jak dorosły
  assert.deepEqual(row('vegan').counts, { adult: 1, lt10: 0, lt3: 0 });
  // dwie diety jednej osoby = jeden wiersz-połączenie
  assert.equal(row('gluten_free+lactose_free').total, 1);
  assert.equal(row('gluten_free+lactose_free').label, 'Bez glutenu + Bez mleka');
  // lista imienna: osoby z dietą albo wolnym tekstem
  assert.deepEqual(s.persons.map((p) => p.person), ['Jan Nowak', 'Anna Nowak', 'Ola Nowak', 'Ewa Nowak', 'Tomek Nowak', 'Piotr Nowak']);
  assert.equal(s.persons.find((p) => p.person === 'Ola Nowak')!.note, 'orzechy');
  assert.equal(s.persons.find((p) => p.person === 'Piotr Nowak')!.diets, '');
  assert.equal(s.registrationNotes.length, 1);
});

test('summarizeDiets bez progów wieku: Dorośli / Dzieci', () => {
  const s = summarizeDiets([{ status: 'CONFIRMED', participants: [P('ADULT', 'A', 30), P('CHILD', 'B', 5, 'Bez glutenu')] }]);
  assert.deepEqual(s.totals, { adult: 1, child: 1 });
  assert.deepEqual(s.rows.find((r) => r.id === 'gluten_free')!.counts, { adult: 0, child: 1 });
});

test('dietSummaryText: nazwy ośrodka, stan na dzień, bez nazwisk; „Uwagi:” nie idą do ośrodka', () => {
  const s = summarizeDiets([
    { status: 'CONFIRMED', registrant: 'Jan Nowak', dietaryNotes: 'alergia na seler\nUwagi: przyjedziemy późno', participants: [P('adult', 'Jan', 40, 'Bez laktozy, orzechy'), P('child', 'Ola', 5)] },
  ], [{ ltAge: 3 }, { ltAge: 10 }]);
  const t = dietSummaryText(s, { eventTitle: 'United In Mission', dates: '22–27.08.2027', place: 'Kiczyce', asOf: '10.08.2027' });
  assert.match(t, /Zestawienie diet: United In Mission/);
  assert.match(t, /Termin: 22–27\.08\.2027, Kiczyce/);
  assert.match(t, /Stan na dzień: 10\.08\.2027/);
  assert.match(t, /Liczba osób łącznie: 2/);
  assert.match(t, /Dieta bezmleczna: 1/);
  assert.match(t, /Wyżywienie standardowe \(bez diety\): 1/);
  assert.match(t, /dieta bezmleczna: orzechy/);
  assert.match(t, /uwaga do zgłoszenia: alergia na seler/);
  assert.ok(!t.includes('Nowak'));
  assert.ok(!t.includes('przyjedziemy'));
  assert.equal(dietaryPartOfNotes('Uwagi: tylko to'), '');
});
