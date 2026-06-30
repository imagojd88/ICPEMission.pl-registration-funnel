import { useState, useEffect, useCallback } from 'react'
import { ExternalLink, Pencil } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EventWizard from './EventWizard'
import { getAdminInstances } from '@/lib/api'
import type { EventInstanceDto } from '@icpe/shared'

type FilterTab = 'all' | 'one_time' | 'evergreen' | 'standalone'

function resolveTitle(title: unknown): string {
  if (typeof title === 'string') return title
  if (title && typeof title === 'object') {
    const t = title as Record<string, string>
    return t.pl ?? t.en ?? t.it ?? ''
  }
  return ''
}

function instanceTypeLabel(type: string): 'jednorazowy' | 'cykliczny' | 'standalone' {
  if (type === 'EVERGREEN') return 'cykliczny'
  if (type === 'STANDALONE') return 'standalone'
  return 'jednorazowy'
}

function mapStatus(status: string): 'Otwarty' | 'Wkrótce' | 'Szkic' | 'Zamknięty' {
  switch (status) {
    case 'OPEN': return 'Otwarty'
    case 'DRAFT': return 'Wkrótce'
    case 'CLOSED': return 'Zamknięty'
    default: return 'Szkic'
  }
}

function statusBadge(status: string) {
  if (status === 'Otwarty' || status === 'OPEN') return <Badge variant="ok">Otwarty</Badge>
  if (status === 'Wkrótce' || status === 'DRAFT') return <Badge variant="warn">Wkrótce</Badge>
  if (status === 'Zamknięty' || status === 'CLOSED') return <Badge variant="err">Zamknięty</Badge>
  return <Badge variant="muted">Szkic</Badge>
}

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'one_time', label: 'Jednorazowe' },
  { id: 'evergreen', label: 'Cykliczne' },
  { id: 'standalone', label: 'Standalone' },
]

interface EventsScreenProps {
  onOpenWizard: () => void
  showWizard: boolean
  onCloseWizard: () => void
}

export default function EventsScreen({ onOpenWizard, showWizard, onCloseWizard }: EventsScreenProps) {
  const [filter, setFilter] = useState<FilterTab>('all')
  const [instances, setInstances] = useState<EventInstanceDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<{ instanceId: string; seriesId: string; slug: string } | null>(null)

  function openNew() {
    setEditTarget(null)
    onOpenWizard()
  }
  function openEdit(instanceId: string, seriesId: string, slug: string) {
    setEditTarget({ instanceId, seriesId, slug })
    onOpenWizard()
  }

  const loadInstances = useCallback(() => {
    setLoading(true)
    setError(null)
    getAdminInstances()
      .then(setInstances)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadInstances()
  }, [loadInstances])

  const filtered = instances.filter((inst) => {
    const t = instanceTypeLabel(inst.type ?? 'ONE_TIME')
    if (filter === 'one_time') return t === 'jednorazowy'
    if (filter === 'evergreen') return t === 'cykliczny'
    if (filter === 'standalone') return t === 'standalone'
    return true
  })

  if (showWizard) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onCloseWizard}
            className="text-sm hover:underline"
            style={{ color: 'var(--brand)' }}
          >
            ← Eventy
          </button>
          <span style={{ color: 'var(--faint)' }}>/</span>
          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {editTarget ? 'Edycja eventu' : 'Nowy event'}
          </span>
        </div>
        <EventWizard
          editTarget={editTarget ?? undefined}
          onCancel={() => {
            setEditTarget(null)
            onCloseWizard()
          }}
          onSuccess={() => {
            setEditTarget(null)
            onCloseWizard()
            loadInstances()
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-1 rounded-[12px] self-start" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className="px-4 py-1.5 rounded-[9px] text-sm font-medium transition-all duration-150"
            style={
              filter === tab.id
                ? { background: 'var(--surface)', color: 'var(--brand)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                : { color: 'var(--muted)' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div
          className="px-4 py-3 rounded-[12px] text-sm"
          style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-[15px] border overflow-hidden"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <p className="font-bold text-base" style={{ color: 'var(--ink)' }}>
            Eventy ({loading ? '…' : filtered.length})
          </p>
          <Button size="sm" onClick={openNew}>
            + Nowy event
          </Button>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--faint)' }}>Ładowanie eventów...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-8 text-center flex flex-col items-center gap-3">
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Brak eventów</p>
            <p className="text-sm" style={{ color: 'var(--faint)' }}>
              {instances.length === 0 ? 'Utwórz pierwszy event klikając „+ Nowy event".' : 'Brak eventów w tej kategorii.'}
            </p>
            {instances.length === 0 && (
              <Button size="sm" onClick={openNew} className="mt-1">
                + Utwórz pierwszy event
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  {['Nazwa', 'Typ', 'Zgłoszenia', 'Status', ''].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2.5 text-left text-xs font-semibold"
                      style={{ color: 'var(--faint)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((ev, i) => {
                  const typeLabel = instanceTypeLabel(ev.type ?? 'ONE_TIME')
                  const statusStr = mapStatus(ev.status)
                  const name = resolveTitle(ev.title)
                  const slug = (ev as EventInstanceDto & { slug?: string }).slug ?? ''
                  const seriesId = (ev as EventInstanceDto & { seriesId?: string }).seriesId ?? ''
                  const cap = ev.capacity ?? 0
                  const reg = ev.registeredCount ?? 0
                  return (
                    <tr
                      key={ev.id}
                      className="hover:bg-[var(--surface-2)] transition-colors"
                      style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border-2)' : undefined }}
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-medium" style={{ color: 'var(--ink)' }}>{name}</p>
                        {slug && (
                          <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--faint)', fontSize: 11 }}>
                            /r/{slug}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {typeLabel === 'jednorazowy' && <Badge variant="brand">Jednorazowy</Badge>}
                        {typeLabel === 'cykliczny' && <Badge variant="accent">Cykliczny</Badge>}
                        {typeLabel === 'standalone' && <Badge variant="muted">Standalone</Badge>}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold" style={{ color: 'var(--ink)' }}>{reg}</span>
                          {cap > 0 && (
                            <>
                              <span style={{ color: 'var(--faint)' }}>/</span>
                              <span style={{ color: 'var(--muted)' }}>{cap}</span>
                              <div
                                className="rounded-full overflow-hidden"
                                style={{ width: 50, height: 4, background: 'var(--border)' }}
                              >
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.min(100, Math.round((reg / cap) * 100))}%`,
                                    background: 'var(--brand)',
                                  }}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">{statusBadge(statusStr)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          {slug && seriesId && (
                            <button
                              onClick={() => openEdit(ev.id, seriesId, slug)}
                              className="flex items-center gap-1 text-xs font-medium transition-colors hover:text-[var(--brand)]"
                              style={{ color: 'var(--muted)' }}
                            >
                              <Pencil size={12} /> Edytuj
                            </button>
                          )}
                          {slug && (
                            <a
                              href={`https://rejestracja.icpemission.pl/r/${slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs font-medium transition-colors hover:text-[var(--brand)]"
                              style={{ color: 'var(--muted)' }}
                            >
                              Otwórz <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
