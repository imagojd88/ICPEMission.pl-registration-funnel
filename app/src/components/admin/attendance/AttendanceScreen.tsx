import { useState, useEffect, useCallback } from 'react'
import { Search, Check, UserCheck } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import {
  getAdminInstances,
  getAdminRegistrations,
  toggleRegistrationCheckIn,
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

export default function AttendanceScreen() {
  const [instances, setInstances] = useState<EventInstanceDto[]>([])
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('')
  const [regs, setRegs] = useState<RegistrationDto[]>([])
  const [loadingInstances, setLoadingInstances] = useState(true)
  const [loadingRegs, setLoadingRegs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
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

  async function handleToggle(r: RegistrationDto) {
    setBusyId(r.id)
    try {
      await toggleRegistrationCheckIn(r.id)
      // optimistic-ish: przeładuj listę
      loadRegs(selectedInstanceId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const filtered = regs.filter((r) => {
    const q = search.toLowerCase()
    return (
      !q ||
      r.contact.firstName.toLowerCase().includes(q) ||
      r.contact.lastName.toLowerCase().includes(q) ||
      r.contact.email.toLowerCase().includes(q)
    )
  })

  const presentCount = regs.filter((r) => !!r.checkedInAt).length
  const totalPeople = regs.reduce((s, r) => s + r.participants.length, 0)
  const presentPeople = regs
    .filter((r) => !!r.checkedInAt)
    .reduce((s, r) => s + r.participants.length, 0)
  const pct = regs.length > 0 ? Math.round((presentCount / regs.length) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      {/* Instance selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          Event:
        </label>
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
              <option key={inst.id} value={inst.id}>
                {resolveTitle(inst.title)} ({inst.status})
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div
          className="px-4 py-3 rounded-[12px] text-sm"
          style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}
        >
          {error}
        </div>
      )}

      {/* Summary card */}
      <div
        className="rounded-[15px] border p-5 flex items-center gap-6 flex-wrap"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-[12px]"
            style={{ width: 44, height: 44, background: 'var(--brand-soft)', color: 'var(--brand)' }}
          >
            <UserCheck size={22} />
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
              {presentCount}<span className="text-base font-medium" style={{ color: 'var(--faint)' }}>/{regs.length}</span>
            </p>
            <p className="text-xs" style={{ color: 'var(--faint)' }}>zgłoszeń obecnych</p>
          </div>
        </div>
        <div>
          <p className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
            {presentPeople}<span className="text-base font-medium" style={{ color: 'var(--faint)' }}>/{totalPeople}</span>
          </p>
          <p className="text-xs" style={{ color: 'var(--faint)' }}>osób na miejscu</p>
        </div>
        <div className="flex-1 min-w-[160px]">
          <div className="rounded-full overflow-hidden" style={{ height: 8, background: 'var(--border)' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--ok)' }} />
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--faint)' }}>{pct}% odprawionych</p>
        </div>
      </div>

      {/* Search */}
      <div
        className="flex items-center gap-2 px-3 rounded-[12px] border self-start"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', height: 40, minWidth: 260 }}
      >
        <Search size={15} style={{ color: 'var(--faint)', flexShrink: 0 }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj uczestnika..."
          className="flex-1 text-sm bg-transparent outline-none"
          style={{ color: 'var(--ink)' }}
        />
      </div>

      {/* List */}
      <div
        className="rounded-[15px] border overflow-hidden"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
      >
        {loadingRegs ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--faint)' }}>Ładowanie listy...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--faint)' }}>
              {regs.length === 0 ? 'Brak zgłoszeń dla tego eventu.' : 'Brak wyników.'}
            </p>
          </div>
        ) : (
          <ul>
            {filtered.map((r, i) => {
              const present = !!r.checkedInAt
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border-2)' : undefined }}
                >
                  <div className="min-w-0">
                    <p className="font-medium" style={{ color: 'var(--ink)' }}>
                      {r.contact.firstName} {r.contact.lastName}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--faint)' }}>
                      {r.participants.length} {r.participants.length === 1 ? 'osoba' : 'osób'} · {r.contact.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {present ? (
                      <Badge variant="ok">Obecny</Badge>
                    ) : (
                      <Badge variant="muted">Nieobecny</Badge>
                    )}
                    <Button
                      size="sm"
                      variant={present ? 'outline' : 'default'}
                      style={present ? undefined : { background: 'var(--ok)' }}
                      disabled={busyId === r.id}
                      onClick={() => { void handleToggle(r) }}
                    >
                      {busyId === r.id ? '...' : present ? 'Cofnij' : (<><Check size={14} /> Odpraw</>)}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
