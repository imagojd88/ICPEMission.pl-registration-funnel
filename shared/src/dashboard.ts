/**
 * Dashboard eventu w panelu admina — czyste funkcje wspólne dla API (liczy) i panelu (rysuje).
 *
 *  - `dailySeries`   — zapisy dzień po dniu (zgłoszenia i osoby) + narastająco,
 *  - `paceToTarget`  — ile osób dziennie brakuje, żeby dojść do celu przed zamknięciem zapisów,
 *  - `buildAlerts`   — krótka lista „co dziś wymaga uwagi”, tylko gdy coś jest nie tak.
 *
 * Daty to dni kalendarzowe `YYYY-MM-DD` w strefie Europe/Warsaw (jak terminy rat).
 */

// Kopie `warsawDate` / `addDays` z paymentPlan.ts: moduły shared importują między sobą tylko typy
// (testy `node --test` nie rozwiązują importów bez rozszerzenia).
function warsawDate(d: Date | string | number = new Date()): string {
  const dt = d instanceof Date ? d : new Date(d);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(dt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface DailyInputRegistration {
  /** chwila utworzenia zgłoszenia (ISO albo Date) */
  createdAt: string | Date;
  /** liczba osób w zgłoszeniu (min. 1) */
  people: number;
  /** status wewnętrzny (CANCELLED / WAITLIST nie trzymają miejsca) */
  status: string;
}

export interface DailyPoint {
  date: string;
  /** nowe zgłoszenia tego dnia, które dziś nadal trzymają miejsce */
  registrations: number;
  people: number;
  /** narastająco (osoby) */
  cumulativePeople: number;
  cumulativeRegistrations: number;
}

/** Zgłoszenie trzyma miejsce (licznik miejsc, cel frekwencji): wszystko poza anulowanym i listą rezerwową. */
export function holdsSpot(status: string | null | undefined): boolean {
  return status !== 'CANCELLED' && status !== 'WAITLIST';
}

/**
 * Zapisy dzień po dniu od `from` do `to` (włącznie), z dniami bez zapisów jako zera.
 * Liczy tylko zgłoszenia, które DZIŚ trzymają miejsce — anulowane znikają z dnia, w którym powstały,
 * więc linia narastająca kończy się na aktualnej liczbie osób.
 * Zgłoszenia sprzed `from` wchodzą do punktu startowego narastająco.
 */
export function dailySeries(regs: DailyInputRegistration[], from: string, to: string): DailyPoint[] {
  if (!from || !to || from > to) return [];
  const byDay = new Map<string, { registrations: number; people: number }>();
  let baseRegs = 0;
  let basePeople = 0;
  for (const r of regs) {
    if (!holdsSpot(r.status)) continue;
    const d = warsawDate(r.createdAt);
    const people = Math.max(1, Math.trunc(Number(r.people) || 0));
    if (d < from) {
      baseRegs += 1;
      basePeople += people;
      continue;
    }
    if (d > to) continue;
    const cur = byDay.get(d) ?? { registrations: 0, people: 0 };
    cur.registrations += 1;
    cur.people += people;
    byDay.set(d, cur);
  }
  const out: DailyPoint[] = [];
  let cumP = basePeople;
  let cumR = baseRegs;
  // Bezpiecznik: najwyżej ~3 lata dni (event zakładany z dużym wyprzedzeniem nie zawiesi pętli).
  for (let d = from, i = 0; d <= to && i < 1100; d = addDays(d, 1), i++) {
    const v = byDay.get(d) ?? { registrations: 0, people: 0 };
    cumP += v.people;
    cumR += v.registrations;
    out.push({ date: d, registrations: v.registrations, people: v.people, cumulativePeople: cumP, cumulativeRegistrations: cumR });
  }
  return out;
}

export interface PaceToTarget {
  target: number;
  current: number;
  missing: number;
  /** dni zapisów, które zostały (od dziś do dnia zamknięcia włącznie); 0 = zapisy zamknięte */
  daysLeft: number;
  /** ile osób dziennie potrzeba do celu (zaokrąglone w górę do 0,1) */
  neededPerDay: number;
  /** średnio osób dziennie w ostatnich `window` dniach */
  recentPerDay: number;
  /** prognoza na dzień zamknięcia przy obecnym tempie */
  projected: number;
  /** 'reached' | 'on_track' | 'behind' | 'closed' | 'not_open' */
  status: 'reached' | 'on_track' | 'behind' | 'closed' | 'not_open';
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Tempo względem celu (np. minimum 170 osób, za które ośrodek i tak każe zapłacić).
 * `recentWindow` — z ilu ostatnich dni liczyć bieżące tempo (domyślnie 14).
 * Przed otwarciem zapisów tempo liczymy dla całego okresu zapisów (status 'not_open').
 */
export function paceToTarget(
  series: DailyPoint[],
  target: number,
  opts: { today?: string; opensOn: string; closesOn: string; recentWindow?: number },
): PaceToTarget | null {
  const t = Math.trunc(Number(target) || 0);
  if (t <= 0) return null;
  const today = opts.today ?? warsawDate();
  const current = series.length ? series[series.length - 1].cumulativePeople : 0;
  const missing = Math.max(0, t - current);
  const win = Math.max(1, opts.recentWindow ?? 14);
  const notOpen = today < opts.opensOn;
  const start = notOpen ? opts.opensOn : today;
  const daysLeft = opts.closesOn < start ? 0 : daysBetween(start, opts.closesOn) + 1;
  // Tempo z ostatnich dni zapisów (nie licząc dni przed otwarciem).
  const recent = series.filter((p) => p.date <= today && p.date >= opts.opensOn).slice(-win);
  const recentPerDay = recent.length ? round1(recent.reduce((s, p) => s + p.people, 0) / recent.length) : 0;
  const neededPerDay = daysLeft > 0 ? Math.ceil((missing / daysLeft) * 10) / 10 : missing > 0 ? Infinity : 0;
  const projected = Math.round(current + recentPerDay * Math.max(0, notOpen ? 0 : daysLeft - 1));
  let status: PaceToTarget['status'];
  if (current >= t) status = 'reached';
  else if (notOpen) status = 'not_open';
  else if (daysLeft <= 0) status = 'closed';
  else status = projected >= t ? 'on_track' : 'behind';
  return { target: t, current, missing, daysLeft, neededPerDay, recentPerDay, projected, status };
}

/** Liczba dni od `a` do `b` (b − a); obie daty `YYYY-MM-DD`. */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export type AlertLevel = 'error' | 'warn' | 'info';

export interface DashboardAlert {
  level: AlertLevel;
  code: string;
  text: string;
  count: number;
  /** ekran panelu, który rozwiązuje sprawę */
  screen?: 'registrations' | 'payments' | 'accommodation' | 'events';
}

export interface AlertInput {
  /** zgłoszenia z zaległą ratą (termin minął) i łączna kwota */
  overdueCount: number;
  overdueAmount: number;
  currency: string;
  /** zgłoszenia oczekujące na przelew bez żadnej wpłaty dłużej niż 7 dni */
  staleAwaitingTransfer: number;
  /** zgłoszenia z wybranym noclegiem bez przydzielonego pokoju (gdy do eventu ≤ 30 dni) */
  unassignedRooms: number;
  daysToEvent: number;
  /** zgłoszenia na liście rezerwowej (status WAITLIST) */
  waitlistRegistrations: number;
  /** porzucone formularze (lead bez zgłoszenia, ostatnia aktywność > 24 h) */
  abandonedLeads: number;
  /** typy pokoi / dodatki wyczerpane (nazwy) */
  soldOut: string[];
  /** typy pokoi / dodatki z ≤ 2 wolnymi (nazwy z liczbą) */
  almostSoldOut: string[];
  /** osoby ponad limit miejsc eventu */
  overCapacity: number;
  /** tempo do celu frekwencji */
  pace: PaceToTarget | null;
  /** zapisy otwarte (do komunikatów o tempie) */
  registrationOpen: boolean;
}

const plural = (n: number, one: string, few: string, many: string) => {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n === 1) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
};

const money = (n: number, cur: string) =>
  `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(Math.round(n))} ${cur === 'PLN' ? 'zł' : cur}`;

/** Lista alarmów (najważniejsze pierwsze). Pusta = nic nie wymaga uwagi. */
export function buildAlerts(a: AlertInput): DashboardAlert[] {
  const out: DashboardAlert[] = [];
  if (a.overCapacity > 0) {
    out.push({ level: 'error', code: 'over_capacity', count: a.overCapacity, screen: 'registrations',
      text: `Limit miejsc przekroczony o ${a.overCapacity} ${plural(a.overCapacity, 'osobę', 'osoby', 'osób')}` });
  }
  if (a.overdueCount > 0) {
    out.push({ level: 'error', code: 'overdue', count: a.overdueCount, screen: 'payments',
      text: `${a.overdueCount} ${plural(a.overdueCount, 'zgłoszenie ma', 'zgłoszenia mają', 'zgłoszeń ma')} zaległą wpłatę (razem ${money(a.overdueAmount, a.currency)})` });
  }
  if (a.soldOut.length) {
    out.push({ level: 'warn', code: 'sold_out', count: a.soldOut.length, screen: 'events',
      text: `Wyczerpane: ${a.soldOut.join(', ')}` });
  }
  if (a.pace && a.registrationOpen && a.pace.status === 'behind') {
    out.push({ level: 'warn', code: 'pace_behind', count: a.pace.missing,
      text: `Przy obecnym tempie (${a.pace.recentPerDay} os./dzień) będzie ok. ${a.pace.projected} z ${a.pace.target} osób — potrzeba ${fmtPerDay(a.pace.neededPerDay)} os./dzień` });
  }
  if (a.staleAwaitingTransfer > 0) {
    out.push({ level: 'warn', code: 'stale_transfer', count: a.staleAwaitingTransfer, screen: 'payments',
      text: `${a.staleAwaitingTransfer} ${plural(a.staleAwaitingTransfer, 'zgłoszenie czeka', 'zgłoszenia czekają', 'zgłoszeń czeka')} na przelew ponad 7 dni bez żadnej wpłaty` });
  }
  if (a.unassignedRooms > 0 && a.daysToEvent <= 30 && a.daysToEvent >= 0) {
    out.push({ level: 'warn', code: 'unassigned_rooms', count: a.unassignedRooms, screen: 'accommodation',
      text: `${a.unassignedRooms} ${plural(a.unassignedRooms, 'zgłoszenie', 'zgłoszenia', 'zgłoszeń')} z noclegiem bez przydzielonego pokoju (do eventu ${a.daysToEvent} dni)` });
  }
  if (a.almostSoldOut.length) {
    out.push({ level: 'info', code: 'almost_sold_out', count: a.almostSoldOut.length, screen: 'events',
      text: `Na wyczerpaniu: ${a.almostSoldOut.join(', ')}` });
  }
  if (a.waitlistRegistrations > 0) {
    out.push({ level: 'info', code: 'waitlist', count: a.waitlistRegistrations, screen: 'registrations',
      text: `${a.waitlistRegistrations} ${plural(a.waitlistRegistrations, 'zgłoszenie', 'zgłoszenia', 'zgłoszeń')} na liście rezerwowej` });
  }
  if (a.abandonedLeads > 0) {
    out.push({ level: 'info', code: 'abandoned', count: a.abandonedLeads,
      text: `${a.abandonedLeads} ${plural(a.abandonedLeads, 'osoba zaczęła', 'osoby zaczęły', 'osób zaczęło')} formularz i nie ${plural(a.abandonedLeads, 'dokończyła', 'dokończyły', 'dokończyło')} (ponad 24 h)` });
  }
  return out;
}

function fmtPerDay(n: number): string {
  return Number.isFinite(n) ? String(n).replace('.', ',') : '—';
}
