/**
 * „Dodatki z limitem” — konfigurowalne per event (`pricingConfig.addons`), np. dostawka albo
 * łóżeczko turystyczne: ograniczona liczba sztuk na cały event, realizowane w kolejności zamówień.
 *
 * Zgłoszenie trzyma wybór w `optionsJson.addons` ({ id: liczba sztuk }) i chwilę zamówienia
 * w `optionsJson.addonsAt` ({ id: ISO }). Sztuki zajmują zgłoszenia aktywne (bez anulowanych
 * i bez listy rezerwowej). Event bez `addons` działa dokładnie jak dotąd.
 *
 * Plik bez importów wykonywalnych (testy `node --test` na samych .ts).
 */

export type AddonText = string | Record<string, string>;

export interface AddonDef {
  /** stały identyfikator (zapisany w zgłoszeniach) */
  id: string;
  /** nazwa w językach strony */
  name: AddonText;
  /** opis pod nazwą (opcjonalny) */
  desc?: AddonText;
  /** limit sztuk w całym evencie; brak / 0 = bez limitu */
  limit?: number;
  /** ile sztuk może zamówić jedno zgłoszenie (domyślnie 1) */
  maxPerRegistration?: number;
  /** cena za sztukę w walucie eventu (domyślnie 0 = bezpłatnie) */
  price?: number;
  /** widoczny tylko, gdy w zgłoszeniu jest dziecko młodsze niż N lat (brak = zawsze) */
  childUnderAge?: number;
}

export type AddonSelection = Record<string, number>;

export interface AddonPerson {
  type: string; // 'adult' | 'child' | 'ADULT' | 'CHILD'
  age?: number | null;
}

const ADDON_ID = /^[A-Za-z0-9_-]{1,40}$/;
const int = (v: unknown) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Tekst dodatku w danym języku (jak nazwy pokoi: PL → PL; inne języki → EN → PL). */
export function addonLabel(text: AddonText | undefined | null, lng = 'pl'): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  const l = (lng || 'pl').slice(0, 2);
  if (l === 'pl') return text.pl ?? text.en ?? Object.values(text)[0] ?? '';
  return text[l] ?? text.en ?? text.pl ?? Object.values(text)[0] ?? '';
}

/** Poprawne definicje dodatków eventu (z `pricingConfig.addons`); błędne wpisy i powtórzone id pomijane. */
export function eventAddons(config: { addons?: unknown } | null | undefined): AddonDef[] {
  const raw = config?.addons;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AddonDef[] = [];
  for (const a of raw as AddonDef[]) {
    if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !ADDON_ID.test(a.id) || seen.has(a.id)) continue;
    if (!addonLabel(a.name).trim()) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

export const addonLimit = (a: AddonDef): number => int(a.limit);
export const addonMaxPerRegistration = (a: AddonDef): number => int(a.maxPerRegistration) || 1;
export const addonPrice = (a: AddonDef): number => {
  const n = Number(a.price);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

/** Warunek wieku: dodatek widoczny, gdy nie ma warunku albo w zgłoszeniu jest dziecko młodsze niż N lat. */
export function addonVisible(a: AddonDef, people: AddonPerson[] | null | undefined): boolean {
  const under = int(a.childUnderAge);
  if (!under) return true;
  return (people ?? []).some((p) => String(p.type).toLowerCase() === 'child' && (Number(p.age ?? 0) || 0) < under);
}

/** Wybór dodatków z dowolnego wejścia: tylko znane id, liczba całkowita ≥ 1. Niczego nie przycina do limitu. */
export function cleanAddonSelection(raw: unknown, defs: AddonDef[]): AddonSelection {
  const out: AddonSelection = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const known = new Set(defs.map((d) => d.id));
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(id)) continue;
    const q = v === true ? 1 : int(v);
    if (q > 0) out[id] = Math.min(q, 99);
  }
  return out;
}

/** Wybór ograniczony do dodatków widocznych dla tego składu osób (lejek: gość usunął dziecko → łóżeczko znika). */
export function visibleAddonSelection(selection: AddonSelection | null | undefined, defs: AddonDef[], people: AddonPerson[] | null | undefined): AddonSelection {
  const clean = cleanAddonSelection(selection, defs);
  const out: AddonSelection = {};
  for (const d of defs) if (clean[d.id] && addonVisible(d, people)) out[d.id] = clean[d.id];
  return out;
}

/** Zgłoszenie zajmuje sztuki dodatków, gdy jest aktywne: nie anulowane i nie na liście rezerwowej. */
export function addonHoldingStatus(status: string | null | undefined): boolean {
  return status !== 'CANCELLED' && status !== 'WAITLIST';
}

/** Ile sztuk każdego dodatku zajmują zgłoszenia (anulowane i lista rezerwowa pominięte). */
export function addonUsage(regs: Array<{ status?: string | null; options?: unknown }> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of regs ?? []) {
    if (!r || !addonHoldingStatus(r.status)) continue;
    const sel = (r.options as { addons?: unknown } | null | undefined)?.addons;
    if (!sel || typeof sel !== 'object' || Array.isArray(sel)) continue;
    for (const [id, v] of Object.entries(sel as Record<string, unknown>)) {
      const q = v === true ? 1 : int(v);
      if (q > 0) out[id] = (out[id] ?? 0) + q;
    }
  }
  return out;
}

/** Wolne sztuki per dodatek — tylko dodatki z limitem (brak klucza = bez limitu). */
export function addonAvailability(defs: AddonDef[], used: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of defs) {
    const limit = addonLimit(d);
    if (limit > 0) out[d.id] = Math.max(0, limit - (used[d.id] ?? 0));
  }
  return out;
}

export type AddonProblemCode = 'MAX_PER_REGISTRATION' | 'NOT_ELIGIBLE' | 'SOLD_OUT';
export interface AddonProblem {
  addonId: string;
  code: AddonProblemCode;
  requested: number;
  /** MAX_PER_REGISTRATION: dozwolone maksimum; SOLD_OUT: ile zostało */
  allowed: number;
}

/**
 * Walidacja wyboru: maksimum na zgłoszenie, warunek wieku, limit sztuk w evencie.
 * `available` = wolne sztuki BEZ tego zgłoszenia (jego własne sztuki wracają do puli przed liczeniem).
 * `ignoreLimit` — admin świadomie przekracza limit (pozostałe reguły też go nie wiążą: `adminOverride`).
 */
export function validateAddonSelection(
  defs: AddonDef[],
  selection: AddonSelection,
  people: AddonPerson[] | null | undefined,
  available: Record<string, number>,
  opts: { ignoreLimit?: boolean; adminOverride?: boolean } = {},
): AddonProblem[] {
  const out: AddonProblem[] = [];
  for (const d of defs) {
    const q = int(selection?.[d.id]);
    if (!q) continue;
    if (!opts.adminOverride) {
      if (!addonVisible(d, people)) {
        out.push({ addonId: d.id, code: 'NOT_ELIGIBLE', requested: q, allowed: 0 });
        continue;
      }
      const max = addonMaxPerRegistration(d);
      if (q > max) {
        out.push({ addonId: d.id, code: 'MAX_PER_REGISTRATION', requested: q, allowed: max });
        continue;
      }
    }
    if (!opts.ignoreLimit && d.id in available && q > available[d.id]) {
      out.push({ addonId: d.id, code: 'SOLD_OUT', requested: q, allowed: available[d.id] });
    }
  }
  return out;
}

/** Łączna cena dodatków (cena × sztuki). */
export function addonsPrice(defs: AddonDef[], selection: AddonSelection | null | undefined): number {
  let sum = 0;
  for (const d of defs) sum += addonPrice(d) * int(selection?.[d.id]);
  return Math.round(sum * 100) / 100;
}

/** Wybrane dodatki jako lista (nazwa w języku, sztuki, cena łączna) — do podsumowań, maili, eksportu. */
export function addonLines(defs: AddonDef[], selection: unknown, lng = 'pl'): Array<{ id: string; name: string; qty: number; price: number }> {
  const sel = (selection && typeof selection === 'object' && !Array.isArray(selection) ? selection : {}) as Record<string, unknown>;
  const out: Array<{ id: string; name: string; qty: number; price: number }> = [];
  const known = new Set<string>();
  for (const d of defs) {
    known.add(d.id);
    const q = sel[d.id] === true ? 1 : int(sel[d.id]);
    if (q > 0) out.push({ id: d.id, name: addonLabel(d.name, lng), qty: q, price: Math.round(addonPrice(d) * q * 100) / 100 });
  }
  // Dodatek usunięty z konfiguracji eventu po zamówieniu — pokazujemy po id, żeby nie zniknął z oczu.
  for (const [id, v] of Object.entries(sel)) {
    if (known.has(id)) continue;
    const q = v === true ? 1 : int(v);
    if (q > 0) out.push({ id, name: id, qty: q, price: 0 });
  }
  return out;
}

/** „Dostawka, Łóżeczko turystyczne × 2” — jedna linia tekstu. */
export function addonsText(defs: AddonDef[], selection: unknown, lng = 'pl'): string {
  return addonLines(defs, selection, lng).map((l) => (l.qty > 1 ? `${l.name} × ${l.qty}` : l.name)).join(', ');
}

/**
 * Znaczniki czasu zamówień po zmianie wyboru: dodatek, który już był, zachowuje swój czas
 * (kolejność zamówień się nie zmienia); nowy dostaje `now`; odznaczony znika.
 */
export function nextAddonTimes(selection: AddonSelection, previousTimes: unknown, now: string): Record<string, string> {
  const prev = (previousTimes && typeof previousTimes === 'object' && !Array.isArray(previousTimes) ? previousTimes : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const id of Object.keys(selection)) out[id] = typeof prev[id] === 'string' && prev[id] ? (prev[id] as string) : now;
  return out;
}

export interface AddonOrder {
  registrationId: string;
  registrant: string;
  status: string;
  qty: number;
  orderedAt: string;
  /** czy mieści się w limicie (kolejność zamówień); false = ponad limit */
  withinLimit: boolean;
  /** zgłoszenie nie zajmuje sztuk (anulowane / lista rezerwowa) */
  inactive: boolean;
}

export interface AddonReportRow {
  id: string;
  name: string;
  limit: number;
  ordered: number;
  left: number | null;
  orders: AddonOrder[];
}

/**
 * Tabela „Dodatki” dla panelu: zamówiono / limit i lista zgłoszeń w kolejności zamówienia
 * (`options.addonsAt[id]`, a gdy go brak — data zgłoszenia).
 */
export function addonReport(
  defs: AddonDef[],
  regs: Array<{ id: string; status: string; registrant?: string; createdAt?: string; options?: unknown }>,
): AddonReportRow[] {
  return defs.map((d) => {
    const limit = addonLimit(d);
    const orders: AddonOrder[] = [];
    for (const r of regs ?? []) {
      const o = (r.options ?? {}) as { addons?: Record<string, unknown>; addonsAt?: Record<string, unknown> };
      const v = o.addons?.[d.id];
      const qty = v === true ? 1 : int(v);
      if (!qty) continue;
      const at = o.addonsAt?.[d.id];
      orders.push({
        registrationId: r.id,
        registrant: r.registrant ?? '',
        status: r.status,
        qty,
        orderedAt: typeof at === 'string' && at ? at : r.createdAt ?? '',
        withinLimit: true,
        inactive: !addonHoldingStatus(r.status),
      });
    }
    orders.sort((a, b) => Number(a.inactive) - Number(b.inactive) || a.orderedAt.localeCompare(b.orderedAt) || a.registrationId.localeCompare(b.registrationId));
    let running = 0;
    for (const o of orders) {
      if (o.inactive) { o.withinLimit = false; continue; }
      running += o.qty;
      o.withinLimit = limit === 0 || running <= limit;
    }
    return { id: d.id, name: addonLabel(d.name, 'pl'), limit, ordered: running, left: limit > 0 ? Math.max(0, limit - running) : null, orders };
  });
}

/** Komunikat dla gościa, gdy limit wyczerpał się między wyświetleniem a wysłaniem (w jego języku). */
export function addonProblemMessage(p: AddonProblem, defs: AddonDef[], lng = 'pl'): string {
  const l = (lng || 'pl').slice(0, 2);
  const name = addonLabel(defs.find((d) => d.id === p.addonId)?.name ?? p.addonId, l);
  const T: Record<string, Record<AddonProblemCode | 'LEFT', string>> = {
    pl: {
      SOLD_OUT: `Dodatek „${name}” nie jest już dostępny — wszystkie sztuki zostały zamówione. Odznacz go w kroku „Opcje” i wyślij zgłoszenie ponownie.`,
      LEFT: `Dodatek „${name}”: zostało tylko ${p.allowed} szt. (wybrano ${p.requested}). Zmniejsz liczbę w kroku „Opcje” i wyślij zgłoszenie ponownie.`,
      MAX_PER_REGISTRATION: `Dodatek „${name}”: najwyżej ${p.allowed} szt. na zgłoszenie.`,
      NOT_ELIGIBLE: `Dodatek „${name}” nie jest dostępny dla tego składu osób.`,
    },
    en: {
      SOLD_OUT: `The extra “${name}” is no longer available — all units have been taken. Please untick it in the “Options” step and submit again.`,
      LEFT: `The extra “${name}”: only ${p.allowed} left (you selected ${p.requested}). Please reduce the number in the “Options” step and submit again.`,
      MAX_PER_REGISTRATION: `The extra “${name}”: at most ${p.allowed} per registration.`,
      NOT_ELIGIBLE: `The extra “${name}” is not available for this group of participants.`,
    },
    it: {
      SOLD_OUT: `L’extra “${name}” non è più disponibile: tutte le unità sono state richieste. Deselezionalo nel passaggio “Opzioni” e invia di nuovo.`,
      LEFT: `L’extra “${name}”: ne restano solo ${p.allowed} (selezionati ${p.requested}). Riduci il numero nel passaggio “Opzioni” e invia di nuovo.`,
      MAX_PER_REGISTRATION: `L’extra “${name}”: al massimo ${p.allowed} per iscrizione.`,
      NOT_ELIGIBLE: `L’extra “${name}” non è disponibile per questo gruppo di partecipanti.`,
    },
    ko: {
      SOLD_OUT: `추가 항목 “${name}”은(는) 더 이상 신청할 수 없습니다(모두 마감). “옵션” 단계에서 선택을 해제한 뒤 다시 제출해 주세요.`,
      LEFT: `추가 항목 “${name}”: ${p.allowed}개만 남았습니다(선택: ${p.requested}개). “옵션” 단계에서 수량을 줄인 뒤 다시 제출해 주세요.`,
      MAX_PER_REGISTRATION: `추가 항목 “${name}”: 신청서당 최대 ${p.allowed}개입니다.`,
      NOT_ELIGIBLE: `추가 항목 “${name}”은(는) 현재 참가자 구성으로는 신청할 수 없습니다.`,
    },
    zh: {
      SOLD_OUT: `附加项目“${name}”已无名额（全部已被预订）。请在“选项”步骤中取消勾选后重新提交。`,
      LEFT: `附加项目“${name}”仅剩 ${p.allowed} 个（您选择了 ${p.requested} 个）。请在“选项”步骤中减少数量后重新提交。`,
      MAX_PER_REGISTRATION: `附加项目“${name}”：每份报名最多 ${p.allowed} 个。`,
      NOT_ELIGIBLE: `附加项目“${name}”不适用于当前的参加者组合。`,
    },
  };
  const t = T[l] ?? T.en;
  if (p.code === 'SOLD_OUT' && p.allowed > 0) return t.LEFT;
  return t[p.code];
}

/** Gotowe szablony do wstawienia jednym kliknięciem w „Edytuj event ▸ Dodatki z limitem”. */
export const ADDON_TEMPLATES: Array<AddonDef & { templateLabel: string }> = [
  {
    templateLabel: 'Dostawka (dodatkowe łóżko)',
    id: 'extra_bed',
    name: {
      pl: 'Dostawka (dodatkowe łóżko)',
      en: 'Extra bed',
      it: 'Letto aggiunto',
      ko: '보조 침대(추가 침대)',
      zh: '加床',
    },
    desc: {
      pl: 'Dostawki są dostępne wyłącznie w pokojach hotelowych, a ich liczba jest ograniczona. Zamówienie jest prośbą — organizator potwierdzi je po przydziale pokoi.',
      en: 'Extra beds are available only in hotel rooms and their number is limited. This is a request — the organiser will confirm it once rooms have been allocated.',
      it: 'I letti aggiunti sono disponibili solo nelle camere dell’hotel e in numero limitato. Questa è una richiesta: l’organizzatore la confermerà dopo l’assegnazione delle camere.',
      ko: '보조 침대는 호텔 객실에서만 이용할 수 있으며 수량이 한정되어 있습니다. 이 신청은 요청이며, 객실 배정 후 주최 측에서 확정해 드립니다.',
      zh: '加床仅限酒店客房，数量有限。此项为申请，主办方将在分配房间后予以确认。',
    },
    limit: 8,
    maxPerRegistration: 1,
    price: 0,
  },
  {
    templateLabel: 'Łóżeczko turystyczne dla niemowlęcia',
    id: 'travel_cot',
    name: {
      pl: 'Łóżeczko turystyczne dla niemowlęcia',
      en: 'Travel cot for an infant',
      it: 'Lettino da viaggio per neonato',
      ko: '유아용 휴대용 침대',
      zh: '婴儿旅行床',
    },
    desc: {
      pl: 'Bezpłatne, z pościelą. Liczba łóżeczek w ośrodku jest ograniczona.',
      en: 'Free of charge, bedding included. The number of cots at the venue is limited.',
      it: 'Gratuito, con biancheria. Il numero di lettini nella struttura è limitato.',
      ko: '무료이며 침구가 포함됩니다. 시설에 비치된 수량이 한정되어 있습니다.',
      zh: '免费，含床上用品。场地提供的数量有限。',
    },
    limit: 5,
    maxPerRegistration: 2,
    price: 0,
    childUnderAge: 3,
  },
];
