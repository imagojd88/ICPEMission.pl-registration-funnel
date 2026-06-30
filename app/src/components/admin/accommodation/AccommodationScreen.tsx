import { useState, useEffect, useCallback } from 'react'
import { Search, BedDouble, Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import {
  getAdminInstances,
  getAdminRegistrations,
  setAccommodation,
} from '@/lib/api'
import type { RegistrationDto, EventInstanceDto } from '@icpe/shared'

function resolveTitle(title: unknown): string {
  if (typeof title === 'string') return title
  if (title && typeof title === 'object') {
    const t = title as Record<string, string>
    return t.pl ?? t.en ?? t.it ?? ''
  }
  return ''
}

interface Draft {
  roomLabel: string
  roomNote: string
}

export default function AccommodationScreen() {
  const [instances, setInstances] = useState<EventInstanceDto[]>([])
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('')
  const [regs, setRegs] = useState<RegistrationDto[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loadingInstances, setLoadingInstances] = useState(true)
  const [loadingRegs, setLoadingRegs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

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
      .then((list) => {
        const active = list.filter((r) => r.status !== 'CANCELLED')
        setRegs(active)
        const d: Record<string, Draft> = {}
        for (const r of active) d[r.id] = { roomLabel: r.roomLabel ?? '', roomNote: r.roomNote ?? '' }
        setDrafts(d)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
        setRegs([])
      })
      .finally(() => setLoadingRegs(false))
  }, [])

  useEffect(() => {
    if (selectedInstanceId) loadRegs(selectedInstanceId)
  }, [selectedInstanceId, loadRegs])

  async function handleSave(r: RegistrationDto) {
    const d = drafts[r.id] ?? { roomLabel: '', roomNote: '' }
    setSavingId(r.id)
    setError(null)
    try {
      await setAccommodation(r.id, { roomLabel: d.roomLabel, roomNote: d.roomNote })
      setRegs((prev) => prev.map((x) => (x.id === r.id ? { ...x, roomLabel: d.roomLabel, roomNote: d.roomNote } : x)))
      setSavedId(r.id)
      setTimeout(() => setSavedId((id) => (id === r.id ? null : id)), 1600)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingId(null)
    }
  }

  const filtered = regs.filter((r) => {
    const q = search.toLowerCase()
    return (
      !q ||
      r.contact.firstName.toLowerCase().includes(q) ||
      r.contact.lastName.toLowerCase().includes(q) ||
      (r.roomLabel ?? '').toLowerCase().includes(q)
    )
  })

  const assignedCount = regs.filter((r) => (r.roomLabel ?? '').trim()).length

  const inputCls = 'rounded-[10px] border px-3 py-2 text-sm'
  const inputStyle = { borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' } as const

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
        <span className="text-sm ml-auto" style={{ color: 'var(--muted)' }}>
          Przydzielono: <b style={{ color: 'var(--ink)' }}>{assignedCount}</b> / {regs.length}
        </span>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-[12px] text-sm" style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}>
          {error}
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 px-3 rounded-[12px] border self-start" style={{ background: 'var(--surface)', borderColor: 'var(--border)', height: 40, minWidth: 260 }}>
        <Search size={15} style={{ color: 'var(--faint)', flexShrink: 0 }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj gościa lub pokoju..." className="flex-1 text-sm bg-transparent outline-none" style={{ color: 'var(--ink)' }} />
      </div>

      {/* List */}
      <div className="rounded-[15px] border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        {loadingRegs ? (
          <div className="px-5 py-8 text-center"><p className="text-sm" style={{ color: 'var(--faint)' }}>Ładowanie...</p></div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-8 text-center"><p className="text-sm" style={{ color: 'var(--faint)' }}>{regs.length === 0 ? 'Brak zgłoszeń dla tego eventu.' : 'Brak wyników.'}</p></div>
        ) : (
          <ul>
            {filtered.map((r, i) => {
              const d = drafts[r.id] ?? { roomLabel: '', roomNote: '' }
              const dirty = d.roomLabel !== (r.roomLabel ?? '') || d.roomNote !== (r.roomNote ?? '')
              return (
                <li key={r.id} className="px-5 py-3 flex flex-col gap-2" style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border-2)' : undefined }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium" style={{ color: 'var(--ink)' }}>{r.contact.firstName} {r.contact.lastName}</p>
                      <p className="text-xs" style={{ color: 'var(--faint)' }}>
                        {r.participants.length} {r.participants.length === 1 ? 'osoba' : 'osób'}
                        {r.assignedRoom ? <> · wybrany: {r.assignedRoom}</> : null}
                      </p>
                    </div>
                    {(r.roomLabel ?? '').trim() ? <Badge variant="ok">Pokój {r.roomLabel}</Badge> : <Badge variant="muted">Bez pokoju</Badge>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      value={d.roomLabel}
                      onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: { ...d, roomLabel: e.target.value } }))}
                      placeholder="Nr pokoju"
                      className={inputCls}
                      style={{ ...inputStyle, width: 120 }}
                    />
                    <input
                      value={d.roomNote}
                      onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: { ...d, roomNote: e.target.value } }))}
                      placeholder="Komentarz (opcjonalnie)"
                      className={inputCls}
                      style={{ ...inputStyle, flex: 1, minWidth: 180 }}
                    />
                    <Button size="sm" variant={dirty ? 'default' : 'outline'} onClick={() => { void handleSave(r) }} disabled={savingId === r.id || !dirty}>
                      {savingId === r.id ? '...' : savedId === r.id ? (<><Check size={14} /> Zapisano</>) : 'Zapisz'}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
        <BedDouble size={13} /> Wpisz numer/nazwę pokoju i opcjonalny komentarz, potem „Zapisz" przy danym gościu.
      </p>
    </div>
  )
}
