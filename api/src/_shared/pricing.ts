/**
 * Kanoniczny silnik wyceny ICPE — odtworzony 1:1 z handoffu Claude Design.
 * Używany przez frontend (podgląd ceny na żywo) i backend (cena wiążąca).
 *
 * Model (wg README handoffu, sekcja "Logika cennika"):
 *  cena osoby = (opłata formacyjna + nocleg_per_os × noce + wyżywienie) × mnożnik_wiekowy
 *  mnożnik: <3 lata → 0 | 3–11 → 0.7 | 12–17 → 0.9 | dorosły 18+ → 1.0
 *  opcje: transport +40 (na zgłoszenie), pościel +15 × liczba osób
 *  rabat: kod ICPE10 → −10% od sumy (po opcjach)
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
  cap: number;
  /** cena per osoba/noc (dla pokoju 1-os. = cena pokoju/noc) */
  perPerson: number;
  /** etykieta modelu cenowego (informacyjna): 'os / noc' | 'noc' | ... */
  model?: string;
  tag?: string;
}

export interface AgeBracket {
  /** górna granica wieku (wyłącznie). Sortowane rosnąco. */
  ltAge: number;
  multiplier: number;
}

export interface PricingConfig {
  /** opłata formacyjna per osoba */
  formationFee: number;
  /** wyżywienie per osoba (pełne, za cały pobyt) */
  mealsFee: number;
  /** liczba nocy */
  nights: number;
  /** progi wiekowe (mnożnik na całą cenę osoby) — tylko dla type === 'child' */
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

/** Ustawienia domyślne = wartości eventu "Dzień Formacji 2026" z handoffu. */
export const DEFAULT_PRICING: PricingConfig = {
  formationFee: 50,
  mealsFee: 80,
  nights: 1,
  childBrackets: [
    { ltAge: 3, multiplier: 0 },
    { ltAge: 12, multiplier: 0.7 },
    { ltAge: 18, multiplier: 0.9 },
  ],
  rooms: [
    { id: 'double', name: 'Miejsce w pokoju 2-osobowym', desc: 'Wspólny pokój dla dwóch osób — najczęstszy wybór.', cap: 2, perPerson: 80, model: 'os / noc', tag: 'Najpopularniejsze' },
    { id: 'single', name: 'Pokój 1-osobowy', desc: 'Prywatny pokój dla osób potrzebujących ciszy i skupienia.', cap: 1, perPerson: 100, model: 'noc', tag: '' },
    { id: 'family', name: 'Pokój rodzinny (4 os.)', desc: 'Większy pokój dla rodziny z dziećmi, dwa łóżka + dostawki.', cap: 4, perPerson: 70, model: 'os / noc', tag: 'Dla rodzin' },
  ],
  options: { transport: 40, bedding: 15 },
  discountCodes: { ICPE10: 0.1 },
};

export interface PriceOptions {
  transport?: boolean;
  bedding?: boolean;
}

export interface PriceInput {
  participants: PricedParticipant[];
  roomId: string;
  options?: PriceOptions;
  /** kod rabatowy wpisany przez użytkownika (case-insensitive) */
  discountCode?: string;
}

export interface PriceLine extends PricedParticipant {
  multiplier: number;
  total: number;
}

export interface PriceResult {
  /** opłaty uczestników (formacja + wyżywienie), po mnożnikach */
  participants: number;
  /** zakwaterowanie, po mnożnikach */
  accommodation: number;
  /** opcje dodatkowe */
  options: number;
  /** kwota rabatu (>= 0) */
  discount: number;
  /** suma przed rabatem */
  subtotal: number;
  /** kwota do zapłaty */
  total: number;
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
 * Wylicza cenę zgłoszenia. Deterministyczna i czysta — bez side-effectów.
 * Zaokrąglenia jak w prototypie: rabat = round(subtotal * frac).
 */
export function computePrice(input: PriceInput, config: PricingConfig = DEFAULT_PRICING): PriceResult {
  const room = config.rooms.find((r) => r.id === input.roomId) ?? config.rooms[0];
  let fee = 0;
  let acc = 0;
  let meals = 0;

  const lines: PriceLine[] = input.participants.map((p) => {
    const m = ageMultiplier(p, config.childBrackets);
    const f = config.formationFee * m;
    const a = room.perPerson * config.nights * m;
    const ml = config.mealsFee * m;
    fee += f;
    acc += a;
    meals += ml;
    return { ...p, multiplier: m, total: f + a + ml };
  });

  let opts = 0;
  if (input.options?.transport) opts += config.options.transport;
  if (input.options?.bedding) opts += config.options.bedding * input.participants.length;

  const participants = fee + meals;
  const subtotal = participants + acc + opts;

  const code = (input.discountCode ?? '').trim().toUpperCase();
  const frac = config.discountCodes[code] ?? 0;
  const discount = frac > 0 ? Math.round(subtotal * frac) : 0;

  return {
    participants,
    accommodation: acc,
    options: opts,
    discount,
    subtotal,
    total: subtotal - discount,
    lines,
    currency: 'PLN',
  };
}

/** Formatowanie waluty jak w handoffie: Intl pl-PL + " zł". */
export function formatZl(n: number): string {
  return new Intl.NumberFormat('pl-PL').format(Math.round(n)) + ' zł';
}
