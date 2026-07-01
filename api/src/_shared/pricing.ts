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
 */

import type { ParticipantType } from './types';

export interface PricedParticipant {
  type: ParticipantType;
  age: number;
}

export interface RoomTypeDef {
  id: string;
  name: string;
  desc?: string;
  /** maksymalna liczba osób w pokoju */
  cap: number;
  /** cena za osobę za noc (dla pokoju 1-os. = cena pokoju/noc) */
  perPerson: number;
  /** etykieta modelu cenowego (informacyjna) */
  model?: string;
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
  options?: PriceOptions;
  /** kod rabatowy wpisany przez użytkownika (case-insensitive) */
  discountCode?: string;
}

export interface PriceLine extends PricedParticipant {
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
  if (config.free) {
    const people = (input.rooms ?? []).reduce((s, b) => s + b.participants.length, 0);
    return { formation: 0, accommodation: 0, meals: 0, options: 0, discount: 0, subtotal: 0, total: 0, people, lines: [], currency: 'PLN' };
  }

  const lines: PriceLine[] = [];

  for (const booking of input.rooms ?? []) {
    const room = config.rooms.find((r) => r.id === booking.roomId) ?? config.rooms[0];
    for (const p of booking.participants) {
      const m = ageMultiplier(p, config.childBrackets);
      // Próg „gratis" (mnożnik 0) → cała cena osoby = 0 (w tym opłata formacyjna).
      const formation = m === 0 ? 0 : config.formationFee;
      const accommodation = room.perPerson * config.nights * m;
      const meals = config.mealsFee * m;
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
    lines,
    currency: 'PLN',
  };
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
      errors.push(`Pokój „${room.name}" nie ma przypisanych osób.`);
    }
    if (booking.participants.length > room.cap) {
      errors.push(`Pokój „${room.name}" mieści maks. ${room.cap} os., przypisano ${booking.participants.length}.`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Formatowanie waluty: Intl pl-PL + " zł". */
export function formatZl(n: number): string {
  return new Intl.NumberFormat('pl-PL').format(Math.round(n)) + ' zł';
}
