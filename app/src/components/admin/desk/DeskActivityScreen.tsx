import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, RotateCcw } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import {
  getAdminInstances, getDeskLog, getDeskRequests, setDeskRequestStatus,
  type DeskLogPage, type DeskRequestItem, type DeskRequestsList,
} from '@/lib/api'
import type { EventInstanceDto } from '@icpe/shared'

/**
 * Panel ▸ „Recepcja”: co działo się na stanowisku przyjęć wybranego eventu.
 *  - „Prośby dodatkowe” — dieta, dostawka, inne; filtr otwarte / załatwione, oznaczanie jako załatwione.
 *  - „Dziennik działań” — kto, kiedy i co zrobił w Recepcji (przyjazdy, klucze, wpłaty, prośby); filtr po osobie
 *    i rodzaju akcji, stronicowanie. Tylko odczyt.
 * Sama Recepcja (praca na miejscu) jest pod adresem /recepcja.
 */

const ACTION_LABEL: Record<string, string> = {
  CHECK_IN: 'Przyjazd',
  CHECK_IN_UNDO: 'Cofnięcie przyjazdu',
  KEY_ISSUE: 'Wydanie klucza',
  KEY_RETURN: 'Zwrot klucza',
  KEY_ISSUE_UNDO: 'Cofnięcie wydania klucza',
  KEY_RETURN_UNDO: 'Cofnięcie zwrotu klucza',
  PAYMENT_ADD: 'Przyjęcie wpłaty',
  PAYMENT_VOID: 'Cofnięcie wpłaty',
  REQUEST_ADD: 'Nowa prośba',
  REQUEST_DONE: 'Prośba załatwiona',
  REQUEST_REOPEN: 'Prośba otwarta ponownie',
}
const KIND_LABEL: Record<string, string> = { DIET: 'Dieta', EXTRA_BED: 'Dostawka', OTHER: 'Inne' }
const METHOD_LABEL: Record<string, string> = { CASH: 'gotówka', BANK_TRANSFER: 'przelew', ONLINE: 'online' }
const PAGE_SIZE = 50

type Tab = 'requests' | 'log'
type ReqFilter = 'OPEN' | 'DONE' | 'ALL'

function resolveTitle(title: unknown): string {
  if (typeof title === 'string') return title
  if (title && typeof title === 'object') {
    const t = title as Record<string, string>
    return t.pl ?? t.en ?? t.it ?? ''
  }
  return ''
}

function when(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const zl = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} zł`
const selectStyle: React.CSSProperties = { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }

export default function DeskActivityScreen() {
  const [instances, setInstances] = useState<EventInstanceDto[]>([])
  const [instanceId, setInstanceId] = useState('')
  const [loadingInstances, setLoadingInstances] = useState(true)
  const [tab, setTab] = useState<Tab>('requests')
  const [error, setError] = useState<string | null>(null)

  // Prośby
  const [reqFilter, setReqFilter] = useState<ReqFilter>('OPEN')
  const [requests, setRequests] = useState<DeskRequestsList | null>(null)
  const [reqBusy, setReqBusy] = useState<string | null>(null)

  // Dziennik
  const [log, setLog] = useState<DeskLogPage | null>(null)
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getAdminInstances()
      .then((list) => {
        setInstances(list)
        if (list.length > 0) setInstanceId((list.find((i) => !i.archived) ?? list[0]).id)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingInstances(false))
  }, [])

  const loadRequests = useCallback(() => {
    if (!instanceId) return
    setLoading(true)
    setError(null)
    getDeskRequests(instanceId, reqFilter === 'ALL' ? undefined : reqFilter)
      .then(setRequests)
      .catch((e: unknown) => { setRequests(null); setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => setLoading(false))
  }, [instanceId, reqFilter])

  const loadLog = useCallback(() => {
    if (!instanceId) return
    setLoading(true)
    setError(null)
    getDeskLog(instanceId, { actor: actor || undefined, action: action || undefined, page, pageSize: PAGE_SIZE })
      .then(setLog)
      .catch((e: unknown) => { setLog(null); setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => setLoading(false))
  }, [instanceId, actor, action, page])

  // Zmiana eventu: filtry dziennika od zera (osoby i akcje są per event).
  useEffect(() => {
    setActor('')
    setAction('')
    setPage(1)
    setLog(null)
    setRequests(null)
  }, [instanceId])

  useEffect(() => {
    if (tab === 'requests') loadRequests()
  }, [tab, loadRequests])

  useEffect(() => {
    if (tab === 'log') loadLog()
  }, [tab, loadLog])

  async function toggleRequest(q: DeskRequestItem) {
    setReqBusy(q.id)
    setError(null)
    try {
      await setDeskRequestStatus(instanceId, q.id, q.status === 'DONE' ? 'OPEN' : 'DONE')
      loadRequests()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReqBusy(null)
    }
  }

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      className="px-4 py-1.5 rounded-[9px] text-sm font-medium transition-all duration-150"
      style={tab === id ? { background: 'var(--surface)', color: 'var(--brand)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : { color: 'var(--muted)' }}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Event */}
      <div className="flex items-center gap-3 flex-wrap">
        <label htmlFor="desk-activity-event" className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Event:</label>
        {loadingInstances ? (
          <span className="text-sm" style={{ color: 'var(--faint)' }}>Ładowanie...</span>
        ) : instances.length === 0 ? (
          <span className="text-sm" style={{ color: 'var(--faint)' }}>Brak eventów</span>
        ) : (
          <select id="desk-activity-event" value={instanceId} onChange={(e) => setInstanceId(e.target.value)} className="rounded-[12px] border px-3 py-2 text-sm" style={selectStyle}>
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>{resolveTitle(inst.title)} ({inst.archived ? 'ARCHIWUM' : inst.status})</option>
            ))}
          </select>
        )}
        {instanceId && (
          <a href={`/recepcja/${instanceId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--brand)' }}>
            Otwórz Recepcję tego eventu <ExternalLink size={14} />
          </a>
        )}
        <button
          type="button"
          onClick={() => (tab === 'requests' ? loadRequests() : loadLog())}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-[8px] ml-auto"
          style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} /> Odśwież
        </button>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-[12px] self-start" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        {tabBtn('requests', `Prośby dodatkowe${requests ? ` (${requests.counts.open} otwartych)` : ''}`)}
        {tabBtn('log', 'Dziennik działań')}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-[12px] text-sm" role="alert" style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}>
          {error}
        </div>
      )}

      {/* ── Prośby ── */}
      {tab === 'requests' && (
        <>
          <div className="flex items-center gap-1 p-1 rounded-[12px] self-start" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            {([['OPEN', 'Otwarte'], ['DONE', 'Załatwione'], ['ALL', 'Wszystkie']] as Array<[ReqFilter, string]>).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setReqFilter(id)}
                aria-pressed={reqFilter === id}
                className="px-3 py-1.5 rounded-[9px] text-sm font-medium"
                style={reqFilter === id ? { background: 'var(--surface)', color: 'var(--brand)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : { color: 'var(--muted)' }}
              >
                {label}{requests ? ` (${id === 'OPEN' ? requests.counts.open : id === 'DONE' ? requests.counts.done : requests.counts.total})` : ''}
              </button>
            ))}
          </div>
          <div className="rounded-[15px] border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            {requests === null ? (
              <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--faint)' }}>{loading ? 'Ładowanie próśb…' : 'Brak danych.'}</p>
            ) : requests.items.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--faint)' }}>
                {requests.counts.total === 0 ? 'Recepcja nie zapisała jeszcze żadnej prośby dla tego eventu.' : 'Brak próśb w tym filtrze.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                      {['Status', 'Prośba', 'Zgłoszenie', 'Dodał(a)', ''].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: 'var(--faint)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {requests.items.map((q, i) => (
                      <tr key={q.id} style={{ borderBottom: i < requests.items.length - 1 ? '1px solid var(--border-2)' : undefined, verticalAlign: 'top' }}>
                        <td className="px-4 py-3">
                          {q.status === 'DONE' ? <Badge variant="ok">Załatwiona</Badge> : <Badge variant="warn">Otwarta</Badge>}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--ink)', maxWidth: 380 }}>
                          <p className="font-medium">{KIND_LABEL[q.kind] ?? q.kind}{q.participant ? ` · ${q.participant}` : ''}</p>
                          {q.note && <p className="text-sm" style={{ color: 'var(--muted)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{q.note}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium" style={{ color: 'var(--ink)' }}>{q.registrant || '—'}</p>
                          <p className="text-xs" style={{ color: 'var(--faint)' }}>
                            {q.roomLabel ? `pokój ${q.roomLabel}` : 'bez numeru pokoju'}
                            {q.registrationStatus === 'CANCELLED' ? ' · zgłoszenie anulowane' : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>
                          <p>{q.createdBy}</p>
                          <p>{when(q.createdAt)}</p>
                          {q.status === 'DONE' && <p style={{ color: 'var(--ok)' }}>załatwił(a): {q.resolvedBy ?? '—'}{q.resolvedAt ? `, ${when(q.resolvedAt)}` : ''}</p>}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Button size="sm" variant={q.status === 'DONE' ? 'outline' : 'default'} disabled={reqBusy === q.id} onClick={() => { void toggleRequest(q) }}>
                            {q.status === 'DONE' ? <><RotateCcw size={14} /> Otwórz ponownie</> : <><Check size={14} /> Oznacz jako załatwioną</>}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-xs" style={{ color: 'var(--faint)' }}>
            Prośby dodaje Recepcja na karcie zgłoszenia. Zmiana statusu tutaj jest od razu widoczna w Recepcji i trafia do dziennika działań.
          </p>
        </>
      )}

      {/* ── Dziennik ── */}
      {tab === 'log' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
              Osoba:
              <select value={actor} onChange={(e) => { setActor(e.target.value); setPage(1) }} className="rounded-[12px] border px-3 py-2 text-sm" style={selectStyle}>
                <option value="">wszyscy</option>
                {(log?.actors ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
                {actor && !(log?.actors ?? []).includes(actor) && <option value={actor}>{actor}</option>}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
              Akcja:
              <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} className="rounded-[12px] border px-3 py-2 text-sm" style={selectStyle}>
                <option value="">wszystkie</option>
                {(log?.actions ?? []).map((a) => <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>)}
                {action && !(log?.actions ?? []).includes(action) && <option value={action}>{ACTION_LABEL[action] ?? action}</option>}
              </select>
            </label>
            {log && <span className="text-sm" style={{ color: 'var(--muted)' }}>Wpisów: {log.total}</span>}
          </div>
          <div className="rounded-[15px] border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            {log === null ? (
              <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--faint)' }}>{loading ? 'Ładowanie dziennika…' : 'Brak danych.'}</p>
            ) : log.items.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--faint)' }}>
                {actor || action ? 'Brak wpisów dla tych filtrów.' : 'Recepcja nie wykonała jeszcze żadnej akcji dla tego eventu.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                      {['Kiedy', 'Kto', 'Co', 'Zgłoszenie'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: 'var(--faint)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {log.items.map((it, i) => (
                      <tr key={it.id} style={{ borderBottom: i < log.items.length - 1 ? '1px solid var(--border-2)' : undefined }}>
                        <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--muted)' }}>{when(it.createdAt)}</td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>{it.actor}</td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--ink)' }}>
                          {ACTION_LABEL[it.action] ?? it.action}
                          {it.amount !== null ? ` · ${zl(it.amount)}` : ''}
                          {it.method ? ` (${METHOD_LABEL[it.method] ?? it.method})` : ''}
                          {it.kind ? ` · ${KIND_LABEL[it.kind] ?? it.kind}` : ''}
                          {it.via === 'panel' ? ' · z panelu' : ''}
                        </td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--muted)' }}>
                          {it.registrant ?? (it.registrationId ? 'zgłoszenie usunięte' : '—')}
                          {it.registrationId && <span className="block text-xs font-mono" style={{ color: 'var(--faint)' }}>{it.registrationId}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {log && log.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Strona {log.page} z {log.pages} · po {log.pageSize} wpisów, od najnowszych</p>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Poprzednia strona" disabled={log.page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-2 rounded-[8px] border transition-colors hover:bg-[var(--surface-2)] disabled:opacity-40" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                  <ChevronLeft size={15} />
                </button>
                <button type="button" aria-label="Następna strona" disabled={log.page >= log.pages || loading} onClick={() => setPage((p) => p + 1)} className="p-2 rounded-[8px] border transition-colors hover:bg-[var(--surface-2)] disabled:opacity-40" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
          <p className="text-xs" style={{ color: 'var(--faint)' }}>
            Dziennik zapisuje działania wykonane w Recepcji (także przez administratora) oraz zmiany statusu próśb z tego ekranu. Wpłat wpisanych w „Płatnościach” tu nie ma.
          </p>
        </>
      )}
    </div>
  )
}
