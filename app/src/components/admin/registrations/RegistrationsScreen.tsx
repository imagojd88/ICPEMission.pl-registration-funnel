import { useState, useEffect, useCallback } from 'react'
import { Search, X, ChevronRight, ChevronLeft } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import {
  getAdminInstances,
  getAdminRegistrations,
  markRegistrationPaid,
  patchRegistrationStatus,
} from '@/lib/api'
import type { RegistrationDto, EventInstanceDto } from '@icpe/shared'

// ── Helpers ───────────────────────────────────────────────────────────────────

type PayStatus = 'all' | 'PAID' | 'AWAITING_TRANSFER' | 'PENDING' | 'CANCELLED'

function payBadge(r: RegistrationDto) {
  if (r.paymentStatus === 'PAID') return <Badge variant="ok">Opłacone</Badge>
  if (r.paymentStatus === 'AWAITING_TRANSFER') return <Badge variant="warn">Oczekuje</Badge>
  if (r.status === 'WAITLIST') return <Badge variant="muted">Lista oczekujących</Badge>
  return <Badge variant="err">Oczekuje</Badge>
}

function payStatusMatch(r: RegistrationDto, filter: PayStatus): boolean {
  if (filter === 'all') return true
  if (filter === 'PAID') return r.paymentStatus === 'PAID'
  if (filter === 'AWAITING_TRANSFER') return r.paymentStatus === 'AWAITING_TRANSFER'
  if (filter === 'PENDING') return r.paymentStatus === 'PENDING' && r.status !== 'WAITLIST'
  return false
}

function resolveTitle(title: unknown): string {
  if (typeof title === 'string') return title
  if (title && typeof title === 'object') {
    const t = title as Record<string, string>
    return t.pl ?? t.en ?? t.it ?? ''
  }
  return ''
}

// ── Registration Drawer ───────────────────────────────────────────────────────

function RegistrationDrawer({
  registration,
  onClose,
  onMarkPaid,
  onStatusChange,
}: {
  registration: RegistrationDto
  onClose: () => void
  onMarkPaid: (id: string) => Promise<void>
  onStatusChange: (id: string, status: string) => Promise<void>
}) {
  const r = registration
  const fullName = `${r.contact.firstName} ${r.contact.lastName}`
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleMarkPaid() {
    setBusy(true)
    setActionError(null)
    try {
      await onMarkPaid(r.id)
      onClose()
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    setBusy(true)
    setActionError(null)
    try {
      await onStatusChange(r.id, 'CANCELLED')
      onClose()
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.35)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full z-50 overflow-y-auto flex flex-col"
        style={{
          width: 430,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.14)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-6 py-5 sticky top-0"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', zIndex: 1 }}
        >
          <div>
            <p className="font-bold text-sm" style={{ color: 'var(--faint)' }}>
              Zgłoszenie
            </p>
            <p className="font-bold text-base mt-0.5" style={{ color: 'var(--ink)' }}>
              {r.id}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {payBadge(r)}
            <button
              onClick={onClose}
              className="p-1.5 rounded-[8px] hover:bg-[var(--surface-2)] transition-colors"
              style={{ color: 'var(--faint)' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 py-5 flex flex-col gap-6">
          {/* Kontakt */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--faint)' }}>
              Kontakt
            </p>
            <div className="flex flex-col gap-2">
              {[
                { label: 'Imię i nazwisko', value: fullName },
                { label: 'E-mail', value: r.contact.email },
                { label: 'Telefon', value: r.contact.phone ?? '—' },
              ].map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-2">
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>{item.label}</span>
                  <span className="text-sm font-medium text-right" style={{ color: 'var(--ink)' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Uczestnicy */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--faint)' }}>
              Uczestnicy ({r.participants.length})
            </p>
            <ul className="flex flex-col gap-2">
              {r.participants.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-sm px-3 py-2 rounded-[10px]"
                  style={{ background: 'var(--surface-2)' }}
                >
                  <span style={{ color: 'var(--ink)' }}>
                    {p.firstName} {p.lastName}
                  </span>
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--faint)', fontSize: 12 }}>{p.age} l.</span>
                    <Badge variant={p.type === 'adult' ? 'brand' : 'muted'}>
                      {p.type === 'adult' ? 'Dorosły' : 'Dziecko'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Grid: pokój + kwota */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="p-3 rounded-[10px]"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <p className="text-xs" style={{ color: 'var(--faint)' }}>Pokój</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--ink)' }}>
                {r.assignedRoom ?? '—'}
              </p>
            </div>
            <div
              className="p-3 rounded-[10px]"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <p className="text-xs" style={{ color: 'var(--faint)' }}>Kwota</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--ink)' }}>
                {r.totalPrice} {r.currency}
              </p>
            </div>
          </div>

          {/* Historia */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--faint)' }}>
              Historia
            </p>
            <div className="flex flex-col gap-0">
              {[
                { label: 'Zgłoszono', time: new Date(r.createdAt).toLocaleString('pl-PL'), ok: true },
                { label: 'Wysłano potwierdzenie', time: 'automatycznie', ok: true },
                {
                  label: r.paymentStatus === 'PAID' ? 'Opłacono' : 'Oczekuje na płatność',
                  time: r.paymentStatus === 'PAID' ? 'potwierdzono' : 'w toku',
                  ok: r.paymentStatus === 'PAID',
                },
              ].map((ev, i, arr) => (
                <div key={ev.label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className="rounded-full mt-1"
                      style={{
                        width: 10,
                        height: 10,
                        background: ev.ok ? 'var(--ok)' : 'var(--border)',
                        flexShrink: 0,
                      }}
                    />
                    {i < arr.length - 1 && (
                      <div style={{ width: 2, flex: 1, background: 'var(--border)', minHeight: 24 }} />
                    )}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{ev.label}</p>
                    <p className="text-xs" style={{ color: 'var(--faint)' }}>{ev.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {actionError && (
            <div
              className="px-4 py-3 rounded-[12px] text-sm"
              style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}
            >
              {actionError}
            </div>
          )}
        </div>

        {/* Actions footer */}
        <div
          className="px-6 py-4 flex flex-col gap-2 sticky bottom-0"
          style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="default"
              style={{ background: 'var(--ok)' }}
              onClick={() => { void handleMarkPaid() }}
              disabled={busy || r.paymentStatus === 'PAID'}
            >
              {busy ? 'Zapisuję...' : 'Oznacz opłacone'}
            </Button>
            <Button size="sm" variant="outline">
              Przydziel pokój
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline">
              Wyślij e-mail
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => { void handleCancel() }}
              disabled={busy}
            >
              Anuluj zgłoszenie
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── RegistrationsScreen ───────────────────────────────────────────────────────

const FILTER_TABS: { id: PayStatus; label: string }[] = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'PAID', label: 'Opłacone' },
  { id: 'AWAITING_TRANSFER', label: 'Oczekujące' },
  { id: 'PENDING', label: 'W toku' },
]

export default function RegistrationsScreen() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PayStatus>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openDrawer, setOpenDrawer] = useState<RegistrationDto | null>(null)

  const [instances, setInstances] = useState<EventInstanceDto[]>([])
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('')
  const [regs, setRegs] = useState<RegistrationDto[]>([])
  const [loadingInstances, setLoadingInstances] = useState(true)
  const [loadingRegs, setLoadingRegs] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load instances once
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

  // Load registrations when instance changes
  const loadRegs = useCallback((instanceId: string) => {
    if (!instanceId) return
    setLoadingRegs(true)
    setError(null)
    getAdminRegistrations(instanceId)
      .then(setRegs)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
        setRegs([])
      })
      .finally(() => setLoadingRegs(false))
  }, [])

  useEffect(() => {
    if (selectedInstanceId) loadRegs(selectedInstanceId)
  }, [selectedInstanceId, loadRegs])

  async function handleMarkPaid(id: string) {
    await markRegistrationPaid(id)
    loadRegs(selectedInstanceId)
  }

  async function handleStatusChange(id: string, status: string) {
    await patchRegistrationStatus(id, status)
    loadRegs(selectedInstanceId)
  }

  const filtered = regs.filter((r) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      r.contact.firstName.toLowerCase().includes(q) ||
      r.contact.lastName.toLowerCase().includes(q) ||
      r.contact.email.toLowerCase().includes(q)
    return matchSearch && payStatusMatch(r, statusFilter)
  })

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((r) => r.id)))
    }
  }

  const allSelected = filtered.length > 0 && selected.size === filtered.length

  return (
    <div className="flex flex-col gap-4">
      {/* Instance selector */}
      <div className="flex items-center gap-3">
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

      {/* Error */}
      {error && (
        <div
          className="px-4 py-3 rounded-[12px] text-sm"
          style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}
        >
          {error}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div
          className="flex items-center gap-2 px-3 rounded-[12px] border"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            height: 40,
            minWidth: 260,
          }}
        >
          <Search size={15} style={{ color: 'var(--faint)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj zgłoszeń..."
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: 'var(--ink)' }}
          />
        </div>

        {/* Status tabs */}
        <div
          className="flex items-center gap-1 p-1 rounded-[12px]"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className="px-3 py-1.5 rounded-[9px] text-sm font-medium transition-all duration-150"
              style={
                statusFilter === tab.id
                  ? { background: 'var(--surface)', color: 'var(--brand)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                  : { color: 'var(--muted)' }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 rounded-[12px] border"
          style={{ background: 'var(--brand-soft)', borderColor: 'var(--brand)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
            {selected.size} zaznaczono
          </span>
          <div className="flex gap-2 ml-2">
            <Button size="sm" variant="outline" style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}>
              Oznacz opłacone
            </Button>
            <Button size="sm" variant="outline" style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}>
              Wyślij e-mail
            </Button>
            <Button size="sm" variant="outline" style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}>
              Eksport
            </Button>
          </div>
          <button
            className="ml-auto p-1"
            onClick={() => setSelected(new Set())}
            style={{ color: 'var(--brand)' }}
          >
            <X size={14} />
          </button>
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
        {loadingRegs ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--faint)' }}>Ładowanie zgłoszeń...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--faint)' }}>
              {regs.length === 0 ? 'Brak zgłoszeń dla tego eventu.' : 'Brak zgłoszeń pasujących do filtrów.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="accent-[var(--brand)] w-4 h-4"
                    />
                  </th>
                  {['Zgłaszający', 'Osoby', 'Pokój', 'Kwota', 'Płatność', ''].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-semibold"
                      style={{ color: 'var(--faint)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border-2)' : undefined }}
                    onClick={() => setOpenDrawer(r)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="accent-[var(--brand)] w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: 'var(--ink)' }}>
                        {r.contact.firstName} {r.contact.lastName}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--faint)' }}>{r.contact.email}</p>
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--ink)' }}>
                      {r.participants.length}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>
                      {r.assignedRoom ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--ink)' }}>
                      {r.totalPrice} zł
                    </td>
                    <td className="px-4 py-3">{payBadge(r)}</td>
                    <td className="px-4 py-3">
                      <ChevronRight size={15} style={{ color: 'var(--faint)' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Pokazano {filtered.length} z {regs.length}
        </p>
        <div className="flex items-center gap-1">
          <button
            className="p-2 rounded-[8px] border transition-colors hover:bg-[var(--surface-2)]"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            className="p-2 rounded-[8px] border transition-colors hover:bg-[var(--surface-2)]"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Drawer */}
      {openDrawer && (
        <RegistrationDrawer
          registration={openDrawer}
          onClose={() => setOpenDrawer(null)}
          onMarkPaid={handleMarkPaid}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
