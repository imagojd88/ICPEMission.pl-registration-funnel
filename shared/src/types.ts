/** Wspólne typy domenowe i DTO kontraktu API (frontend ↔ backend). */

export type Locale = 'pl' | 'en' | 'it' | 'ko' | 'zh';
export type Gender = 'F' | 'M' | 'other';
export type ParticipantType = 'adult' | 'child';

export type EventType = 'ONE_TIME' | 'EVERGREEN' | 'STANDALONE' | 'INVITE';
export type InstanceStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED';
/** LEADER_DEPOSIT = zaliczka (domyślnie 50%) u lidera wspólnoty ICPE + reszta gotówką na miejscu. */
export type PaymentMethod = 'ONLINE' | 'BANK_TRANSFER' | 'CASH' | 'LEADER_DEPOSIT';
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

/** Tekst w językach eventu: PL/EN/IT jak dotąd, KO/ZH opcjonalne (brak → interfejs bierze EN). */
export type Localized = Record<'pl' | 'en' | 'it', string> & Partial<Record<'ko' | 'zh', string>>;

export interface Contact {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  /** Parafia — gdy event pyta o parafię. */
  parish?: string;
  /** Wspólnota z listy albo nazwa wpisana ręcznie (wtedy communityOther = true). */
  community?: string;
  communityOther?: boolean;
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
  /** Start zapisów (ISO). W przyszłości = strona widoczna, ale z licznikiem zamiast zapisu. */
  registrationOpensAt?: string | null;
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
  /** Suma zaksięgowanych wpłat (panel admina). */
  paidAmount?: number;
  /** Stan względem harmonogramu wpłat eventu (panel admina). */
  payment?: {
    total: number; paid: number; remaining: number; dueNow: number; overdue: number;
    nextDue: { id: string; label: string; dueDate: string; amount: number } | null;
    depositPaid: boolean; fullyPaid: boolean; hasPlan: boolean;
    schedule: Array<{ id: string; label: string; dueDate: string; atRegistration: boolean; cumulativePct: number; cumulativeAmount: number; amount: number }>;
  };
  /** Obecność: znacznik check-in (ISO) lub null, gdy nieobecny. */
  checkedInAt?: string | null;
  /** Zakwaterowanie: numer/nazwa przydzielonego pokoju i komentarz. */
  roomLabel?: string | null;
  roomNote?: string | null;
  /** Pokoje z puli zarezerwowanej dla gości specjalnych (ustawia admin). */
  roomsReserved?: boolean;
  createdAt: string;
  /** Do edycji przez admina: pełny skład pokoi + opcje + kod rabatowy. */
  rooms?: Array<{ roomId: string; participantIndexes: number[] }>;
  options?: {
    transport?: boolean;
    bedding?: boolean;
    /** dobrowolna darowizna na dofinansowanie pobytu innych (kwota w walucie eventu) */
    donation?: number;
    /** ręczna korekta ceny admina (rabat %, rabat kwotowy, kwota końcowa, notatka) */
    adjustment?: { discountPct?: number; discountAmount?: number; overrideTotal?: number; note?: string };
  };
  discountCode?: string;
}

/** Jeden pokój w komponowanym zgłoszeniu: typ pokoju + indeksy osób z `participants`. */
export interface RoomCompositionEntry {
  /** id typu pokoju (RoomType.id lub klucz z PricingConfig.rooms) */
  roomId: string;
  /** indeksy uczestników (pozycje w tablicy participants) przypisanych do tego pokoju */
  participantIndexes: number[];
}

/** Wejście publicznego POST /registrations. */
export interface CreateRegistrationDto {
  instanceId: string;
  locale: Locale;
  contact: Contact;
  participants: ParticipantDto[];
  /** komponowane pokoje — każdy z typem i listą przypisanych osób */
  rooms: RoomCompositionEntry[];
  dietaryNotes?: string;
  dietaryTags?: string[];
  options?: { transport?: boolean; bedding?: boolean; donation?: number };
  discountCode?: string;
  paymentMethod: PaymentMethod;
  consents: { rodo: boolean; regulamin: boolean };
  /** Token osobistego zaproszenia (link `/r/:slug?inv=`) — spina zaproszenie ze zgłoszeniem. */
  invitationToken?: string;
}

/** Skrót KPI dla dashboardu / karty Personal OS. */
export interface AdminSummaryDto {
  openInstances: number;
  registrationsToday: number;
  revenue: number;
  currency: string;
  occupancyPct: number;
}
