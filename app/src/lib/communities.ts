/**
 * Wspólnoty do wyboru w formularzu zapisu (pole „Wspólnota" — alternatywa dla „Parafii").
 * Nazwy własne — nie tłumaczymy ich; tłumaczone są tylko nagłówki sekcji i „Inna".
 * Kolejność = kolejność na liście. Zmiana listy = edycja tego pliku + push.
 */
export const COMMUNITY_GROUPS: { id: 'pl' | 'world'; names: string[] }[] = [
  {
    id: 'pl',
    names: [
      'ICPE Mission Kraków - Eden',
      'ICPE Mission Lublin - Armia Dzieci',
      'ICPE Mission Warszawa',
      'Nowe Jeruzalem',
    ],
  },
  {
    id: 'world',
    names: [
      'Bread Of Life (Malta)',
      'Comunità Cattolica di Alleanza Dio Vivente',
      'Earthen Vessels Catholic Community (Singapore)',
      'ICPE Mission Deutschland',
      'ICPE Mission Ghana',
      'ICPE Mission Korea',
      'ICPE Mission Kuala Lumpur',
      'ICPE Mission Malta',
      'ICPE Mission Mysore',
      'ICPE Mission New Zealand',
      'ICPE Mission Philippines',
      'ICPE Mission Seminary',
      'ICPE Mission Singapore',
      'LIFE – ICPE Mission Kota Kinabalu',
      'Light of Christ Covenant Community (India)',
      'Tehillah Covenant Community',
    ],
  },
]

/** Wartość opcji „Inna" w liście (wtedy pokazujemy pole do wpisania nazwy). */
export const COMMUNITY_OTHER = '__other'

/** Jakie pole przynależności pokazuje formularz zapisu (ustawienie per event). */
export type AffiliationField = 'parish' | 'community'

/** Tekst do pokazania organizatorowi: wybrana wspólnota albo wpisana ręcznie („Inna: …"). */
export function communityDisplay(contact: { community?: string; communityOther?: boolean } | null | undefined): string {
  const c = contact?.community?.trim()
  if (!c) return ''
  return contact?.communityOther ? `Inna: ${c}` : c
}
