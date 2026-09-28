import type { ReactNode } from 'react'
import Badge from '@/components/ui/Badge'
import type { CourseStatus, LangText, VideoState } from '@/lib/courses'

export const STATUS_LABEL: Record<CourseStatus, string> = {
  DRAFT: 'Szkic',
  PUBLISHED: 'Opublikowany',
  ARCHIVED: 'Zarchiwizowany',
}

export function StatusBadge({ status }: { status: CourseStatus }) {
  const v = status === 'PUBLISHED' ? 'ok' : status === 'DRAFT' ? 'warn' : 'muted'
  return <Badge variant={v}>{STATUS_LABEL[status]}</Badge>
}

export function VideoStateBadge({ state }: { state: VideoState | null }) {
  switch (state) {
    case 'READY':
      return <Badge variant="ok">Gotowy</Badge>
    case 'PROCESSING':
      return <Badge variant="accent">Kodowanie…</Badge>
    case 'FAILED':
      return <Badge variant="err">Błąd kodowania</Badge>
    default:
      return <Badge variant="warn">Czeka na plik</Badge>
  }
}

export const t = (v: LangText | null | undefined, lng = 'pl') => (v ? v[lng] || v.pl || v.en || '' : '')

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div
      className="rounded-[15px] border overflow-hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
    >
      <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{title}</p>
        {action}
      </div>
      <div className="px-5 py-4 flex flex-col gap-4">{children}</div>
    </div>
  )
}

export function Notice({ kind, children }: { kind: 'ok' | 'err' | 'info'; children: ReactNode }) {
  const map = {
    ok: { bg: 'var(--ok-soft)', fg: 'var(--ok)' },
    err: { bg: 'var(--err-soft)', fg: 'var(--err)' },
    info: { bg: 'var(--surface-2)', fg: 'var(--muted)' },
  }[kind]
  return (
    <p className="text-xs font-medium px-3 py-2 rounded-[8px]" style={{ background: map.bg, color: map.fg }}>
      {children}
    </p>
  )
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
