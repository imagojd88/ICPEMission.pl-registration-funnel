/**
 * Adapter wewnętrzny model → kontrakt Personal OS (wiążący).
 * Trzyma WSZYSTKIE różnice w nazwach pól i wartościach enumów w jednym miejscu.
 */

export type Localized = { pl?: string; en?: string; it?: string };

export type ContractInstanceStatus = 'OPEN' | 'CLOSED';
export type ContractRegStatus = 'CONFIRMED' | 'PENDING' | 'WAITLIST' | 'CANCELLED';
export type ContractPaymentStatus = 'PAID' | 'PENDING' | 'UNPAID' | 'REFUNDED';

export function toLocalized(title: unknown): Localized {
  if (typeof title === 'string') return { pl: title };
  const t = (title ?? {}) as Localized;
  return { pl: t.pl, en: t.en, it: t.it };
}

export function localizedName(name: unknown): string {
  if (typeof name === 'string') return name;
  const n = (name ?? {}) as Localized;
  return n.pl ?? n.en ?? n.it ?? '';
}

/** instance.status: internal DRAFT/OPEN/CLOSED/ARCHIVED → OPEN | CLOSED */
export function mapInstanceStatus(s: string): ContractInstanceStatus {
  return s === 'OPEN' ? 'OPEN' : 'CLOSED';
}

/** registration.status → CONFIRMED | PENDING | WAITLIST | CANCELLED */
export function mapRegStatus(s: string): ContractRegStatus {
  switch (s) {
    case 'CONFIRMED':
      return 'CONFIRMED';
    case 'WAITLIST':
      return 'WAITLIST';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'PENDING'; // DRAFT, PENDING_PAYMENT, AWAITING_TRANSFER
  }
}

/** PATCH /status: kontrakt → internal (akceptuje też wartości wewnętrzne). */
export function contractStatusToInternal(s: string): string {
  switch (s) {
    case 'PENDING':
      return 'PENDING_PAYMENT';
    case 'CONFIRMED':
    case 'WAITLIST':
    case 'CANCELLED':
      return s;
    default:
      return s;
  }
}

/** Filtr listy zgłoszeń: kontrakt status → zbiór statusów internal. */
export function contractStatusFilter(s: string): string[] | undefined {
  switch (s) {
    case 'CONFIRMED':
      return ['CONFIRMED'];
    case 'WAITLIST':
      return ['WAITLIST'];
    case 'CANCELLED':
      return ['CANCELLED'];
    case 'PENDING':
      return ['DRAFT', 'PENDING_PAYMENT', 'AWAITING_TRANSFER'];
    default:
      return undefined; // nieznany → brak filtra
  }
}

/** paymentStatus → PAID | PENDING | UNPAID | REFUNDED */
export function mapPaymentStatus(regStatus: string, paymentStatus?: string): ContractPaymentStatus {
  if (paymentStatus === 'PAID') return 'PAID';
  if (paymentStatus === 'REFUNDED') return 'REFUNDED';
  if (
    paymentStatus === 'PENDING' ||
    paymentStatus === 'AWAITING_TRANSFER' ||
    regStatus === 'PENDING_PAYMENT' ||
    regStatus === 'AWAITING_TRANSFER'
  ) {
    return 'PENDING';
  }
  return 'UNPAID';
}

/** paymentMethod: ONLINE → 'card', BANK_TRANSFER → 'transfer' */
export function mapPaymentMethod(m?: string | null): string | undefined {
  if (!m) return undefined;
  if (m === 'BANK_TRANSFER') return 'transfer';
  if (m === 'ONLINE') return 'card';
  return m.toLowerCase();
}

export function mapGender(g?: string | null): string | undefined {
  if (!g) return undefined;
  if (g === 'FEMALE' || g === 'F') return 'F';
  if (g === 'MALE' || g === 'M') return 'M';
  return 'other';
}

export function mapParticipantType(t: string): 'adult' | 'child' {
  return t === 'CHILD' || t === 'child' ? 'child' : 'adult';
}

export function num(d: { toString(): string } | number | null | undefined): number {
  if (d === null || d === undefined) return 0;
  return typeof d === 'number' ? d : parseFloat(d.toString());
}

export function iso(d: Date | string): string {
  return typeof d === 'string' ? new Date(d).toISOString() : d.toISOString();
}
