/**
 * Klient API Recepcji (/desk/*). Osobny od `api.ts`, bo recepcja ma własną sesję:
 * token pomocnika trzymamy pod innym kluczem niż token panelu admina, żeby logowanie
 * pomocnika na wspólnym tablecie nigdy nie podmieniło ani nie odblokowało panelu.
 * Admin zalogowany w panelu wchodzi do recepcji bez ponownego logowania (jego token panelu).
 */
import type { DeskRequestKind, DeskRequestStatus, DeskScope } from '@icpe/shared'
import { API_URL, getAuthToken, hasValidAdminToken, setAuthToken } from './api'

const DESK_TOKEN_KEY = 'icpe_desk_token'
export const DESK_AUTH_EVENT = 'icpe-desk-auth-changed'

function readStored(): string | null {
  try {
    return localStorage.getItem(DESK_TOKEN_KEY)
  } catch {
    return null
  }
}

let _deskToken: string | null = readStored()

function claims(t: string | null): { exp?: number; email?: string; role?: string; realm?: string } | null {
  if (!t) return null
  try {
    const p = t.split('.')[1]
    return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number; email?: string; role?: string; realm?: string }
  } catch {
    return null
  }
}

const alive = (t: string | null) => {
  const c = claims(t)
  return !!c && (!c.exp || c.exp * 1000 > Date.now() + 30_000)
}

export function setDeskToken(token: string | null): void {
  _deskToken = token
  try {
    if (token) localStorage.setItem(DESK_TOKEN_KEY, token)
    else localStorage.removeItem(DESK_TOKEN_KEY)
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DESK_AUTH_EVENT))
}

/** Sesja recepcji: własny token recepcji, a gdy go nie ma — ważny token panelu admina. */
export function deskSession(): { token: string; source: 'desk' | 'admin'; email: string | null } | null {
  if (alive(_deskToken)) return { token: _deskToken as string, source: 'desk', email: claims(_deskToken)?.email ?? null }
  if (hasValidAdminToken()) {
    const t = getAuthToken()
    if (t) return { token: t, source: 'admin', email: claims(t)?.email ?? null }
  }
  return null
}

export type DeskErrorKind = 'offline' | 'auth' | 'forbidden' | 'notfound' | 'server'

export class DeskError extends Error {
  kind: DeskErrorKind
  constructor(kind: DeskErrorKind, message = '') {
    super(message || kind)
    this.kind = kind
  }
}

async function deskFetch<T>(path: string, init?: RequestInit, auth = true): Promise<T> {
  if (!API_URL) throw new DeskError('server', 'No API URL configured')
  const s = auth ? deskSession() : null
  if (auth && !s) throw new DeskError('auth')
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: `Bearer ${s.token}` } : {}), ...init?.headers },
    })
  } catch {
    // fetch rzuca tylko przy braku sieci / zerwanym połączeniu
    throw new DeskError('offline')
  }
  if (res.ok) return res.json() as Promise<T>
  let detail = ''
  try {
    const body = (await res.json()) as { message?: unknown }
    if (Array.isArray(body?.message)) detail = body.message.filter((x) => typeof x === 'string').join(' ')
    else if (typeof body?.message === 'string') detail = body.message
  } catch {
    /* brak JSON */
  }
  if (res.status === 401) {
    if (auth && s?.source === 'desk') setDeskToken(null)
    // token panelu odrzucony = sesja admina nieważna także w panelu
    if (auth && s?.source === 'admin') setAuthToken(null)
    throw new DeskError('auth', detail)
  }
  if (res.status === 403) throw new DeskError('forbidden', detail)
  if (res.status === 404) throw new DeskError('notfound', detail)
  // 502/503/504 z hostingu podczas restartu API traktujemy jak chwilowy brak połączenia
  if (res.status >= 502 && res.status <= 504) throw new DeskError('offline')
  throw new DeskError('server', detail)
}

// ── Typy (lustro odpowiedzi /desk) ───────────────────────────────────────────

export type LangTitle = string | Record<string, string> | null

export interface DeskEventRef {
  instanceId: string
  title: LangTitle
  startsAt: string | null
  endsAt: string | null
  location: string | null
  scopes: DeskScope[]
  expiresAt: string | null
}

export interface DeskMe {
  email: string
  role: string
  full: boolean
  events: DeskEventRef[]
}

export interface DeskPerson {
  id: string
  firstName: string
  lastName: string
  child: boolean
  age: number | null
  diet: string | null
}

export interface DeskRequest {
  id: string
  participantId: string | null
  kind: DeskRequestKind | string
  note: string
  status: DeskRequestStatus
  createdBy: string
  createdAt: string | null
  resolvedBy: string | null
  resolvedAt: string | null
}

export interface DeskMoney {
  total: number
  paid: number
  remaining: number
  dueNow: number
  overdue: number
  currency: string
}

export interface DeskRegistration {
  id: string
  status: string
  contact: { firstName: string; lastName: string; email: string; phone: string }
  people: DeskPerson[]
  dietaryNotes: string | null
  roomLabel: string | null
  roomNote: string | null
  checkedInAt: string | null
  checkedInBy: string | null
  key: { issuedAt: string | null; issuedBy: string | null; returnedAt: string | null; returnedBy: string | null }
  requests: DeskRequest[]
  /** null = brak zakresu „wpłaty” (kwot nie pokazujemy) */
  money: DeskMoney | null
}

export interface DeskCounters {
  registrations: number
  registrationsArrived: number
  people: number
  peopleArrived: number
  keysIssued: number
  keysOut: number
  requestsOpen: number
  toPay: number | null
  toPayCount: number | null
  currency: string
}

export interface DeskOverview {
  event: { instanceId: string; title: LangTitle; startsAt: string | null; endsAt: string | null; location: string | null }
  me: { email: string; full: boolean; scopes: DeskScope[] }
  counters: DeskCounters
  registrations: DeskRegistration[]
  serverTime: string
}

export interface DeskPaymentRow {
  id: string
  amount: number
  currency: string
  status: string
  method: string
  paidAt: string
  note: string | null
  by: string | null
  voidable: boolean
}

// ── Wywołania ────────────────────────────────────────────────────────────────

export async function deskLogin(email: string, password: string): Promise<void> {
  const res = await deskFetch<{ accessToken: string }>('/auth/desk/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false)
  setDeskToken(res.accessToken)
}

export const deskMe = () => deskFetch<DeskMe>('/desk/me')

export const deskOverview = (instanceId: string) => deskFetch<DeskOverview>(`/desk/instances/${encodeURIComponent(instanceId)}`)

const regPath = (instanceId: string, regId: string) => `/desk/instances/${encodeURIComponent(instanceId)}/registrations/${encodeURIComponent(regId)}`

export const deskCheckIn = (instanceId: string, regId: string, present: boolean) =>
  deskFetch<DeskRegistration>(`${regPath(instanceId, regId)}/check-in`, { method: 'POST', body: JSON.stringify({ present }) })

export type DeskKeyAction = 'issue' | 'return' | 'undo-issue' | 'undo-return'

export const deskKey = (instanceId: string, regId: string, action: DeskKeyAction) =>
  deskFetch<DeskRegistration>(`${regPath(instanceId, regId)}/key`, { method: 'POST', body: JSON.stringify({ action }) })

export const deskPayments = (instanceId: string, regId: string) =>
  deskFetch<{ registrationId: string; payments: DeskPaymentRow[] }>(`${regPath(instanceId, regId)}/payments`)

export const deskAddPayment = (
  instanceId: string,
  regId: string,
  input: { amount: number; method: 'CASH' | 'BANK_TRANSFER'; note?: string; clientId: string },
) => deskFetch<DeskRegistration>(`${regPath(instanceId, regId)}/payments`, { method: 'POST', body: JSON.stringify(input) })

export const deskVoidPayment = (instanceId: string, paymentId: string) =>
  deskFetch<DeskRegistration>(`/desk/instances/${encodeURIComponent(instanceId)}/payments/${encodeURIComponent(paymentId)}`, { method: 'DELETE' })

export const deskAddRequest = (instanceId: string, regId: string, input: { kind: DeskRequestKind; participantId?: string | null; note: string }) =>
  deskFetch<DeskRegistration>(`${regPath(instanceId, regId)}/requests`, { method: 'POST', body: JSON.stringify(input) })

export const deskSetRequestStatus = (instanceId: string, requestId: string, status: DeskRequestStatus) =>
  deskFetch<DeskRegistration>(`/desk/instances/${encodeURIComponent(instanceId)}/requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })

/** Identyfikator wpłaty z urządzenia (ochrona przed podwójnym zaksięgowaniem przy ponowieniu). */
export function newClientId(): string {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ── Pomocnicy eventu (panel admina ▸ Edytuj event) — token panelu ────────────

export interface StaffGrant {
  id: string
  email: string
  scopes: DeskScope[]
  createdBy: string
  createdAt: string
  expiresAt: string | null
  expired: boolean
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const t = getAuthToken()
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) } })
  } catch {
    throw new Error('Brak połączenia z internetem.')
  }
  if (res.ok) return res.json() as Promise<T>
  let detail = ''
  try {
    const body = (await res.json()) as { message?: unknown }
    if (typeof body?.message === 'string') detail = body.message
  } catch {
    /* brak JSON */
  }
  throw new Error(detail || `Błąd serwera (${res.status})`)
}

const staffPath = (instanceId: string) => `/admin/instances/${encodeURIComponent(instanceId)}/staff`

export const listStaff = (instanceId: string) => adminFetch<StaffGrant[]>(staffPath(instanceId))

export const addStaff = (instanceId: string, input: { email: string; scopes: DeskScope[]; expiresAt?: string | null }) =>
  adminFetch<{ grant: StaffGrant; accountCreated: boolean; tempPassword: string | null }>(staffPath(instanceId), { method: 'POST', body: JSON.stringify(input) })

export const updateStaff = (instanceId: string, grantId: string, input: { scopes?: DeskScope[]; expiresAt?: string | null }) =>
  adminFetch<StaffGrant>(`${staffPath(instanceId)}/${encodeURIComponent(grantId)}`, { method: 'PATCH', body: JSON.stringify(input) })

export const removeStaff = (instanceId: string, grantId: string) =>
  adminFetch<{ ok: boolean }>(`${staffPath(instanceId)}/${encodeURIComponent(grantId)}`, { method: 'DELETE' })

export const resetStaffPassword = (instanceId: string, grantId: string) =>
  adminFetch<{ email: string; tempPassword: string }>(`${staffPath(instanceId)}/${encodeURIComponent(grantId)}/reset-password`, { method: 'POST' })
