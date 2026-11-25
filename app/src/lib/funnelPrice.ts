import { buildPriceInput, hasAccommodation } from '@icpe/shared'
import type { PriceInput, PriceOptions, PricingConfig } from '@icpe/shared'

interface PersonLike {
  type: 'adult' | 'child'
  age: number
}

/**
 * Wejście do wyceny z formularza (lejek, strona zgłoszenia gościa).
 *  - nocleg opcjonalny / event bez pokoi → osoby bez pokoju liczone jako „bez noclegu"
 *    (opłata formacyjna + wyżywienie),
 *  - nocleg obowiązkowy → osoby jeszcze nieprzypisane nie są liczone (jak wcześniej:
 *    cena rośnie w miarę przypisywania do pokoi).
 * `owners[i]` = indeks uczestnika, do którego należy `computePrice(...).lines[i]`.
 */
export function funnelPriceInput(
  participants: PersonLike[],
  rooms: Array<{ roomId: string; participantIndexes: number[] }>,
  cfg: PricingConfig,
  options?: PriceOptions,
  discountCode?: string,
): { input: PriceInput; owners: number[] } {
  const input = buildPriceInput(participants, rooms, options, discountCode)
  const owners: number[] = []
  const used = new Set<number>()
  for (const r of rooms) {
    for (const i of r.participantIndexes) {
      if (!Number.isInteger(i) || i < 0 || i >= participants.length || used.has(i)) continue
      used.add(i)
      owners.push(i)
    }
  }
  if (isAccommodationOptional(cfg) || !hasAccommodation(cfg)) {
    participants.forEach((_, i) => {
      if (!used.has(i)) owners.push(i)
    })
  } else {
    input.withoutRoom = []
  }
  return { input, owners }
}

/**
 * Event ma pokoje do wyboru, ale nocleg nie jest obowiązkowy.
 * Celowo NIE zależy od liczby nocy: przy „nocleg opcjonalny" + 0 nocy (błąd konfiguracji)
 * gość i tak musi móc zaznaczyć „Nie potrzebuję noclegu" — inaczej krok pokoju blokuje zapis
 * (zgłoszenie 19.11.2026, foundation-day-2027).
 */
export function isAccommodationOptional(cfg: PricingConfig | null | undefined): boolean {
  return !!cfg?.accommodationOptional && (cfg?.rooms?.length ?? 0) > 0
}

/** Krok „Wybór pokoju” w lejku (indeks logiczny — stały w szkicach, analityce i „Zmień” w podsumowaniu). */
export const ROOM_STEP = 3

/**
 * Czy lejek pokazuje krok „Wybór pokoju”: event ma pokoje i co najmniej 1 noc (tak samo API
 * decyduje, czy w ogóle sprawdza pokoje — `hasAccommodation`) albo ma nocleg opcjonalny.
 * Event bez pokoi / bez nocy → kroku nie ma i nie liczy się w „Krok X z Y”.
 */
export function showsRoomStep(cfg: PricingConfig | null | undefined): boolean {
  return hasAccommodation(cfg) || isAccommodationOptional(cfg)
}

/** Kroki lejka dla eventu (indeksy logiczne 0–4, w kolejności wyświetlania). */
export function funnelSteps(cfg: PricingConfig | null | undefined): number[] {
  return showsRoomStep(cfg) ? [0, 1, 2, 3, 4] : [0, 1, 2, 4]
}

/** Krok do pokazania: gdy zapisany krok nie istnieje w tym evencie → najbliższy następny (albo ostatni). */
export function effectiveStep(step: number, steps: number[]): number {
  if (steps.includes(step)) return step
  return steps.find((s) => s > step) ?? steps[steps.length - 1]
}
