import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanLeadKey, hasActiveRegistrationFor, leadIdsToClose, normalizeLeadEmail, planLeadUpsert, type LeadRef } from './leads.ts';

const KEY = 'k_0123456789abcdef0123';
const OTHER = 'k_ffffffffffffffffffff';

/** Mini-baza leadów jednego eventu — odtwarza to, co robi serwis, na czystych funkcjach. */
function db() {
  let seq = 0;
  const rows: Array<LeadRef & { sessionKey: string | null; convertedAt: Date | null }> = [];
  const upsert = (email: string, leadKey: string | null) => {
    const e = normalizeLeadEmail(email);
    const byEmail = rows.find((r) => r.email === e) ?? null;
    const byKey = leadKey ? rows.find((r) => r.sessionKey === leadKey && !r.convertedAt) ?? null : null;
    const plan = planLeadUpsert({ email: e, leadKey, byEmail, byKey });
    const drop = (id?: string) => { if (id) rows.splice(rows.findIndex((r) => r.id === id), 1); };
    if (plan.kind === 'skip') drop(plan.dropId);
    else if (plan.kind === 'create') rows.push({ id: `l${++seq}`, email: e, sessionKey: plan.sessionKey, convertedAt: null });
    else if (plan.kind === 'move') rows.find((r) => r.id === plan.id)!.email = e;
    else {
      drop(plan.dropId);
      const row = rows.find((r) => r.id === plan.id)!;
      if (plan.setSessionKey) row.sessionKey = plan.setSessionKey;
    }
    return plan;
  };
  const register = (email: string, leadKey?: string) => {
    const ids = leadIdsToClose(rows, { email, leadKey });
    for (const r of rows) if (ids.includes(r.id)) r.convertedAt = new Date();
    return ids;
  };
  const open = () => rows.filter((r) => !r.convertedAt).map((r) => r.email);
  return { rows, upsert, register, open };
}

test('normalizeLeadEmail: małe litery, bez białych znaków', () => {
  assert.equal(normalizeLeadEmail('  Jan.Kowalski+Test@Example.COM \n'), 'jan.kowalski+test@example.com');
  assert.equal(normalizeLeadEmail('a b@c.pl'), 'ab@c.pl');
  assert.equal(normalizeLeadEmail(null), '');
  assert.equal(normalizeLeadEmail(12), '');
});

test('cleanLeadKey: tylko 16–64 znaki z bezpiecznego alfabetu', () => {
  assert.equal(cleanLeadKey(KEY), KEY);
  assert.equal(cleanLeadKey('krotki'), null);
  assert.equal(cleanLeadKey('x'.repeat(65)), null);
  assert.equal(cleanLeadKey('zly klucz ze spacja!!'), null);
  assert.equal(cleanLeadKey(undefined), null);
  assert.equal(cleanLeadKey({}), null);
});

test('scenariusz z produkcji: zmiana e-maila w trakcie, potem zgłoszenie — nie zostaje żaden otwarty lead', () => {
  const d = db();
  d.upsert('jan+testtpay@example.com', KEY);
  d.upsert('jan+test_tpay@example.com', KEY); // gość poprawił adres
  assert.deepEqual(d.open(), ['jan+test_tpay@example.com'], 'lead zmienił adres, nie powstał drugi');
  assert.equal(d.rows.length, 1);
  d.register('jan+test_tpay@example.com', KEY);
  assert.deepEqual(d.open(), []);
});

test('lead sprzed wdrożenia (bez klucza) pod starym adresem: zgłoszenie z kluczem zamyka też lead tej sesji', () => {
  const d = db();
  d.upsert('a@example.com', KEY);
  // Druga karta / odświeżenie bez szkicu nie zmienia klucza — ale nawet gdyby lead pod nowym adresem
  // powstał osobno (np. wyścig zapisów), zgłoszenie zamyka oba po kluczu i po adresie.
  d.rows.push({ id: 'x', email: 'b@example.com', sessionKey: KEY, convertedAt: null });
  assert.deepEqual(d.register('b@example.com', KEY).sort(), ['l1', 'x']);
  assert.deepEqual(d.open(), []);
});

test('stary front bez leadKey: działa jak dotąd — zamyka tylko lead pod adresem zgłoszenia', () => {
  const d = db();
  d.upsert('a@example.com', null);
  d.upsert('b@example.com', null);
  assert.equal(d.rows.length, 2);
  d.register('B@Example.com ');
  assert.deepEqual(d.open(), ['a@example.com']);
});

test('kolizja: pod nowym adresem jest już inny otwarty lead — zostaje on, sierota sesji znika', () => {
  const d = db();
  d.upsert('zona@example.com', OTHER); // inna przeglądarka
  d.upsert('maz@example.com', KEY);
  const plan = d.upsert('zona@example.com', KEY); // ta sesja zmienia adres na już zajęty
  assert.equal(plan.kind, 'touch');
  assert.deepEqual(d.open(), ['zona@example.com']);
  assert.equal(d.rows[0].sessionKey, OTHER, 'cudzego klucza nie nadpisujemy');
});

test('kolizja z leadem bez klucza: sesja przejmuje go (klucz był pusty)', () => {
  const d = db();
  d.upsert('a@example.com', null);
  d.upsert('b@example.com', KEY);
  d.upsert('a@example.com', KEY);
  assert.deepEqual(d.open(), ['a@example.com']);
  assert.equal(d.rows[0].sessionKey, KEY);
});

test('kolizja z dokończonym leadem: nic nie zapisujemy, sierota sesji znika', () => {
  const d = db();
  d.upsert('a@example.com', null);
  d.register('a@example.com');
  d.upsert('b@example.com', KEY);
  const plan = d.upsert('a@example.com', KEY);
  assert.equal(plan.kind, 'skip');
  assert.deepEqual(d.open(), []);
  assert.equal(d.rows.length, 1);
});

test('sam adres nie daje władzy nad cudzym leadem: obcy klucz nie przenosi leada ofiary', () => {
  const d = db();
  d.upsert('ofiara@example.com', KEY);
  d.upsert('ofiara@example.com', OTHER); // ktoś obcy wpisuje ten sam adres
  assert.equal(d.rows[0].sessionKey, KEY);
  d.upsert('napastnik@example.com', OTHER); // i „zmienia adres”
  assert.deepEqual(d.open().sort(), ['napastnik@example.com', 'ofiara@example.com']);
});

test('ta sama sesja, ten sam adres: zwykła aktualizacja', () => {
  const d = db();
  d.upsert('a@example.com', KEY);
  assert.deepEqual(d.upsert('a@example.com', KEY), { kind: 'touch', id: 'l1', setSessionKey: null });
  assert.equal(d.rows.length, 1);
});

test('dokończony lead sesji nie jest przenoszony przy następnym zapisie z tej przeglądarki', () => {
  const d = db();
  d.upsert('a@example.com', KEY);
  d.register('a@example.com', KEY);
  // Klucz powinien być wymieniony po wysłaniu, ale nawet ze starym kluczem nie ruszamy dokończonego leada.
  const plan = d.upsert('b@example.com', KEY);
  assert.equal(plan.kind, 'create');
  assert.deepEqual(d.rows.map((r) => r.email), ['a@example.com', 'b@example.com']);
});

test('leadIdsToClose: bez adresu i bez klucza nic nie zamyka; pomija już zamknięte', () => {
  const open: LeadRef[] = [
    { id: '1', email: 'a@example.com', sessionKey: null, convertedAt: null },
    { id: '2', email: 'b@example.com', sessionKey: KEY, convertedAt: new Date() },
  ];
  assert.deepEqual(leadIdsToClose(open, { email: '' }), []);
  assert.deepEqual(leadIdsToClose(open, { email: 'b@example.com', leadKey: KEY }), []);
  assert.deepEqual(leadIdsToClose(open, { email: 'x@example.com', leadKey: 'za-krotki' }), []);
});

test('pas bezpieczeństwa crona: aktywne zgłoszenie na ten sam adres po normalizacji', () => {
  const registered = ['Jan@Example.com ', 'ola@example.com'];
  assert.equal(hasActiveRegistrationFor('jan@example.com', registered), true);
  assert.equal(hasActiveRegistrationFor(' JAN@example.COM', registered), true);
  // Żadnego zgadywania po „podobnych” adresach: +tag i podkreślenie to inne adresy.
  assert.equal(hasActiveRegistrationFor('jan+test@example.com', registered), false);
  assert.equal(hasActiveRegistrationFor('jan_@example.com', registered), false);
  assert.equal(hasActiveRegistrationFor('', registered), false);
});
