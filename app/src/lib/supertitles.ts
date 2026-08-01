/**
 * Gotowe nadtytuły (tekst nad nazwą eventu w hero).
 * Wspólne dla kreatora i edytora eventu. Lista jest podpowiedzią, nie ograniczeniem —
 * w obu formularzach można wpisać własny tekst (opcja „Inny…").
 */
export const SUPERTITLE_PRESETS = [
  'Spotkanie wspólnoty',
  'Rekolekcje',
  'Obóz wakacyjny',
  'Weekend formacyjny',
  'Wyjazd formacyjny',
  'Kids Ministry',
  'Youth Ministry',
  'Spotkanie otwarte',
  'Fellowship',
  'Świętowanie daru wspólnoty',
] as const

/** Czy wartość pochodzi z listy (steruje pokazaniem pola „własny tekst"). */
export function isPresetSupertitle(value: string): boolean {
  return (SUPERTITLE_PRESETS as readonly string[]).includes(value)
}
