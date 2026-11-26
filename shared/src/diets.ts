/**
 * Diety: katalog (klucze stałe, etykiety w językach strony), rozpoznawanie diet w tekście
 * zapisanym przy uczestniku oraz zestawienie dla ośrodka (liczba OSÓB na dietach).
 *
 * W bazie NIE ma kluczy diet — `Participant.dietary` to tekst: polskie etykiety zaznaczonych diet
 * + wpis ręczny, rozdzielone przecinkami (np. „Bez mięsa, Bez mleka, alergia na orzechy”).
 * Dlatego zmiana etykiety wymaga zgodności wstecz: stare etykiety są w `DIET_ALIASES`
 * i liczą się do tej samej diety (bez migracji danych).
 *
 * Plik bez importów wykonywalnych (testy `node --test` na samych .ts).
 */

export interface DietOption {
  key: string;
  label: { pl: string; en: string; it: string; ko: string; zh: string };
  /** nazwa diety używana przez ośrodek / kuchnię (zestawienie do wysłania) */
  kitchen: string;
}

export const DIETS: DietOption[] = [
  { key: 'no_meat', kitchen: 'wegetariańska', label: { pl: 'Bez mięsa', en: 'No meat (vegetarian)', it: 'Senza carne (vegetariana)', ko: '고기 제외 (채식)', zh: '不含肉类（素食）' } },
  { key: 'vegan', kitchen: 'wegańska', label: { pl: 'Wegańska', en: 'Vegan', it: 'Vegana', ko: '비건', zh: '纯素' } },
  { key: 'gluten_free', kitchen: 'bezglutenowa', label: { pl: 'Bez glutenu', en: 'Gluten-free', it: 'Senza glutine', ko: '글루텐 프리', zh: '无麸质' } },
  // Klucz historyczny `lactose_free` zostaje (zapisany w ustawieniach eventów); od 26.11.2026 dieta
  // nazywa się „Bez mleka” (bezmleczna) — to nie to samo co „bez laktozy” przy alergii na białko mleka.
  { key: 'lactose_free', kitchen: 'bezmleczna', label: { pl: 'Bez mleka', en: 'Dairy-free', it: 'Senza latticini', ko: '유제품 제외', zh: '不含乳制品' } },
  { key: 'nut_free', kitchen: 'bez orzechów', label: { pl: 'Bez orzechów', en: 'Nut-free', it: 'Senza frutta a guscio', ko: '견과류 제외', zh: '不含坚果' } },
  { key: 'kosher', kitchen: 'koszerna', label: { pl: 'Koszerna', en: 'Kosher', it: 'Kosher', ko: '코셔', zh: '犹太洁食' } },
];

/**
 * Dodatkowe zapisy rozpoznawane jako dana dieta: dawne etykiety (zgodność wstecz) i nazwy,
 * którymi posługuje się ośrodek. Aktualne etykiety we wszystkich językach są rozpoznawane zawsze.
 */
export const DIET_ALIASES: Record<string, string[]> = {
  no_meat: ['Wegetariańska', 'Dieta wegetariańska', 'Vegetarian', 'Vegetariana', 'No meat', 'Senza carne'],
  vegan: ['Dieta wegańska', 'Wegan'],
  gluten_free: ['Bezglutenowa', 'Dieta bezglutenowa', 'Gluten free'],
  lactose_free: [
    // etykiety sprzed 26.11.2026
    'Bez laktozy', 'Lactose-free', 'Lactose free', 'Senza lattosio', '락토스 프리', '无乳糖',
    'Bezmleczna', 'Dieta bezmleczna', 'Bez nabiału', 'Dairy free',
  ],
  nut_free: ['Nut free'],
  kosher: [],
};

const norm = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

let lookup: Map<string, string> | null = null;
function dietLookup(): Map<string, string> {
  if (lookup) return lookup;
  const m = new Map<string, string>();
  for (const d of DIETS) {
    for (const l of Object.values(d.label)) m.set(norm(l), d.key);
    m.set(norm(d.kitchen), d.key);
    for (const a of DIET_ALIASES[d.key] ?? []) m.set(norm(a), d.key);
  }
  lookup = m;
  return m;
}

/** Diety włączone w evencie (w kolejności katalogu; nieznane klucze pomijane). */
export function enabledDiets(keys: string[] | null | undefined): DietOption[] {
  const set = new Set(keys ?? []);
  return DIETS.filter((d) => set.has(d.key));
}

export function dietLabel(key: string, lng = 'pl'): string {
  const d = DIETS.find((x) => x.key === key);
  if (!d) return key;
  const l = (lng || 'pl').slice(0, 2) as keyof DietOption['label'];
  return d.label[l] ?? d.label.pl;
}

/**
 * Tekst do `Participant.dietary` (po polsku, dla organizatora):
 * wybrane diety + wpis ręczny uczestnika (alergie itp.).
 */
export function participantDietaryText(dietKeys: string[] | undefined, freeText: string | undefined): string | undefined {
  const parts = [...(dietKeys ?? []).map((k) => dietLabel(k, 'pl')), (freeText ?? '').trim()].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

/**
 * Rozkłada tekst diety osoby na rozpoznane diety (klucze w kolejności katalogu) i resztę
 * (wolny tekst: alergie, uwagi). Rozpoznawane są tylko CAŁE fragmenty między przecinkami /
 * średnikami — „nietolerancja laktozy” zostaje wolnym tekstem.
 */
export function parseDietary(text: string | null | undefined): { keys: string[]; note: string } {
  const found = new Set<string>();
  const rest: string[] = [];
  const map = dietLookup();
  for (const raw of String(text ?? '').split(/[,;\n]/)) {
    const part = raw.trim();
    if (!part) continue;
    const key = map.get(norm(part));
    if (key) found.add(key);
    else rest.push(part);
  }
  return { keys: DIETS.map((d) => d.key).filter((k) => found.has(k)), note: rest.join(', ') };
}

/**
 * Tekst diety do WYŚWIETLENIA: rozpoznane diety pod aktualną polską etykietą (stare „Bez laktozy”
 * → „Bez mleka”), potem wolny tekst bez zmian. Niczego nie zapisuje.
 */
export function displayDietary(text: string | null | undefined, lng = 'pl'): string {
  const p = parseDietary(text);
  return [...p.keys.map((k) => dietLabel(k, lng)), p.note].filter(Boolean).join(', ');
}

// ── Zestawienie dla ośrodka ────────────────────────────────────────────────────────────────

export interface DietAgeGroup {
  id: string;
  label: string;
}

export interface DietSummaryRegistration {
  id?: string;
  /** status kontraktu (CONFIRMED / PENDING / WAITLIST / CANCELLED) albo wewnętrzny */
  status: string;
  registrant?: string;
  dietaryNotes?: string | null;
  participants: Array<{
    type: string; // 'adult' | 'child' | 'ADULT' | 'CHILD'
    firstName?: string | null;
    lastName?: string | null;
    age?: number | null;
    dietary?: string | null;
  }>;
}

export interface DietSummaryRow {
  /** 'standard' albo klucze diet połączone „+” (np. `gluten_free+lactose_free`) */
  id: string;
  keys: string[];
  label: string;
  /** nazwa(y) diety wg ośrodka, '' dla wiersza „standard” */
  kitchen: string;
  counts: Record<string, number>;
  total: number;
}

export interface DietSummaryPerson {
  registrationId: string;
  registrant: string;
  person: string;
  groupId: string;
  groupLabel: string;
  age: number | null;
  keys: string[];
  diets: string;
  note: string;
  registrationNote: string;
}

export interface DietSummary {
  groups: DietAgeGroup[];
  /** pierwszy wiersz to „standard” (bez diety), potem diety i ich połączenia */
  rows: DietSummaryRow[];
  totals: Record<string, number>;
  /** suma kontrolna = liczba osób w aktywnych zgłoszeniach */
  people: number;
  registrations: number;
  /** osoby z dietą albo z wpisem ręcznym */
  persons: DietSummaryPerson[];
  /** uwagi wpisane do całego zgłoszenia (pole „Alergie i nietolerancje” + „Dodatkowe uwagi”) — wszystkie aktywne zgłoszenia, które je mają */
  registrationNotes: Array<{ registrationId: string; registrant: string; note: string }>;
}

/** Zgłoszenie „aktywne” = trzyma miejsce: wszystko poza anulowanymi i listą rezerwową (jak licznik miejsc). */
export function isActiveRegistrationStatus(status: string | null | undefined): boolean {
  return status !== 'CANCELLED' && status !== 'WAITLIST';
}

/**
 * Grupy wiekowe z progów cennika eventu (`childBrackets[].ltAge`): „Dzieci do 3 lat”, „Dzieci 3–9 lat”,
 * „Dorośli”. Bez progów: Dorośli / Dzieci. Dziecko starsze niż ostatni próg liczy się jak dorosły.
 */
export function dietAgeGroups(childBrackets?: Array<{ ltAge: number }> | null): DietAgeGroup[] {
  const lts = [...new Set((childBrackets ?? []).map((b) => Math.floor(Number(b?.ltAge))).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  if (lts.length === 0) return [{ id: 'adult', label: 'Dorośli' }, { id: 'child', label: 'Dzieci' }];
  const groups: DietAgeGroup[] = [{ id: 'adult', label: `Dorośli (i dzieci od ${lts[lts.length - 1]} lat)` }];
  for (let i = lts.length - 1; i >= 0; i--) {
    const lt = lts[i];
    const from = i === 0 ? 0 : lts[i - 1];
    const label = i === 0 ? `Dzieci do ${lt} lat (${lt - 1 === 0 ? '0' : `0–${lt - 1}`})` : from === lt - 1 ? `Dzieci ${from} lat` : `Dzieci ${from}–${lt - 1} lat`;
    groups.push({ id: `lt${lt}`, label });
  }
  return groups;
}

function groupOf(p: { type: string; age?: number | null }, childBrackets?: Array<{ ltAge: number }> | null): string {
  const child = String(p.type).toLowerCase() === 'child';
  const lts = [...new Set((childBrackets ?? []).map((b) => Math.floor(Number(b?.ltAge))).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  if (lts.length === 0) return child ? 'child' : 'adult';
  if (!child) return 'adult';
  const age = Number(p.age ?? 0) || 0;
  for (const lt of lts) if (age < lt) return `lt${lt}`;
  return 'adult';
}

/**
 * Zlicza OSOBY (nie zgłoszenia) wg diety i grupy wiekowej. Osoba z kilkoma dietami trafia do
 * jednego wiersza-połączenia („Bez glutenu + Bez mleka”), więc suma wierszy = liczba osób.
 * Anulowane i lista rezerwowa pominięte. Zgłoszenie bez listy osób = 1 dorosły bez diety
 * (tak samo liczy licznik miejsc).
 */
export function summarizeDiets(
  regs: DietSummaryRegistration[],
  childBrackets?: Array<{ ltAge: number }> | null,
): DietSummary {
  const groups = dietAgeGroups(childBrackets);
  const groupLabel = (id: string) => groups.find((g) => g.id === id)?.label ?? id;
  const zero = () => Object.fromEntries(groups.map((g) => [g.id, 0])) as Record<string, number>;
  const rowMap = new Map<string, DietSummaryRow>();
  const row = (keys: string[]): DietSummaryRow => {
    const id = keys.length ? keys.join('+') : 'standard';
    let r = rowMap.get(id);
    if (!r) {
      r = {
        id,
        keys,
        label: keys.length ? keys.map((k) => dietLabel(k, 'pl')).join(' + ') : 'Standard (bez diety)',
        kitchen: keys.map((k) => DIETS.find((d) => d.key === k)?.kitchen ?? k).join(' + '),
        counts: zero(),
        total: 0,
      };
      rowMap.set(id, r);
    }
    return r;
  };
  row([]);
  const totals = zero();
  const persons: DietSummaryPerson[] = [];
  const registrationNotes: DietSummary['registrationNotes'] = [];
  let people = 0;
  let registrations = 0;

  for (const reg of regs ?? []) {
    if (!reg || !isActiveRegistrationStatus(reg.status)) continue;
    registrations++;
    const regNote = String(reg.dietaryNotes ?? '').trim();
    const registrant = String(reg.registrant ?? '').trim();
    const list = reg.participants?.length ? reg.participants : [{ type: 'adult', firstName: registrant, lastName: '', age: null, dietary: null }];
    for (const p of list) {
      const g = groupOf(p, childBrackets);
      const parsed = parseDietary(p.dietary);
      const r = row(parsed.keys);
      r.counts[g] = (r.counts[g] ?? 0) + 1;
      r.total++;
      totals[g] = (totals[g] ?? 0) + 1;
      people++;
      if (parsed.keys.length || parsed.note) {
        persons.push({
          registrationId: String(reg.id ?? ''),
          registrant,
          person: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
          groupId: g,
          groupLabel: groupLabel(g),
          age: String(p.type).toLowerCase() === 'child' && p.age != null ? Number(p.age) : null,
          keys: parsed.keys,
          diets: parsed.keys.map((k) => dietLabel(k, 'pl')).join(' + '),
          note: parsed.note,
          registrationNote: regNote,
        });
      }
    }
    if (regNote) registrationNotes.push({ registrationId: String(reg.id ?? ''), registrant, note: regNote });
  }

  const order = (r: DietSummaryRow) => (r.id === 'standard' ? -1 : r.keys.length * 100 + DIETS.findIndex((d) => d.key === r.keys[0]));
  const rows = [...rowMap.values()].sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id));
  return { groups, rows, totals, people, registrations, persons, registrationNotes };
}

/**
 * Część uwag zgłoszenia dotycząca jedzenia: lejek dokleja „Dodatkowe uwagi” gościa w wierszu
 * zaczynającym się od „Uwagi:” — te wiersze nie idą do ośrodka.
 */
export function dietaryPartOfNotes(notes: string | null | undefined): string {
  return String(notes ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^uwagi\s*:/i.test(l))
    .join('; ');
}

/**
 * Podsumowanie zwykłym tekstem — do wklejenia w e-mail do ośrodka. Bez imion i nazwisk
 * (same liczby i treść alergii z grupą wiekową); lista imienna zostaje w panelu i w pliku CSV.
 */
export function dietSummaryText(
  s: DietSummary,
  info: { eventTitle: string; dates?: string; place?: string; asOf: string },
): string {
  const lines: string[] = [];
  lines.push(`Zestawienie diet: ${info.eventTitle}`);
  if (info.dates) lines.push(`Termin: ${info.dates}${info.place ? `, ${info.place}` : ''}`);
  lines.push(`Stan na dzień: ${info.asOf}`);
  lines.push('');
  const split = (c: Record<string, number>) => s.groups.map((g) => `${g.label}: ${c[g.id] ?? 0}`).join(', ');
  lines.push(`Liczba osób łącznie: ${s.people} (${split(s.totals)})`);
  lines.push('');
  for (const r of s.rows) {
    const name = r.id === 'standard' ? 'Wyżywienie standardowe (bez diety)' : `Dieta ${r.kitchen}`;
    lines.push(`${name}: ${r.total} (${split(r.counts)})`);
  }
  const kitchenOf = (keys: string[]) => keys.map((k) => DIETS.find((d) => d.key === k)?.kitchen ?? k).join(' + ');
  const withNotes = s.persons.filter((p) => p.note);
  const regNotes = s.registrationNotes.map((n) => dietaryPartOfNotes(n.note)).filter(Boolean);
  if (withNotes.length || regNotes.length) {
    lines.push('');
    lines.push('Alergie i uwagi wpisane przez uczestników:');
    for (const p of withNotes) {
      lines.push(`- 1 os. (${p.groupLabel}${p.age != null ? `, ${p.age} l.` : ''})${p.keys.length ? `, dieta ${kitchenOf(p.keys)}` : ''}: ${p.note}`);
    }
    for (const n of regNotes) lines.push(`- uwaga do zgłoszenia: ${n}`);
  }
  return lines.join('\n');
}
