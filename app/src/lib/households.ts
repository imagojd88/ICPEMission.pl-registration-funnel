import type { ChildEntry, HouseholdInput, InvitationItem } from './api'

/**
 * Gospodarstwo domowe w formularzu panelu (osoba główna + małżonek + dzieci).
 * Wartości jako stringi — pola mogą być puste w trakcie edycji.
 */
export type HouseholdMode = 'single' | 'couple' | 'family'

export interface ChildDraft {
  key: string
  age: string
  firstName: string
  dietary: string
}

export interface HouseholdDraft {
  mode: HouseholdMode
  /** Tylko dla „Rodzina": czy jest małżonek (samotny rodzic → false). */
  familyWithSpouse: boolean
  dietary: string
  spouseFirstName: string
  spouseLastName: string
  spouseDietary: string
  children: ChildDraft[]
  adminNote: string
}

let keySeq = 0
export function newChild(partial: Partial<ChildDraft> = {}): ChildDraft {
  return { key: `hc-${++keySeq}`, age: '', firstName: '', dietary: '', ...partial }
}

export function emptyHousehold(mode: HouseholdMode = 'single'): HouseholdDraft {
  return {
    mode,
    familyWithSpouse: true,
    dietary: '',
    spouseFirstName: '',
    spouseLastName: '',
    spouseDietary: '',
    children: mode === 'family' ? [newChild()] : [],
    adminNote: '',
  }
}

/** Formularz wypełniony tym, co już wiadomo o zaproszeniu (do „Potwierdź ręcznie" / „Edytuj skład"). */
export function householdFromItem(inv: InvitationItem): HouseholdDraft {
  const kids = inv.children ?? []
  const spouse = inv.spouseAttending === true
  return {
    mode: kids.length > 0 ? 'family' : spouse ? 'couple' : 'single',
    familyWithSpouse: kids.length > 0 ? spouse : true,
    dietary: inv.dietaryNotes ?? '',
    spouseFirstName: inv.spouseFirstName ?? '',
    spouseLastName: inv.spouseLastName ?? '',
    spouseDietary: inv.spouseDietaryNotes ?? '',
    children: kids.map((c) => newChild({ age: String(c.age), firstName: c.firstName ?? '', dietary: c.dietary ?? '' })),
    adminNote: inv.adminNote ?? '',
  }
}

export function hasSpouse(d: HouseholdDraft): boolean {
  return d.mode === 'couple' || (d.mode === 'family' && d.familyWithSpouse)
}

/** Skład do API. Tryb „Osoba" wysyła jawnie brak małżonka i dzieci (żeby edycja je usuwała). */
export function householdToInput(d: HouseholdDraft): HouseholdInput {
  const spouse = hasSpouse(d)
  const children: ChildEntry[] =
    d.mode === 'family'
      ? d.children
          .filter((c) => c.age.trim() !== '')
          .map((c) => ({
            age: Number(c.age),
            ...(c.firstName.trim() ? { firstName: c.firstName.trim() } : {}),
            ...(c.dietary.trim() ? { dietary: c.dietary.trim() } : {}),
          }))
      : []
  return {
    dietaryNotes: d.dietary.trim() || null,
    spouse: spouse
      ? { firstName: d.spouseFirstName.trim(), lastName: d.spouseLastName.trim(), dietaryNotes: d.spouseDietary.trim() || null }
      : null,
    children,
    adminNote: d.adminNote.trim() || null,
  }
}

/** Walidacja formularza składu — komunikat po polsku albo null. */
export function householdDraftError(d: HouseholdDraft): string | null {
  if (hasSpouse(d) && !d.spouseFirstName.trim()) return 'Podaj imię małżonka (albo wybierz „Osoba").'
  for (const c of d.mode === 'family' ? d.children : []) {
    if (c.age.trim() === '' && (c.firstName.trim() || c.dietary.trim())) return 'Podaj wiek każdego dziecka.'
    const n = Number(c.age)
    if (c.age.trim() !== '' && (!Number.isFinite(n) || n < 0 || n > 25)) return 'Wiek dziecka musi być liczbą od 0 do 25.'
  }
  return null
}

/** Ile osób (dorosłych/dzieci) liczy formularz — do podpowiedzi „= N posiłków". */
export function householdCounts(d: HouseholdDraft): { adults: number; kids: number } {
  const kids = d.mode === 'family' ? d.children.filter((c) => c.age.trim() !== '').length : 0
  return { adults: 1 + (hasSpouse(d) ? 1 : 0), kids }
}

// ── Wklejana lista (masowe dodawanie potwierdzonych) ─────────────────────────

export interface ParsedHousehold {
  line: number
  raw: string
  household: HouseholdInput & { firstName: string; lastName: string; email: string }
  error: string | null
}

/**
 * Format jednej linii (kolumny rozdzielone przecinkiem, puste kolumny dozwolone):
 *   Imię Nazwisko, e-mail, telefon, Imię [Nazwisko] małżonka, dzieci
 * dzieci: „Ola 7; Staś 4; 2" (imię opcjonalne, liczba = wiek).
 * Przykłady:
 *   Jan Kowalski, jan@example.com, +48600100200, Anna Kowalska, Ola 7; Staś 4
 *   Ewa Nowak, ewa@example.com
 *   Piotr Lis,,, Maria
 */
export function parseHouseholdLines(raw: string): ParsedHousehold[] {
  const out: ParsedHousehold[] = []
  raw.split('\n').forEach((lineRaw, i) => {
    const line = lineRaw.trim()
    if (!line) return
    const cols = line.split(',').map((c) => c.trim())
    const [namePart = '', emailPart = '', phonePart = '', spousePart = '', kidsPart = ''] = cols
    const names = namePart.split(/\s+/).filter(Boolean)
    const firstName = names[0] ?? ''
    const lastName = names.slice(1).join(' ')
    let error: string | null = null
    if (!firstName || !lastName) error = 'brak imienia lub nazwiska'
    if (!error && emailPart && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPart)) error = `niepoprawny e-mail „${emailPart}"`
    const spNames = spousePart.split(/\s+/).filter(Boolean)
    const children: ChildEntry[] = []
    // Kolumny po 5. (np. przecinek w liście dzieci zamiast średnika) doklejamy do dzieci.
    const kidsRaw = [kidsPart, ...cols.slice(5)].filter(Boolean).join(';')
    for (const tok of kidsRaw.split(';').map((s) => s.trim()).filter(Boolean)) {
      const m = tok.match(/^(.*?)(\d{1,2})\s*(lat|lata|rok|l\.?)?$/i)
      if (!m) {
        error = error ?? `nie rozumiem „${tok}" (dziecko: imię i wiek, np. „Ola 7")`
        continue
      }
      const age = Number(m[2])
      if (age > 25) error = error ?? `wiek ${age} poza zakresem 0–25`
      const nm = m[1].trim()
      children.push({ age, ...(nm ? { firstName: nm } : {}) })
    }
    if (children.length > 12) error = error ?? 'maksymalnie 12 dzieci'
    out.push({
      line: i + 1,
      raw: line,
      household: {
        firstName,
        lastName,
        email: emailPart,
        ...(phonePart ? { phone: phonePart } : {}),
        spouse: spNames.length ? { firstName: spNames[0], lastName: spNames.slice(1).join(' ') } : null,
        children,
      },
      error,
    })
  })
  return out
}

/** „Jan Kowalski + Anna + 2 dzieci" — krótki opis rodziny do podglądu listy. */
export function describeHousehold(h: HouseholdInput): string {
  const parts = [`${h.firstName ?? ''} ${h.lastName ?? ''}`.trim()]
  if (h.spouse?.firstName) parts.push(`${h.spouse.firstName}${h.spouse.lastName ? ` ${h.spouse.lastName}` : ''}`)
  const kids = h.children?.length ?? 0
  if (kids) parts.push(`${kids} ${kids === 1 ? 'dziecko' : 'dzieci'} (${h.children!.map((c) => c.age).join(', ')})`)
  return parts.join(' + ')
}
