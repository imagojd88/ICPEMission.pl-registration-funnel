/** Wspólne typy domenowe i DTO kontraktu API (frontend ↔ backend). */

export type Locale = 'pl' | 'en' | 'it';
export type Gender = 'F' | 'M' | 'other';
export type ParticipantType = 'adult' | 'child';

export type EventType = 'ONE_TIME' | 'EVERGREEN' | 'STANDALONE';
export type InstanceStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED';
export type PaymentMethod = 'ONLINE' | 'BANK_TRANSFER';
export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'AWAITING_TRANSFER'
  | 'FAILED'
  | 'REFUNDED';
export type RegistrationStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'AWAITING_TRANSFER'
  | 'CONFIRMED'
  | 'WAITLIST'
  | 'CANCELLED';

export type Localized = Record<Locale, string>;

export interface Contact {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
}

export interface ParticipantDto {
  id?: string;
  type: ParticipantType;
  firstName: string;
  lastName?: string;
  age: number;
  gender: Gender;
  dietary?: string;
}

export interface RoomTypeDto {
  id: string;
  name: Localized | string;
  capacity: number;
  pricingModel: 'PER_PERSON' | 'PER_ROOM' | 'PER_PERSON_PER_NIGHT' | 'SINGLE_SUPPLEMENT';
  price: number;
  quantity: number;
}

export interface EventInstanceDto {
  id: string;
  seriesId: string;
  type: EventType;
  title: Localized | string;
  description?: Localized | string;
  startsAt: string; // ISO
  endsAt: string;
  location?: string;
  nights: number;
  capacity: number | null;
  status: InstanceStatus;
  registeredCount: number;
  confirmedCount: number;
  revenue: number;
  currency: string;
  paymentMethods: PaymentMethod[];
  slug: string;
}

export interface RegistrationDto {
  id: string;
  instanceId: string;
  status: RegistrationStatus;
  locale: Locale;
  contact: Contact;
  participants: ParticipantDto[];
  preferredRoomId?: string;
  assignedRoom?: string | null;
  dietaryNotes?: string;
  totalPrice: number;
  currency: string;
  paymentMethod?: PaymentMethod;
  paymentStatus: PaymentStatus;
  createdAt: string;
}

/** Wejście publicznego POST /registrations. */
export interface CreateRegistrationDto {
  instanceId: string;
  locale: Locale;
  contact: Contact;
  participants: ParticipantDto[];
  preferredRoomId: string;
  dietaryNotes?: string;
  dietaryTags?: string[];
  options?: { transport?: boolean; bedding?: boolean };
  discountCode?: string;
  paymentMethod: PaymentMethod;
  consents: { rodo: boolean; regulamin: boolean };
}

/** Skrót KPI dla dashboardu / karty Personal OS. */
export interface AdminSummaryDto {
  openInstances: number;
  registrationsToday: number;
  revenue: number;
  currency: string;
  occupancyPct: number;
}
