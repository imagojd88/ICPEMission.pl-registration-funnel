/**
 * Niedokończone zgłoszenia („leady”) — czysta logika wspólna dla API i testów.
 *
 * Lead jest w bazie kluczowany `(instanceId, email)`. Sama zmiana e-maila w trakcie wypełniania
 * zostawiała sierotę pod starym adresem (i przypomnienie „dokończ zgłoszenie” mimo wysłanego
 * zgłoszenia). Dlatego lejek wysyła też losowy KLUCZ SESJI formularza (`leadKey`, tworzony
 * w przeglądarce): lead tej sesji zmienia adres zamiast powstawać drugi, a wysłane zgłoszenie
 * zamyka wszystkie leady tej sesji ORAZ lead pod adresem zgłoszenia.
 *
 * Świadomie NIE ma tu zgadywania po nazwisku ani po „podobnych” adresach.
 */

/** Adres do porównań: małe litery, bez żadnych białych znaków. Nie-tekst → ''. */
export function normalizeLeadEmail(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, '').toLowerCase() : '';
}

/** Klucz sesji formularza: 16–64 znaki z [A-Za-z0-9_-]. Cokolwiek innego → null (jak brak klucza). */
export function cleanLeadKey(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v) ? v : null;
}

export interface LeadRef {
  id: string;
  email: string;
  sessionKey?: string | null;
  convertedAt?: unknown;
}

export type LeadUpsertPlan =
  /** lead pod tym adresem jest już dokończony — nic nie zapisujemy; `dropId`: sierota tej sesji do usunięcia */
  | { kind: 'skip'; dropId?: string }
  /** nowy lead */
  | { kind: 'create'; sessionKey: string | null }
  /** aktualizacja istniejącego leada pod tym adresem; `setSessionKey` — przypisz klucz, gdy lead go nie ma */
  | { kind: 'touch'; id: string; setSessionKey: string | null; dropId?: string }
  /** lead tej sesji zmienia adres (gość poprawił e-mail) */
  | { kind: 'move'; id: string };

/**
 * Co zrobić przy zapisie leada.
 *  - `byKey`  — NIEdokończony lead tego eventu z kluczem tej sesji (albo null),
 *  - `byEmail` — lead tego eventu pod wpisanym adresem (albo null).
 * Kolizja (sesja ma lead pod starym adresem, a pod nowym już istnieje inny): zostaje ten pod nowym
 * adresem, stary lead sesji jest usuwany (`dropId`) — nie zostaje sierota.
 * Cudzego klucza nie nadpisujemy: znajomość samego adresu nie daje władzy nad cudzym leadem.
 */
export function planLeadUpsert(input: { email: string; leadKey: string | null; byEmail: LeadRef | null; byKey: LeadRef | null }): LeadUpsertPlan {
  const email = normalizeLeadEmail(input.email);
  const key = input.leadKey;
  const byKey = key && input.byKey && !input.byKey.convertedAt && input.byKey.sessionKey === key ? input.byKey : null;
  const byEmail = input.byEmail && normalizeLeadEmail(input.byEmail.email) === email ? input.byEmail : null;
  const orphan = byKey && (!byEmail || byEmail.id !== byKey.id) ? byKey : null;

  if (byEmail) {
    const dropId = orphan ? { dropId: orphan.id } : {};
    if (byEmail.convertedAt) return { kind: 'skip', ...dropId };
    return { kind: 'touch', id: byEmail.id, setSessionKey: key && !byEmail.sessionKey ? key : null, ...dropId };
  }
  if (orphan) return { kind: 'move', id: orphan.id };
  return { kind: 'create', sessionKey: key };
}

/**
 * Które otwarte leady eventu zamyka wysłane zgłoszenie: lead pod adresem zgłoszenia
 * ORAZ wszystkie leady z kluczem tej sesji formularza (także założone na wcześniej wpisany adres).
 * Stary front bez `leadKey` → tylko po adresie (jak dotąd).
 */
export function leadIdsToClose(open: LeadRef[], reg: { email: unknown; leadKey?: unknown }): string[] {
  const email = normalizeLeadEmail(reg.email);
  const key = cleanLeadKey(reg.leadKey);
  return open
    .filter((l) => !l.convertedAt)
    .filter((l) => (!!email && normalizeLeadEmail(l.email) === email) || (!!key && l.sessionKey === key))
    .map((l) => l.id);
}

/** Pas bezpieczeństwa crona: nie przypominamy, gdy na ten adres (po normalizacji) jest aktywne zgłoszenie. */
export function hasActiveRegistrationFor(leadEmail: unknown, registeredEmails: Iterable<unknown>): boolean {
  const e = normalizeLeadEmail(leadEmail);
  if (!e) return false;
  for (const r of registeredEmails) if (normalizeLeadEmail(r) === e) return true;
  return false;
}
