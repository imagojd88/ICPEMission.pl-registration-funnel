import { Fragment, useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Download, FileText, Film, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import {
  downloadActivityCsv, formatDuration, getActivity, getActivityHistory,
  type ActivityHistory, type ActivityPdfCell, type ActivityReport, type ActivityVideoCell, type CourseDetail,
} from '@/lib/courses'
import { Notice, Panel, errMsg, fmtDate, t } from './shared'

/** Zakładka „Aktywność": kursant × materiały (% obejrzenia filmów, otwarcia/pobrania PDF) + historia osoby + CSV. */
export default function CourseActivityTab({ course }: { course: CourseDetail }) {
  const [report, setReport] = useState<ActivityReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [history, setHistory] = useState<Record<string, ActivityHistory | 'loading' | string>>({})
  const [busy, setBusy] = useState(false)
  const [onlyActive, setOnlyActive] = useState(true)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      setReport(await getActivity(course.id))
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }, [course.id])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(eid: string) {
    if (open === eid) return setOpen(null)
    setOpen(eid)
    if (history[eid] && history[eid] !== 'loading') return
    setHistory((h) => ({ ...h, [eid]: 'loading' }))
    try {
      const data = await getActivityHistory(course.id, eid)
      setHistory((h) => ({ ...h, [eid]: data }))
    } catch (e) {
      setHistory((h) => ({ ...h, [eid]: errMsg(e) }))
    }
  }

  async function csv() {
    try {
      await downloadActivityCsv(course.id, course.slug)
    } catch (e) {
      setError(errMsg(e))
    }
  }

  const rows = (report?.rows ?? []).filter((r) => !onlyActive || r.active)
  const items = report?.items ?? []
  const videos = items.filter((i) => i.kind === 'VIDEO')

  return (
    <div className="flex flex-col gap-5">
      {error && <Notice kind="err">{error}</Notice>}

      {report && rows.length > 0 && videos.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(videos.length, 4)}, minmax(0, 1fr))` }}>
          {videos.map((v) => {
            const cells = rows.map((r) => r.items[v.id] as ActivityVideoCell | null)
            const started = cells.filter(Boolean).length
            const done = cells.filter((c) => c?.completed).length
            return (
              <div key={v.id} className="rounded-[12px] border px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                <p className="text-xs truncate" style={{ color: 'var(--faint)' }}>{t(v.title)}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--ink)' }}>
                  <strong>{done}</strong> / {rows.length} obejrzało (≥90%) · rozpoczęło: {started}
                </p>
              </div>
            )
          })}
        </div>
      )}

      <Panel
        title="Postępy kursantów"
        action={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
              <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> tylko z dostępem
            </label>
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
              <RefreshCw size={14} className={busy ? 'animate-spin' : undefined} />
            </Button>
            <Button size="sm" variant="outline" onClick={() => void csv()} disabled={!report || report.rows.length === 0}>
              <Download size={14} /> CSV
            </Button>
          </div>
        }
      >
        {!report && !error && <p className="text-sm" style={{ color: 'var(--faint)' }}>Wczytuję…</p>}
        {report && rows.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Brak kursantów — dodaj ich w zakładce Kursanci.</p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto -mx-5">
            <table className="text-sm min-w-full">
              <thead>
                <tr className="text-left text-xs" style={{ color: 'var(--faint)' }}>
                  <th className="px-5 py-2 font-semibold sticky left-0" style={{ background: 'var(--surface)', minWidth: 220 }}>Kursant</th>
                  <th className="px-2 py-2 font-semibold whitespace-nowrap">Ostatnio</th>
                  {items.map((i) => (
                    <th key={i.id} className="px-2 py-2 font-semibold" style={{ minWidth: 120, maxWidth: 180 }} title={t(i.title)}>
                      <span className="flex items-center gap-1">
                        {i.kind === 'VIDEO' ? <Film size={12} /> : <FileText size={12} />}
                        <span className="truncate block" style={{ maxWidth: 150 }}>{t(i.title)}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.enrollmentId}>
                    <tr
                      onClick={() => void toggle(r.enrollmentId)}
                      className="cursor-pointer"
                      style={{ borderTop: '1px solid var(--border)', opacity: r.active ? 1 : 0.55 }}
                    >
                      <td className="px-5 py-2 sticky left-0" style={{ background: 'var(--surface)' }}>
                        <div className="flex items-center gap-1.5">
                          {open === r.enrollmentId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <div className="min-w-0">
                            <p className="font-medium truncate" style={{ color: 'var(--ink)' }}>{`${r.firstName} ${r.lastName}`.trim() || r.email}</p>
                            <p className="text-xs truncate" style={{ color: 'var(--faint)' }}>
                              {r.email} · {r.passwordSet ? `logowania: ${r.logins}` : 'nie ustawił(a) hasła'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-xs whitespace-nowrap" style={{ color: 'var(--muted)' }}>{fmtDate(r.lastActivityAt)}</td>
                      {items.map((i) => (
                        <td key={i.id} className="px-2 py-2">
                          {i.kind === 'VIDEO' ? <VideoCell c={r.items[i.id] as ActivityVideoCell | null} /> : <PdfCell c={r.items[i.id] as ActivityPdfCell | null} />}
                        </td>
                      ))}
                    </tr>
                    {open === r.enrollmentId && (
                      <tr>
                        <td colSpan={items.length + 2} className="px-5 pb-4" style={{ background: 'var(--surface-2)' }}>
                          <HistoryView h={history[r.enrollmentId]} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs" style={{ color: 'var(--faint)' }}>
          % obejrzenia liczony z unikalnie obejrzanych fragmentów (przewijanie i powtórki nie zawyżają). Film „obejrzany" = co najmniej 90%.
          Kliknij kursanta, aby zobaczyć historię. Twój podgląd jako admin nie jest liczony.
        </p>
      </Panel>
    </div>
  )
}

function VideoCell({ c }: { c: ActivityVideoCell | null }) {
  if (!c) return <span className="text-xs" style={{ color: 'var(--faint)' }}>—</span>
  return (
    <div className="flex flex-col gap-1" title={`Odtworzenia: ${c.plays} · ostatnia pozycja ${formatDuration(c.positionSec) || '0:00'}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: c.completed ? 'var(--ok)' : 'var(--ink)' }}>
        {c.completed && <CheckCircle2 size={13} />} {c.percent}%
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)', width: 90 }}>
        <div className="h-full" style={{ width: `${c.percent}%`, background: c.completed ? 'var(--ok)' : 'var(--brand)' }} />
      </div>
    </div>
  )
}

function PdfCell({ c }: { c: ActivityPdfCell | null }) {
  if (!c) return <span className="text-xs" style={{ color: 'var(--faint)' }}>—</span>
  return (
    <span className="text-xs" style={{ color: 'var(--ink)' }}>
      {c.opened ? `otw. ${c.opened}` : ''}
      {c.opened && c.downloaded ? ' · ' : ''}
      {c.downloaded ? `pobr. ${c.downloaded}` : ''}
    </span>
  )
}

function HistoryView({ h }: { h: ActivityHistory | 'loading' | string | undefined }) {
  if (!h || h === 'loading') return <p className="text-xs pt-3" style={{ color: 'var(--faint)' }}>Wczytuję historię…</p>
  if (typeof h === 'string') return <p className="text-xs pt-3" style={{ color: 'var(--err)' }}>{h}</p>
  return (
    <div className="grid md:grid-cols-2 gap-4 pt-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--faint)' }}>Filmy</p>
        {h.videos.length === 0 && <p className="text-xs" style={{ color: 'var(--muted)' }}>Jeszcze nic nie oglądał(a).</p>}
        {h.videos.map((v) => (
          <p key={v.itemId} className="text-xs mb-1" style={{ color: 'var(--ink)' }}>
            <strong>{v.title ?? '—'}</strong>: {v.percent}%{v.completedAt ? ` (obejrzany ${fmtDate(v.completedAt)})` : ''} · skończył(a) na{' '}
            {formatDuration(v.positionSec) || '0:00'}
            {v.durationSec ? ` / ${formatDuration(v.durationSec)}` : ''} · ostatnio {fmtDate(v.lastAt)}
          </p>
        ))}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--faint)' }}>Historia ({h.events.length})</p>
        <div className="flex flex-col gap-0.5 max-h-[260px] overflow-y-auto">
          {h.events.length === 0 && <p className="text-xs" style={{ color: 'var(--muted)' }}>Brak zdarzeń.</p>}
          {h.events.map((e, i) => (
            <p key={i} className="text-xs" style={{ color: 'var(--ink)' }}>
              <span style={{ color: 'var(--faint)' }}>{fmtDate(e.at)}</span> · {e.label}
              {e.itemTitle ? ` — ${e.itemTitle}` : ''}
              {e.meta && typeof e.meta.lang === 'string' ? ` (${e.meta.lang.toUpperCase()})` : ''}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}
