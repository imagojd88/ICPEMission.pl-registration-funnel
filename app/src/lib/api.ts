import type {
  EventInstanceDto,
  RoomTypeDto,
  CreateRegistrationDto,
  RegistrationDto,
  AdminSummaryDto,
  PaymentMethod,
  PricingConfig,
  PriceInput,
  PriceResult,
  RegistrationStatus,
} from '@icpe/shared'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const API_URL = (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_API_URL ?? ''

// ---------------------------------------------------------------------------
// Auth token management
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'icpe_admin_token'

let _authToken: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
})()

export function setAuthToken(token: string | null): void {
  const changed = _authToken !== token
  _authToken = token
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    // ignore storage errors
  }
  if (changed && typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
}

export function getAuthToken(): string | null {
  return _authToken
}

/** Zdarzenie „sesja admina się zmieniła" (np. 401 → wylogowanie) — AdminPanel pokazuje wtedy ekran logowania. */
export const AUTH_CHANGED_EVENT = 'icpe-admin-auth-changed'

function tokenClaims(t: string | null): { exp?: number; iat?: number; rmb?: boolean } | null {
  if (!t) return null
  try {
    const p = t.split('.')[1]
    return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number; iat?: number; rmb?: boolean }
  } catch {
    return null
  }
}

/** Czy zapisany token admina jest jeszcze ważny (z 1-min zapasem). */
export function hasValidAdminToken(): boolean {
  const c = tokenClaims(_authToken)
  return !!c && (!c.exp || c.exp * 1000 > Date.now() + 60_000)
}

let _renewing: Promise<void> | null = null

/**
 * Sesja „przesuwna": gdy minęła połowa ważności tokenu, pobiera nowy (ta sama długość sesji).
 * Przy „Zapamiętaj mnie" (30 dni) aktywny admin praktycznie nigdy nie musi logować się ponownie.
 */
export function maybeRenewAdminToken(): Promise<void> {
  const c = tokenClaims(_authToken)
  if (!c?.exp || !c.iat || !API_URL) return Promise.resolve()
  const now = Date.now() / 1000
  if (c.exp <= now) {
    setAuthToken(null)
    return Promise.resolve()
  }
  if (now - c.iat < (c.exp - c.iat) / 2) return Promise.resolve()
  if (_renewing) return _renewing
  _renewing = fetch(`${API_URL}/auth/admin/refresh`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${_authToken}`, 'Content-Type': 'application/json' },
  })
    .then(async (res) => {
      if (res.status === 401) return setAuthToken(null)
      if (!res.ok) return // chwilowy błąd serwera — spróbujemy przy następnej okazji
      const body = (await res.json()) as { accessToken?: string }
      if (body.accessToken) setAuthToken(body.accessToken)
    })
    .catch(() => undefined)
    .finally(() => {
      _renewing = null
    })
  return _renewing
}

/** Odczytuje e-mail zalogowanego admina z payloadu JWT (bez zapytania do API). */
export function getAdminEmail(): string | null {
  const t = _authToken
  if (!t) return null
  try {
    const payload = t.split('.')[1]
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { email?: string }
    return json.email ?? null
  } catch {
    return null
  }
}

/**
 * Wgrywa obrazek (np. tło hero) do backendu i zwraca PEŁNY URL do niego.
 * Używa multipart/form-data (nie ustawiamy Content-Type — przeglądarka doda boundary).
 */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const headers: Record<string, string> = {}
  const tok = _authToken
  if (tok) headers['Authorization'] = `Bearer ${tok}`
  const res = await fetch(`${API_URL}/admin/uploads`, { method: 'POST', headers, body: form })
  if (res.status === 401) {
    setAuthToken(null)
    throw new Error('API 401: Unauthorized')
  }
  if (!res.ok) throw new Error(`Upload ${res.status}: ${res.statusText}`)
  const data = (await res.json()) as { path: string }
  return `${API_URL}${data.path}`
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error('No API URL configured')
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    // headers MUSZĄ być po ...init, inaczej init.headers (np. Authorization)
    // nadpisuje cały obiekt i gubi Content-Type → serwer nie parsuje JSON body.
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (res.status === 401) {
    setAuthToken(null)
    throw new Error(`API 401: Unauthorized`)
  }
  if (!res.ok) {
    // Wyciągnij czytelny komunikat z ciała odpowiedzi (NestJS: { message: string | string[] }).
    let detail = ''
    try {
      const body = (await res.json()) as { message?: unknown; error?: unknown }
      const m = body?.message ?? body?.error
      if (Array.isArray(m)) detail = m.filter((x) => typeof x === 'string').join(' ')
      else if (typeof m === 'string') detail = m
    } catch {
      /* brak JSON w odpowiedzi */
    }
    throw new Error(detail || `Błąd serwera (${res.status})`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_INSTANCE: EventInstanceDto = {
  id: 'inst-2026-01',
  seriesId: 'series-dzien-formacji',
  type: 'ONE_TIME',
  title: 'Dzień Formacji 2026',
  description: 'Wyjazd formacyjny ICPE Mission — czas modlitwy, wspólnoty i odnowy duchowej.',
  startsAt: '2026-09-04T14:00:00.000Z',
  endsAt: '2026-09-05T16:00:00.000Z',
  location: 'Centrum Edukacyjno-Formacyjne, ul. Kilińskiego 20, Ożarów Mazowiecki',
  nights: 1,
  capacity: 80,
  status: 'OPEN',
  registeredCount: 52,
  confirmedCount: 47,
  revenue: 34720,
  currency: 'PLN',
  paymentMethods: ['ONLINE', 'BANK_TRANSFER'],
  slug: 'dzien-formacji-2026',
}

// Room types for display (UI shape — names are localized strings here)
const MOCK_ROOM_TYPES: RoomTypeDto[] = [
  {
    id: 'double',
    name: { pl: 'Pokój 2-osobowy', en: 'Twin / Double', it: 'Doppia' },
    capacity: 2,
    pricingModel: 'PER_PERSON_PER_NIGHT',
    price: 80,
    quantity: 20,
  },
  {
    id: 'single',
    name: { pl: 'Pokój 1-osobowy', en: 'Single', it: 'Singola' },
    capacity: 1,
    pricingModel: 'PER_PERSON_PER_NIGHT',
    price: 100,
    quantity: 5,
  },
  {
    id: 'family',
    name: { pl: 'Pokój rodzinny (4 os.)', en: 'Family Room (4 pax)', it: 'Camera familiare (4 pax)' },
    capacity: 4,
    pricingModel: 'PER_PERSON_PER_NIGHT',
    price: 70,
    quantity: 8,
  },
]

/**
 * Canonical pricing config — nowy format z progami wiekowymi (childBrackets)
 * i pokojem jako listą do komponowania.
 */
const MOCK_PRICING: PricingConfig = {
  formationFee: 50,
  mealsFee: 80,
  nights: 1,
  childBrackets: [
    { ltAge: 4, multiplier: 0 },   // 0–3 gratis
    { ltAge: 13, multiplier: 0.7 }, // 4–12 → 70%
    { ltAge: 18, multiplier: 0.9 }, // 13–17 → 90%
  ],
  rooms: [
    { id: 'double', name: 'Miejsce w pokoju 2-osobowym', desc: 'Wspólny pokój dla dwóch osób.', cap: 2, perPerson: 80, model: 'os / noc', tag: 'Najpopularniejsze' },
    { id: 'single', name: 'Pokój 1-osobowy', desc: 'Pokój dla jednej osoby.', cap: 1, perPerson: 100, model: 'noc', tag: '' },
    { id: 'family', name: 'Pokój rodzinny (4 os.)', desc: 'Większy pokój dla rodziny.', cap: 4, perPerson: 70, model: 'os / noc', tag: 'Dla rodzin' },
  ],
  options: { transport: 40, bedding: 15 },
  discountCodes: { ICPE10: 0.1 },
}

const MOCK_REGISTRATIONS: RegistrationDto[] = [
  {
    id: 'reg-001',
    instanceId: 'inst-2026-01',
    status: 'CONFIRMED',
    locale: 'pl',
    contact: { firstName: 'Anna', lastName: 'Kowalska', email: 'anna.kowalska@example.com', phone: '+48 600 100 200' },
    participants: [
      { type: 'adult', firstName: 'Anna', lastName: 'Kowalska', age: 34, gender: 'F' },
      { type: 'adult', firstName: 'Marek', lastName: 'Kowalski', age: 36, gender: 'M' },
    ],
    preferredRoomId: 'double',
    totalPrice: 460,
    currency: 'PLN',
    paymentMethod: 'ONLINE',
    paymentStatus: 'PAID',
    createdAt: '2026-05-12T09:14:00.000Z',
  },
  {
    id: 'reg-002',
    instanceId: 'inst-2026-01',
    status: 'AWAITING_TRANSFER',
    locale: 'pl',
    contact: { firstName: 'Tomasz', lastName: 'Wiśniewski', email: 'tomasz.w@example.com', phone: '+48 601 200 300' },
    participants: [
      { type: 'adult', firstName: 'Tomasz', lastName: 'Wiśniewski', age: 42, gender: 'M' },
    ],
    preferredRoomId: 'family',
    totalPrice: 245,
    currency: 'PLN',
    paymentMethod: 'BANK_TRANSFER',
    paymentStatus: 'AWAITING_TRANSFER',
    createdAt: '2026-05-14T11:30:00.000Z',
  },
  {
    id: 'reg-003',
    instanceId: 'inst-2026-01',
    status: 'CONFIRMED',
    locale: 'pl',
    contact: { firstName: 'Katarzyna', lastName: 'Nowak', email: 'k.nowak@example.com', phone: '+48 602 300 400' },
    participants: [
      { type: 'adult', firstName: 'Katarzyna', lastName: 'Nowak', age: 29, gender: 'F' },
      { type: 'child', firstName: 'Zosia', lastName: 'Nowak', age: 7, gender: 'F' },
      { type: 'child', firstName: 'Piotrek', lastName: 'Nowak', age: 5, gender: 'M' },
    ],
    preferredRoomId: 'family',
    totalPrice: 398,
    currency: 'PLN',
    paymentMethod: 'ONLINE',
    paymentStatus: 'PAID',
    createdAt: '2026-05-15T14:05:00.000Z',
  },
  {
    id: 'reg-004',
    instanceId: 'inst-2026-01',
    status: 'PENDING_PAYMENT',
    locale: 'en',
    contact: { firstName: 'Michael', lastName: 'Johnson', email: 'michael.j@example.com', phone: '+1 555 0101' },
    participants: [
      { type: 'adult', firstName: 'Michael', lastName: 'Johnson', age: 38, gender: 'M' },
      { type: 'adult', firstName: 'Sarah', lastName: 'Johnson', age: 35, gender: 'F' },
    ],
    preferredRoomId: 'double',
    totalPrice: 460,
    currency: 'PLN',
    paymentMethod: 'ONLINE',
    paymentStatus: 'PENDING',
    createdAt: '2026-05-16T08:22:00.000Z',
  },
  {
    id: 'reg-005',
    instanceId: 'inst-2026-01',
    status: 'CONFIRMED',
    locale: 'it',
    contact: { firstName: 'Marco', lastName: 'Rossi', email: 'marco.rossi@example.com', phone: '+39 333 1234567' },
    participants: [
      { type: 'adult', firstName: 'Marco', lastName: 'Rossi', age: 45, gender: 'M' },
      { type: 'adult', firstName: 'Elena', lastName: 'Rossi', age: 43, gender: 'F' },
      { type: 'child', firstName: 'Luca', lastName: 'Rossi', age: 10, gender: 'M' },
    ],
    preferredRoomId: 'family',
    totalPrice: 379,
    currency: 'PLN',
    paymentMethod: 'BANK_TRANSFER',
    paymentStatus: 'PAID',
    createdAt: '2026-05-17T16:45:00.000Z',
  },
  {
    id: 'reg-006',
    instanceId: 'inst-2026-01',
    status: 'WAITLIST',
    locale: 'pl',
    contact: { firstName: 'Paweł', lastName: 'Zając', email: 'p.zajac@example.com', phone: '+48 603 400 500' },
    participants: [
      { type: 'adult', firstName: 'Paweł', lastName: 'Zając', age: 31, gender: 'M' },
    ],
    preferredRoomId: 'double',
    totalPrice: 200,
    currency: 'PLN',
    paymentMethod: 'BANK_TRANSFER',
    paymentStatus: 'PENDING',
    createdAt: '2026-05-18T10:10:00.000Z',
  },
  {
    id: 'reg-007',
    instanceId: 'inst-2026-01',
    status: 'CONFIRMED',
    locale: 'pl',
    contact: { firstName: 'Monika', lastName: 'Lewandowska', email: 'monika.l@example.com', phone: '+48 604 500 600' },
    participants: [
      { type: 'adult', firstName: 'Monika', lastName: 'Lewandowska', age: 27, gender: 'F' },
      { type: 'adult', firstName: 'Dawid', lastName: 'Lewandowski', age: 28, gender: 'M' },
    ],
    preferredRoomId: 'double',
    totalPrice: 420,
    currency: 'PLN',
    paymentMethod: 'ONLINE',
    paymentStatus: 'PAID',
    createdAt: '2026-05-19T13:00:00.000Z',
  },
]

const MOCK_ADMIN_SUMMARY: AdminSummaryDto = {
  openInstances: 4,
  registrationsToday: 18,
  revenue: 34720,
  currency: 'PLN',
  occupancyPct: 68,
}

// ---------------------------------------------------------------------------
// Public endpoints
// ---------------------------------------------------------------------------

// Demonstracyjny event STANDALONE (bez noclegu, bezpłatny, RSVP)
const MOCK_STANDALONE: EventInstanceDto = {
  id: 'inst-standalone-01',
  seriesId: 'series-spotkanie',
  type: 'STANDALONE',
  title: 'Spotkanie otwarte ICPE',
  description: 'Wieczór uwielbienia i świadectw — wstęp wolny. Potwierdź obecność, byśmy wiedzieli, ilu Was będzie.',
  startsAt: '2026-07-18T17:00:00.000Z',
  endsAt: '2026-07-18T20:00:00.000Z',
  location: 'Parafia św. Anny, ul. Główna 5, Warszawa',
  nights: 0,
  capacity: 200,
  status: 'OPEN',
  registeredCount: 0,
  confirmedCount: 0,
  revenue: 0,
  currency: 'PLN',
  paymentMethods: [],
  slug: 'spotkanie-otwarte',
}

function isStandaloneSlug(slug: string): boolean {
  return slug.includes('spotkanie') || slug.includes('standalone') || slug.includes('rsvp')
}

export interface PublicEventTile {
  slug: string
  title: { pl?: string; en?: string; it?: string } | string
  startsAt: string
  endsAt: string
  location: string
  heroImageUrl: string | null
  primaryColor: string | null
}

/** Publiczna lista aktywnych eventów do strony głównej (kafelki). */
export async function getPublicActiveEvents(): Promise<PublicEventTile[]> {
  try {
    return await apiFetch<PublicEventTile[]>('/events')
  } catch {
    return []
  }
}

export async function getEventBySlug(slug: string): Promise<EventInstanceDto> {
  try {
    const res = await apiFetch<EventInstanceDto | { instance: EventInstanceDto }>(`/r/${slug}`)
    return 'instance' in (res as object) ? (res as { instance: EventInstanceDto }).instance : (res as EventInstanceDto)
  } catch {
    if (isStandaloneSlug(slug)) return { ...MOCK_STANDALONE, slug }
    return { ...MOCK_INSTANCE, slug }
  }
}

export interface RsvpResult {
  id: string
  response: 'YES' | 'NO'
  editToken: string
  calendar: { google: string }
}

export async function createRsvp(input: {
  instanceId: string
  name: string
  email?: string
  response: 'YES' | 'NO'
  locale?: string
}): Promise<RsvpResult> {
  try {
    return await apiFetch<RsvpResult>('/rsvp', { method: 'POST', body: JSON.stringify(input) })
  } catch {
    return {
      id: 'rsvp-mock',
      response: input.response,
      editToken: 'mock-token',
      calendar: { google: '' },
    }
  }
}

export interface EventTheme {
  primaryColor?: string
  titleColor?: string
  heroImageUrl?: string
  /** Tag/kategoria (pigułka u góry hero), np. „ICPE Mission Polska" lub „Rekolekcje". */
  badge?: string
  /** Nadtytuł nad nazwą eventu, np. „Wyjazd formacyjny" (string lub mapa językowa). */
  supertitle?: LangText
}

export interface EventConfig {
  /** Typ eventu z serii — źródło zapasowe, gdy `/r/:slug` nie zwróci `type` na instancji. */
  type?: 'ONE_TIME' | 'EVERGREEN' | 'STANDALONE' | 'INVITE'
  roomTypes: RoomTypeDto[]
  pricing: PricingConfig
  locales: string[]
  theme?: EventTheme
  paymentInfo?: BankInfo
  customFields?: EventContent
  /** Limit pokoi: wolne pokoje per typ (tylko typy z limitem; brak klucza = bez limitu). */
  roomAvailability?: Record<string, number>
  /** Czy event ma aktywny kod rabatowy (flaga z API; bez niej lejek sprawdza cennik). */
  hasDiscountCodes?: boolean
}

export async function getEventConfig(slug: string, locale = 'pl'): Promise<EventConfig> {
  try {
    // Backend zwraca `pricingConfig` (nie `pricing`) → mapujemy, inaczej funnel dostaje
    // undefined i krok „Pokój" się wywala (pusta strona).
    const raw = await apiFetch<Record<string, unknown>>(`/r/${slug}/config?locale=${locale}`)
    return {
      type: raw.type as EventConfig['type'],
      roomTypes: (raw.roomTypes as EventConfig['roomTypes']) ?? MOCK_ROOM_TYPES,
      pricing: (raw.pricingConfig as PricingConfig) ?? (raw.pricing as PricingConfig) ?? MOCK_PRICING,
      locales: (raw.locales as string[]) ?? ['pl'],
      theme: raw.theme as EventTheme | undefined,
      paymentInfo: raw.paymentInfo as BankInfo | undefined,
      customFields: raw.customFields as EventContent | undefined,
      roomAvailability: (raw.roomAvailability as Record<string, number> | undefined) ?? {},
      hasDiscountCodes: typeof raw.hasDiscountCodes === 'boolean' ? raw.hasDiscountCodes : undefined,
    }
  } catch {
    return {
      roomTypes: MOCK_ROOM_TYPES,
      pricing: MOCK_PRICING,
      locales: ['pl', 'en', 'it'],
    }
  }
}

/**
 * Pobiera wycenę z backendu (nowy format PriceInput z komponentami pokoi).
 * Fallback: oblicza lokalnie przez computePrice z @icpe/shared i MOCK_PRICING.
 */
export async function getQuote(input: PriceInput): Promise<PriceResult> {
  try {
    return await apiFetch<PriceResult>('/pricing/quote', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  } catch {
    const { computePrice } = await import('@icpe/shared')
    return computePrice(input, MOCK_PRICING)
  }
}

export async function createRegistration(
  data: CreateRegistrationDto,
): Promise<{ registration: RegistrationDto; summary: PriceResult; payment: unknown; canInviteGuests?: boolean }> {
  return apiFetch('/registrations', { method: 'POST', body: JSON.stringify(data) })
}

/** Zakłada konto gościa (bezhasłowo — dostęp przez e-mail/magic-link). */
export async function registerGuest(data: {
  email: string
  firstName: string
  lastName: string
  phone?: string
  locale?: string
}): Promise<unknown> {
  return apiFetch('/auth/guest/register', { method: 'POST', body: JSON.stringify(data) })
}

export interface UploadItem {
  id: string
  path: string
  url: string
  mimeType: string
  size: number
  createdAt: string
}

/** Lista wgranych obrazków (galeria) — zwraca pełne URL-e. */
export async function listUploads(token?: string): Promise<UploadItem[]> {
  const rows = await apiFetch<Array<Omit<UploadItem, 'url'>>>('/admin/uploads', {
    headers: authHeaders(token),
  })
  return rows.map((r) => ({ ...r, url: `${API_URL}${r.path}` }))
}

export interface Place {
  id: string
  label: string
}

/** Lista zapisanych miejsc/lokalizacji. */
export async function listPlaces(token?: string): Promise<Place[]> {
  return apiFetch<Place[]>('/admin/places', { headers: authHeaders(token) })
}

/** Zapisuje nowe miejsce (idempotentnie po label). */
export async function createPlace(label: string, token?: string): Promise<Place> {
  return apiFetch<Place>('/admin/places', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ label }),
  })
}

/** Zmiana nazwy zapisanego miejsca (eventy trzymają kopię tekstu — stare się nie zmieniają). */
export async function renamePlace(id: string, label: string, token?: string): Promise<Place> {
  return apiFetch<Place>(`/admin/places/${id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ label }),
  })
}

export async function deletePlace(id: string, token?: string): Promise<void> {
  await apiFetch(`/admin/places/${id}`, { method: 'DELETE', headers: authHeaders(token) })
}

// ── Biblioteka gości specjalnych ─────────────────────────────────────────────

export interface SavedGuest {
  id: string
  name: Record<string, string>
  bio?: Record<string, string> | null
  photoUrl?: string | null
  plural: boolean
  updatedAt?: string
}

/** Zapisani goście specjalni (najnowsze/ostatnio zmieniane pierwsze). */
export async function listSavedGuests(token?: string): Promise<SavedGuest[]> {
  return apiFetch<SavedGuest[]>('/admin/special-guests', { headers: authHeaders(token) })
}

/** Zapis gościa w bibliotece: z `id` → aktualizacja; bez `id` → po imieniu PL (bez duplikatów). */
export async function saveSavedGuest(
  g: { id?: string; name: Record<string, string>; bio: Record<string, string>; photoUrl: string; plural: boolean },
  token?: string,
): Promise<SavedGuest> {
  return apiFetch<SavedGuest>('/admin/special-guests', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(g),
  })
}

export async function deleteSavedGuest(id: string, token?: string): Promise<void> {
  await apiFetch(`/admin/special-guests/${id}`, { method: 'DELETE', headers: authHeaders(token) })
}

// ── Zaproszenia (event typu INVITE) ──────────────────────────────────────────

export interface Invitee {
  firstName: string
  lastName: string
  email: string
  /** Opcjonalny telefon — pozwala wysłać zaproszenie wprost przez WhatsApp. */
  phone?: string
  /** Personalizacja maila z zaproszeniem (puste = standardowa treść). */
  mailSalutation?: string | null
  mailNote?: string | null
  mailSubject?: string | null
  mailFormal?: boolean
}

/** Pola personalizacji maila — edytowane w panelu przy gościu. */
export type MailPersonalization = Pick<Invitee, 'mailSalutation' | 'mailNote' | 'mailSubject' | 'mailFormal'>

export interface MailPreview {
  to: string | null
  subject: string
  html: string
}

/** Szkic do podglądu maila: pola gościa + (opcjonalnie) tryb „potwierdzony przez organizatora" ze składem. */
export type PreviewDraft = Partial<Invitee> & { preconfirmed?: boolean; household?: HouseholdInput }

/** Podgląd maila zapisanego gościa; `draft` nadpisuje zapisane pola (bez zapisu). */
export async function previewInvitation(invId: string, draft: PreviewDraft, token?: string): Promise<MailPreview> {
  return apiFetch(`/admin/invitations/${invId}/preview`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(draft),
  })
}

/** Podgląd maila dla gościa, który dopiero będzie dodany. */
export async function previewNewInvitation(instanceId: string, draft: PreviewDraft, token?: string): Promise<MailPreview> {
  return apiFetch(`/admin/instances/${instanceId}/invitations/preview`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(draft),
  })
}

/** Wpis dziecka w deklaracji gościa. */
export interface ChildEntry {
  firstName?: string
  age: number
  /** Wymagania żywieniowe dziecka (opcjonalne). */
  dietary?: string
}

/**
 * Gospodarstwo domowe wpisywane przez admina (osoba główna + małżonek + dzieci).
 * Przy edycji istniejącego: pole pominięte = bez zmian, `spouse: null` = bez małżonka.
 */
export interface HouseholdInput extends MailPersonalization {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  dietaryNotes?: string | null
  spouse?: { firstName?: string; lastName?: string; dietaryNotes?: string | null } | null
  children?: ChildEntry[]
  adminNote?: string | null
}

export type InvitationStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED'
export type DietStatus = 'PROVIDED' | 'NONE' | 'UNKNOWN'

export interface HouseholdConflict {
  index: number
  kind: 'SAME_PERSON_PENDING' | 'SAME_PERSON_CONFIRMED' | 'SPOUSE_ON_LIST' | 'PERSON_IS_SPOUSE'
  existingId: string
  label: string
  blocking: boolean
}

export interface CreateConfirmedResult {
  items: InvitationItem[]
  conflicts: HouseholdConflict[]
  added: number
  confirmedExisting: number
  mail: { sent: number; failed: number; logged: number; noEmail: number }
}

export type MailSendStatus = 'SENT' | 'FAILED' | 'LOGGED' | 'NO_EMAIL' | 'SKIPPED'

/** Payload deklaracji przy potwierdzeniu udziału (link imienny lub dopasowanie po danych). */
export interface ConfirmPayload {
  dietaryNotes?: string
  spouseAttending?: boolean
  spouseFirstName?: string
  spouseLastName?: string
  spouseDietaryNotes?: string
  children?: ChildEntry[]
}

export interface InvitationItem extends Omit<Invitee, 'phone'> {
  id: string
  token: string
  /** Gotowy link /i/:token złożony po stronie API (bazuje na PUBLIC_APP_URL). */
  link?: string
  phone?: string | null
  confirmedAt: string | null
  /** Kiedy poszedł mail z zaproszeniem (null = jeszcze nie wysłano). */
  sentAt?: string | null
  dietaryNotes: string | null
  spouseAttending: boolean | null
  spouseFirstName: string | null
  spouseLastName: string | null
  spouseDietaryNotes: string | null
  children: ChildEntry[]
  /** Zgłoszenie (moduł Zgłoszenia/Obecność) powiązane przy potwierdzeniu — null, gdy jeszcze niezsynchronizowane. */
  registrationId: string | null
  /** „Imię Nazwisko" uczestnika, który dodał tę osobę (null = dodana przez admina). */
  invitedByName?: string | null
  invitedByParticipant?: boolean
  /** Link „Zaproś gościa" tej osoby (/g/:token) — potwierdzeni, gdy ścieżka gości włączona. */
  guestInviteLink?: string | null
  /** PENDING / CONFIRMED / DECLINED (starsze API: brak → wyliczyć z confirmedAt). */
  status?: InvitationStatus
  /** Kto potwierdził: GUEST (link/dopasowanie) albo ADMIN (panel). */
  confirmedBy?: 'GUEST' | 'ADMIN' | null
  guestRespondedAt?: string | null
  declinedAt?: string | null
  /** Status diety potwierdzonej rodziny: PROVIDED / NONE (potwierdzone „bez wymagań") / UNKNOWN. */
  dietStatus?: DietStatus | null
  adminNote?: string | null
}

export async function createInvitations(
  instanceId: string,
  invitees: Invitee[],
  token?: string,
  sendEmails = true,
): Promise<InvitationItem[]> {
  return apiFetch<InvitationItem[]>(`/admin/instances/${instanceId}/invitations`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ invitees, sendEmails }),
  })
}

export async function listInvitations(instanceId: string, token?: string): Promise<InvitationItem[]> {
  return apiFetch<InvitationItem[]>(`/admin/instances/${instanceId}/invitations`, {
    headers: authHeaders(token),
  })
}

export async function updateInvitation(
  invId: string,
  patch: Partial<Invitee>,
  token?: string,
): Promise<InvitationItem> {
  return apiFetch<InvitationItem>(`/admin/invitations/${invId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(patch),
  })
}

/** Dodaje od razu potwierdzone osoby/małżeństwa/rodziny (event INVITE) — bez zaproszenia. */
export async function createConfirmedInvitations(
  instanceId: string,
  households: HouseholdInput[],
  opts: { sendEmails?: boolean; confirmExisting?: boolean; ignoreWarnings?: boolean } = {},
  token?: string,
): Promise<CreateConfirmedResult> {
  return apiFetch(`/admin/instances/${instanceId}/invitations/confirmed`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ households, ...opts }),
  })
}

/** „Potwierdź ręcznie" albo „Edytuj skład i diety" (idempotentne). */
export async function confirmInvitationByAdmin(
  invId: string,
  household: HouseholdInput,
  sendEmail?: boolean,
  token?: string,
): Promise<{ item: InvitationItem; mail: MailSendStatus }> {
  return apiFetch(`/admin/invitations/${invId}/confirm`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ ...household, ...(sendEmail === undefined ? {} : { sendEmail }) }),
  })
}

/** Cofnij potwierdzenie albo odmowę → z powrotem „czeka". */
export async function unconfirmInvitation(invId: string, token?: string): Promise<InvitationItem> {
  return apiFetch(`/admin/invitations/${invId}/unconfirm`, { method: 'POST', headers: authHeaders(token) })
}

/** Oznacz odmowę udziału (np. po telefonie). */
export async function declineInvitationByAdmin(invId: string, token?: string): Promise<InvitationItem> {
  return apiFetch(`/admin/invitations/${invId}/decline`, { method: 'POST', headers: authHeaders(token) })
}

/** Przypomnienie o diecie dla potwierdzonych przez organizatora, którzy nie odpowiedzieli. */
export async function sendDietReminders(
  instanceId: string,
  token?: string,
): Promise<{ sent: number; failed: number; logged: number; skipped: number }> {
  return apiFetch(`/admin/instances/${instanceId}/invitations/diet-reminders`, {
    method: 'POST',
    headers: authHeaders(token),
  })
}

export async function deleteInvitation(invId: string, token?: string): Promise<void> {
  await apiFetch(`/admin/invitations/${invId}`, { method: 'DELETE', headers: authHeaders(token) })
}

/** Wysyła (lub ponawia) mail z zaproszeniem do jednej osoby. */
export async function sendInvitation(
  invId: string,
  token?: string,
): Promise<{ ok: boolean; status: 'SENT' | 'FAILED' | 'LOGGED' | 'NO_EMAIL' }> {
  return apiFetch(`/admin/invitations/${invId}/send`, { method: 'POST', headers: authHeaders(token) })
}

/** Wysyłka zbiorcza; domyślnie tylko do tych, którzy jeszcze nie dostali maila. */
export async function sendAllInvitations(
  instanceId: string,
  onlyUnsent = true,
  token?: string,
): Promise<{ sent: number; failed: number; skipped: number; logged: number }> {
  return apiFetch(`/admin/instances/${instanceId}/invitations/send`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ onlyUnsent }),
  })
}

/** Rozsyła uczestnikom link „Zaproś gościa" (dla tych, którzy zapisali się przed włączeniem ścieżki). */
export async function sendGuestInviteLinks(
  instanceId: string,
  token?: string,
): Promise<{ sent: number; failed: number; logged: number; skipped: number }> {
  return apiFetch(`/admin/instances/${instanceId}/guest-invite-links/send`, {
    method: 'POST',
    headers: authHeaders(token),
  })
}

/** Backfill: dogania zgłoszenia (Zgłoszenia/Obecność) dla już potwierdzonych zaproszeń tej instancji. */
export async function syncInvitationRegistrations(
  instanceId: string,
  token?: string,
): Promise<{ created: number; updated: number; failed: number }> {
  return apiFetch(`/admin/instances/${instanceId}/invitations/sync-registrations`, {
    method: 'POST',
    headers: authHeaders(token),
  })
}

/** Tekst wielojęzyczny: albo zwykły string (legacy), albo mapa { pl, en, it }. */
export type LangText = string | Record<string, string>

/** Wybiera wersję językową z LangText; fallback: dla PL → pl, en…; dla innych języków → en, potem pl, potem pierwsza dostępna. */
export function pickLang(value: LangText | undefined | null, lng: string): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  // Puste wersje traktujemy jak brak tłumaczenia (spadamy do kolejnego języka).
  const has = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
  const l = (lng || 'pl').slice(0, 2)
  const order = l === 'pl' ? ['pl', 'en'] : [l, 'en', 'pl']
  for (const k of order) if (has(value[k])) return value[k]
  return Object.values(value).find(has) ?? ''
}

/**
 * Tłumaczenia miejsca wydarzenia. Kanoniczne miejsce (PL) siedzi w `EventInstance.location`
 * (z niego korzystają kalendarz .ics i maile); tu trzymamy wersje językowe razem z kopią PL,
 * z której je zrobiono (`pl`). Gdy ktoś później zmieni miejsce po polsku, a tłumaczenia nie
 * poprawi — stare tłumaczenie przestaje pasować i strona pokazuje aktualne miejsce po polsku,
 * zamiast nieaktualnego adresu w innym języku.
 */
export type LocationI18n = { pl?: string; en?: string; it?: string }

/** Miejsce wydarzenia w języku `lng` (fallback: kanoniczne miejsce PL). */
export function eventLocation(
  location: string | null | undefined,
  content: EventContent | null | undefined,
  lng: string,
): string {
  const base = (location ?? '').trim()
  if (!base) return ''
  const m = content?.locationI18n
  if (!m || lng === 'pl') return base
  const tr = (m as Record<string, string | undefined>)[lng]?.trim()
  return tr && (m.pl ?? '').trim() === base ? tr : base
}

/** Gość specjalny (osoba albo para — wtedy jedno zdjęcie i wspólny opis). */
export interface SpecialGuest {
  /** Imiona — string (starsze eventy) albo mapa językowa („Anna i Mario" / „Anna and Mario"). */
  name?: LangText
  photoUrl?: string
  /** true → para / kilka osób w jednym wpisie (np. małżeństwo). */
  plural?: boolean
  /** Krótkie 1–2 zdania: kim są. Wielojęzyczne jak program. */
  bio?: LangText
}

/** Lista gości specjalnych eventu — nowy format `specialGuests` albo starszy pojedynczy `specialGuest`. */
export function eventGuests(content: EventContent | null | undefined): SpecialGuest[] {
  if (Array.isArray(content?.specialGuests)) return content!.specialGuests!.filter(Boolean)
  return content?.specialGuest ? [content.specialGuest] : []
}

export interface EventContent {
  program?: { time: string; item: LangText }[]
  /** Wersje językowe miejsca — patrz `LocationI18n`. */
  locationI18n?: LocationI18n | null
  /** Starszy format: jeden gość (lub para). Nowe zapisy używają `specialGuests`. */
  specialGuest?: SpecialGuest | null
  /** Goście specjalni — dowolnie wielu, w kolejności wyświetlania. */
  specialGuests?: SpecialGuest[] | null
  /** Ścieżka „uczestnik zaprasza gościa" — włączana per event w edycji. */
  guestInvites?: { enabled?: boolean; maxPerInviter?: number } | null
  /** Pole przynależności w formularzu zapisu: parafia (tekst) / wspólnota (lista) / brak. */
  affiliationField?: 'parish' | 'community' | null
  /** Diety do wyboru w formularzu (klucze z `lib/diets.ts`); brak/pusta = bez wyboru diet. */
  diets?: string[] | null
}

export interface InvitationView {
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  /** Kto zaprosił (gość uczestnika) — null, gdy zaproszenie od organizatora. */
  invitedByName?: string | null
  /** Po potwierdzeniu pokazać „Zaproś gościa" (event INVITE z włączoną ścieżką, osoba nie jest gościem). */
  guestInvitesEnabled?: boolean
  maxGuests?: number
  confirmedAt: string | null
  /** Kto potwierdził: ADMIN = organizator dodał jako potwierdzonego. */
  confirmedBy?: 'GUEST' | 'ADMIN' | null
  /** Kiedy gość ostatnio sam zapisał odpowiedź (null = jeszcze nie odpowiadał). */
  guestRespondedAt?: string | null
  /** Odmowa udziału („Nie damy rady przyjść"). */
  declinedAt?: string | null
  /** Wydarzenie już się zaczęło — odpowiedź tylko do odczytu. */
  eventStarted?: boolean
  dietaryNotes: string | null
  spouseAttending: boolean | null
  spouseFirstName: string | null
  spouseLastName: string | null
  spouseDietaryNotes: string | null
  children: ChildEntry[]
  event: {
    title: unknown
    description: unknown
    startsAt: string
    endsAt: string
    location: string | null
    theme: EventTheme | null
    customFields: EventContent | null
    slug: string | null
    type?: string | null
    /** Języki strony wybrane dla eventu (do przełącznika). */
    locales?: string[] | null
  }
}

/** Publiczne: dane zaproszenia po tokenie (strona /i/:token). */
export async function getInvitation(inviteToken: string): Promise<InvitationView> {
  return apiFetch<InvitationView>(`/invite/${inviteToken}`)
}

/** Publiczne: potwierdź (lub zmień) udział po linku — deklaracja małżonka/dzieci/diety. */
export async function confirmInvitation(
  inviteToken: string,
  payload: ConfirmPayload,
): Promise<{ ok: boolean }> {
  return apiFetch(`/invite/${inviteToken}/confirm`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** Publiczne: „Nie damy rady przyjść" — odmowa udziału po linku. */
export async function declineInvitation(inviteToken: string): Promise<{ ok: boolean }> {
  return apiFetch(`/invite/${inviteToken}/decline`, { method: 'POST' })
}

/**
 * Publiczne: dopasuj dane do zaproszenia (bez linku) i potwierdź. Rzuca, gdy brak dopasowania.
 * `alreadyConfirmed` — udział potwierdził organizator; dane nie zostały zmienione, link poszedł mailem.
 */
export async function matchInvite(
  slug: string,
  data: Invitee & ConfirmPayload,
): Promise<{ ok: boolean; firstName: string; alreadyConfirmed?: boolean }> {
  return apiFetch(`/r/${slug}/invite-match`, { method: 'POST', body: JSON.stringify(data) })
}

// ---------------------------------------------------------------------------
// Ścieżka „uczestnik zaprasza gościa" (publiczna, token w URL-u /g/:token)
// ---------------------------------------------------------------------------

export type GuestBlockedReason = 'DISABLED' | 'NOT_CONFIRMED' | 'GUEST_CANNOT_INVITE' | 'CLOSED' | 'LIMIT' | null

export interface GuestInviteView {
  inviter: { firstName: string }
  event: {
    title: unknown
    startsAt: string
    endsAt: string
    location: string | null
    theme: EventTheme | null
    slug: string | null
    type: string | null
    locales?: string[] | null
  }
  /** CONFIRM = gość potwierdza udział (event na zaproszenie), REGISTER = gość przechodzi rejestrację. */
  guestFlow: 'CONFIRM' | 'REGISTER'
  maxGuests: number
  used: number
  remaining: number
  canInvite: boolean
  blockedReason: GuestBlockedReason
  guests: { id: string; firstName: string; lastName: string; email: string; status: 'CONFIRMED' | 'PENDING' | 'DECLINED'; sentAt: string | null }[]
  added?: { id: string; mailStatus: 'SENT' | 'FAILED' | 'LOGGED' | 'NO_EMAIL' }
}

export interface GuestInput {
  firstName: string
  lastName: string
  email: string
  phone: string
}

export async function getGuestInvites(token: string): Promise<GuestInviteView> {
  return apiFetch<GuestInviteView>(`/guest-invites/${encodeURIComponent(token)}`)
}

export async function addGuestInvite(token: string, guest: GuestInput): Promise<GuestInviteView> {
  return apiFetch<GuestInviteView>(`/guest-invites/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: JSON.stringify(guest),
  })
}

export async function removeGuestInvite(token: string, guestId: string): Promise<GuestInviteView> {
  return apiFetch<GuestInviteView>(`/guest-invites/${encodeURIComponent(token)}/guests/${guestId}`, {
    method: 'DELETE',
  })
}

export async function getRegistration(id: string, token: string): Promise<RegistrationDto> {
  return apiFetch(`/registrations/${id}?token=${token}`)
}

export async function updateRegistration(
  id: string,
  token: string,
  data: Partial<CreateRegistrationDto>,
): Promise<RegistrationDto> {
  return apiFetch(`/registrations/${id}?token=${token}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function startCheckout(
  regId: string,
  method: PaymentMethod,
): Promise<{ redirectUrl?: string; transferDetails?: unknown }> {
  return apiFetch(`/payments/${regId}/checkout`, {
    method: 'POST',
    body: JSON.stringify({ method }),
  })
}

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------

function authHeaders(token?: string): Record<string, string> {
  const tok = token ?? getAuthToken()
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

// ── Poczta (Ustawienia ▸ E-mail) ────────────────────────────────────────────

export interface MailStatus {
  provider: 'resend' | 'smtp' | 'log'
  from: string
  replyTo: string | null
  resendKeySet: boolean
  resendKeyHint: string | null
  smtpHost: string | null
  mailModeEnv: string | null
}

export interface MailLogItem {
  id: string
  type: string
  to: string
  status: string
  provider: string | null
  error: string | null
  createdAt: string
}

export async function getMailStatus(token?: string): Promise<MailStatus> {
  return apiFetch<MailStatus>('/admin/mail/status', { headers: authHeaders(token) })
}

export async function sendTestMail(
  to: string,
  token?: string,
): Promise<{ status: 'SENT' | 'FAILED' | 'LOGGED'; error?: string; provider: string }> {
  return apiFetch('/admin/mail/test', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ to }) })
}

export async function getMailLog(limit = 30, token?: string): Promise<MailLogItem[]> {
  return apiFetch<MailLogItem[]>(`/admin/mail/log?limit=${limit}`, { headers: authHeaders(token) })
}

export async function getAdminSummary(token?: string): Promise<AdminSummaryDto> {
  return apiFetch<AdminSummaryDto>('/admin/summary', {
    headers: authHeaders(token),
  })
}

export async function getAdminInstances(
  status?: string,
  token?: string,
): Promise<EventInstanceDto[]> {
  const qs = status ? `?status=${status}` : ''
  return apiFetch<EventInstanceDto[]>(`/admin/instances${qs}`, {
    headers: authHeaders(token),
  })
}

export async function getAdminRegistrations(
  instanceId: string,
  opts?: { status?: string; q?: string; token?: string },
): Promise<RegistrationDto[]> {
  const params = new URLSearchParams()
  if (opts?.status) params.set('status', opts.status)
  if (opts?.q) params.set('q', opts.q)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return apiFetch<RegistrationDto[]>(
    `/admin/instances/${instanceId}/registrations${qs}`,
    { headers: authHeaders(opts?.token) },
  )
}

/** Admin: pełna edycja zgłoszenia (kontakt, uczestnicy, pokoje, opcje) z przeliczeniem ceny. */
export interface AdminEditRegistrationDto {
  /** `countryCode`: kod ISO alpha-2 kraju zamieszkania; '' = usuń zapisany kraj (decyduje wtedy język zgłoszenia). */
  contact?: { firstName: string; lastName: string; email: string; phone?: string; countryCode?: string }
  participants: Array<{ type: 'adult' | 'child'; firstName: string; lastName?: string; age?: number; gender?: string; dietary?: string }>
  rooms: Array<{ roomId: string; participantIndexes: number[] }>
  options?: {
    transport?: boolean
    bedding?: boolean
    /** darowizna gościa na dofinansowanie pobytu innych (0 = usuń) */
    donation?: number
    /** ręczna korekta ceny (rabat %, rabat kwotowy, kwota końcowa, notatka) */
    adjustment?: { discountPct?: number; discountAmount?: number; overrideTotal?: number; note?: string }
  }
  discountCode?: string
  dietaryNotes?: string | null
  locale?: string
  /** Pokoje z puli zarezerwowanej dla gości specjalnych. */
  roomsReserved?: boolean
}
export async function adminUpdateRegistration(
  id: string,
  dto: AdminEditRegistrationDto,
  token?: string,
): Promise<{ registration: RegistrationDto; summary: unknown }> {
  return apiFetch(`/admin/registrations/${id}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(dto),
  })
}

/** Strona z licznikiem: zapis e-maila na listę oczekujących (jeden mail w chwili startu zapisów). */
export async function joinWaitlist(input: { instanceId: string; email: string; locale?: string }): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/registrations/waitlist', { method: 'POST', body: JSON.stringify(input) })
}

export interface WaitlistInfo {
  count: number
  notified: number
  entries: Array<{ id: string; email: string; locale: string; createdAt: string; notifiedAt: string | null; notifyStatus: string | null }>
}

export async function getInstanceWaitlist(instanceId: string, token?: string): Promise<WaitlistInfo> {
  return apiFetch<WaitlistInfo>(`/admin/instances/${instanceId}/waitlist`, { headers: authHeaders(token) })
}

/** Finanse eventu: wpłacone, zadatki, zaległości, prognoza wpływów wg terminów, darowizny. */
export interface InstanceFinance {
  hasPlan: boolean
  currency: string
  registrations: number
  people: number
  expected: number
  paid: number
  remaining: number
  dueNow: number
  overdue: number
  overdueCount: number
  depositRequired: number
  depositPaid: number
  depositPaidCount: number
  fullyPaidCount: number
  donations: number
  donationsCount: number
  forecast: Array<{ dueDate: string; amount: number; count: number; overdue: boolean }>
}

export async function getInstanceFinance(instanceId: string, token?: string): Promise<InstanceFinance> {
  return apiFetch<InstanceFinance>(`/admin/instances/${instanceId}/finance`, { headers: authHeaders(token) })
}

export interface RegistrationPaymentRow {
  id: string
  amount: number
  currency: string
  status: string
  provider: string
  method: string
  paidAt: string
  note: string | null
  by: string | null
  sender: string | null
  title: string | null
  /** wpłata online (Tpay): transakcja testowa (sandbox) */
  testMode?: boolean
  /** wpłata online (Tpay): wpłacono inną kwotę niż ta, na którą utworzono płatność */
  mismatch?: boolean
  /** wpłata online (Tpay): kwota, na którą utworzono płatność */
  expected?: number | null
  /** zwroty tej wpłaty (wpłaty Tpay) — od najstarszego */
  refunds?: PaymentRefundRow[]
  /** ile z tej wpłaty zwrócono */
  refundedAmount?: number
  /** ile z tej wpłaty liczy się do „Wpłacono” */
  netAmount?: number
  refundState?: 'NONE' | 'PARTIAL' | 'FULL'
  /** ile można jeszcze zwrócić z panelu (0 = zwrot niedostępny) */
  refundable?: number
  /** zwrot w toku albo do wyjaśnienia — kolejne zwroty zablokowane */
  refundInFlight?: boolean
  createdAt: string
}

export interface PaymentRefundRow {
  id: string
  amount: number
  reason: string | null
  /** PENDING (w toku) | DONE (wykonany) | UNCERTAIN (do wyjaśnienia) | FAILED (odrzucony) */
  status: 'PENDING' | 'DONE' | 'UNCERTAIN' | 'FAILED'
  source: 'panel' | 'tpay-notification'
  by: string | null
  createdAt: string
}

export interface RefundResult extends RegistrationPayments {
  ok: boolean
  /** Tpay nie potwierdził zwrotu (np. przekroczony czas) — zwrot czeka na wyjaśnienie */
  uncertain?: boolean
  refundId?: string
  amount?: number
  guestMail?: 'sent' | 'skipped' | 'failed'
}

export interface RegistrationPayments {
  registrationId: string
  payments: RegistrationPaymentRow[]
  summary: NonNullable<RegistrationDto['payment']>
}

export async function getRegistrationPayments(id: string, token?: string): Promise<RegistrationPayments> {
  return apiFetch<RegistrationPayments>(`/admin/registrations/${id}/payments`, { headers: authHeaders(token) })
}

/** Księguje wpłatę (także częściową: zadatek, rata). */
export async function addRegistrationPayment(
  id: string,
  dto: { amount: number; paidAt?: string; method?: 'BANK_TRANSFER' | 'CASH' | 'ONLINE'; note?: string },
  token?: string,
): Promise<RegistrationPayments> {
  return apiFetch<RegistrationPayments>(`/admin/registrations/${id}/payments`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(dto),
  })
}

/** Cofa błędnie wpisaną wpłatę (zostaje w historii jako anulowana). */
export async function voidRegistrationPayment(paymentId: string, token?: string): Promise<RegistrationPayments> {
  return apiFetch<RegistrationPayments>(`/admin/payments/${paymentId}`, { method: 'DELETE', headers: authHeaders(token) })
}

/**
 * Zleca zwrot wpłaty Tpay (prawdziwy przelew zwrotny). Bez `amount` = cała pozostała kwota wpłaty.
 * Kwotę sprawdza serwer. Tylko pełny admin.
 */
export async function refundPayment(
  paymentId: string,
  dto: { amount?: number; reason?: string; notifyGuest?: boolean },
  token?: string,
): Promise<RefundResult> {
  return apiFetch<RefundResult>(`/admin/payments/${paymentId}/refund`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(dto) })
}

/** Rozstrzyga zwrot „do wyjaśnienia” po sprawdzeniu w panelu Tpay (nic nie wysyła do Tpay). */
export async function resolveRefund(refundId: string, outcome: 'done' | 'failed', token?: string): Promise<RefundResult> {
  return apiFetch<RefundResult>(`/admin/payments/refunds/${refundId}/resolve`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ outcome }) })
}

export async function markRegistrationPaid(id: string, token?: string): Promise<void> {
  await apiFetch(`/admin/registrations/${id}/mark-paid`, {
    method: 'POST',
    headers: authHeaders(token),
  })
}

export async function patchRegistrationStatus(
  id: string,
  status: string,
  token?: string,
): Promise<void> {
  await apiFetch(`/admin/registrations/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ status }),
  })
}

/** Obecność: przełącz check-in zgłoszenia (present pominięte → toggle na backendzie). */
export async function toggleRegistrationCheckIn(
  id: string,
  present?: boolean,
  token?: string,
): Promise<void> {
  await apiFetch(`/admin/registrations/${id}/check-in`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(present === undefined ? {} : { present }),
  })
}

/** Zakwaterowanie: ustaw numer pokoju i komentarz dla zgłoszenia. */
export async function setAccommodation(
  id: string,
  dto: { roomLabel?: string | null; roomNote?: string | null },
  token?: string,
): Promise<void> {
  await apiFetch(`/admin/registrations/${id}/accommodation`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(dto),
  })
}

export interface UpdateInstancePayload {
  /** OPEN = otwarty; CLOSED = zamknięty (Personal OS → „Poprzednie"). */
  status?: 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED'
  title?: { pl: string; en?: string; it?: string }
  description?: { pl?: string; en?: string; it?: string } | null
  startsAt?: string
  endsAt?: string
  /** Start zapisów (ISO) — w przyszłości: strona z licznikiem zamiast przycisku zapisu. */
  registrationOpensAt?: string
  location?: string | null
  nights?: number
  capacity?: number | null
  paymentMethods?: string[]
  pricingConfig?: PricingConfig
  /** „Udostępniaj dane ICPE Go" — event widoczny w GET /icpe-go/events. */
  shareWithIcpeGo?: boolean
  /** Kraj eventu — kod ISO 3166-1 alpha-2 („PL”) albo null. */
  countryCode?: string | null
  /** Ukryty event — dostępny tylko przez link /r/<slug>, pomijany na publicznych listach. */
  unlisted?: boolean
}

/** Edycja istniejącego eventu (instancji). */
export async function updateEventInstance(
  instanceId: string,
  payload: UpdateInstancePayload,
  token?: string,
): Promise<unknown> {
  return apiFetch(`/admin/instances/${instanceId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

export interface EventEditConfig {
  type: string
  title: { pl?: string; en?: string; it?: string }
  description?: { pl?: string; en?: string; it?: string } | null
  startsAt: string
  endsAt: string
  /** Start zapisów (ISO). */
  registrationOpensAt?: string | null
  location?: string | null
  nights: number
  capacity?: number | null
  /** „Udostępniaj dane ICPE Go" (EventInstance.shareWithIcpeGo). */
  shareWithIcpeGo?: boolean
  /** Ukryty event (EventInstance.unlisted). */
  unlisted?: boolean
  /** Kraj eventu (EventInstance.countryCode, ISO 3166-1 alpha-2). */
  countryCode?: string | null
  paymentMethods: string[]
  pricingConfig: PricingConfig
  /** Limit pokoi: wolne publicznie / zajęte publicznie / zajęte z rezerwy (tylko typy z limitem). */
  roomAvailability?: Record<string, number>
  roomUsage?: Record<string, number>
  roomUsageReserved?: Record<string, number>
  enabledFields?: Record<string, boolean>
  locales: string[]
  theme?: { primaryColor?: string; heroImageUrl?: string; titleColor?: string; badge?: string; supertitle?: LangText }
  paymentInfo?: BankInfo | null
  customFields?: EventContent | null
}

/** Surowe dane eventu do edycji (bez fallbacku do mocka — błędy mają wyjść na wierzch). */
export async function getEventEditConfig(slug: string, token?: string): Promise<EventEditConfig> {
  return apiFetch<EventEditConfig>(`/r/${slug}/config`, { headers: authHeaders(token) })
}

// ── New admin write endpoints ────────────────────────────────────────────────

export interface CreateSeriesPayload {
  type: 'ONE_TIME' | 'EVERGREEN' | 'STANDALONE' | 'INVITE'
  title: { pl: string; en?: string; it?: string }
  description?: { pl?: string; en?: string; it?: string }
  startsAt: string
  endsAt: string
  location?: string
  nights: number
  capacity?: number
  paymentMethods: string[]
  pricingConfig: PricingConfig
  registrationOpensAt: string
  registrationClosesAt: string
  recurrence?: string
  /** Ukryty event od utworzenia (domyślnie widoczny na listach). */
  unlisted?: boolean
}

export interface SeriesWithInstance {
  id: string
  instances: Array<{ id: string }>
}

export async function createEventSeries(
  payload: CreateSeriesPayload,
  token?: string,
): Promise<SeriesWithInstance> {
  return apiFetch<SeriesWithInstance>('/admin/series', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

export interface BankInfo {
  recipient?: string
  account?: string
  /** Dane do przelewów z zagranicy — pokazywane w wersjach innych niż polska, tylko gdy wypełnione. */
  swift?: string
  bankName?: string
  bankAddress?: string
  /** Podmiot obsługujący wydarzenie (np. „IMAGO Jacek Dudzic") — wypełnione = zdanie pod danymi przelewu. */
  operator?: string
}

export interface ConfigurePagePayload {
  slug: string
  theme?: unknown
  enabledFields: Record<string, boolean>
  customFields?: unknown
  paymentInfo?: BankInfo
  locales: string[]
  isEvergreen: boolean
}

export async function configureSeriesPage(
  seriesId: string,
  payload: ConfigurePagePayload,
  token?: string,
): Promise<unknown> {
  return apiFetch<unknown>(`/admin/series/${seriesId}/page`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

export interface AddRoomTypePayload {
  name: Record<string, string>
  capacity: number
  pricingModel: 'PER_PERSON_PER_NIGHT' | 'PER_ROOM' | 'PER_PERSON' | 'SINGLE_SUPPLEMENT'
  price: number
  quantity: number
  genderPolicy?: 'ANY' | 'MALE' | 'FEMALE' | 'FAMILY'
}

export async function addRoomType(
  instanceId: string,
  payload: AddRoomTypePayload,
  token?: string,
): Promise<unknown> {
  return apiFetch<unknown>(`/admin/instances/${instanceId}/room-types`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

export async function getInstanceDetail(id: string, token?: string): Promise<EventInstanceDto> {
  return apiFetch<EventInstanceDto>(`/admin/instances/${id}`, {
    headers: authHeaders(token),
  })
}

export async function adminLogin(
  email: string,
  password: string,
  remember = true,
): Promise<{ accessToken: string; remember?: boolean }> {
  return apiFetch('/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, remember }),
  })
}

// Re-export mock data for use in components/stories (public funnel fallbacks only)
export { MOCK_INSTANCE, MOCK_ROOM_TYPES, MOCK_PRICING, MOCK_REGISTRATIONS, MOCK_ADMIN_SUMMARY }

// ─── Strona zgłoszenia gościa (/z/:token): podgląd + zmiana / domówienie noclegu ─────

export type ManageLock = 'PAID' | 'CANCELLED' | 'CLOSED' | 'STARTED' | 'NO_ACCOMMODATION' | null

export interface ManagedRegistration {
  id: string
  status: RegistrationStatus
  locale: string
  contact: { firstName: string; lastName: string; email: string }
  participants: Array<{ type: 'adult' | 'child'; name: string; age: number }>
  rooms: Array<{ roomId: string; participantIndexes: number[] }>
  options: { transport?: boolean; bedding?: boolean; donation?: number; adjustment?: { discountPct?: number; discountAmount?: number; overrideTotal?: number; note?: string } }
  discountCode?: string
  totalPrice: number
  currency: 'PLN' | 'EUR' | 'USD'
  paymentMethod?: 'ONLINE' | 'BANK_TRANSFER' | 'CASH' | 'LEADER_DEPOSIT'
  event: {
    title: string | Record<string, string>
    startsAt: string
    endsAt: string | null
    location: string | null
    slug: string | null
    locales: string[] | null
    theme: Record<string, unknown> | null
  }
  pricing: PricingConfig | null
  /** Wolne pokoje dla tego zgłoszenia (jego pokoje wliczone w pulę). */
  roomAvailability?: Record<string, number>
  lock: ManageLock
}

export function getManagedRegistration(token: string): Promise<ManagedRegistration> {
  return apiFetch<ManagedRegistration>(`/registrations/manage/${encodeURIComponent(token)}`)
}

export function updateManagedAccommodation(
  token: string,
  rooms: Array<{ roomId: string; participantIndexes: number[] }>,
): Promise<ManagedRegistration> {
  return apiFetch<ManagedRegistration>(`/registrations/manage/${encodeURIComponent(token)}/accommodation`, {
    method: 'PUT',
    body: JSON.stringify({ rooms }),
  })
}

// ---------------------------------------------------------------------------
// Płatności online (Tpay) — docs/20-plan-wdrozenie-tpay.md
// ---------------------------------------------------------------------------

/** Dostawcy płatności online skonfigurowani na serwerze (w trybie `mock` pusta lista). Błąd = brak płatności online. */
export async function getPaymentsConfig(): Promise<{ providers: string[] }> {
  try {
    const r = await apiFetch<{ providers?: unknown }>('/payments/config')
    return { providers: Array.isArray(r?.providers) ? r.providers.filter((x): x is string => typeof x === 'string') : [] }
  } catch {
    return { providers: [] }
  }
}

export type OnlineUnavailableReason = 'NOT_CONFIGURED' | 'EVENT_DISABLED' | 'CURRENCY' | 'NOT_ELIGIBLE' | 'CANCELLED' | 'NOTHING_TO_PAY'

export interface ManagedPayments {
  registrationId: string
  status: RegistrationStatus
  currency: 'PLN' | 'EUR' | 'USD'
  summary: NonNullable<RegistrationDto['payment']>
  /** granice kwoty płatności online: `due` = „Zapłać teraz”, `min`…`max` = „Inna kwota” */
  bounds: { due: number; min: number; max: number }
  payments: Array<{
    id: string; amount: number; currency: string; status: 'PAID' | 'REFUNDED'; source: 'online' | 'transfer' | 'cash'; paidAt: string
    /** łączna zwrócona kwota tej wpłaty */
    refunded?: number
    /** zwroty tej wpłaty: dzień `YYYY-MM-DD` i kwota */
    refunds?: Array<{ amount: number; date: string }>
  }>
  lastAttempt: { status: 'CREATED' | 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED' | 'EXPIRED'; amount: number; paidAmount: number | null; createdAt: string } | null
  online: { available: boolean; provider: 'tpay' | null; reason: OnlineUnavailableReason | null }
}

/** Strona gościa: rozliczenie zgłoszenia, wpłaty i dostępność płatności online. */
export function getManagedPayments(token: string): Promise<ManagedPayments> {
  return apiFetch<ManagedPayments>(`/registrations/manage/${encodeURIComponent(token)}/payments`)
}

/** Tworzy płatność online; kwotę liczy i sprawdza serwer. Zwraca adres strony płatności Tpay. */
export function startManagedPayment(
  token: string,
  dto: { mode: 'due' | 'remaining' | 'custom'; amount?: number },
): Promise<{ redirectUrl: string; amount: number; currency: string }> {
  return apiFetch(`/registrations/manage/${encodeURIComponent(token)}/pay`, { method: 'POST', body: JSON.stringify(dto) })
}

/** Panel ▸ Ustawienia ▸ Płatności online: tryb, środowisko, czy klucze ustawione (tylko tak / nie). */
export interface OnlinePaymentsStatus {
  mode: 'mock' | 'tpay'
  env: 'sandbox' | 'production'
  ready: boolean
  missing: string[]
  keys: { clientId: boolean; clientSecret: boolean; merchantId: boolean; securityCode: boolean; apiPublicUrl: boolean }
  rootCa: 'env' | 'file' | 'download'
  /** TPAY_ALLOW_TEST_MODE */
  allowTestMode: boolean
  /** flaga włączona na produkcji: testowe wpłaty potwierdzają zgłoszenia bez pieniędzy */
  testModeOnProduction: boolean
  notificationUrl: string | null
  providers: string[]
}

export async function getOnlinePaymentsStatus(token?: string): Promise<OnlinePaymentsStatus> {
  return apiFetch<OnlinePaymentsStatus>('/admin/payments/online-status', { headers: authHeaders(token) })
}

// ---------------------------------------------------------------------------
// Niedokończone zgłoszenia (lead) + jedno przypomnienie mailem po 3 h
// ---------------------------------------------------------------------------

/** Publiczne: lejek zapisuje rozpoczęte zgłoszenie (imię + e-mail po kroku „Dane"). */
export function saveRegistrationLead(input: {
  instanceId: string; email: string; firstName: string; lastName?: string; locale: string; step: number
}): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/registrations/leads', { method: 'POST', body: JSON.stringify(input) })
}

/** Publiczne: link z przypomnienia (`?lead=`) → dane do wpisania w formularz. */
export function getRegistrationLead(token: string): Promise<{ firstName: string; lastName: string; email: string; instanceId: string }> {
  return apiFetch(`/registrations/leads/${encodeURIComponent(token)}`)
}

export interface RegistrationLeadItem {
  id: string
  email: string
  firstName: string
  lastName: string
  locale: string
  step: number
  lastActivityAt: string
  reminderSentAt: string | null
  /** SENT | SKIPPED_CLOSED | SKIPPED_FULL | FAILED */
  reminderStatus: string | null
  convertedAt: string | null
  createdAt: string
}

/** Admin: rozpoczęte zgłoszenia eventu (niedokończone i dokończone). */
export function getAdminLeads(instanceId: string, token?: string): Promise<RegistrationLeadItem[]> {
  return apiFetch<RegistrationLeadItem[]>(`/admin/instances/${instanceId}/leads`, { headers: authHeaders(token) })
}
