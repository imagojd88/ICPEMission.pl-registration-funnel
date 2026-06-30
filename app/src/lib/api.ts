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
} from '@icpe/shared'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_URL = (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_API_URL ?? ''

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
}

export function getAuthToken(): string | null {
  return _authToken
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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error('No API URL configured')
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (res.status === 401) {
    setAuthToken(null)
    throw new Error(`API 401: Unauthorized`)
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
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
}

export interface EventConfig {
  roomTypes: RoomTypeDto[]
  pricing: PricingConfig
  locales: string[]
  theme?: EventTheme
}

export async function getEventConfig(slug: string, locale = 'pl'): Promise<EventConfig> {
  try {
    return await apiFetch<EventConfig>(`/r/${slug}/config?locale=${locale}`)
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
): Promise<{ registration: RegistrationDto; summary: PriceResult; payment: unknown }> {
  return apiFetch('/registrations', { method: 'POST', body: JSON.stringify(data) })
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

// ── New admin write endpoints ────────────────────────────────────────────────

export interface CreateSeriesPayload {
  type: 'ONE_TIME' | 'EVERGREEN' | 'STANDALONE'
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

export interface ConfigurePagePayload {
  slug: string
  theme?: unknown
  enabledFields: Record<string, boolean>
  customFields?: unknown
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
): Promise<{ accessToken: string; refreshToken: string }> {
  return apiFetch('/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

// Re-export mock data for use in components/stories (public funnel fallbacks only)
export { MOCK_INSTANCE, MOCK_ROOM_TYPES, MOCK_PRICING, MOCK_REGISTRATIONS, MOCK_ADMIN_SUMMARY }
