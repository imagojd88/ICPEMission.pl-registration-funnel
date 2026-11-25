/**
 * Recepcja (stanowisko przyjęć) — model uprawnień pomocników eventu.
 * Czyste funkcje bez importów wykonywalnych (testowane przez `node --test` na plikach .ts),
 * używane przez backend (guardy) i frontend (widoczność akcji).
 *
 * Zasady:
 *  - pełny admin (SUPER_ADMIN / ADMIN / COORDINATOR) ma w recepcji każdy zakres bez grantu,
 *  - pomocnik (EVENT_STAFF) ma tylko zakresy z ważnego grantu na KONKRETNY event,
 *  - każda nieznana rola, pusty albo wygasły grant = brak dostępu (domyślnie odmowa),
 *  - EVENT_STAFF nigdy nie ma dostępu do API panelu admina (`canUseAdminApi`).
 */

export const DESK_SCOPES = [
  'checkin', // obecność: oznacz przyjazd / cofnij
  'payments', // wpisywanie wpłat (i widok kwot)
  'keys', // wydanie i zwrot klucza
  'requests', // prośby dodatkowe
  'participants.view', // podgląd listy + kontakt do zgłaszającego
  'lodging.view', // tablica zakwaterowania: podgląd (na przyszłość)
  'lodging.edit', // tablica zakwaterowania: edycja (na przyszłość)
] as const;

export type DeskScope = (typeof DESK_SCOPES)[number];

/** Zakresy, które dziś coś robią w Recepcji (lodging.* są tylko zdefiniowane). */
export const DESK_ACTIVE_SCOPES: DeskScope[] = ['checkin', 'payments', 'keys', 'requests', 'participants.view'];

export const EVENT_STAFF_ROLE = 'EVENT_STAFF';
export const FULL_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'COORDINATOR'] as const;

export const DESK_REQUEST_KINDS = ['DIET', 'EXTRA_BED', 'OTHER'] as const;
export type DeskRequestKind = (typeof DESK_REQUEST_KINDS)[number];
export type DeskRequestStatus = 'OPEN' | 'DONE';

export function isDeskScope(v: unknown): v is DeskScope {
  return typeof v === 'string' && (DESK_SCOPES as readonly string[]).includes(v);
}

/** Tylko znane zakresy, bez powtórzeń, w kolejności z DESK_SCOPES. */
export function normalizeDeskScopes(input: unknown): DeskScope[] {
  const set = new Set((Array.isArray(input) ? input : []).filter(isDeskScope));
  return DESK_SCOPES.filter((s) => set.has(s));
}

export function isFullAdminRole(role: unknown): boolean {
  return typeof role === 'string' && (FULL_ADMIN_ROLES as readonly string[]).includes(role);
}

/**
 * Czy token może wejść na istniejące API panelu (`/admin/*` i resztę za JwtAuthGuard).
 * Lista dozwolonych ról (nie lista zakazanych): nowa rola dodana w przyszłości też będzie
 * domyślnie odcięta, dopóki ktoś jej tu świadomie nie dopisze.
 */
export function canUseAdminApi(realm: unknown, role: unknown): boolean {
  return realm === 'admin' && isFullAdminRole(role);
}

/** Grant wygasł? `expiresAt` puste = bezterminowo. Nieczytelna data = traktujemy jak wygasły. */
export function deskGrantExpired(expiresAt: Date | string | null | undefined, now: Date | number = Date.now()): boolean {
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') return false;
  const t = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return true;
  return t <= (now instanceof Date ? now.getTime() : now);
}

export interface DeskGrantLike {
  scopes?: unknown;
  expiresAt?: Date | string | null;
}

/** Zakresy faktycznie obowiązujące dla roli i grantu (pełny admin = wszystkie). */
export function effectiveDeskScopes(role: unknown, grant: DeskGrantLike | null | undefined, now: Date | number = Date.now()): DeskScope[] {
  if (isFullAdminRole(role)) return [...DESK_SCOPES];
  if (role !== EVENT_STAFF_ROLE || !grant) return [];
  if (deskGrantExpired(grant.expiresAt, now)) return [];
  return normalizeDeskScopes(grant.scopes);
}

/**
 * Czy wolno wykonać akcję recepcji.
 * `required`: konkretny zakres, lista (wystarczy jeden z nich) albo null = „jakikolwiek dostęp do eventu”.
 */
export function canDesk(
  role: unknown,
  grantScopes: unknown,
  required: DeskScope | readonly DeskScope[] | null,
  opts?: { expiresAt?: Date | string | null; now?: Date | number },
): boolean {
  const eff = effectiveDeskScopes(role, { scopes: grantScopes, expiresAt: opts?.expiresAt }, opts?.now);
  if (eff.length === 0) return false;
  if (required === null) return true;
  const need = (Array.isArray(required) ? required : [required]) as readonly DeskScope[];
  if (need.length === 0) return false;
  return need.some((s) => isDeskScope(s) && eff.includes(s));
}

/** Akcje zastrzeżone dla pełnego admina (np. cofnięcie wpłaty). */
export function canDeskAdminOnly(role: unknown): boolean {
  return isFullAdminRole(role);
}
