import { useState, useMemo } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { computePrice, formatMoney, roomLabel } from '@icpe/shared'
import type { PricingConfig } from '@icpe/shared'
import type { RegistrationDto } from '@icpe/shared'
import { adminUpdateRegistration } from '@/lib/api'

interface EditParticipant {
  id: string
  firstName: string
  lastName: string
  type: 'adult' | 'child'
  age: string
  gender: string // 'M' | 'F' | ''
  dietary: string
}
interface EditRoom {
  uid: string
  roomId: string
  pids: string[]
}

let uid = 0
const nextUid = () => `x-${++uid}-${Date.now()}`

export default function RegistrationEditForm({
  registration,
  pricingConfig,
  onClose,
  onSaved,
}: {
  registration: RegistrationDto
  pricingConfig: PricingConfig
  onClose: () => void
  onSaved: () => void
}) {
  const roomTypes = pricingConfig.rooms ?? []
  const money = (n: number) => formatMoney(n, pricingConfig.currency, 'pl')

  const [contact, setContact] = useState({
    firstName: registration.contact.firstName ?? '',
    lastName: registration.contact.lastName ?? '',
    email: registration.contact.email ?? '',
    phone: registration.contact.phone ?? '',
  })
  const [participants, setParticipants] = useState<EditParticipant[]>(
    registration.participants.map((p, i) => ({
      id: `p${i}`,
      firstName: p.firstName ?? '',
      lastName: p.lastName ?? '',
      type: p.type === 'child' ? 'child' : 'adult',
      age: p.age != null ? String(p.age) : '',
      gender: p.gender === 'F' ? 'F' : p.gender === 'M' ? 'M' : '',
      dietary: p.dietary ?? '',
    })),
  )
  const [rooms, setRooms] = useState<EditRoom[]>(
    (registration.rooms ?? []).map((r) => ({
      uid: nextUid(),
      roomId: r.roomId,
      pids: r.participantIndexes.map((idx) => `p${idx}`),
    })),
  )
  const [options, setOptions] = useState({
    transport: !!registration.options?.transport,
    bedding: !!registration.options?.bedding,
  })
  const [dietaryNotes, setDietaryNotes] = useState(registration.dietaryNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const showTransport = (pricingConfig.options?.transport ?? 0) > 0
  const showBedding = (pricingConfig.options?.bedding ?? 0) > 0

  // Żywa cena
  const total = useMemo(() => {
    const input = {
      rooms: rooms.map((r) => ({
        roomId: r.roomId,
        participants: r.pids
          .map((pid) => participants.find((p) => p.id === pid))
          .filter((p): p is EditParticipant => !!p)
          .map((p) => ({ type: p.type, age: parseInt(p.age) || 0 })),
      })),
      options: { transport: options.transport, bedding: options.bedding },
      discountCode: registration.discountCode,
    }
    try {
      return computePrice(input, pricingConfig).total
    } catch {
      return 0
    }
  }, [rooms, participants, options, pricingConfig, registration.discountCode])

  // ── Uczestnicy ──────────────────────────────────────────────
  const addParticipant = () =>
    setParticipants((p) => [...p, { id: nextUid(), firstName: '', lastName: '', type: 'adult', age: '', gender: '', dietary: '' }])
  const updateParticipant = (id: string, patch: Partial<EditParticipant>) =>
    setParticipants((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const removeParticipant = (id: string) => {
    setParticipants((p) => p.filter((x) => x.id !== id))
    setRooms((rs) => rs.map((r) => ({ ...r, pids: r.pids.filter((pid) => pid !== id) })))
  }

  // ── Pokoje ──────────────────────────────────────────────────
  const addRoom = () => setRooms((rs) => [...rs, { uid: nextUid(), roomId: roomTypes[0]?.id ?? '', pids: [] }])
  const removeRoom = (u: string) => setRooms((rs) => rs.filter((r) => r.uid !== u))
  const setRoomType = (u: string, roomId: string) => setRooms((rs) => rs.map((r) => (r.uid === u ? { ...r, roomId } : r)))
  const toggleAssign = (u: string, pid: string, checked: boolean) =>
    setRooms((rs) =>
      rs.map((r) => {
        if (r.uid !== u) return r
        return { ...r, pids: checked ? [...r.pids, pid] : r.pids.filter((x) => x !== pid) }
      }),
    )

  const assignedPids = new Set(rooms.flatMap((r) => r.pids))

  function validate(): string | null {
    if (!contact.firstName.trim() || !contact.email.trim()) return 'Podaj imię i e-mail zgłaszającego.'
    if (participants.length === 0) return 'Dodaj przynajmniej jednego uczestnika.'
    if (participants.some((p) => !p.firstName.trim())) return 'Uzupełnij imię każdego uczestnika.'
    if (roomTypes.length > 0) {
      const unassigned = participants.filter((p) => !assignedPids.has(p.id))
      if (rooms.length === 0) return 'Dodaj pokój i przypisz do niego uczestników.'
      if (unassigned.length > 0) return `Przypisz wszystkich uczestników do pokoi — brakuje ${unassigned.length}.`
    }
    return null
  }

  async function handleSave() {
    const err = validate()
    if (err) {
      setError(err)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await adminUpdateRegistration(registration.id, {
        contact: {
          firstName: contact.firstName.trim(),
          lastName: contact.lastName.trim(),
          email: contact.email.trim(),
          phone: contact.phone.trim() || undefined,
        },
        participants: participants.map((p) => ({
          type: p.type,
          firstName: p.firstName.trim(),
          lastName: p.lastName.trim() || undefined,
          age: p.age ? parseInt(p.age) : undefined,
          gender: p.gender || undefined,
          dietary: p.dietary.trim() || undefined,
        })),
        rooms: rooms.map((r) => ({
          roomId: r.roomId,
          participantIndexes: r.pids.map((pid) => participants.findIndex((p) => p.id === pid)).filter((i) => i >= 0),
        })),
        options,
        discountCode: registration.discountCode,
        dietaryNotes: dietaryNotes.trim() || null,
      })
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'rounded-[10px] border px-3 py-2 text-sm'
  const inputStyle = { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' } as const

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div
        className="w-full rounded-[18px] overflow-hidden flex flex-col"
        style={{ maxWidth: 680, maxHeight: '92vh', background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="font-bold text-base" style={{ color: 'var(--ink)' }}>Edycja zgłoszenia</p>
          <button onClick={onClose} className="p-1.5 rounded-[8px]" style={{ color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
          {/* Kontakt */}
          <section className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Zgłaszający</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Imię" value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} />
              <Input label="Nazwisko" value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} />
              <Input label="E-mail" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
              <Input label="Telefon" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            </div>
          </section>

          {/* Uczestnicy */}
          <section className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Uczestnicy</p>
            {participants.map((p) => (
              <div key={p.id} className="flex flex-wrap items-end gap-2 p-3 rounded-[12px]" style={{ background: 'var(--surface-2)' }}>
                <input value={p.firstName} onChange={(e) => updateParticipant(p.id, { firstName: e.target.value })} placeholder="Imię" className={inputCls} style={{ ...inputStyle, flex: 1, minWidth: 90 }} />
                <input value={p.lastName} onChange={(e) => updateParticipant(p.id, { lastName: e.target.value })} placeholder="Nazwisko" className={inputCls} style={{ ...inputStyle, flex: 1, minWidth: 90 }} />
                <select value={p.type} onChange={(e) => updateParticipant(p.id, { type: e.target.value as 'adult' | 'child' })} className={inputCls} style={{ ...inputStyle, width: 96 }}>
                  <option value="adult">Dorosły</option>
                  <option value="child">Dziecko</option>
                </select>
                <input value={p.age} onChange={(e) => updateParticipant(p.id, { age: e.target.value })} placeholder="wiek" inputMode="numeric" className={inputCls} style={{ ...inputStyle, width: 64 }} />
                <select value={p.gender} onChange={(e) => updateParticipant(p.id, { gender: e.target.value })} className={inputCls} style={{ ...inputStyle, width: 70 }}>
                  <option value="">—</option>
                  <option value="F">K</option>
                  <option value="M">M</option>
                </select>
                <button onClick={() => removeParticipant(p.id)} className="p-2 rounded-[8px]" style={{ color: 'var(--err)', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={15} /></button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addParticipant}><Plus size={14} /> Dodaj uczestnika</Button>
          </section>

          {/* Pokoje */}
          {roomTypes.length > 0 && (
            <section className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Pokoje</p>
              {rooms.map((r, ri) => (
                <div key={r.uid} className="flex flex-col gap-2 p-3 rounded-[12px]" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Pokój {ri + 1}</span>
                    <select value={r.roomId} onChange={(e) => setRoomType(r.uid, e.target.value)} className={inputCls} style={{ ...inputStyle, flex: 1 }}>
                      {roomTypes.map((rt) => (
                        <option key={rt.id} value={rt.id}>{roomLabel(rt.name, 'pl')} — {money(rt.perPerson)}/os · maks. {rt.cap}</option>
                      ))}
                    </select>
                    <button onClick={() => removeRoom(r.uid)} className="p-2 rounded-[8px]" style={{ color: 'var(--err)', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={15} /></button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {participants.map((p) => {
                      const checked = r.pids.includes(p.id)
                      const inOther = !checked && assignedPids.has(p.id)
                      return (
                        <button
                          key={p.id}
                          onClick={() => !inOther && toggleAssign(r.uid, p.id, !checked)}
                          disabled={inOther}
                          className="text-xs px-2.5 py-1 rounded-full"
                          style={{
                            border: `1px solid ${checked ? 'var(--brand)' : 'var(--border)'}`,
                            background: checked ? 'var(--brand)' : 'transparent',
                            color: checked ? '#fff' : inOther ? 'var(--faint)' : 'var(--ink)',
                            opacity: inOther ? 0.5 : 1,
                            cursor: inOther ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {p.firstName || 'Uczestnik'}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addRoom}><Plus size={14} /> Dodaj pokój</Button>
            </section>
          )}

          {/* Opcje */}
          {(showTransport || showBedding) && (
            <section className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Opcje</p>
              {showTransport && (
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                  <input type="checkbox" checked={options.transport} onChange={(e) => setOptions({ ...options, transport: e.target.checked })} className="accent-[var(--brand)] w-4 h-4" /> Transport
                </label>
              )}
              {showBedding && (
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                  <input type="checkbox" checked={options.bedding} onChange={(e) => setOptions({ ...options, bedding: e.target.checked })} className="accent-[var(--brand)] w-4 h-4" /> Pościel
                </label>
              )}
            </section>
          )}

          {/* Uwagi dietetyczne */}
          <section className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Uwagi / dieta</p>
            <textarea value={dietaryNotes} onChange={(e) => setDietaryNotes(e.target.value)} rows={2} className={inputCls} style={{ ...inputStyle, resize: 'vertical' }} placeholder="alergie, dieta, uwagi…" />
          </section>

          {error && (
            <div className="px-4 py-3 rounded-[12px] text-sm" style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="text-sm" style={{ color: 'var(--muted)' }}>
            Nowa kwota: <span className="font-bold" style={{ color: 'var(--ink)' }}>{money(total)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Anuluj</Button>
            <Button onClick={() => { void handleSave() }} disabled={saving}>{saving ? 'Zapisuję…' : 'Zapisz zmiany'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
