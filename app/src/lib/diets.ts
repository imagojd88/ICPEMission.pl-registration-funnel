/**
 * Diety do wyboru w formularzu zapisu — włączane per event przez admina
 * (`customFields.diets`: lista kluczy; domyślnie pusta = brak wyboru diet).
 * Klucze są stałe (zapisane w evencie); etykiety PL trafiają do zgłoszenia
 * (`Participant.dietary` — czyta organizator / kuchnia), gość widzi etykietę w swoim języku.
 */
export interface DietOption {
  key: string
  label: { pl: string; en: string; it: string; ko: string; zh: string }
}

export const DIETS: DietOption[] = [
  { key: 'no_meat', label: { pl: 'Bez mięsa', en: 'No meat (vegetarian)', it: 'Senza carne (vegetariana)', ko: '고기 제외 (채식)', zh: '不含肉类（素食）' } },
  { key: 'vegan', label: { pl: 'Wegańska', en: 'Vegan', it: 'Vegana', ko: '비건', zh: '纯素' } },
  { key: 'gluten_free', label: { pl: 'Bez glutenu', en: 'Gluten-free', it: 'Senza glutine', ko: '글루텐 프리', zh: '无麸质' } },
  { key: 'lactose_free', label: { pl: 'Bez laktozy', en: 'Lactose-free', it: 'Senza lattosio', ko: '락토스 프리', zh: '无乳糖' } },
  { key: 'nut_free', label: { pl: 'Bez orzechów', en: 'Nut-free', it: 'Senza frutta a guscio', ko: '견과류 제외', zh: '不含坚果' } },
  { key: 'kosher', label: { pl: 'Koszerna', en: 'Kosher', it: 'Kosher', ko: '코셔', zh: '犹太洁食' } },
]

/** Diety włączone w evencie (w kolejności katalogu; nieznane klucze pomijane). */
export function enabledDiets(keys: string[] | null | undefined): DietOption[] {
  const set = new Set(keys ?? [])
  return DIETS.filter((d) => set.has(d.key))
}

export function dietLabel(key: string, lng = 'pl'): string {
  const d = DIETS.find((x) => x.key === key)
  if (!d) return key
  const l = (lng || 'pl').slice(0, 2) as keyof DietOption['label']
  return d.label[l] ?? d.label.pl
}

/**
 * Tekst do `Participant.dietary` (po polsku, dla organizatora):
 * wybrane diety + wpis ręczny uczestnika (alergie itp.).
 */
export function participantDietaryText(dietKeys: string[] | undefined, freeText: string | undefined): string | undefined {
  const parts = [...(dietKeys ?? []).map((k) => dietLabel(k, 'pl')), (freeText ?? '').trim()].filter(Boolean)
  return parts.length ? parts.join(', ') : undefined
}
