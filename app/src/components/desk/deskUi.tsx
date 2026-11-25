import type { CSSProperties, ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { DeskError, type LangTitle } from '@/lib/deskApi'

/** Języki interfejsu Recepcji. */
export const DESK_LANGS = ['pl', 'en', 'it'] as const
export type DeskLang = (typeof DESK_LANGS)[number]
const LANG_KEY = 'icpe_desk_lang'

export function savedDeskLang(): DeskLang | null {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return (DESK_LANGS as readonly string[]).includes(v ?? '') ? (v as DeskLang) : null
  } catch {
    return null
  }
}

export function saveDeskLang(l: DeskLang): void {
  try {
    localStorage.setItem(LANG_KEY, l)
  } catch {
    /* ignore */
  }
}

/** Zapamiętany wybór, a gdy go nie ma: pierwszy obsługiwany język przeglądarki, inaczej angielski. */
export function initialDeskLang(): DeskLang {
  const saved = savedDeskLang()
  if (saved) return saved
  const list = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const n of list) {
    const c = (n ?? '').slice(0, 2).toLowerCase()
    if ((DESK_LANGS as readonly string[]).includes(c)) return c as DeskLang
  }
  return 'en'
}

const LOCALES: Record<string, string> = { pl: 'pl-PL', en: 'en-GB', it: 'it-IT' }
export const localeOf = (lng: string) => LOCALES[(lng || 'pl').slice(0, 2)] ?? 'en-GB'

export function fmtMoney(amount: number, currency: string, lng: string): string {
  try {
    return new Intl.NumberFormat(localeOf(lng), { style: 'currency', currency: currency || 'PLN' }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export function fmtTime(iso: string | Date | null | undefined, lng: string): string {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const sameDay = d.toDateString() === new Date().toDateString()
  return d.toLocaleString(localeOf(lng), sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function fmtDateRange(a: string | null, b: string | null, lng: string): string {
  if (!a) return ''
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
  const from = new Date(a).toLocaleDateString(localeOf(lng), o)
  if (!b) return from
  const to = new Date(b).toLocaleDateString(localeOf(lng), o)
  return from === to ? from : `${from} – ${to}`
}

export function titleOf(title: LangTitle, lng: string): string {
  if (!title) return ''
  if (typeof title === 'string') return title
  const l = (lng || 'pl').slice(0, 2)
  const has = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
  for (const k of [l, 'en', 'pl']) if (has(title[k])) return title[k]
  return Object.values(title).find(has) ?? ''
}

/** Komunikat błędu w języku interfejsu (komunikaty serwera są po polsku, więc tylko jako dopisek). */
export function deskErrText(t: TFunction, e: unknown): string {
  if (e instanceof DeskError) {
    if (e.kind === 'offline') return t('desk.offline.action')
    if (e.kind === 'auth') return t('desk.errors.session')
    if (e.kind === 'forbidden') return t('desk.errors.forbidden')
    if (e.kind === 'notfound') return t('desk.errors.notfound')
    return e.message && e.message !== 'server' ? `${t('desk.errors.server')} (${e.message})` : t('desk.errors.server')
  }
  return t('desk.errors.server')
}

/** Do wyszukiwania: małe litery bez znaków diakrytycznych („Żółć” = „zolc”). */
export function fold(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
}

type Tone = 'brand' | 'ok' | 'warn' | 'err' | 'plain'

const TONES: Record<Tone, CSSProperties> = {
  brand: { background: 'var(--brand)', color: '#fff', border: '1px solid var(--brand)' },
  ok: { background: 'var(--ok)', color: '#fff', border: '1px solid var(--ok)' },
  warn: { background: 'var(--warn)', color: '#fff', border: '1px solid var(--warn)' },
  err: { background: 'transparent', color: 'var(--err)', border: '1px solid var(--err)' },
  plain: { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border)' },
}

/** Duży przycisk pod palec (min. 52 px). */
export function BigButton({
  tone = 'plain',
  children,
  disabled,
  onClick,
  type = 'button',
  small,
}: {
  tone?: Tone
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  small?: boolean
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="w-full inline-flex items-center justify-center gap-2 font-semibold rounded-[14px] px-4 transition-all active:scale-[0.99] disabled:opacity-50"
      style={{ ...TONES[tone], minHeight: small ? 44 : 52, fontSize: small ? 14 : 16, cursor: disabled ? 'default' : 'pointer' }}
    >
      {children}
    </button>
  )
}

export function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'err' | 'brand' | 'muted'; children: ReactNode }) {
  const map: Record<string, CSSProperties> = {
    ok: { background: 'var(--ok-soft)', color: 'var(--ok)' },
    warn: { background: 'var(--warn-soft)', color: 'var(--warn)' },
    err: { background: 'var(--err-soft)', color: 'var(--err)' },
    brand: { background: 'var(--brand-soft)', color: 'var(--brand)' },
    muted: { background: 'var(--bg)', color: 'var(--muted)' },
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap" style={map[tone]}>
      {children}
    </span>
  )
}

export function Notice({ tone, children }: { tone: 'err' | 'warn' | 'ok'; children: ReactNode }) {
  return (
    <div
      role={tone === 'ok' ? 'status' : 'alert'}
      className="rounded-[12px] px-4 py-3 text-sm"
      style={{ background: `var(--${tone}-soft)`, color: `var(--${tone})`, border: `1px solid var(--${tone})` }}
    >
      {children}
    </div>
  )
}

export const fieldStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--ink)',
  borderRadius: 12,
  minHeight: 48,
  fontSize: 16, // 16 px = iOS nie przybliża strony po dotknięciu pola
  padding: '10px 14px',
  width: '100%',
  outline: 'none',
}
