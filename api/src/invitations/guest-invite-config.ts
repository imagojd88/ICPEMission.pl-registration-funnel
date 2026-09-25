/**
 * Ścieżka „uczestnik zaprasza gościa" — konfiguracja per event i wspólne helpery.
 * Konfiguracja siedzi w `RegistrationPage.customFields.guestInvites` (wolny JSON — bez migracji):
 *   { enabled: boolean, maxPerInviter: number }
 */
export interface GuestInviteConfig {
  enabled: boolean;
  maxPerInviter: number;
}

export const DEFAULT_MAX_GUESTS = 2;
/** Twardy sufit niezależnie od ustawień — zabezpieczenie przed literówką „100" w panelu. */
export const HARD_MAX_GUESTS = 10;

export function guestInviteConfig(customFields: unknown): GuestInviteConfig {
  const raw = ((customFields ?? {}) as { guestInvites?: { enabled?: unknown; maxPerInviter?: unknown } }).guestInvites;
  const enabled = raw?.enabled === true;
  const n = Math.round(Number(raw?.maxPerInviter));
  const maxPerInviter = Number.isFinite(n) && n >= 1 ? Math.min(n, HARD_MAX_GUESTS) : DEFAULT_MAX_GUESTS;
  return { enabled, maxPerInviter };
}

/**
 * Bazowy adres publicznego frontu (linki w mailach). `||`, nie `??` — pusty ENV na Renderze
 * dałby link względny, martwy w mailu. Czytane z process.env, żeby helper działał także
 * w serwisach bez wstrzykniętego ConfigService (ConfigModule ładuje .env do process.env).
 */
export function publicAppUrl(): string {
  const raw = process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || 'https://rejestracja.icpemission.pl';
  return raw.split(',')[0].trim().replace(/\/+$/, '');
}

/** Link strony „Zaproś gościa" dla zapraszającego (token zaproszenia albo editToken zgłoszenia). */
export function guestInvitePageLink(token: string): string {
  return `${publicAppUrl()}/g/${token}`;
}

/**
 * Osobisty link zaproszonej osoby:
 *  - event na zaproszenie → strona potwierdzenia `/i/:token`,
 *  - zwykły event → lejek rejestracji z wypełnionymi danymi `/r/:slug?inv=:token`.
 */
export function personalInviteLink(token: string, seriesType: string | undefined, slug: string | null | undefined): string {
  if (seriesType !== 'INVITE' && slug) return `${publicAppUrl()}/r/${slug}?inv=${encodeURIComponent(token)}`;
  return `${publicAppUrl()}/i/${token}`;
}

/** Zgłoszenia z lejka, które uznajemy za „potwierdzonego uczestnika" (może zapraszać). */
export const ACTIVE_REGISTRATION_STATUSES = ['PENDING_PAYMENT', 'AWAITING_TRANSFER', 'CONFIRMED'];
