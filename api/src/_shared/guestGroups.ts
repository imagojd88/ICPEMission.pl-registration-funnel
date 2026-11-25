/**
 * Nagłówki nad gośćmi specjalnymi eventu — czyste funkcje wspólne dla strony zapisu i panelu.
 *
 * Każdy gość może mieć opcjonalne pole `heading`:
 *   brak / 'special' → „Goście specjalni” (dotychczasowe zachowanie),
 *   'speakers'       → „Wykładowcy” / “Guest Speakers”,
 *   'panelists'      → „Paneliści” / “Panelists”,
 *   'custom'         → własny tekst z `headingText` (mapa językowa).
 * Goście są grupowani pod nagłówkami w kolejności pierwszego wystąpienia grupy na liście;
 * kolejność gości w grupie jest taka jak na liście. Event bez pola `heading` daje jedną grupę
 * 'special' — dokładnie jak przed wprowadzeniem nagłówków.
 */

export type GuestHeadingKind = 'special' | 'speakers' | 'panelists' | 'custom';

export const GUEST_HEADING_PRESETS: GuestHeadingKind[] = ['special', 'speakers', 'panelists'];

/** Klucze tłumaczeń (i18n) gotowych nagłówków: [liczba pojedyncza, liczba mnoga]. */
export const GUEST_HEADING_I18N: Record<Exclude<GuestHeadingKind, 'custom'>, [string, string]> = {
  special: ['content.special_guest', 'content.special_guests'],
  speakers: ['content.speaker', 'content.speakers'],
  panelists: ['content.panelist', 'content.panelists'],
};

export interface GuestHeadingFields {
  heading?: string | null;
  headingText?: string | Record<string, string> | null;
  plural?: boolean | null;
}

/** Mapa językowa bez pustych wpisów, z przyciętymi tekstami; string → { pl }. */
export function cleanHeadingText(v: string | Record<string, string> | null | undefined): Record<string, string> {
  if (v == null) return {};
  if (typeof v === 'string') return v.trim() ? { pl: v.trim() } : {};
  const out: Record<string, string> = {};
  for (const k of Object.keys(v).sort()) {
    const t = typeof v[k] === 'string' ? v[k].trim() : '';
    if (t) out[k] = t;
  }
  return out;
}

/** Rodzaj nagłówka gościa. Nieznana wartość albo „własny” bez tekstu → domyślny 'special'. */
export function guestHeadingKind(g: GuestHeadingFields | null | undefined): GuestHeadingKind {
  const h = g?.heading;
  if (h === 'speakers' || h === 'panelists') return h;
  if (h === 'custom' && Object.keys(cleanHeadingText(g?.headingText)).length > 0) return 'custom';
  return 'special';
}

/** Klucz grupy: goście z tym samym kluczem trafiają pod jeden nagłówek. */
export function guestGroupKey(g: GuestHeadingFields | null | undefined): string {
  const kind = guestHeadingKind(g);
  return kind === 'custom' ? `custom:${JSON.stringify(cleanHeadingText(g?.headingText))}` : kind;
}

export interface GuestGroup<T> {
  key: string;
  kind: GuestHeadingKind;
  /** Tylko dla 'custom': teksty nagłówka w językach. */
  text: Record<string, string>;
  /** Liczba mnoga nagłówka: kilka wpisów albo wpis oznaczony jako para / kilka osób. */
  plural: boolean;
  guests: T[];
}

/** Grupuje gości pod nagłówkami w kolejności pierwszego wystąpienia grupy. */
export function groupGuests<T extends GuestHeadingFields>(guests: T[]): GuestGroup<T>[] {
  const groups: GuestGroup<T>[] = [];
  const byKey = new Map<string, GuestGroup<T>>();
  for (const g of guests) {
    if (!g) continue;
    const key = guestGroupKey(g);
    let grp = byKey.get(key);
    if (!grp) {
      const kind = guestHeadingKind(g);
      grp = { key, kind, text: kind === 'custom' ? cleanHeadingText(g.headingText) : {}, plural: false, guests: [] };
      byKey.set(key, grp);
      groups.push(grp);
    }
    grp.guests.push(g);
  }
  for (const grp of groups) grp.plural = grp.guests.length > 1 || grp.guests.some((g) => g.plural === true);
  return groups;
}

/** Tekst własnego nagłówka w języku strony: język → EN → PL → pierwszy dostępny. */
export function pickHeadingText(text: Record<string, string> | null | undefined, lng: string): string {
  const m = cleanHeadingText(text);
  const l = (lng || 'pl').slice(0, 2).toLowerCase();
  for (const k of [l, 'en', 'pl']) if (m[k]) return m[k];
  return Object.values(m)[0] ?? '';
}

/** Klucz tłumaczenia gotowego nagłówka grupy (null dla własnego tekstu). */
export function guestGroupI18nKey(group: { kind: GuestHeadingKind; plural: boolean }): string | null {
  if (group.kind === 'custom') return null;
  return GUEST_HEADING_I18N[group.kind][group.plural ? 1 : 0];
}

/**
 * Pola nagłówka do zapisu w treści eventu. Domyślny nagłówek nie zapisuje niczego
 * (JSON gościa zostaje identyczny jak przed wprowadzeniem nagłówków).
 */
export function headingFieldsToSave(g: GuestHeadingFields | null | undefined): { heading?: 'speakers' | 'panelists' | 'custom'; headingText?: Record<string, string> } {
  const kind = guestHeadingKind(g);
  if (kind === 'special') return {};
  if (kind === 'custom') return { heading: 'custom', headingText: cleanHeadingText(g?.headingText) };
  return { heading: kind };
}
