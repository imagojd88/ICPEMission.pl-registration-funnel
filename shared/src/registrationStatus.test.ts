import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeletableTestPayment, paymentsConfirm, pendingStatusFor, permanentDeleteBlocker, restoredStatus, statusAfterPaymentRemoval } from './registrationStatus.ts';

const none = { total: 400, hasPlan: true, depositPaid: false, fullyPaid: false };
const deposit = { total: 400, hasPlan: true, depositPaid: true, fullyPaid: false };
const partNoPlan = { total: 400, hasPlan: false, depositPaid: false, fullyPaid: false };
const fullNoPlan = { total: 400, hasPlan: false, depositPaid: true, fullyPaid: true };
const free = { total: 0, hasPlan: false, depositPaid: true, fullyPaid: true };

test('paymentsConfirm: plan → zadatek; bez planu → całość; bezpłatne → tak', () => {
  assert.equal(paymentsConfirm(none), false);
  assert.equal(paymentsConfirm(deposit), true);
  assert.equal(paymentsConfirm(partNoPlan), false);
  assert.equal(paymentsConfirm(fullNoPlan), true);
  assert.equal(paymentsConfirm(free), true);
});

test('pendingStatusFor: online → PENDING_PAYMENT, reszta → AWAITING_TRANSFER', () => {
  assert.equal(pendingStatusFor('ONLINE'), 'PENDING_PAYMENT');
  assert.equal(pendingStatusFor('BANK_TRANSFER'), 'AWAITING_TRANSFER');
  assert.equal(pendingStatusFor('CASH'), 'AWAITING_TRANSFER');
  assert.equal(pendingStatusFor(null), 'AWAITING_TRANSFER');
});

test('restoredStatus: bez wpłat wraca do „czeka na wpłatę” wg metody', () => {
  assert.equal(restoredStatus(null, { ...none, paymentMethod: 'ONLINE' }), 'PENDING_PAYMENT');
  assert.equal(restoredStatus('AWAITING_TRANSFER', { ...none, paymentMethod: 'BANK_TRANSFER' }), 'AWAITING_TRANSFER');
});

test('restoredStatus: wpłacony zadatek / całość → CONFIRMED, także gdy przed anulowaniem czekało', () => {
  assert.equal(restoredStatus('PENDING_PAYMENT', deposit), 'CONFIRMED');
  assert.equal(restoredStatus(undefined, fullNoPlan), 'CONFIRMED');
  assert.equal(restoredStatus(null, partNoPlan), 'AWAITING_TRANSFER');
});

test('restoredStatus: znany status sprzed anulowania — lista rezerwowa i potwierdzone wracają na swoje miejsce', () => {
  assert.equal(restoredStatus('WAITLIST', fullNoPlan), 'WAITLIST');
  assert.equal(restoredStatus('CONFIRMED', none), 'CONFIRMED');
  assert.equal(restoredStatus(null, free), 'CONFIRMED');
});

test('statusAfterPaymentRemoval: cofa potwierdzenie tylko, gdy wpłat już nie wystarcza', () => {
  assert.equal(statusAfterPaymentRemoval('CONFIRMED', { ...none, paymentMethod: 'ONLINE' }), 'PENDING_PAYMENT');
  assert.equal(statusAfterPaymentRemoval('CONFIRMED', { ...none, paymentMethod: 'BANK_TRANSFER' }), 'AWAITING_TRANSFER');
  assert.equal(statusAfterPaymentRemoval('CONFIRMED', deposit), null);
  assert.equal(statusAfterPaymentRemoval('CONFIRMED', free), null);
  assert.equal(statusAfterPaymentRemoval('AWAITING_TRANSFER', none), null);
  assert.equal(statusAfterPaymentRemoval('AWAITING_TRANSFER', deposit), 'CONFIRMED');
  assert.equal(statusAfterPaymentRemoval('CANCELLED', none), null);
  assert.equal(statusAfterPaymentRemoval('WAITLIST', none), null);
});

test('isDeletableTestPayment: wyłącznie Tpay ze znacznikiem testu (i zgodną próbą)', () => {
  assert.equal(isDeletableTestPayment({ provider: 'tpay', rawTestMode: true, attemptTestMode: true }), true);
  assert.equal(isDeletableTestPayment({ provider: 'tpay', rawTestMode: true }), true);
  assert.equal(isDeletableTestPayment({ provider: 'tpay', rawTestMode: true, attemptTestMode: false }), false);
  assert.equal(isDeletableTestPayment({ provider: 'tpay', rawTestMode: false, attemptTestMode: true }), false);
  assert.equal(isDeletableTestPayment({ provider: 'tpay' }), false);
  assert.equal(isDeletableTestPayment({ provider: 'tpay', rawTestMode: 'true' }), false);
  assert.equal(isDeletableTestPayment({ provider: 'panel', rawTestMode: true }), false);
  assert.equal(isDeletableTestPayment({ provider: 'manual', rawTestMode: true, attemptTestMode: true }), false);
  assert.equal(isDeletableTestPayment({ provider: 'bank-import' }), false);
});

test('permanentDeleteBlocker: tylko anulowane i tylko bez prawdziwych wpłat', () => {
  const t = { provider: 'tpay', rawTestMode: true, attemptTestMode: true };
  assert.equal(permanentDeleteBlocker({ status: 'CANCELLED' }, []), null);
  assert.equal(permanentDeleteBlocker({ status: 'CANCELLED' }, [t, t]), null);
  assert.equal(permanentDeleteBlocker({ status: 'CONFIRMED' }, []), 'NOT_CANCELLED');
  assert.equal(permanentDeleteBlocker({ status: 'CANCELLED' }, [t, { provider: 'panel' }]), 'REAL_PAYMENTS');
  // Także wpłata cofnięta / zwrócona nietestowa blokuje — historia prawdziwych pieniędzy zostaje.
  assert.equal(permanentDeleteBlocker({ status: 'CANCELLED' }, [{ provider: 'tpay', rawTestMode: false }]), 'REAL_PAYMENTS');
});
