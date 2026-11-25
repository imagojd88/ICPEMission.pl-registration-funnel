/**
 * Status zgłoszenia wynikający ze stanu wpłat — czysta logika dla „Przywróć zgłoszenie”
 * i dla przeliczenia po usunięciu wpłaty testowej. Reguła potwierdzenia jest ta sama, której używa
 * `PaymentPlanService.syncStatus`: event z harmonogramem → wystarczy zadatek; bez harmonogramu → całość.
 */

export type ActiveRegStatus = 'CONFIRMED' | 'PENDING_PAYMENT' | 'AWAITING_TRANSFER' | 'WAITLIST';

export interface PaymentFacts {
  /** kwota zgłoszenia */
  total: number;
  /** event ma harmonogram wpłat */
  hasPlan: boolean;
  /** wpłacono co najmniej pierwszy próg harmonogramu */
  depositPaid: boolean;
  /** wpłacono całość */
  fullyPaid: boolean;
  /** metoda wybrana przy zgłoszeniu (ONLINE | BANK_TRANSFER | CASH | LEADER_DEPOSIT) */
  paymentMethod?: string | null;
}

/** Czy wpłaty wystarczają do potwierdzenia (jak w `syncStatus`). Zgłoszenie bezpłatne — tak. */
export function paymentsConfirm(f: PaymentFacts): boolean {
  if (!(f.total > 0)) return true;
  return f.hasPlan ? f.depositPaid : f.fullyPaid;
}

/** Status „czeka na wpłatę” właściwy dla metody płatności (tak samo jak przy tworzeniu zgłoszenia). */
export function pendingStatusFor(paymentMethod?: string | null): 'PENDING_PAYMENT' | 'AWAITING_TRANSFER' {
  return paymentMethod === 'ONLINE' ? 'PENDING_PAYMENT' : 'AWAITING_TRANSFER';
}

/**
 * Status po przywróceniu anulowanego zgłoszenia.
 *  - `previous` = status sprzed anulowania, jeśli go znamy (zapisuje go anulowanie z panelu):
 *    lista rezerwowa wraca na listę rezerwową; potwierdzone wraca jako potwierdzone
 *    (np. bezpłatne, z zaproszenia albo potwierdzone ręcznie — bez wpłat);
 *  - poza tym decydują wpłaty: wystarczające → CONFIRMED, inaczej „czeka na wpłatę”.
 */
export function restoredStatus(previous: string | null | undefined, f: PaymentFacts): ActiveRegStatus {
  if (previous === 'WAITLIST') return 'WAITLIST';
  if (previous === 'CONFIRMED') return 'CONFIRMED';
  return paymentsConfirm(f) ? 'CONFIRMED' : pendingStatusFor(f.paymentMethod);
}

/**
 * Status po TRWAŁYM usunięciu wpłaty (tylko testowej). W odróżnieniu od `syncStatus` potrafi cofnąć
 * potwierdzenie: zgłoszenie potwierdzone, któremu po usunięciu wpłaty nie zostaje wymagana kwota,
 * wraca do „czeka na wpłatę”. Anulowane, lista rezerwowa i szkic — bez zmian (null = nie zmieniaj).
 */
export function statusAfterPaymentRemoval(current: string, f: PaymentFacts): ActiveRegStatus | null {
  if (current === 'CONFIRMED') return paymentsConfirm(f) ? null : pendingStatusFor(f.paymentMethod);
  if (current === 'PENDING_PAYMENT' || current === 'AWAITING_TRANSFER') return paymentsConfirm(f) ? 'CONFIRMED' : null;
  return null;
}

/** Czy wpłata jest testową wpłatą Tpay, którą wolno trwale usunąć (jedyny dozwolony przypadek). */
export function isDeletableTestPayment(p: { provider?: unknown; rawTestMode?: unknown; attemptTestMode?: unknown }): boolean {
  if (p.provider !== 'tpay') return false;
  if (p.rawTestMode !== true) return false;
  // Jeżeli znamy próbę płatności (OnlinePayment), ona też musi mówić „test”. Brak próby → decyduje znacznik wpłaty.
  if (p.attemptTestMode !== undefined && p.attemptTestMode !== null && p.attemptTestMode !== true) return false;
  return true;
}

/**
 * Czy zgłoszenie wolno usunąć trwale: tylko anulowane i tylko bez prawdziwych wpłat
 * (brak wpłat albo wszystkie wpłaty to testowe wpłaty Tpay). Zwraca powód odmowy albo null.
 */
export function permanentDeleteBlocker(reg: { status: string }, payments: Array<{ provider?: unknown; rawTestMode?: unknown; attemptTestMode?: unknown }>): 'NOT_CANCELLED' | 'REAL_PAYMENTS' | null {
  if (reg.status !== 'CANCELLED') return 'NOT_CANCELLED';
  if (payments.some((p) => !isDeletableTestPayment(p))) return 'REAL_PAYMENTS';
  return null;
}
