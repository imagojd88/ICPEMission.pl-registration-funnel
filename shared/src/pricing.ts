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
import type { PaymentPlan } from './paymentPlan';

// Lokalne kopie pomocników dat z `paymentPlan.ts` — bez importu wykonywalnego, żeby `node --test`
// (uruchamiany na plikach .ts bez bundlera) nie musiał rozwiązywać ścieżek bez rozszerzeń.
function warsawDate(d: Date | string | number = new Date()): string {
  const dt = d instanceof Date ? d : new Date(d);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(dt);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

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
  /**
   * Wyższy zadatek przy zapisie dla tego typu zakwaterowania, w % (np. 50 za pokój / domek
   * na wyłączność). Działa tylko z włączonym `PricingConfig.paymentPlan`. Brak = zadatek z planu.
   */
  depositPct?: number;
  tag?: string;
}

export interface AgeBracket {
  /** górna granica wieku (wyłącznie). Sortowane rosnąco. */
  ltAge: number;
  /**
   * Mnożnik NOCLEGU (pokój za osobę + posiłki dla nocujących), np. 0 = nocleg gratis, 0.7 = −30%.
   * Bez `eventMultiplier` działa po staremu także na wyżywienie dzienne, a 0 zeruje całą cenę osoby.
   */
  multiplier: number;
  /**
   * Mnożnik OPŁATY FORMACYJNEJ, np. 1 = pełna, 0.5 = −50%. (Wcześniej także wyżywienia —
   * obowiązuje dla wyżywienia, gdy brak `mealsMultiplier`.)
   * Brak = dotychczasowe zasady (opłata formacyjna pełna, 0 tylko przy multiplier 0; wyżywienie × multiplier).
   */
  eventMultiplier?: number;
  /** Mnożnik WYŻYWIENIA dziennego (obiady itp.), np. 1 = bez zniżki. Brak = jak `eventMultiplier`. */
  mealsMultiplier?: number;
  /**
   * Zniżka KWOTOWA na wyżywienie za cały pobyt (np. 150 = dziecko płaci o 150 mniej, niezależnie
   * od poziomu cen). Odejmowana po mnożniku; wyżywienie nie spada poniżej zera.
   */
  mealsDiscountAmount?: number;
}

/**
 * Poziom cen obowiązujący od wskazanego dnia (np. „Pre-Summer" od 1 maja). Ceny bazowe cennika
 * to pierwszy poziom (np. „Early bird"); każdy kolejny nadpisuje tylko podane kwoty.
 * Cena zgłoszenia jest liczona wg poziomu z DNIA ZAPISU i nie zmienia się po przejściu progu.
 */
export interface PriceTier {
  id: string;
  /** nazwa pokazywana gościom — tekst albo mapa językowa */
  name?: string | Record<string, string>;
  /** pierwszy dzień obowiązywania `YYYY-MM-DD` (Europe/Warsaw, włącznie) */
  from: string;
  mealsFee?: number;
  formationFee?: number;
  overnightMealsFee?: number;
  /** ceny typów zakwaterowania: id typu → cena za noc (jednostka jak w typie: osoba / pokój) */
  rooms?: Record<string, number>;
}

export interface PricingConfig {
  /** wydarzenie bezpłatne — ukrywamy ceny/koszty i pomijamy płatność (np. standalone) */
  free?: boolean;
  /** waluta cen wydarzenia (kwoty wpisuje organizator w tej walucie). Domyślnie PLN. */
  currency?: 'PLN' | 'EUR' | 'USD';
  /**
   * Zaliczka u lidera wspólnoty (metoda płatności LEADER_DEPOSIT): ile % kwoty gość przekazuje
   * liderowi; reszta gotówką na miejscu. Domyślnie 50.
   */
  leaderDepositPct?: number;
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
  /**
   * Opcjonalna darowizna na dofinansowanie pobytu osób, których nie stać na udział:
   * gość wybiera kwotę w kroku „Opcje” (50 / 100 / 200 albo dowolna). Brak / false = opcja ukryta.
   */
  donationEnabled?: boolean;
  /** Harmonogram wpłat: zadatek przy rejestracji + raty z terminami (patrz `paymentPlan.ts`). */
  paymentPlan?: PaymentPlan;
  /** Kolejne poziomy cen z datami (ceny bazowe = pierwszy poziom). */
  priceTiers?: PriceTier[];
  /** Nazwa pierwszego poziomu (cen bazowych), np. „Early bird". */
  baseTierName?: string | Record<string, string>;
}

const TIER_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Poziomy cen z poprawną datą, posortowane rosnąco. */
export function sortedTiers(config: PricingConfig | null | undefined): PriceTier[] {
  return [...(config?.priceTiers ?? [])].filter((t) => t && TIER_DATE.test(String(t.from))).sort((a, b) => a.from.localeCompare(b.from));
}

/** Poziom obowiązujący w danym dniu (`YYYY-MM-DD`) albo null = ceny bazowe. */
export function activeTier(config: PricingConfig | null | undefined, date: string = warsawDate()): PriceTier | null {
  let hit: PriceTier | null = null;
  for (const t of sortedTiers(config)) if (t.from <= date) hit = t;
  return hit;
}

/**
 * Cennik obowiązujący w danym dniu: ceny bazowe z nadpisanymi kwotami aktywnego poziomu.
 * Używać WSZĘDZIE przed `computePrice` — z datą zapisu zgłoszenia (cena „zamrożona")
 * albo z dzisiejszą datą (nowe zgłoszenie).
 */
export function pricingAt<T extends PricingConfig | null | undefined>(config: T, date: string = warsawDate()): T {
  const tier = activeTier(config, date);
  if (!config || !tier) return config;
  const n = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
  return {
    ...config,
    mealsFee: n(tier.mealsFee, config.mealsFee),
    formationFee: n(tier.formationFee, config.formationFee),
    ...(typeof tier.overnightMealsFee === 'number' ? { overnightMealsFee: n(tier.overnightMealsFee, config.overnightMealsFee ?? 0) } : {}),
    rooms: config.rooms.map((r) => ({ ...r, perPerson: n(tier.rooms?.[String(r.id)], r.perPerson) })),
  };
}

export interface PriceLevelInfo {
  id: string;
  name: string | Record<string, string> | undefined;
  /** pierwszy dzień (null = od początku zapisów) */
  from: string | null;
  /** ostatni dzień (null = do końca zapisów) */
  until: string | null;
  /** cena „od": najtańsze miejsce liczone za osobę + wyżywienie + opłata formacyjna, za cały pobyt */
  fromPrice: number;
  active: boolean;
}

/** Lista poziomów cen do pokazania gościom (pusta, gdy event ma tylko ceny bazowe). */
export function priceLevels(config: PricingConfig | null | undefined, date: string = warsawDate()): PriceLevelInfo[] {
  const tiers = sortedTiers(config);
  if (!config || tiers.length === 0) return [];
  const current = activeTier(config, date);
  const fromPrice = (cfg: PricingConfig) => {
    const perPerson = cfg.rooms.filter((r) => r.priceUnit !== 'room').map((r) => r.perPerson * cfg.nights);
    const stay = perPerson.length ? Math.min(...perPerson) : 0;
    return Math.round((stay + cfg.mealsFee + cfg.formationFee + (cfg.overnightMealsFee ?? 0) * cfg.nights) * 100) / 100;
  };
  const base: PricingConfig = { ...config, priceTiers: [] };
  const out: PriceLevelInfo[] = [
    { id: 'base', name: config.baseTierName, from: null, until: addDays(tiers[0].from, -1), fromPrice: fromPrice(base), active: !current },
  ];
  tiers.forEach((t, i) => {
    out.push({
      id: t.id,
      name: t.name,
      from: t.from,
      until: tiers[i + 1] ? addDays(tiers[i + 1].from, -1) : null,
      fromPrice: fromPrice(pricingAt(config, t.from)),
      active: current?.id === t.id,
    });
  });
  return out;
}

/** Proponowane kwoty darowizny per waluta (ostatnia opcja w formularzu to „dowolna kwota”). */
export const DONATION_PRESETS: Record<string, number[]> = {
  PLN: [50, 100, 200],
  EUR: [10, 25, 50],
  USD: [10, 25, 50],
};

/** Górny limit darowizny w jednym zgłoszeniu (ochrona przed literówką). */
export const DONATION_MAX = 100000;

/** Kwota darowizny z dowolnego wejścia: liczba >= 0, do 2 miejsc po przecinku, z limitem. */
export function cleanDonation(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(DONATION_MAX, Math.round(n * 100) / 100);
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
  /**
   * Dobrowolna darowizna na dofinansowanie pobytu innych (kwota w walucie eventu).
   * Liczona tylko, gdy event ma `donationEnabled`; doliczana PO rabatach i ręcznej korekcie.
   */
  donation?: number;
  /** Ręczna korekta ceny zgłoszenia przez admina (zapisywana w `Registration.optionsJson`). */
  adjustment?: PriceAdjustment;
}

/**
 * Ręczna korekta ceny (panel ▸ Edytuj zgłoszenie). Kolejność: cena wg cennika → kod rabatowy →
 * rabat % → rabat kwotowy. `overrideTotal` (gdy ustawione) zastępuje wynik — np. ustalona z gościem kwota.
 */
export interface PriceAdjustment {
  /** rabat w % od kwoty po kodzie rabatowym (0–100) */
  discountPct?: number;
  /** rabat kwotowy (w walucie eventu) */
  discountAmount?: number;
  /** kwota końcowa wpisana ręcznie (zastępuje wyliczenie) */
  overrideTotal?: number;
  /** powód / notatka dla organizatora */
  note?: string;
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
  /** ręczna korekta admina: o ile zmieniła kwotę (>= 0 = obniżka; ujemna, gdy kwota ręczna jest wyższa) */
  manualAdjustment?: number;
  /** kwota końcowa wpisana ręcznie przez admina */
  overridden?: boolean;
  /** dobrowolna darowizna doliczona do kwoty (nie podlega rabatom ani ręcznej korekcie) */
  donation?: number;
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
  return ageBracketFor(p, brackets)?.multiplier ?? 1;
}

/** Próg wiekowy dziecka (pierwszy z `ltAge > wiek`) albo null (dorosły / brak progu). */
export function ageBracketFor(p: PricedParticipant, brackets: AgeBracket[]): AgeBracket | null {
  if (p.type === 'child') {
    for (const b of brackets) {
      if (p.age < b.ltAge) return b;
    }
  }
  return null;
}

/**
 * Części ceny osoby zależne od wieku:
 *  - `stay` — mnożnik noclegu (pokój za osobę + posiłki nocujących),
 *  - `formation` — opłata formacyjna po zniżce,
 *  - `dayMeals` — mnożnik wyżywienia dziennego.
 */
function personFactors(p: PricedParticipant, config: PricingConfig): { stay: number; formation: number; dayMeals: number; mealsOff: number } {
  const b = ageBracketFor(p, config.childBrackets);
  const stay = b ? b.multiplier : 1;
  const mealsOff = Math.max(0, Number(b?.mealsDiscountAmount) || 0);
  if (b && typeof b.eventMultiplier === 'number') {
    const meals = typeof b.mealsMultiplier === 'number' ? b.mealsMultiplier : b.eventMultiplier;
    return { stay, formation: config.formationFee * b.eventMultiplier, dayMeals: meals, mealsOff };
  }
  // Dotychczasowe zasady: próg „gratis" (mnożnik 0) zeruje całą cenę osoby.
  return { stay, formation: stay === 0 ? 0 : config.formationFee, dayMeals: stay, mealsOff };
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
      const f = personFactors(p, config);
      const m = f.stay;
      const formation = f.formation;
      // Cena za pokój: stała za pokój i noc, dzielona po równo (bez mnożnika wieku).
      const accommodation = perRoom
        ? (occupants > 0 ? (room.perPerson * config.nights) / occupants : 0)
        : room.perPerson * config.nights * m;
      const meals = Math.max(0, config.mealsFee * f.dayMeals - f.mealsOff) + overnightMeals * m;
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
    const f = personFactors(p, config);
    const m = f.stay;
    const formation = f.formation;
    const meals = Math.max(0, config.mealsFee * f.dayMeals - f.mealsOff);
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

  // Ręczna korekta admina (rabat %, rabat kwotowy albo kwota końcowa).
  const afterCode = subtotal - discount;
  const adj = input.options?.adjustment;
  let total = afterCode;
  if (adj) {
    const pct = Math.min(100, Math.max(0, Number(adj.discountPct) || 0));
    total = total - Math.round((total * pct) / 100) - Math.max(0, Number(adj.discountAmount) || 0);
    total = Math.max(0, total);
    if (typeof adj.overrideTotal === 'number' && Number.isFinite(adj.overrideTotal) && adj.overrideTotal >= 0) {
      total = Math.round(adj.overrideTotal * 100) / 100;
    }
  }

  // Darowizna: zawsze osobno, na końcu — rabaty i kwota ręczna admina jej nie zmieniają.
  const donation = config.donationEnabled ? cleanDonation(input.options?.donation) : 0;
  total += donation;

  return {
    formation,
    accommodation,
    meals,
    options: opts,
    discount,
    ...(adj ? { manualAdjustment: afterCode - (total - donation), overridden: typeof adj.overrideTotal === 'number' } : {}),
    ...(donation > 0 ? { donation } : {}),
    subtotal,
    total,
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
  // Brak tłumaczenia: gość PL → wersja PL; każdy inny język → najpierw EN (KO/ZH/IT łatwiej zrozumie angielski).
  if (l === 'pl') return name.pl ?? name.en ?? name.it ?? Object.values(name)[0] ?? '';
  return name[l] ?? name.en ?? name.pl ?? Object.values(name)[0] ?? '';
}

/** Podział kwoty przy zaliczce u lidera: zaliczka (zaokrąglona do 1) + reszta na miejscu. */
export function leaderDepositSplit(total: number, config?: Pick<PricingConfig, 'leaderDepositPct'> | null): { pct: number; deposit: number; rest: number } {
  const raw = Number(config?.leaderDepositPct ?? 50);
  const pct = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.round(raw))) : 50;
  const deposit = Math.round((total * pct) / 100);
  return { pct, deposit, rest: Math.max(0, total - deposit) };
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
  const locale = l === 'en' ? 'en-GB' : l === 'it' ? 'it-IT' : l === 'ko' ? 'ko-KR' : l === 'zh' ? 'zh-CN' : 'pl-PL';
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
