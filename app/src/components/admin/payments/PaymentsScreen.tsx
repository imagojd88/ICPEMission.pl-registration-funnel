import { useState, useEffect, useCallback } from 'react'
import { Search, Check, Wallet } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { getAdminInstances, getAdminRegistrations, markRegistrationPaid } from '@/lib/api'
import type { RegistrationDto, EventInstanceDto } from '@icpe/shared'

type Filter = 'all' | 'paid' | 'pending'

function resolveTitle(title: unknown): string {
  if (typeof title === 'string') return title
  if (title && typeof title === 'object') {
    const t = title as Record<string, string>
    return t.pl ?? t.en ?? t.it ?? ''
  }
  return ''
}

function methodLabel(m?: string): string {
  if (m === 'ONLINE') return 'Online'
  if (m === 'BANK_TRANSFER') return 'Przelew'
  if (m === 'CASH') return 'Gotówka'
  return '—'
}

function zl(n: number): string {
  return `${Math.round(n)} zł`
}

export default function PaymentsScreen() {
  const [instances, setInstances] = useState<EventInstanceDto[]>([])
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('')
  const [regs, setRegs] = useState<RegistrationDto[]>([])
  const [loadingInstances, setLoadingInstances] = useState(true)
  const [loadingRegs, setLoadingRegs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    setLoadingInstances(true)
    getAdminInstances()
      .then((list) => {
        setInstances(list)
        if (list.length > 0) setSelectedInstanceId(list[0].id)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingInstances(false))
  }, [])

  const loadRegs = useCallback((instanceId: string) => {
    if (!instanceId) return
    setLoadingRegs(true)
    setError(null)
    getAdminRegistrations(instanceId)
      .then((list) => setRegs(list.filter((r) => r.status !== 'CANCELLED')))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
        setRegs([])
      })
      .finally(() => setLoadingRegs(false))
  }, [])

  useEffect(() => {
    if (selectedInstanceId) loadRegs(selectedInstanceId)
  }, [selectedInstanceId, loadRegs])

  async function handleMarkPaid(r: RegistrationDto) {
    setBusyId(r.id)
    setError(null)
    try {
      await markRegistrationPaid(r.id)
      loadRegs(selectedInstanceId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const isPaid = (r: RegistrationDto) => r.paymentStatus === 'PAID'

  const revenue = regs.filter(isPaid).reduce((s, r) => s + (r.totalPrice ?? 0), 0)
  const pendingAmount = regs.filter((r) => !isPaid(r)).reduce((s, r) => s + (r.totalPrice ?? 0), 0)
  const paidCount = regs.filter(isPaid).length

  const filtered = regs.filter((r) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      r.contact.firstName.toLowerCase().includes(q) ||
      r.contact.lastName.toLowerCase().includes(q) ||
      r.contact.email.toLowerCase().includes(q)
    const matchFilter = filter === 'all' || (filter === 'paid' ? isPaid(r) : !isPaid(r))
    return matchSearch && matchFilter
  })

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Wszystkie' },
    { id: 'paid', label: 'Opłacone' },
    { id: 'pending', label: 'Oczekujące' },
  ]

  function card(label: string, value: string, accent?: string) {
    return (
      <div className="rounded-[15px] border p-4 flex-1 min-w-[150px]" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--faint)' }}>{label}</p>
        <p className="text-2xl font-bold mt-1" style={{ color: accent ?? 'var(--ink)' }}>{value}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Instance selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Event:</label>
        {loadingInstances ? (
          <span className="text-sm" style={{ color: 'var(--faint)' }}>Ładowanie...</span>
        ) : instances.length === 0 ? (
          <span className="text-sm" style={{ color: 'var(--faint)' }}>Brak eventów</span>
        ) : (
          <select
            value={selectedInstanceId}
            onChange={(e) => setSelectedInstanceId(e.target.value)}
            className="rounded-[12px] border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}
          >
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>{resolveTitle(inst.title)} ({inst.status})</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-[12px] text-sm" style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}>{error}</div>
      )}

      {/* Summary */}
      <div className="flex gap-3 flex-wrap">
        {card('Przychód', zl(revenue), 'var(--ok)')}
        {card('Oczekuje', zl(pendingAmount), 'var(--warn)')}
        {card('Opłacone', `${paidCount} / ${regs.length}`)}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 rounded-[12px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)', height: 40, minWidth: 240 }}>
          <Search size={15} style={{ color: 'var(--faint)', flexShrink: 0 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj..." className="flex-1 text-sm bg-transparent outline-none" style={{ color: 'var(--ink)' }} />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-[12px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="px-3 py-1.5 rounded-[9px] text-sm font-medium transition-all duration-150"
              style={filter === f.id ? { background: 'var(--surface)', color: 'var(--brand)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : { color: 'var(--muted)' }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-[15px] border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        {loadingRegs ? (
          <div className="px-5 py-8 text-center"><p className="text-sm" style={{ color: 'var(--faint)' }}>Ładowanie...</p></div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-8 text-center"><p className="text-sm" style={{ color: 'var(--faint)' }}>{regs.length === 0 ? 'Brak zgłoszeń dla tego eventu.' : 'Brak wyników.'}</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  {['Zgłaszający', 'Kwota', 'Metoda', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: 'var(--faint)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const paid = isPaid(r)
                  const isFree = (r.totalPrice ?? 0) === 0
                  return (
                    <tr key={r.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border-2)' : undefined }}>
                      <td className="px-4 py-3">
                        <p className="font-medium" style={{ color: 'var(--ink)' }}>{r.contact.firstName} {r.contact.lastName}</p>
                        <p className="text-xs" style={{ color: 'var(--faint)' }}>{r.contact.email}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold" style={{ color: 'var(--ink)' }}>{isFree ? 'Bezpłatne' : zl(r.totalPrice ?? 0)}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{methodLabel(r.paymentMethod)}</td>
                      <td className="px-4 py-3">{paid ? <Badge variant="ok">Opłacone</Badge> : isFree ? <Badge variant="muted">—</Badge> : <Badge variant="warn">Oczekuje</Badge>}</td>
                      <td className="px-4 py-3 text-right">
                        {!paid && !isFree && (
                          <Button size="sm" variant="default" style={{ background: 'var(--ok)' }} disabled={busyId === r.id} onClick={() => { void handleMarkPaid(r) }}>
                            {busyId === r.id ? '...' : (<><Check size={14} /> Oznacz opłacone</>)}
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
        <Wallet size={13} /> „Przychód" liczy sumę zgłoszeń oznaczonych jako opłacone.
      </p>
    </div>
  )
}
