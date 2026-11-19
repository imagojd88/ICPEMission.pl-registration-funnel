/**
 * Kanoniczny silnik wyceny ICPE — model z komponowaniem pokoi.
 * Używany przez frontend (podgląd na żywo) i backend (cena wiążąca).
 *
 * Model ceny osoby:
 *   cena_osoby = opłata_formacyjna* + (nocleg_per_os × noce + wyżywienie) × mnożnik_wiekowy
 *   *opłata formacyjna jest PEŁNA dla każdego, z wyjątkiem progu „gratis" (mnożnik 0),
 *    dla którego cała cena osoby = 0.
 *
 * Mnożnik wiekowy (domyślnie): 0–3 → 0 (gratis) | 4–12 → 0.7 | 13–17 → 0.9 | 18+ → 1.0
 * Mnożnik działa na NOCLEG + WYŻYWIENIE (nie na opłatę formacyjną, poza progiem gratis).
 *
 * Goście komponują pokoje: każdy pokój ma typ i listę przypisanych osób.
 * Cena zakwaterowania liczona per osoba w danym pokoju (stawka typu pokoju × noce × mnożnik).
 *
 * Nocleg opcjonalny (`accommodationOptional`): osoby bez pokoju (`withoutRoom`) płacą
 * opłatę formacyjną + wyżywienie dzienne (bez noclegu i bez `overnightMealsFee`).
 */

import type { ParticipantType } from './types';

export interface PricedParticipant {
  type: ParticipantType;
  age: number;
}

export interface RoomTypeDef {
  id: string;
  /** nazwa pokoju — string (legacy) lub mapa językowa { pl, en, it } */
  name: string | Record<string, string>;
  desc?: string;
  /** maksymalna liczba osób w pokoju */
  cap: number;
  /**
   * Cena za noc — za osobę albo za cały pokój, zależnie od `priceUnit`
   * (nazwa pola historyczna; przy `priceUnit: 'room'` to cena pokoju).
   */
  perPerson: number;
  /**
   * Jednostka ceny: 'person' (domyślnie) = cena × osoby × noce × mnożnik wieku;
   * 'room' = cena × noce za pokój, niezależnie od liczby i wieku osób w pokoju
   * (w rozbiciu na osoby dzielona po równo między mieszkańców pokoju).
   */
  priceUnit?: 'person' | 'room';
  /** etykieta modelu cenowego (informacyjna) */
  model?: string;
  /** liczba pokoi tego typu do wynajęcia; brak / 0 = bez limitu */
  stock?: number;
  /**
   * Ile z `stock` jest zablokowanych dla gości specjalnych (niedostępne w publicznym
   * zapisie; przydziela je admin w panelu — zgłoszenie oznaczone „z rezerwy").
   */
  reserved?: number;
  tag?: string;
}

export interface AgeBracket {
  /** górna granica wieku (wyłącznie). Sortowane rosnąco. */
  ltAge: number;
  multiplier: number;
}

export interface PricingConfig {
  /** wydarzenie bezpłatne — ukrywamy ceny/koszty i pomijamy płatność (np. standalone) */
  free?: boolean;
  /** waluta cen wydarzenia (kwoty wpisuje organizator w tej walucie). Domyślnie PLN. */
  currency?: 'PLN' | 'EUR' | 'USD';
  /** opłata formacyjna per osoba (stała; zerowana tylko dla progu gratis) */
  formationFee: number;
  /** wyżywienie per osoba (pełne, za cały pobyt) — podlega mnożnikowi wieku */
  mealsFee: number;
  /** liczba nocy */
  nights: number;
  /**
   * Nocleg opcjonalny: gość może zapisać się bez pokoju (np. event 9:00–17:00 z noclegiem
   * dla przyjezdnych). Osoby bez pokoju płacą opłatę formacyjną + wyżywienie (mealsFee).
   */
  accommodationOptional?: boolean;
  /**
   * Wyżywienie dodatkowe dla nocujących (np. kolacja + śniadanie), za osobę za noc.
   * Doliczane tylko osobom z pokojem; podlega mnożnikowi wieku. Domyślnie 0.
   */
  overnightMealsFee?: number;
  /** progi wiekowe (mnożnik na nocleg + wyżywienie) — tylko dla type === 'child' */
  childBrackets: AgeBracket[];
  rooms: RoomTypeDef[];
  options: {
    /** transport — kwota stała na zgłoszenie */
    transport: number;
    /** pościel — kwota × liczba osób */
    bedding: number;
  };
  /** kody rabatowe → ułamek zniżki (0.10 = 10%) */
  discountCodes: Record<string, number>;
}

/** Ustawienia domyślne (wg ustaleń: nocleg 80/100/70, wyżywienie 80, formacja 50, 1 noc). */
export const DEFAULT_PRICING: PricingConfig = {
  formationFee: 50,
  mealsFee: 80, // np. śniadanie 20 + obiad 40 + kolacja 20
  nights: 1,
  childBrackets: [
    { ltAge: 4, multiplier: 0 }, // 0–3 gratis
    { ltAge: 13, multiplier: 0.7 }, // 4–12
    { ltAge: 18, multiplier: 0.9 }, // 13–17
  ],
  rooms: [
    { id: 'double', name: 'Miejsce w pokoju 2-osobowym', desc: 'Wspólny pokój dla dwóch osób.', cap: 2, perPerson: 80, model: 'os / noc', tag: 'Najpopularniejsze' },
    { id: 'single', name: 'Pokój 1-osobowy', desc: 'Pokój dla jednej osoby.', cap: 1, perPerson: 100, model: 'noc', tag: '' },
    { id: 'family', name: 'Pokój rodzinny (4 os.)', desc: 'Większy pokój dla rodziny.', cap: 4, perPerson: 70, model: 'os / noc', tag: 'Dla rodzin' },
  ],
  options: { transport: 40, bedding: 15 },
  discountCodes: { ICPE10: 0.1 },
};

export interface PriceOptions {
  transport?: boolean;
  bedding?: boolean;
}

/** Jeden pokój w komponowanym zgłoszeniu wraz z przypisanymi osobami. */
export interface RoomBooking {
  roomId: string;
  participants: PricedParticipant[];
}

export interface PriceInput {
  /** komponowane pokoje — każdy z typem i listą osób */
  rooms: RoomBooking[];
  /** osoby bez noclegu (nocleg opcjonalny albo event bez pokoi) */
  withoutRoom?: PricedParticipant[];
  options?: PriceOptions;
  /** kod rabatowy wpisany przez użytkownika (case-insensitive) */
  discountCode?: string;
}

export interface PriceLine extends PricedParticipant {
  /** id typu pokoju; '' = osoba bez noclegu */
  roomId: string;
  multiplier: number;
  formation: number;
  accommodation: number;
  meals: number;
  total: number;
}

export interface PriceResult {
  /** suma opłat formacyjnych */
  formation: number;
  /** suma zakwaterowania (po mnożnikach) */
  accommodation: number;
  /** suma wyżywienia (po mnożnikach) */
  meals: number;
  /** opcje dodatkowe */
  options: number;
  /** kwota rabatu (>= 0) */
  discount: number;
  /** suma przed rabatem */
  subtotal: number;
  /** kwota do zapłaty */
  total: number;
  /** liczba osób */
  people: number;
  /** ile osób jest bez noclegu */
  withoutRoom?: number;
  /** rozbicie per osoba */
  lines: PriceLine[];
  currency: string;
}

export function ageMultiplier(p: PricedParticipant, brackets: AgeBracket[]): number {
  if (p.type === 'child') {
    for (const b of brackets) {
      if (p.age < b.ltAge) return b.multiplier;
    }
  }
  return 1;
}

/**
 * Wylicza cenę zgłoszenia z komponowanych pokoi. Czysta i deterministyczna.
 */
export function computePrice(input: PriceInput, config: PricingConfig = DEFAULT_PRICING): PriceResult {
  // Wydarzenie bezpłatne → zero kosztów (ceny ukryte w UI, płatność pominięta).
  const currency = config.currency ?? 'PLN';
  const noRoom = input.withoutRoom ?? [];
  if (config.free) {
    const people = (input.rooms ?? []).reduce((s, b) => s + b.participants.length, 0) + noRoom.length;
    return { formation: 0, accommodation: 0, meals: 0, options: 0, discount: 0, subtotal: 0, total: 0, people, withoutRoom: noRoom.length, lines: [], currency };
  }

  const lines: PriceLine[] = [];
  const overnightMeals = (config.overnightMealsFee ?? 0) * config.nights;

  for (const booking of input.rooms ?? []) {
    const room = config.rooms.find((r) => r.id === booking.roomId) ?? config.rooms[0];
    const perRoom = room.priceUnit === 'room';
    const occupants = booking.participants.length;
    for (const p of booking.participants) {
      const m = ageMultiplier(p, config.childBrackets);
      // Próg „gratis" (mnożnik 0) → cała cena osoby = 0 (w tym opłata formacyjna).
      const formation = m === 0 ? 0 : config.formationFee;
      // Cena za pokój: stała za pokój i noc, dzielona po równo (bez mnożnika wieku).
      const accommodation = perRoom
        ? (occupants > 0 ? (room.perPerson * config.nights) / occupants : 0)
        : room.perPerson * config.nights * m;
      const meals = (config.mealsFee + overnightMeals) * m;
      lines.push({
        ...p,
        roomId: room.id,
        multiplier: m,
        formation,
        accommodation,
        meals,
        total: formation + accommodation + meals,
      });
    }
  }

  // Osoby bez noclegu: opłata formacyjna + wyżywienie dzienne (bez noclegu i posiłków nocujących).
  for (const p of noRoom) {
    const m = ageMultiplier(p, config.childBrackets);
    const formation = m === 0 ? 0 : config.formationFee;
    const meals = config.mealsFee * m;
    lines.push({ ...p, roomId: '', multiplier: m, formation, accommodation: 0, meals, total: formation + meals });
  }

  const people = lines.length;
  const formation = lines.reduce((s, l) => s + l.formation, 0);
  const accommodation = lines.reduce((s, l) => s + l.accommodation, 0);
  const meals = lines.reduce((s, l) => s + l.meals, 0);

  let opts = 0;
  if (input.options?.transport) opts += config.options.transport;
  if (input.options?.bedding) opts += config.options.bedding * people;

  const subtotal = formation + accommodation + meals + opts;

  const code = (input.discountCode ?? '').trim().toUpperCase();
  const frac = config.discountCodes[code] ?? 0;
  const discount = frac > 0 ? Math.round(subtotal * frac) : 0;

  return {
    formation,
    accommodation,
    meals,
    options: opts,
    discount,
    subtotal,
    total: subtotal - discount,
    people,
    withoutRoom: noRoom.length,
    lines,
    currency,
  };
}

/**
 * Buduje PriceInput z formularza: pokoje (indeksy osób) + osoby nieprzypisane do żadnego
 * pokoju trafiają do `withoutRoom`. Wspólne dla lejka, strony gościa, panelu i API.
 */
export function buildPriceInput(
  participants: PricedParticipant[],
  rooms: Array<{ roomId: string; participantIndexes: number[] }>,
  options?: PriceOptions,
  discountCode?: string,
): PriceInput {
  const n = participants.length;
  const assigned = new Set<number>();
  const bookings: RoomBooking[] = (rooms ?? []).map((r) => {
    const idx: number[] = [];
    for (const i of r.participantIndexes ?? []) {
      if (!Number.isInteger(i) || i < 0 || i >= n || assigned.has(i)) continue;
      assigned.add(i);
      idx.push(i);
    }
    return { roomId: r.roomId, participants: idx.map((i) => ({ type: participants[i].type, age: participants[i].age ?? 0 })) };
  });
  const withoutRoom = participants
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => !assigned.has(i))
    .map(({ p }) => ({ type: p.type, age: p.age ?? 0 }));
  return { rooms: bookings, withoutRoom, options, discountCode };
}

/** Czy event ma noclegi do wyboru (są typy pokoi i co najmniej 1 noc). */
export function hasAccommodation(config: PricingConfig | null | undefined): boolean {
  return !!config && (config.rooms?.length ?? 0) > 0 && (config.nights ?? 0) > 0;
}

/** Walidacja pojemności: każdy pokój nie przekracza limitu osób swojego typu. */
export function validateRoomCapacity(input: PriceInput, config: PricingConfig = DEFAULT_PRICING): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const booking of input.rooms ?? []) {
    const room = config.rooms.find((r) => r.id === booking.roomId);
    if (!room) {
      errors.push(`Nieznany typ pokoju: ${booking.roomId}`);
      continue;
    }
    if (booking.participants.length === 0) {
      errors.push(`Pokój „${roomLabel(room.name)}" nie ma przypisanych osób.`);
    }
    if (booking.participants.length > room.cap) {
      errors.push(`Pokój „${roomLabel(room.name)}" mieści maks. ${room.cap} os., przypisano ${booking.participants.length}.`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Odczytuje nazwę pokoju w danym języku (string legacy lub mapa { pl, en, it }). */
export function roomLabel(name: string | Record<string, string> | undefined | null, lng = 'pl'): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  const l = (lng || 'pl').slice(0, 2);
  return name[l] ?? name.pl ?? name.en ?? name.it ?? Object.values(name)[0] ?? '';
}

/** Formatowanie waluty: Intl pl-PL + " zł". */
export function formatZl(n: number): string {
  return new Intl.NumberFormat('pl-PL').format(Math.round(n)) + ' zł';
}

/**
 * Formatowanie kwoty zależne od waluty eventu i języka UI.
 * Dla PLN w polskim locale daje „180 zł", w angielskim „PLN 180"; EUR/USD dostają swój symbol.
 */
export function formatMoney(n: number, currency: 'PLN' | 'EUR' | 'USD' = 'PLN', lng = 'pl'): string {
  const l = (lng || 'pl').slice(0, 2);
  const locale = l === 'en' ? 'en-GB' : l === 'it' ? 'it-IT' : 'pl-PL';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Math.round(n));
  } catch {
    return `${new Intl.NumberFormat(locale).format(Math.round(n))} ${currency}`;
  }
}

/** Ile pokoi każdego typu zajmuje skład pokoi (lista z roomsJson / formularza). */
export function countRoomsByType(rooms: Array<{ roomId: string; participantIndexes?: unknown }> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rooms ?? []) {
    if (!r || typeof r.roomId !== 'string') continue;
    if (Array.isArray(r.participantIndexes) && r.participantIndexes.length === 0) continue;
    out[r.roomId] = (out[r.roomId] ?? 0) + 1;
  }
  return out;
}

/**
 * Wolne pokoje per typ dla zapisu publicznego:
 *   stock − max(rezerwa, zajęte z rezerwy) − zajęte publicznie.
 * Goście specjalni najpierw zużywają rezerwę; ponad nią — pulę publiczną.
 * Tylko typy z limitem (stock > 0); typ bez limitu nie występuje w wyniku.
 */
export function roomAvailability(
  config: PricingConfig | null | undefined,
  used: Record<string, number>,
  usedReserved: Record<string, number> = {},
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of config?.rooms ?? []) {
    const stock = Number(r.stock ?? 0);
    if (stock <= 0) continue;
    const reserve = Math.min(stock, Math.max(0, Number(r.reserved ?? 0)));
    out[r.id] = Math.max(0, stock - Math.max(reserve, usedReserved[r.id] ?? 0) - (used[r.id] ?? 0));
  }
  return out;
}

/** Typy pokoi, których w zgłoszeniu jest więcej niż wolnych (puste = OK). */
export function roomStockShortages(
  config: PricingConfig | null | undefined,
  requested: Array<{ roomId: string; participantIndexes?: unknown }>,
  available: Record<string, number>,
): Array<{ roomId: string; requested: number; available: number }> {
  const want = countRoomsByType(requested);
  const out: Array<{ roomId: string; requested: number; available: number }> = [];
  for (const [roomId, n] of Object.entries(want)) {
    if (!(roomId in available)) continue;
    if (n > available[roomId]) out.push({ roomId, requested: n, available: available[roomId] });
  }
  return out;
}
