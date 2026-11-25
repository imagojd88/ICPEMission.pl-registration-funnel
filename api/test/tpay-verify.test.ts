/**
 * Test weryfikacji powiadomień Tpay. Uruchomienie (bez instalowania czegokolwiek):
 *   node --experimental-strip-types --test api/test/tpay-verify.test.ts
 * Klucze i certyfikaty powstają w locie w katalogu tymczasowym (openssl) — w repozytorium
 * nie ma żadnych kluczy. Sekrety w teście są fikcyjne.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, createSign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isTrustedX5u, tpayMd5, verifyTpayNotification } from '../src/payments/tpay-verify.ts';
import type { TpayEnv, TpayVerifyInput } from '../src/payments/tpay-verify.ts';

const MERCHANT = '999001';
const CODE = 'fikcyjny-kod-bezpieczenstwa-do-testow';
const X5U_SANDBOX = 'https://secure.sandbox.tpay.com/x509/notifications-jws.pem';
const X5U_PROD = 'https://secure.tpay.com/x509/notifications-jws.pem';

let dir = '';
const pem: Record<string, string> = {};

function openssl(args: string[]) {
  execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
}

/** Root CA + certyfikat podpisujący wystawiony przez ten root. */
function makePki(prefix: string) {
  writeFileSync(join(dir, `${prefix}-ca.ext`), 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n');
  writeFileSync(join(dir, `${prefix}-leaf.ext`), 'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature\n');
  openssl(['genrsa', '-out', `${prefix}-root.key`, '2048']);
  openssl(['req', '-new', '-key', `${prefix}-root.key`, '-subj', `/CN=Testowy Root ${prefix}`, '-out', `${prefix}-root.csr`]);
  openssl(['x509', '-req', '-in', `${prefix}-root.csr`, '-signkey', `${prefix}-root.key`, '-days', '30', '-extfile', `${prefix}-ca.ext`, '-out', `${prefix}-root.pem`]);
  openssl(['genrsa', '-out', `${prefix}-leaf.key`, '2048']);
  openssl(['req', '-new', '-key', `${prefix}-leaf.key`, '-subj', `/CN=Testowy podpis ${prefix}`, '-out', `${prefix}-leaf.csr`]);
  openssl(['x509', '-req', '-in', `${prefix}-leaf.csr`, '-CA', `${prefix}-root.pem`, '-CAkey', `${prefix}-root.key`, '-CAcreateserial', '-days', '10', '-extfile', `${prefix}-leaf.ext`, '-out', `${prefix}-leaf.pem`]);
  for (const f of ['root.pem', 'root.key', 'leaf.pem', 'leaf.key']) pem[`${prefix}-${f}`] = readFileSync(join(dir, `${prefix}-${f}`), 'utf8');
}

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tpay-verify-'));
  makePki('a'); // „Tpay”
  makePki('b'); // obcy urząd certyfikacji
});

after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function bodyOf(over: Record<string, string> = {}, opts: { code?: string; md5?: string } = {}): string {
  const f: Record<string, string> = {
    id: MERCHANT,
    tr_id: 'TR-TEST-0000001',
    tr_date: '2027-01-10 12:00:00',
    tr_crc: 'icpe-test-crc-0001',
    tr_amount: '200.00',
    tr_paid: '200.00',
    tr_desc: 'Test',
    tr_status: 'TRUE',
    tr_error: 'none',
    tr_email: 'gosc@example.com',
    test_mode: '1',
    ...over,
  };
  f.md5sum = opts.md5 ?? createHash('md5').update(`${f.id}${f.tr_id}${f.tr_amount}${f.tr_crc}${opts.code ?? CODE}`).digest('hex');
  return new URLSearchParams(f).toString();
}

function sign(body: string, opts: { alg?: string; x5u?: string; key?: string; header?: Record<string, unknown> } = {}): string {
  const header = b64url(JSON.stringify(opts.header ?? { alg: opts.alg ?? 'RS256', x5u: opts.x5u ?? X5U_SANDBOX }));
  const s = createSign('RSA-SHA256');
  s.update(`${header}.${b64url(body)}`);
  return `${header}..${b64url(s.sign(opts.key ?? pem['a-leaf.key']))}`;
}

function input(body: string, jws: string, over: Partial<TpayVerifyInput> = {}): TpayVerifyInput {
  return {
    rawBody: Buffer.from(body, 'utf8'),
    jws,
    env: 'sandbox' as TpayEnv,
    merchantId: MERCHANT,
    securityCode: CODE,
    rootCaPem: pem['a-root.pem'],
    getSigningCertPem: () => pem['a-leaf.pem'],
    ...over,
  };
}

test('poprawny podpis → ok, pola sparsowane', async () => {
  const body = bodyOf();
  const r = await verifyTpayNotification(input(body, sign(body)));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.fields.tr_crc, 'icpe-test-crc-0001');
    assert.equal(r.fields.tr_paid, '200.00');
    assert.equal(r.testMode, true);
  }
});

test('poprawny podpis: ciało jako tekst i jako bufor dają ten sam wynik', async () => {
  const body = bodyOf();
  const r = await verifyTpayNotification(input(body, sign(body), { rawBody: body }));
  assert.equal(r.ok, true);
});

test('zły podpis: zmienione ciało po podpisaniu', async () => {
  const body = bodyOf();
  const jws = sign(body);
  const tampered = bodyOf({ tr_paid: '9999.00', tr_amount: '9999.00' });
  assert.deepEqual(await verifyTpayNotification(input(tampered, jws)), { ok: false, reason: 'BAD_SIGNATURE' });
});

test('zły podpis: podpisane innym kluczem niż certyfikat', async () => {
  const body = bodyOf();
  assert.deepEqual(await verifyTpayNotification(input(body, sign(body, { key: pem['b-leaf.key'] }))), { ok: false, reason: 'BAD_SIGNATURE' });
});

test('zły podpis: uszkodzony / pusty / brak nagłówka', async () => {
  const body = bodyOf();
  const jws = sign(body);
  const [h, , s] = jws.split('.');
  const flipped = `${h}..${s.slice(0, -4)}${s.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'}`;
  assert.deepEqual(await verifyTpayNotification(input(body, flipped)), { ok: false, reason: 'BAD_SIGNATURE' });
  assert.deepEqual(await verifyTpayNotification(input(body, `${h}..`)), { ok: false, reason: 'BAD_JWS' });
  assert.deepEqual(await verifyTpayNotification(input(body, 'to-nie-jest-jws')), { ok: false, reason: 'BAD_JWS' });
  assert.deepEqual(await verifyTpayNotification(input(body, '')), { ok: false, reason: 'NO_SIGNATURE' });
  assert.deepEqual(await verifyTpayNotification(input(body, undefined as never)), { ok: false, reason: 'NO_SIGNATURE' });
  assert.deepEqual(await verifyTpayNotification(input('', jws)), { ok: false, reason: 'NO_BODY' });
  assert.deepEqual(await verifyTpayNotification(input(body, jws, { rawBody: undefined })), { ok: false, reason: 'NO_BODY' });
});

test('obcy host x5u — certyfikat nie jest nawet pobierany', async () => {
  const body = bodyOf();
  const bad = [
    'https://secure.tpay.com.evil.pl/x509/notifications-jws.pem',
    'https://secure.sandbox.tpay.com.evil.pl/x509/notifications-jws.pem',
    'https://evil.pl/x509/notifications-jws.pem',
    'https://secure.sandbox.tpay.com@evil.pl/x509/notifications-jws.pem',
    'https://evil.pl/secure.sandbox.tpay.com/x509/notifications-jws.pem',
    'http://secure.sandbox.tpay.com/x509/notifications-jws.pem',
    'https://secure.sandbox.tpay.com:8443/x509/notifications-jws.pem',
    'https://secure.sandbox.tpay.com/inne/notifications-jws.pem',
    'https://secure.sandbox.tpay.com/x509/../inne.pem',
    'https://sandbox.tpay.com/x509/notifications-jws.pem',
    'https://xsecure.sandbox.tpay.com/x509/notifications-jws.pem',
    X5U_PROD, // adres produkcyjny w środowisku sandbox
    'file:///etc/passwd',
    '',
  ];
  for (const x5u of bad) {
    let fetched = 0;
    const r = await verifyTpayNotification(input(body, sign(body, { x5u }), { getSigningCertPem: () => { fetched += 1; return pem['a-leaf.pem']; } }));
    assert.deepEqual(r, { ok: false, reason: 'BAD_X5U' }, x5u);
    assert.equal(fetched, 0, `pobrano certyfikat dla ${x5u}`);
  }
  // brak x5u w nagłówku
  assert.deepEqual(await verifyTpayNotification(input(body, sign(body, { header: { alg: 'RS256' } }))), { ok: false, reason: 'BAD_X5U' });
});

test('isTrustedX5u: środowiska się nie mieszają', () => {
  assert.equal(isTrustedX5u(X5U_PROD, 'production'), true);
  assert.equal(isTrustedX5u(X5U_SANDBOX, 'sandbox'), true);
  assert.equal(isTrustedX5u(X5U_SANDBOX, 'production'), false);
  assert.equal(isTrustedX5u(X5U_PROD, 'sandbox'), false);
  assert.equal(isTrustedX5u('https://SECURE.TPAY.COM/x509/a.pem', 'production'), true); // host bez rozróżniania wielkości liter
  assert.equal(isTrustedX5u('https://secure.tpay.com.evil.pl/x509/a.pem', 'production'), false);
  assert.equal(isTrustedX5u(undefined, 'production'), false);
  assert.equal(isTrustedX5u(42, 'production'), false);
});

test('zły alg: none, HS256, RS512, brak', async () => {
  const body = bodyOf();
  for (const alg of ['none', 'HS256', 'RS512', 'rs256', '']) {
    assert.deepEqual(await verifyTpayNotification(input(body, sign(body, { alg }))), { ok: false, reason: 'BAD_ALG' }, alg);
  }
  assert.deepEqual(await verifyTpayNotification(input(body, sign(body, { header: { x5u: X5U_SANDBOX } }))), { ok: false, reason: 'BAD_ALG' });
});

test('zły md5sum (inny kod bezpieczeństwa / podmieniona wartość)', async () => {
  const wrongCode = bodyOf({}, { code: 'inny-fikcyjny-kod' });
  assert.deepEqual(await verifyTpayNotification(input(wrongCode, sign(wrongCode))), { ok: false, reason: 'BAD_MD5' });
  const garbage = bodyOf({}, { md5: '00000000000000000000000000000000' });
  assert.deepEqual(await verifyTpayNotification(input(garbage, sign(garbage))), { ok: false, reason: 'BAD_MD5' });
  const short = bodyOf({}, { md5: 'abc' });
  assert.deepEqual(await verifyTpayNotification(input(short, sign(short))), { ok: false, reason: 'BAD_MD5' });
});

test('md5sum pisany wielkimi literami jest akceptowany', async () => {
  const f = { id: MERCHANT, tr_id: 'TR-TEST-0000001', tr_amount: '200.00', tr_crc: 'icpe-test-crc-0001' };
  const body = bodyOf({}, { md5: tpayMd5(f, CODE).toUpperCase() });
  assert.equal((await verifyTpayNotification(input(body, sign(body)))).ok, true);
});

test('zły merchant id', async () => {
  const body = bodyOf({ id: '123456' });
  assert.deepEqual(await verifyTpayNotification(input(body, sign(body))), { ok: false, reason: 'BAD_MERCHANT' });
});

test('test_mode=1 na produkcji → odrzucone; test_mode=0 na produkcji → ok', async () => {
  const testBody = bodyOf({ test_mode: '1' });
  assert.deepEqual(
    await verifyTpayNotification(input(testBody, sign(testBody, { x5u: X5U_PROD }), { env: 'production' })),
    { ok: false, reason: 'TEST_MODE_ON_PRODUCTION' },
  );
  const liveBody = bodyOf({ test_mode: '0' });
  const r = await verifyTpayNotification(input(liveBody, sign(liveBody, { x5u: X5U_PROD }), { env: 'production' }));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.testMode, false);
});

test('TPAY_ALLOW_TEST_MODE: test_mode=1 na produkcji przyjęty tylko przy jawnej zgodzie', async () => {
  const body = bodyOf({ test_mode: '1' });
  const jws = sign(body, { x5u: X5U_PROD });
  // zgoda → przyjęte, ale oznaczone jako test
  const allowed = await verifyTpayNotification(input(body, jws, { env: 'production', allowTestMode: true }));
  assert.equal(allowed.ok, true);
  if (allowed.ok) assert.equal(allowed.testMode, true);
  // brak zgody / false / wartości „prawie true” → odrzucone
  for (const allowTestMode of [false, undefined, 'true' as never, 1 as never]) {
    assert.deepEqual(
      await verifyTpayNotification(input(body, jws, { env: 'production', allowTestMode })),
      { ok: false, reason: 'TEST_MODE_ON_PRODUCTION' },
    );
  }
  // zgoda nie osłabia pozostałych kroków: zły podpis nadal odpada
  const tampered = bodyOf({ test_mode: '1', tr_paid: '1.00' });
  assert.deepEqual(
    await verifyTpayNotification(input(tampered, jws, { env: 'production', allowTestMode: true })),
    { ok: false, reason: 'BAD_SIGNATURE' },
  );
  // zwykła (nietestowa) wpłata na produkcji z włączoną zgodą: testMode = false
  const live = bodyOf({ test_mode: '0' });
  const r = await verifyTpayNotification(input(live, sign(live, { x5u: X5U_PROD }), { env: 'production', allowTestMode: true }));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.testMode, false);
});

test('sandbox: test_mode akceptowany niezależnie od flagi', async () => {
  const body = bodyOf({ test_mode: '1' });
  for (const allowTestMode of [false, true, undefined]) {
    const r = await verifyTpayNotification(input(body, sign(body), { allowTestMode }));
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.testMode, true);
  }
});

test('certyfikat spoza root CA', async () => {
  const body = bodyOf();
  // Poprawnie podpisane kluczem obcego certyfikatu, ale ten certyfikat nie pochodzi od naszego root CA.
  const jws = sign(body, { key: pem['b-leaf.key'] });
  assert.deepEqual(
    await verifyTpayNotification(input(body, jws, { getSigningCertPem: () => pem['b-leaf.pem'] })),
    { ok: false, reason: 'CERT_NOT_TRUSTED' },
  );
  // Certyfikat samopodpisany podstawiony jako podpisujący.
  const selfSigned = sign(body, { key: pem['b-root.key'] });
  assert.deepEqual(
    await verifyTpayNotification(input(body, selfSigned, { getSigningCertPem: () => pem['b-root.pem'] })),
    { ok: false, reason: 'CERT_NOT_TRUSTED' },
  );
  // Dołączenie obcego root CA do pliku z certyfikatem nie pomaga — kotwicą jest tylko rootCaPem.
  assert.deepEqual(
    await verifyTpayNotification(input(body, jws, { getSigningCertPem: () => `${pem['b-leaf.pem']}\n${pem['b-root.pem']}` })),
    { ok: false, reason: 'CERT_NOT_TRUSTED' },
  );
});

test('certyfikat przeterminowany / jeszcze nieważny', async () => {
  const body = bodyOf();
  const jws = sign(body);
  const in20days = new Date(Date.now() + 20 * 86_400_000); // certyfikat podpisujący ważny 10 dni
  assert.deepEqual(await verifyTpayNotification(input(body, jws, { now: in20days })), { ok: false, reason: 'CERT_EXPIRED' });
  const yearAgo = new Date(Date.now() - 365 * 86_400_000);
  assert.deepEqual(await verifyTpayNotification(input(body, jws, { now: yearAgo })), { ok: false, reason: 'CERT_EXPIRED' });
});

test('certyfikat niedostępny / nie-PEM / brak konfiguracji', async () => {
  const body = bodyOf();
  const jws = sign(body);
  assert.deepEqual(
    await verifyTpayNotification(input(body, jws, { getSigningCertPem: () => { throw new Error('sieć'); } })),
    { ok: false, reason: 'CERT_UNAVAILABLE' },
  );
  assert.deepEqual(await verifyTpayNotification(input(body, jws, { getSigningCertPem: () => '<html>404</html>' })), { ok: false, reason: 'BAD_CERT' });
  assert.deepEqual(await verifyTpayNotification(input(body, jws, { rootCaPem: '' })), { ok: false, reason: 'NOT_CONFIGURED' });
  assert.deepEqual(await verifyTpayNotification(input(body, jws, { securityCode: '' })), { ok: false, reason: 'NOT_CONFIGURED' });
  assert.deepEqual(await verifyTpayNotification(input(body, jws, { merchantId: '' })), { ok: false, reason: 'NOT_CONFIGURED' });
});

test('łańcuch z certyfikatem pośrednim w tym samym pliku PEM', async () => {
  // root „a” → pośredni → podpisujący
  writeFileSync(join(dir, 'int.ext'), 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign\n');
  writeFileSync(join(dir, 'leaf2.ext'), 'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature\n');
  openssl(['genrsa', '-out', 'int.key', '2048']);
  openssl(['req', '-new', '-key', 'int.key', '-subj', '/CN=Testowy posredni', '-out', 'int.csr']);
  openssl(['x509', '-req', '-in', 'int.csr', '-CA', 'a-root.pem', '-CAkey', 'a-root.key', '-CAcreateserial', '-days', '10', '-extfile', 'int.ext', '-out', 'int.pem']);
  openssl(['genrsa', '-out', 'leaf2.key', '2048']);
  openssl(['req', '-new', '-key', 'leaf2.key', '-subj', '/CN=Testowy podpis 2', '-out', 'leaf2.csr']);
  openssl(['x509', '-req', '-in', 'leaf2.csr', '-CA', 'int.pem', '-CAkey', 'int.key', '-CAcreateserial', '-days', '10', '-extfile', 'leaf2.ext', '-out', 'leaf2.pem']);
  const leaf2 = readFileSync(join(dir, 'leaf2.pem'), 'utf8');
  const int = readFileSync(join(dir, 'int.pem'), 'utf8');
  const body = bodyOf();
  const jws = sign(body, { key: readFileSync(join(dir, 'leaf2.key'), 'utf8') });
  assert.equal((await verifyTpayNotification(input(body, jws, { getSigningCertPem: () => `${leaf2}\n${int}` }))).ok, true);
  // bez certyfikatu pośredniego łańcuch się nie domyka
  assert.deepEqual(await verifyTpayNotification(input(body, jws, { getSigningCertPem: () => leaf2 })), { ok: false, reason: 'CERT_NOT_TRUSTED' });
});
