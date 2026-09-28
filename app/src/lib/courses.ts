// Formacja online — klient API panelu admina (kursy, pozycje, kursanci).
// Spec: docs/13-handoff-formacja-online.md
import { API_URL, apiFetch, getAuthToken, setAuthToken } from './api'

export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type LangText = Record<string, string>
export type VideoState = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED'

export interface CourseListItem {
  id: string
  slug: string
  title: LangText
  status: CourseStatus
  url: string
  items: number
  members: number
  createdAt: string
}

export type PdfLang = 'pl' | 'en'
export interface PdfFileMeta {
  id: string
  size: number
  originalName: string | null
}

export interface CourseItem {
  id: string
  kind: 'VIDEO' | 'PDF'
  title: LangText
  description: LangText | null
  order: number
  published: boolean
  videoId: string | null
  videoState: VideoState | null
  durationSec: number | null
  thumbnailUrl: string | null
  fileId: string | null
  fileIdEn: string | null
  file: PdfFileMeta | null
  fileEn: PdfFileMeta | null
  createdAt: string
}

export interface CourseDetail {
  id: string
  slug: string
  slugHistory: string[]
  title: LangText
  description: LangText | null
  status: CourseStatus
  sourceInstanceIds: string[]
  grantOn: 'CONFIRMED' | 'ANY_ACTIVE'
  accessUntil: string | null
  url: string
  members: number
  pendingWelcome: number
  items: CourseItem[]
  welcome?: { sent: number; failed: number }
}

export interface Enrollment {
  id: string
  email: string
  firstName: string
  lastName: string
  locale: string
  source: 'AUTO' | 'MANUAL'
  registrationId: string | null
  active: boolean
  revokedAt: string | null
  revokedReason: string | null
  passwordSet: boolean
  welcomeSentAt: string | null
  lastLoginAt: string | null
  lastSeenAt: string | null
  createdAt: string
}

export interface CoursesConfig {
  video: { configured: boolean; libraryId: string | null; tokenAuth: boolean; thumbnails: boolean; webhookSignature: boolean }
  siteCourseBase: string
}

export interface TusUploadInfo {
  endpoint: string
  headers: Record<string, string>
  expiresAt: string
}

function auth(): Record<string, string> {
  const t = getAuthToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: auth(),
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const listCourses = () => apiFetch<CourseListItem[]>('/admin/courses', { headers: auth() })
export const getCoursesConfig = () => apiFetch<CoursesConfig>('/admin/courses/config', { headers: auth() })
export const checkCourseSlug = (slug: string, excludeId?: string) =>
  apiFetch<{ ok: boolean; reason?: string; suggestion?: string | null; url?: string }>(
    `/admin/courses/slug-check?slug=${encodeURIComponent(slug)}${excludeId ? `&excludeId=${encodeURIComponent(excludeId)}` : ''}`,
    { headers: auth() },
  )
export const createCourse = (body: { title: LangText; slug?: string }) =>
  apiFetch<CourseDetail>('/admin/courses', json('POST', body))
export const getCourse = (id: string) => apiFetch<CourseDetail>(`/admin/courses/${id}`, { headers: auth() })
export const updateCourse = (
  id: string,
  body: Partial<{
    title: LangText
    description: LangText | null
    slug: string
    status: CourseStatus
    sourceInstanceIds: string[]
    grantOn: 'CONFIRMED' | 'ANY_ACTIVE'
    accessUntil: string | null
  }>,
) => apiFetch<CourseDetail>(`/admin/courses/${id}`, json('PATCH', body))
export const deleteCourse = (id: string) => apiFetch<{ ok: true }>(`/admin/courses/${id}`, json('DELETE'))

export const createVideoItem = (courseId: string, title: LangText) =>
  apiFetch<{ item: CourseItem; upload: TusUploadInfo }>(`/admin/courses/${courseId}/items/video`, json('POST', { title }))
export const renewVideoUpload = (courseId: string, itemId: string) =>
  apiFetch<{ item: CourseItem; upload: TusUploadInfo }>(`/admin/courses/${courseId}/items/${itemId}/upload`, json('POST'))
export const updateCourseItem = (
  courseId: string,
  itemId: string,
  body: Partial<{ title: LangText; description: LangText | null; published: boolean }>,
) => apiFetch<CourseItem>(`/admin/courses/${courseId}/items/${itemId}`, json('PATCH', body))
export const refreshCourseItem = (courseId: string, itemId: string) =>
  apiFetch<CourseItem>(`/admin/courses/${courseId}/items/${itemId}/refresh`, json('POST'))
export const deleteCourseItem = (courseId: string, itemId: string) =>
  apiFetch<{ ok: true }>(`/admin/courses/${courseId}/items/${itemId}`, json('DELETE'))
export const reorderCourseItems = (courseId: string, ids: string[]) =>
  apiFetch<{ ok: true }>(`/admin/courses/${courseId}/items-order`, json('PUT', { ids }))

/** Wysyłka multipart (bez Content-Type: przeglądarka doda boundary). */
async function postMultipart<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: auth(), body: form })
  if (res.status === 401) {
    setAuthToken(null)
    throw new Error('Sesja wygasła — zaloguj się ponownie.')
  }
  if (!res.ok) {
    let msg = `Błąd serwera (${res.status})`
    try {
      const b = (await res.json()) as { message?: string | string[] }
      if (b.message) msg = Array.isArray(b.message) ? b.message.join(' ') : b.message
    } catch {
      /* brak JSON */
    }
    if (res.status === 413) msg = 'Plik jest za duży (limit 25 MB).'
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

/** Nowy materiał PDF; `lang` = język wgrywanego pliku. */
export function uploadPdfItem(courseId: string, file: File, title: LangText, lang: PdfLang = 'pl') {
  const form = new FormData()
  form.append('file', file)
  form.append('title', JSON.stringify(title))
  form.append('lang', lang)
  return postMultipart<{ item: CourseItem }>(`/admin/courses/${courseId}/items/pdf`, form)
}

/** Dodanie / podmiana wersji językowej PDF w istniejącym materiale. */
export function setItemPdf(courseId: string, itemId: string, file: File, lang: PdfLang) {
  const form = new FormData()
  form.append('file', file)
  return postMultipart<CourseItem>(`/admin/courses/${courseId}/items/${itemId}/file?lang=${lang}`, form)
}

export const removeItemPdf = (courseId: string, itemId: string, lang: PdfLang) =>
  apiFetch<CourseItem>(`/admin/courses/${courseId}/items/${itemId}/file?lang=${lang}`, json('DELETE'))

export const listEnrollments = (courseId: string) =>
  apiFetch<Enrollment[]>(`/admin/courses/${courseId}/enrollments`, { headers: auth() })
export const addEnrollment = (
  courseId: string,
  body: { email: string; firstName?: string; lastName?: string; locale?: string; sendWelcome?: boolean },
) => apiFetch<{ created: boolean; restored: boolean; mail?: string; courseStatus: CourseStatus }>(
  `/admin/courses/${courseId}/enrollments`,
  json('POST', body),
)
export const importEnrollments = (courseId: string, text: string, sendWelcome = true) =>
  apiFetch<{ added: number; existing: number; invalid: string[] }>(
    `/admin/courses/${courseId}/enrollments/import`,
    json('POST', { text, sendWelcome }),
  )
export const setEnrollmentRevoked = (courseId: string, eid: string, revoked: boolean) =>
  apiFetch<{ ok: true }>(`/admin/courses/${courseId}/enrollments/${eid}`, json('PATCH', { revoked }))
export const resendWelcome = (courseId: string, eid: string) =>
  apiFetch<{ status: string }>(`/admin/courses/${courseId}/enrollments/${eid}/resend`, json('POST'))
export const syncCourseAccess = (courseId: string) =>
  apiFetch<{ processed: number; active: number }>(`/admin/courses/${courseId}/sync`, json('POST'))

// ── Pomocnicze ──

const PL: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' }

/** Ta sama reguła co na serwerze (course-utils.slugify) — podgląd adresu na żywo. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatDuration(sec: number | null | undefined): string {
  if (!sec) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

// ── Podgląd i aktywność ──

export const getPreviewUrl = (courseId: string) =>
  apiFetch<{ url: string }>(`/admin/courses/${courseId}/preview`, json('POST'))

export interface ActivityVideoCell {
  percent: number
  completed: boolean
  positionSec: number
  plays: number
  lastAt: string | null
}
export interface ActivityPdfCell {
  opened: number
  downloaded: number
}
export interface ActivityRow {
  enrollmentId: string
  email: string
  firstName: string
  lastName: string
  source: 'AUTO' | 'MANUAL'
  active: boolean
  passwordSet: boolean
  logins: number
  lastActivityAt: string | null
  items: Record<string, ActivityVideoCell | ActivityPdfCell | null>
}
export interface ActivityReport {
  items: { id: string; kind: 'VIDEO' | 'PDF'; title: LangText; durationSec: number | null }[]
  rows: ActivityRow[]
}
export interface ActivityHistory {
  person: { email: string; firstName: string; lastName: string }
  videos: { itemId: string; title: string | null; percent: number; completedAt: string | null; positionSec: number; durationSec: number | null; firstAt: string; lastAt: string }[]
  events: { type: string; label: string; itemId: string | null; itemTitle: string | null; meta: Record<string, unknown> | null; at: string }[]
}

export const getActivity = (courseId: string) =>
  apiFetch<ActivityReport>(`/admin/courses/${courseId}/activity`, { headers: auth() })
export const getActivityHistory = (courseId: string, enrollmentId: string) =>
  apiFetch<ActivityHistory>(`/admin/courses/${courseId}/activity/${enrollmentId}`, { headers: auth() })

/** Pobiera CSV (z autoryzacją) i zapisuje plik w przeglądarce. */
export async function downloadActivityCsv(courseId: string, slug: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/courses/${courseId}/activity.csv`, { headers: auth() })
  if (res.status === 401) {
    setAuthToken(null)
    throw new Error('Sesja wygasła — zaloguj się ponownie.')
  }
  if (!res.ok) throw new Error(`Błąd serwera (${res.status})`)
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `aktywnosc-${slug}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
