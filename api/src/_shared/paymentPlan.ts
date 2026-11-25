/**
 * Harmonogram wpłat eventu (zadatek + raty z terminami) — czyste funkcje wspólne dla
 * lejka, panelu, maili i API. Konfiguracja siedzi w `PricingConfig.paymentPlan`.
 *
 * Zasady:
 *  - rata „przy rejestracji" (`due: 'registration'`) jest wymagalna w dniu zapisu,
 *  - rata z datą (`YYYY-MM-DD`) jest wymagalna do końca tego dnia; jeśli ktoś zapisuje się
 *    po tej dacie, rata jest wymagalna od razu (razem z zadatkiem),
 *  - procenty się sumują; ostatnia rata zawsze domyka do 100%,
 *  - typ zakwaterowania może podnieść wymagany zadatek (`RoomTypeDef.depositPct`, np. 50%
 *    za pokój na wyłączność) — kolejne progi nigdy nie są niższe niż ten zadatek.
 */

export interface PaymentInstallment {
  /** stały identyfikator raty (do deduplikacji przypomnień) */
  id: string;
  /** nazwa pokazywana gościowi, np. „Zadatek", „II rata", „Dopłata" */
  label?: string;
  /** część kwoty zgłoszenia w % (ostatnia rata = reszta do 100%, jej `pct` jest ignorowane) */
  pct: number;
  /** 'registration' = przy zapisie; albo termin `YYYY-MM-DD` */
  due: 'registration' | string;
}

export interface PaymentPlan {
  enabled: boolean;
  installments: PaymentInstallment[];
  /** przypomnienie mailowe: ile dni przed terminem (0 = wyłączone). Domyślnie 3. */
  remindBeforeDays?: number;
  /** ponaglenie mailowe: ile dni po terminie (0 = wyłączone). Domyślnie 7. */
  remindAfterDays?: number;
}

export interface ScheduleItem {
  id: string;
  label: string;
  /** termin wymagalności `YYYY-MM-DD` */
  dueDate: string;
  /** czy termin wynika z daty zapisu (rata „przy rejestracji" albo termin, który już minął) */
  atRegistration: boolean;
  /** łączny % wymagany do tego terminu */
  cumulativePct: number;
  /** łączna kwota wymagana do tego terminu */
  cumulativeAmount: number;
  /** kwota samej raty */
  amount: number;
}

export interface PaymentState {
  total: number;
  paid: number;
  remaining: number;
  /** ile powinno już być wpłacone (terminy, które nadeszły) minus wpłaty; >= 0 */
  dueNow: number;
  /** z tego po terminie (termin minął przed dzisiejszym dniem) */
  overdue: number;
  /** najbliższa nieopłacona rata */
  nextDue: { id: string; label: string; dueDate: string; amount: number } | null;
  /** zadatek (pierwsza rata) pokryty */
  depositPaid: boolean;
  fullyPaid: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clampPct = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Data `YYYY-MM-DD` w strefie Europe/Warsaw (termin = dzień kalendarzowy organizatora). */
export function warsawDate(d: Date | string | number = new Date()): string {
  const dt = d instanceof Date ? d : new Date(d);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(dt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Przesunięcie daty `YYYY-MM-DD` o liczbę dni (może być ujemna). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Czy plan jest włączony i ma co najmniej jedną ratę. */
export function hasPaymentPlan(plan: PaymentPlan | null | undefined): plan is PaymentPlan {
  return !!plan?.enabled && Array.isArray(plan.installments) && plan.installments.length > 0;
}

/** Porządkuje plan z formularza: poprawne daty, % w zakresie, raty „przy rejestracji" na początku, potem wg terminu. */
export function normalizePaymentPlan(plan: PaymentPlan | null | undefined): PaymentPlan | null {
  if (!plan || !Array.isArray(plan.installments)) return null;
  const items = plan.installments
    .map((i, idx) => ({
      id: String(i.id || `r${idx + 1}`),
      ...(i.label && String(i.label).trim() ? { label: String(i.label).trim().slice(0, 60) } : {}),
      pct: clampPct(i.pct),
      due: i.due === 'registration' || !ISO_DATE.test(String(i.due)) ? ('registration' as const) : String(i.due),
    }))
    .sort((a, b) => (a.due === 'registration' ? (b.due === 'registration' ? 0 : -1) : b.due === 'registration' ? 1 : a.due.localeCompare(b.due)));
  const days = (v: unknown, dflt: number) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n >= 0 && n <= 60 ? n : dflt;
  };
  return {
    enabled: !!plan.enabled && items.length > 0,
    installments: items,
    remindBeforeDays: days(plan.remindBeforeDays, 3),
    remindAfterDays: days(plan.remindAfterDays, 7),
  };
}

/**
 * Harmonogram konkretnego zgłoszenia.
 * @param total      kwota zgłoszenia (z darowizną)
 * @param registeredOn data zapisu `YYYY-MM-DD` (Europe/Warsaw)
 * @param minDepositPct najwyższy zadatek wymagany przez wybrane typy zakwaterowania (0 = brak)
 */
export function buildSchedule(total: number, plan: PaymentPlan | null | undefined, registeredOn: string, minDepositPct = 0): ScheduleItem[] {
  const norm = normalizePaymentPlan(plan);
  if (!norm || !norm.enabled || !(total > 0)) return [];
  const floor = clampPct(minDepositPct);
  const out: ScheduleItem[] = [];
  let cumPct = 0;
  norm.installments.forEach((inst, idx) => {
    const last = idx === norm.installments.length - 1;
    cumPct = last ? 100 : Math.min(100, cumPct + inst.pct);
    const atRegistration = inst.due === 'registration' || inst.due <= registeredOn;
    out.push({
      id: inst.id,
      label: inst.label ?? '',
      dueDate: atRegistration ? registeredOn : inst.due,
      atRegistration,
      cumulativePct: Math.max(cumPct, floor),
      cumulativeAmount: 0,
      amount: 0,
    });
  });
  // Progi niemalejące w czasie; raty wymagalne przy zapisie sklejają się w jeden próg.
  out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  let prevPct = 0;
  let prevAmt = 0;
  for (const it of out) {
    it.cumulativePct = Math.max(it.cumulativePct, prevPct);
    it.cumulativeAmount = it.cumulativePct >= 100 ? round2(total) : round2((total * it.cumulativePct) / 100);
    it.amount = round2(it.cumulativeAmount - prevAmt);
    prevPct = it.cumulativePct;
    prevAmt = it.cumulativeAmount;
  }
  // Raty z tym samym terminem (zapis po terminie raty) → jedna pozycja z łączną kwotą.
  const merged: ScheduleItem[] = [];
  for (const it of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.dueDate === it.dueDate) {
      prev.cumulativePct = it.cumulativePct;
      prev.cumulativeAmount = it.cumulativeAmount;
      prev.amount = round2(prev.amount + it.amount);
      prev.atRegistration = prev.atRegistration || it.atRegistration;
    } else {
      merged.push({ ...it });
    }
  }
  return merged.filter((it, i) => it.amount > 0 || i === merged.length - 1);
}

/** Stan rozliczenia zgłoszenia względem harmonogramu na dany dzień. */
export function paymentState(total: number, paid: number, schedule: ScheduleItem[], today: string = warsawDate()): PaymentState {
  const t = round2(Math.max(0, total));
  const p = round2(Math.max(0, paid));
  const remaining = round2(Math.max(0, t - p));
  const fullyPaid = t > 0 ? p >= t - 0.005 : true;
  if (schedule.length === 0) {
    return { total: t, paid: p, remaining, dueNow: remaining, overdue: 0, nextDue: null, depositPaid: fullyPaid, fullyPaid };
  }
  let dueCum = 0;
  let overdueCum = 0;
  let nextDue: PaymentState['nextDue'] = null;
  for (const it of schedule) {
    if (it.dueDate <= today) dueCum = it.cumulativeAmount;
    if (it.dueDate < today) overdueCum = it.cumulativeAmount;
    if (!nextDue && it.cumulativeAmount > p + 0.005) {
      nextDue = { id: it.id, label: it.label, dueDate: it.dueDate, amount: round2(it.cumulativeAmount - p) };
    }
  }
  return {
    total: t,
    paid: p,
    remaining,
    dueNow: round2(Math.max(0, dueCum - p)),
    overdue: round2(Math.max(0, overdueCum - p)),
    nextDue,
    depositPaid: p >= schedule[0].cumulativeAmount - 0.005,
    fullyPaid,
  };
}

/** Najwyższy zadatek wymagany przez typy zakwaterowania w zgłoszeniu (`RoomTypeDef.depositPct`). */
export function minDepositPctFor(rooms: Array<{ id: string; depositPct?: number }> | null | undefined, roomIds: string[]): number {
  let max = 0;
  for (const id of roomIds) {
    const def = (rooms ?? []).find((r) => String(r.id) === String(id));
    const v = clampPct(def?.depositPct);
    if (v > max) max = v;
  }
  return max;
}
